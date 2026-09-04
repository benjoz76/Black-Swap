import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPublicClient, createWalletClient, custom, formatUnits, getAddress, http, isAddress, parseUnits, zeroAddress, type Address, type Hash } from 'viem'
import { erc20Abi, factoryAbi, faucetAbi, pairAbi, routerAbi } from './abis'
import { BLUSD_ADDRESS, FACTORY_ADDRESS, ROUTER_ADDRESS, TOKENS, liteforge, routerAddressFor, tokenBySymbol, type TokenConfig } from './config'

type Mode = 'swap' | 'add' | 'remove' | 'faucet'
type LogTone = 'neutral' | 'success' | 'warning'
interface LogEntry { time: string; message: string; tone: LogTone }
interface PairState { address?: Address; reserveA: bigint; reserveB: bigint; totalSupply: bigint; lpBalance: bigint }

const LITVM_CHAIN_ID = '0x1159'
const LITVM_FAUCET_URL = 'https://liteforge.hub.caldera.xyz'
const publicClient = createPublicClient({ chain: liteforge, transport: http(undefined, { timeout: 20_000, retryCount: 1 }) })
const initialLogs: LogEntry[] = [
  { time: '00:00:01', message: 'Black Swap interface initialized', tone: 'neutral' },
  { time: '00:00:02', message: 'Router connected · LiteForge chain 4441', tone: 'success' },
  { time: '00:00:02', message: 'Exact approvals + auto-revoke enabled', tone: 'neutral' },
]

const shortAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`
const now = () => new Date().toLocaleTimeString('en-GB', { hour12: false })
const displayAmount = (value: bigint | undefined, precision = 4) => {
  if (value === undefined) return '—'
  const formatted = Number(formatUnits(value, 18))
  return Number.isFinite(formatted) ? formatted.toLocaleString('en-US', { maximumFractionDigits: precision }) : '—'
}
const errorMessage = (error: unknown) => {
  const candidate = error as { shortMessage?: string; message?: string }
  return candidate.shortMessage ?? candidate.message?.split('\n')[0] ?? 'Transaction failed'
}
function ArrowDown() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v15M6.5 13.5 12 19l5.5-5.5" /></svg> }
function ExternalLink() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-9 9M19 13v6H5V5h6" /></svg> }

export default function App() {
  const [mode, setMode] = useState<Mode>('swap')
  const [account, setAccount] = useState('')
  const [manuallyDisconnected, setManuallyDisconnected] = useState(() => sessionStorage.getItem('black-swap-disconnected') === '1')
  const [chainId, setChainId] = useState('')
  const [tokenASymbol, setTokenASymbol] = useState('zkLTC')
  const [tokenBSymbol, setTokenBSymbol] = useState('BLUSD')
  const [amountA, setAmountA] = useState('1')
  const [amountB, setAmountB] = useState('250')
  const [quote, setQuote] = useState<bigint>()
  const [quoteMessage, setQuoteMessage] = useState('Add liquidity first to create this pool')
  const [slippage, setSlippage] = useState('0.5')
  const [balances, setBalances] = useState<Record<string, bigint>>({})
  const [pair, setPair] = useState<PairState>({ reserveA: 0n, reserveB: 0n, totalSupply: 0n, lpBalance: 0n })
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs)
  const [busy, setBusy] = useState(false)
  const [faucetAddress, setFaucetAddress] = useState(() => localStorage.getItem('black-swap-faucet') ?? import.meta.env.VITE_BLUSD_FAUCET_ADDRESS ?? '')
  const [faucetReady, setFaucetReady] = useState(false)
  const [nextClaimAt, setNextClaimAt] = useState(0)

  const tokenA = useMemo(() => tokenBySymbol(tokenASymbol), [tokenASymbol])
  const tokenB = useMemo(() => tokenBySymbol(tokenBSymbol), [tokenBSymbol])
  const onLitVM = chainId.toLowerCase() === LITVM_CHAIN_ID
  const addLog = useCallback((message: string, tone: LogTone = 'neutral') => setLogs((current) => [...current.slice(-5), { time: now(), message, tone }]), [])

  useEffect(() => {
    if (!window.ethereum) return
    if (!manuallyDisconnected) window.ethereum.request({ method: 'eth_accounts' }).then((value) => { const accounts = value as string[]; if (accounts[0]) setAccount(accounts[0]) }).catch(() => undefined)
    window.ethereum.request({ method: 'eth_chainId' }).then((value) => setChainId(value as string)).catch(() => undefined)
    const handleAccounts = (...args: unknown[]) => setAccount(manuallyDisconnected ? '' : ((args[0] as string[])?.[0] ?? ''))
    const handleChain = (...args: unknown[]) => setChainId(args[0] as string)
    window.ethereum.on?.('accountsChanged', handleAccounts)
    window.ethereum.on?.('chainChanged', handleChain)
    return () => { window.ethereum?.removeListener?.('accountsChanged', handleAccounts); window.ethereum?.removeListener?.('chainChanged', handleChain) }
  }, [manuallyDisconnected])

  const switchToLitVM = async () => {
    if (!window.ethereum) { addLog('No EVM wallet detected', 'warning'); return false }
    try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: LITVM_CHAIN_ID }] }) }
    catch (error) {
      if ((error as { code?: number }).code !== 4902) { addLog('Network switch cancelled', 'warning'); return false }
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: LITVM_CHAIN_ID, chainName: liteforge.name, nativeCurrency: liteforge.nativeCurrency, rpcUrls: liteforge.rpcUrls.default.http, blockExplorerUrls: [liteforge.blockExplorers.default.url] }] })
    }
    setChainId(LITVM_CHAIN_ID); addLog('Wallet ready on LiteForge', 'success'); return true
  }

  const connectWallet = async (): Promise<Address | undefined> => {
    if (!window.ethereum) { addLog('Install MetaMask, Rabby, or another EVM wallet', 'warning'); return }
    try {
      const result = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[]
      if (!result[0]) return
      const connected = getAddress(result[0]); sessionStorage.removeItem('black-swap-disconnected'); setManuallyDisconnected(false); setAccount(connected)
      addLog(`Wallet connected · ${shortAddress(connected)}`, 'success')
      if (chainId.toLowerCase() !== LITVM_CHAIN_ID) await switchToLitVM()
      return connected
    } catch { addLog('Wallet connection cancelled', 'warning') }
  }

  const disconnectWallet = async () => {
    if (!window.ethereum || !account) return
    try { await window.ethereum.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }) } catch { /* local fallback */ }
    sessionStorage.setItem('black-swap-disconnected', '1'); setManuallyDisconnected(true); setAccount(''); addLog('Wallet disconnected from Black Swap', 'warning')
  }
  const ensureWallet = async (): Promise<Address | undefined> => {
    const connected = account ? getAddress(account) : await connectWallet()
    if (!connected || (!onLitVM && !(await switchToLitVM()))) return
    return connected
  }

  const refreshData = useCallback(async () => {
    if (!account || !onLitVM || tokenA.symbol === tokenB.symbol) return
    const owner = getAddress(account)
    const balanceEntries = await Promise.all(TOKENS.map(async (token) => {
      try {
        const balance = token.native ? await publicClient.getBalance({ address: owner }) : await publicClient.readContract({ address: token.address!, abi: erc20Abi, functionName: 'balanceOf', args: [owner] })
        return [token.symbol, balance] as const
      } catch { return [token.symbol, 0n] as const }
    }))
    setBalances(Object.fromEntries(balanceEntries))
    try {
      const pairAddress = await publicClient.readContract({ address: FACTORY_ADDRESS, abi: factoryAbi, functionName: 'getPair', args: [routerAddressFor(tokenA), routerAddressFor(tokenB)] })
      if (pairAddress === zeroAddress) { setPair({ reserveA: 0n, reserveB: 0n, totalSupply: 0n, lpBalance: 0n }); return }
      const [token0, reserves, totalSupply, lpBalance] = await Promise.all([
        publicClient.readContract({ address: pairAddress, abi: pairAbi, functionName: 'token0' }),
        publicClient.readContract({ address: pairAddress, abi: pairAbi, functionName: 'getReserves' }),
        publicClient.readContract({ address: pairAddress, abi: pairAbi, functionName: 'totalSupply' }),
        publicClient.readContract({ address: pairAddress, abi: pairAbi, functionName: 'balanceOf', args: [owner] }),
      ])
      const aIsToken0 = token0.toLowerCase() === routerAddressFor(tokenA).toLowerCase()
      setPair({ address: pairAddress, reserveA: aIsToken0 ? reserves[0] : reserves[1], reserveB: aIsToken0 ? reserves[1] : reserves[0], totalSupply, lpBalance })
    } catch (error) { addLog(`Pool read failed · ${errorMessage(error)}`, 'warning') }
  }, [account, onLitVM, tokenA, tokenB, addLog])
  useEffect(() => { refreshData() }, [refreshData])

  useEffect(() => {
    setQuote(undefined)
    if (mode !== 'swap' || tokenA.symbol === tokenB.symbol) return
    const timer = window.setTimeout(async () => {
      try {
        const input = parseUnits(amountA || '0', tokenA.decimals); if (input <= 0n) return
        const amounts = await publicClient.readContract({ address: ROUTER_ADDRESS, abi: routerAbi, functionName: 'getAmountsOut', args: [input, [routerAddressFor(tokenA), routerAddressFor(tokenB)]] })
        setQuote(amounts[amounts.length - 1]); setQuoteMessage('Live router quote')
      } catch { setQuoteMessage('No route yet · create and fund the pool first') }
    }, 350)
    return () => clearTimeout(timer)
  }, [amountA, mode, tokenA, tokenB])

  useEffect(() => {
    if (mode !== 'add' || !pair.address || pair.reserveA === 0n) return
    try {
      const a = parseUnits(amountA || '0', 18)
      const matchingB = a * pair.reserveB / pair.reserveA
      setAmountB(formatUnits(matchingB, 18))
    } catch { /* keep the last valid second amount */ }
  }, [amountA, mode, pair.address, pair.reserveA, pair.reserveB])

  useEffect(() => {
    const checkFaucet = async () => {
      setFaucetReady(false); setNextClaimAt(0); if (!isAddress(faucetAddress)) return
      try {
        const address = getAddress(faucetAddress)
        const [code, token] = await Promise.all([publicClient.getCode({ address }), publicClient.readContract({ address, abi: faucetAbi, functionName: 'BLUSD' })])
        if (!code || token.toLowerCase() !== BLUSD_ADDRESS.toLowerCase()) return
        setFaucetReady(true)
        if (account) setNextClaimAt(Number(await publicClient.readContract({ address, abi: faucetAbi, functionName: 'nextClaimAt', args: [getAddress(account)] })))
      } catch { setFaucetReady(false) }
    }
    checkFaucet()
  }, [faucetAddress, account])

  const walletClient = () => {
    if (!window.ethereum) throw new Error('No wallet provider')
    return createWalletClient({ chain: liteforge, transport: custom(window.ethereum) })
  }
  const waitForTransaction = async (hash: Hash, label: string) => {
    addLog(`${label} submitted · ${shortAddress(hash)}`)
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error(`${label} reverted`)
    addLog(`${label} confirmed · block ${receipt.blockNumber}`, 'success')
  }
  const approveExact = async (token: TokenConfig, amount: bigint, owner: Address) => {
    if (token.native) return
    const current = await publicClient.readContract({ address: token.address!, abi: erc20Abi, functionName: 'allowance', args: [owner, ROUTER_ADDRESS] })
    if (current >= amount) return
    const wallet = walletClient()
    if (current > 0n) await waitForTransaction(await wallet.writeContract({ account: owner, address: token.address!, abi: erc20Abi, functionName: 'approve', args: [ROUTER_ADDRESS, 0n] }), `${token.symbol} allowance reset`)
    await waitForTransaction(await wallet.writeContract({ account: owner, address: token.address!, abi: erc20Abi, functionName: 'approve', args: [ROUTER_ADDRESS, amount] }), `${token.symbol} exact approval`)
  }
  const revokeToken = async (token: TokenConfig, owner: Address) => {
    if (token.native) return
    const current = await publicClient.readContract({ address: token.address!, abi: erc20Abi, functionName: 'allowance', args: [owner, ROUTER_ADDRESS] })
    if (current > 0n) await waitForTransaction(await walletClient().writeContract({ account: owner, address: token.address!, abi: erc20Abi, functionName: 'approve', args: [ROUTER_ADDRESS, 0n] }), `${token.symbol} auto-revoke`)
  }
  const minAfterSlippage = (value: bigint) => {
    const bps = Math.max(0, Math.min(5_000, Math.round((Number(slippage) || 0.5) * 100)))
    return value * BigInt(10_000 - bps) / 10_000n
  }

  const runSwap = async (owner: Address) => {
    if (!quote) throw new Error('No live quote. Add liquidity to this pool first.')
    const input = parseUnits(amountA, tokenA.decimals); const path: Address[] = [routerAddressFor(tokenA), routerAddressFor(tokenB)]; const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)
    await approveExact(tokenA, input, owner)
    const wallet = walletClient(); let hash: Hash
    if (tokenA.native) hash = await wallet.writeContract({ account: owner, address: ROUTER_ADDRESS, abi: routerAbi, functionName: 'swapExactETHForTokens', args: [minAfterSlippage(quote), path, owner, deadline], value: input })
    else if (tokenB.native) hash = await wallet.writeContract({ account: owner, address: ROUTER_ADDRESS, abi: routerAbi, functionName: 'swapExactTokensForETH', args: [input, minAfterSlippage(quote), path, owner, deadline] })
    else hash = await wallet.writeContract({ account: owner, address: ROUTER_ADDRESS, abi: routerAbi, functionName: 'swapExactTokensForTokens', args: [input, minAfterSlippage(quote), path, owner, deadline] })
    await waitForTransaction(hash, `Swap ${tokenA.symbol} → ${tokenB.symbol}`); await revokeToken(tokenA, owner)
  }

  const runAddLiquidity = async (owner: Address) => {
    const a = parseUnits(amountA, 18); const b = parseUnits(amountB, 18); if (a <= 0n || b <= 0n) throw new Error('Enter both liquidity amounts')
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); const wallet = walletClient(); let hash: Hash
    if (tokenA.native || tokenB.native) {
      const nativeAmount = tokenA.native ? a : b; const ercAmount = tokenA.native ? b : a; const ercToken = tokenA.native ? tokenB : tokenA
      await approveExact(ercToken, ercAmount, owner)
      hash = await wallet.writeContract({ account: owner, address: ROUTER_ADDRESS, abi: routerAbi, functionName: 'addLiquidityETH', args: [ercToken.address!, ercAmount, pair.address ? minAfterSlippage(ercAmount) : 0n, pair.address ? minAfterSlippage(nativeAmount) : 0n, owner, deadline], value: nativeAmount })
      await waitForTransaction(hash, `Add ${tokenA.symbol}/${tokenB.symbol} liquidity`); await revokeToken(ercToken, owner)
    } else {
      await approveExact(tokenA, a, owner); await approveExact(tokenB, b, owner)
      hash = await wallet.writeContract({ account: owner, address: ROUTER_ADDRESS, abi: routerAbi, functionName: 'addLiquidity', args: [tokenA.address!, tokenB.address!, a, b, pair.address ? minAfterSlippage(a) : 0n, pair.address ? minAfterSlippage(b) : 0n, owner, deadline] })
      await waitForTransaction(hash, `Add ${tokenA.symbol}/${tokenB.symbol} liquidity`); await revokeToken(tokenA, owner); await revokeToken(tokenB, owner)
    }
  }

  const runRemoveLiquidity = async (owner: Address) => {
    if (!pair.address || pair.totalSupply === 0n) throw new Error('This pair does not exist')
    const liquidity = parseUnits(amountA, 18); if (liquidity <= 0n || liquidity > pair.lpBalance) throw new Error('Invalid LP amount')
    const expectedA = liquidity * pair.reserveA / pair.totalSupply; const expectedB = liquidity * pair.reserveB / pair.totalSupply; const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)
    const wallet = walletClient(); const allowance = await publicClient.readContract({ address: pair.address, abi: pairAbi, functionName: 'allowance', args: [owner, ROUTER_ADDRESS] })
    if (allowance < liquidity) await waitForTransaction(await wallet.writeContract({ account: owner, address: pair.address, abi: pairAbi, functionName: 'approve', args: [ROUTER_ADDRESS, liquidity] }), 'LP exact approval')
    let hash: Hash
    if (tokenA.native || tokenB.native) {
      const ercToken = tokenA.native ? tokenB : tokenA; const tokenMinimum = tokenA.native ? minAfterSlippage(expectedB) : minAfterSlippage(expectedA); const nativeMinimum = tokenA.native ? minAfterSlippage(expectedA) : minAfterSlippage(expectedB)
      hash = await wallet.writeContract({ account: owner, address: ROUTER_ADDRESS, abi: routerAbi, functionName: 'removeLiquidityETH', args: [ercToken.address!, liquidity, tokenMinimum, nativeMinimum, owner, deadline] })
    } else hash = await wallet.writeContract({ account: owner, address: ROUTER_ADDRESS, abi: routerAbi, functionName: 'removeLiquidity', args: [tokenA.address!, tokenB.address!, liquidity, minAfterSlippage(expectedA), minAfterSlippage(expectedB), owner, deadline] })
    await waitForTransaction(hash, `Remove ${tokenA.symbol}/${tokenB.symbol} liquidity`)
    const remaining = await publicClient.readContract({ address: pair.address, abi: pairAbi, functionName: 'allowance', args: [owner, ROUTER_ADDRESS] })
    if (remaining > 0n) await waitForTransaction(await wallet.writeContract({ account: owner, address: pair.address, abi: pairAbi, functionName: 'approve', args: [ROUTER_ADDRESS, 0n] }), 'LP auto-revoke')
  }

  const runClaim = async (owner: Address) => {
    if (!faucetReady || !isAddress(faucetAddress)) throw new Error('Configure the deployed BLUSD faucet first')
    if (nextClaimAt > Date.now() / 1000) throw new Error(`Next claim: ${new Date(nextClaimAt * 1000).toLocaleString()}`)
    await waitForTransaction(await walletClient().writeContract({ account: owner, address: getAddress(faucetAddress), abi: faucetAbi, functionName: 'claim' }), 'Claim 250 BLUSD')
  }
  const runAction = async () => {
    const owner = await ensureWallet(); if (!owner || busy) return
    if (tokenA.symbol === tokenB.symbol && mode !== 'faucet') { addLog('Choose two different assets', 'warning'); return }
    setBusy(true)
    try { if (mode === 'swap') await runSwap(owner); if (mode === 'add') await runAddLiquidity(owner); if (mode === 'remove') await runRemoveLiquidity(owner); if (mode === 'faucet') await runClaim(owner); await refreshData() }
    catch (error) { addLog(errorMessage(error), 'warning') } finally { setBusy(false) }
  }

  const changeToken = (side: 'a' | 'b', symbol: string) => {
    if (side === 'a') { if (symbol === tokenBSymbol) setTokenBSymbol(tokenASymbol); setTokenASymbol(symbol) }
    else { if (symbol === tokenASymbol) setTokenASymbol(tokenBSymbol); setTokenBSymbol(symbol) }
  }
  const reversePair = () => { setTokenASymbol(tokenBSymbol); setTokenBSymbol(tokenASymbol); if (mode === 'add') { setAmountA(amountB); setAmountB(amountA) } }
  const saveFaucet = () => {
    if (!isAddress(faucetAddress)) { addLog('Invalid faucet contract address', 'warning'); return }
    const normalized = getAddress(faucetAddress); localStorage.setItem('black-swap-faucet', normalized); setFaucetAddress(normalized); addLog('Faucet address saved · validating contract')
  }
  const openWorkbench = (targetMode: Mode) => {
    setMode(targetMode)
    window.requestAnimationFrame(() => document.getElementById('trade')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const actionLabel = !account ? 'Connect wallet' : !onLitVM ? 'Switch to LitVM' : busy ? 'Waiting for wallet…' : mode === 'swap' ? `Swap ${tokenA.symbol} for ${tokenB.symbol}` : mode === 'add' ? 'Add liquidity' : mode === 'remove' ? 'Remove liquidity' : 'Claim 250 BLUSD'
  const modeLabels: Record<Mode, string> = { swap: 'Swap', add: 'Add liquidity', remove: 'Remove', faucet: 'Faucet' }
  let removeLiquidity = 0n
  try { removeLiquidity = parseUnits(amountA || '0', 18) } catch { removeLiquidity = 0n }
  const estimatedRemoveA = pair.totalSupply > 0n ? removeLiquidity * pair.reserveA / pair.totalSupply : 0n
  const estimatedRemoveB = pair.totalSupply > 0n ? removeLiquidity * pair.reserveB / pair.totalSupply : 0n
  const nextClaimLabel = !faucetReady ? 'CONTRACT NOT SET' : nextClaimAt > Date.now() / 1000 ? new Date(nextClaimAt * 1000).toLocaleString() : 'READY'

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Black Swap home"><span className="brand-mark" aria-hidden="true"><i /><i /></span><span>BLACK/SWAP</span></a>
        <nav aria-label="Primary navigation"><button type="button" onClick={() => openWorkbench('swap')}>Trade</button><button type="button" onClick={() => openWorkbench('add')}>Pool</button><a href="#console">Console</a><a href="https://docs.litvm.com/" target="_blank" rel="noreferrer">Docs</a></nav>
        <div className="network-cluster"><a className="network-status" href={liteforge.blockExplorers.default.url} target="_blank" rel="noreferrer"><span className={`status-dot ${onLitVM ? 'live' : ''}`} /><span>LiteForge</span><b>{onLitVM ? 'online' : 'chain 4441'}</b></a><button className={`wallet-button ${account ? 'connected' : ''}`} type="button" onClick={account ? disconnectWallet : connectWallet}>{account ? <><span>{shortAddress(account)}</span><b>Disconnect</b></> : 'Connect wallet'}</button></div>
      </header>
      <main id="top">
        <section className="intro" aria-labelledby="page-title"><div><p className="eyebrow">LITVM LIQUIDITY LAB / TESTNET</p><h1 id="page-title">Liquidity,<br /><span>without noise.</span></h1></div><div className="intro-copy"><p>Swap real LiteForge test assets, create permissionless pools, and learn AMM mechanics with exact approvals and automatic allowance cleanup.</p><div className="protocol-line"><span>LIVE TX</span><span>x · y = k</span><span>AUTO-REVOKE ON</span></div></div></section>
        <section className="workbench" id="trade" aria-label="Trading workbench">
          <article className="trade-panel">
            <div className="panel-heading"><div><span className="panel-index">01</span><h2>Execution</h2></div><span className="testnet-tag">TESTNET ONLY</span></div>
            <div className="mode-tabs" role="tablist">{(Object.keys(modeLabels) as Mode[]).map((item) => <button key={item} className={mode === item ? 'active' : ''} type="button" role="tab" aria-selected={mode === item} onClick={() => setMode(item)}>{modeLabels[item]}</button>)}</div>
            {mode === 'faucet' ? <div className="faucet-panel">
              <p className="faucet-kicker">BLACK USD / 24H RATE LIMIT</p><h3>Claim exactly 250 BLUSD.</h3><p>The Black Swap faucet serves BLUSD only. Native zkLTC remains available through the official LiteForge faucet.</p>
              <div className="faucet-token-row"><span className="faucet-token-icon">$</span><div><b>BLUSD</b><small>{nextClaimLabel}</small></div><span className={`ready-badge ${faucetReady ? '' : 'pending'}`}>{faucetReady ? '250 / 24H' : 'SETUP'}</span></div>
              <div className="contract-config"><label htmlFor="faucet-address">Faucet contract</label><div><input id="faucet-address" value={faucetAddress} onChange={(event) => setFaucetAddress(event.target.value)} placeholder="0x... after deployment" /><button type="button" onClick={saveFaucet}>Save</button></div></div>
              <button className="primary-action" type="button" onClick={runAction} disabled={busy || (!!account && onLitVM && !faucetReady)}><span>{actionLabel}</span><span>↗</span></button><a className="secondary-action" href={LITVM_FAUCET_URL} target="_blank" rel="noreferrer"><span>Need zkLTC gas?</span><b>Official faucet ↗</b></a>
            </div> : <>
              <div className="token-input"><div className="input-meta"><span>{mode === 'remove' ? 'LP tokens to burn' : mode === 'add' ? 'First deposit' : 'You pay'}</span><span>Balance {mode === 'remove' ? displayAmount(pair.lpBalance) : displayAmount(balances[tokenA.symbol])}</span></div><div className="amount-row"><input aria-label="Input amount" inputMode="decimal" value={amountA} onChange={(event) => setAmountA(event.target.value)} /><select className="token-select" value={tokenASymbol} onChange={(event) => changeToken('a', event.target.value)} disabled={mode === 'remove'}>{TOKENS.map((token) => <option key={token.symbol}>{token.symbol}</option>)}</select></div><span className="fiat-value">{mode === 'remove' ? `LP balance · ${displayAmount(pair.lpBalance)}` : tokenA.name}</span></div>
              <button className="direction-button" type="button" aria-label="Reverse token direction" onClick={reversePair} disabled={mode === 'remove'}><ArrowDown /></button>
              <div className="token-input output-input"><div className="input-meta"><span>{mode === 'add' ? 'Second deposit' : mode === 'remove' ? 'Estimated assets' : 'You receive'}</span><span>Balance {displayAmount(balances[tokenB.symbol])}</span></div><div className="amount-row">{mode === 'add' ? <input aria-label="Second liquidity amount" inputMode="decimal" value={amountB} onChange={(event) => setAmountB(event.target.value)} /> : mode === 'remove' ? <output className="asset-output">{displayAmount(estimatedRemoveA)} {tokenA.symbol} + {displayAmount(estimatedRemoveB)} {tokenB.symbol}</output> : <output>{displayAmount(quote)}</output>}<select className="token-select" value={tokenBSymbol} onChange={(event) => changeToken('b', event.target.value)} disabled={mode === 'remove'}>{TOKENS.map((token) => <option key={token.symbol}>{token.symbol}</option>)}</select></div><span className="fiat-value">{mode === 'swap' ? quoteMessage : pair.address ? 'Existing pool ratio applies' : 'First deposit sets the initial price'}</span></div>
              <div className="execution-details"><div><span>Pool</span><b className={!pair.address ? 'warning' : ''}>{pair.address ? shortAddress(pair.address) : 'NOT CREATED'}</b></div><div><span>Allowance policy</span><b>EXACT + AUTO-REVOKE</b></div><label><span>Slippage tolerance</span><span className="slippage"><input value={slippage} onChange={(event) => setSlippage(event.target.value)} />%</span></label></div>
              <button className="primary-action" type="button" onClick={runAction} disabled={busy}><span>{actionLabel}</span><span>↗</span></button><p className="prototype-note">Every approval, swap, LP action, and revoke is a real LiteForge testnet transaction requiring wallet confirmation.</p>
            </>}
          </article>
          <aside className="telemetry" id="pool">
            <div className="panel-heading"><div><span className="panel-index">02</span><h2>Pool telemetry</h2></div><span className={`live-label ${pair.address ? '' : 'demo'}`}><span /> {pair.address ? 'ONCHAIN' : 'EMPTY'}</span></div>
            <div className="pair-heading"><div className="pair-symbol"><span>{tokenA.symbol === 'zkLTC' ? 'Ł' : tokenA.symbol[0]}</span><span>{tokenB.symbol[0]}</span></div><div><h3>{tokenA.symbol} / {tokenB.symbol}</h3><p>{pair.address ? shortAddress(pair.address) : 'CREATE WITH FIRST DEPOSIT'}</p></div>{pair.address && <a href={`${liteforge.blockExplorers.default.url}/address/${pair.address}`} target="_blank" rel="noreferrer"><ExternalLink /></a>}</div>
            <div className="metric-grid"><div><span>{tokenA.symbol} reserve</span><strong>{displayAmount(pair.reserveA, 3)}</strong><small>ONCHAIN BALANCE</small></div><div><span>{tokenB.symbol} reserve</span><strong>{displayAmount(pair.reserveB, 3)}</strong><small>ONCHAIN BALANCE</small></div><div><span>Total LP supply</span><strong>{displayAmount(pair.totalSupply, 3)}</strong><small>POOL SHARES</small></div><div><span>Your LP balance</span><strong>{account ? displayAmount(pair.lpBalance, 3) : '—'}</strong><small>{account ? 'CONNECTED WALLET' : 'CONNECT WALLET'}</small></div></div>
            <div className="route-block"><span>EXECUTION ROUTE</span><b>{tokenA.symbol} → {tokenB.symbol}</b><p>Router {shortAddress(ROUTER_ADDRESS)}</p></div><div className="position-block"><div className="section-label"><span>Safety policy</span><b>ENFORCED</b></div><dl><div><dt>Approval</dt><dd>Exact amount</dd></div><div><dt>Post-transaction</dt><dd>Revoke to zero</dd></div><div><dt>Deadline</dt><dd>20 minutes</dd></div></dl></div>
          </aside>
        </section>
        <section className="console" id="console"><div className="console-heading"><div><span className="panel-index">03</span><h2>Transaction console</h2></div><span>SESSION / LITEFORGE</span></div><div className="log-list" aria-live="polite">{logs.map((log, index) => <div className={`log ${log.tone}`} key={`${log.time}-${index}`}><time>{log.time}</time><span>black@liteforge:~$</span><p>{log.message}</p></div>)}<div className="prompt-line"><span>black@liteforge:~$</span><i /></div></div></section>
      </main>
      <footer><div><span>BLACK SWAP</span><b>v0.2.0</b></div><div><span>NETWORK</span><b>LitVM LiteForge</b></div><div><span>CHAIN ID</span><b>4441</b></div><div><span>STATUS</span><b className="status-copy">LIVE TESTNET TX</b></div></footer>
    </div>
  )
}
