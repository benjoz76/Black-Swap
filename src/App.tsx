import { useEffect, useMemo, useState } from 'react'

type Mode = 'swap' | 'add' | 'remove' | 'faucet'
type LogTone = 'neutral' | 'success' | 'warning'

interface LogEntry {
  time: string
  message: string
  tone: LogTone
}

const LITVM_CHAIN_ID = '0x1159'
const LITVM_FAUCET_URL = 'https://liteforge.hub.caldera.xyz'
const LITVM_NETWORK = {
  chainId: LITVM_CHAIN_ID,
  chainName: 'LitVM LiteForge',
  nativeCurrency: { name: 'zkLTC', symbol: 'zkLTC', decimals: 18 },
  rpcUrls: ['https://liteforge.rpc.caldera.xyz/http'],
  blockExplorerUrls: ['https://liteforge.explorer.caldera.xyz'],
}

const initialLogs: LogEntry[] = [
  { time: '00:00:01', message: 'Black Swap interface initialized', tone: 'neutral' },
  { time: '00:00:02', message: 'RPC reachable · chain 4441', tone: 'success' },
  { time: '00:00:02', message: 'Demo pair zkLTC / mUSD loaded', tone: 'neutral' },
]

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function now() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false })
}

function ArrowDown() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4v15M6.5 13.5 12 19l5.5-5.5" />
    </svg>
  )
}

function ExternalLink() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 5h5v5M19 5l-9 9M19 13v6H5V5h6" />
    </svg>
  )
}

export default function App() {
  const [mode, setMode] = useState<Mode>('swap')
  const [account, setAccount] = useState('')
  const [chainId, setChainId] = useState('')
  const [amount, setAmount] = useState('10')
  const [slippage, setSlippage] = useState('0.5')
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs)
  const [busy, setBusy] = useState(false)

  const onLitVM = chainId.toLowerCase() === LITVM_CHAIN_ID
  const numericAmount = Number(amount) || 0
  const output = useMemo(() => {
    const reserveIn = 12480
    const reserveOut = 1051120
    const amountAfterFee = numericAmount * 0.997
    return (amountAfterFee * reserveOut) / (reserveIn + amountAfterFee)
  }, [numericAmount])
  const priceImpact = Math.min((numericAmount / 12480) * 100, 99)

  const addLog = (message: string, tone: LogTone = 'neutral') => {
    setLogs((current) => [...current.slice(-4), { time: now(), message, tone }])
  }

  useEffect(() => {
    if (!window.ethereum) return
    window.ethereum.request({ method: 'eth_accounts' }).then((value) => {
      const accounts = value as string[]
      if (accounts[0]) setAccount(accounts[0])
    }).catch(() => undefined)
    window.ethereum.request({ method: 'eth_chainId' }).then((value) => {
      setChainId(value as string)
    }).catch(() => undefined)

    const handleAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[]
      setAccount(accounts?.[0] ?? '')
    }
    const handleChain = (...args: unknown[]) => setChainId(args[0] as string)
    window.ethereum.on?.('accountsChanged', handleAccounts)
    window.ethereum.on?.('chainChanged', handleChain)
    return () => {
      window.ethereum?.removeListener?.('accountsChanged', handleAccounts)
      window.ethereum?.removeListener?.('chainChanged', handleChain)
    }
  }, [])

  const switchToLitVM = async () => {
    if (!window.ethereum) {
      addLog('No EVM wallet detected', 'warning')
      return false
    }
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: LITVM_CHAIN_ID }],
      })
      setChainId(LITVM_CHAIN_ID)
      addLog('Network switched to LitVM LiteForge', 'success')
      return true
    } catch (error) {
      const code = (error as { code?: number }).code
      if (code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [LITVM_NETWORK],
        })
        setChainId(LITVM_CHAIN_ID)
        addLog('LitVM LiteForge added to wallet', 'success')
        return true
      }
      addLog('Network switch was cancelled', 'warning')
      return false
    }
  }

  const connectWallet = async () => {
    if (!window.ethereum) {
      addLog('Install MetaMask, Rabby, or another EVM wallet', 'warning')
      return
    }
    try {
      const result = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[]
      if (result[0]) {
        setAccount(result[0])
        addLog(`Wallet connected · ${shortAddress(result[0])}`, 'success')
        await switchToLitVM()
      }
    } catch {
      addLog('Wallet connection was cancelled', 'warning')
    }
  }

  const runDemoAction = async () => {
    if (!account) {
      await connectWallet()
      return
    }
    if (!onLitVM) {
      await switchToLitVM()
      return
    }
    setBusy(true)
    const labels: Record<Mode, string> = {
      swap: `Quote locked · ${numericAmount.toFixed(2)} zkLTC → ${output.toFixed(2)} mUSD`,
      add: `Liquidity previewed · ${numericAmount.toFixed(2)} zkLTC + ${(numericAmount * 84.22).toFixed(2)} mUSD`,
      remove: `Withdrawal previewed · ${numericAmount.toFixed(2)} LP shares`,
      faucet: 'Official LiteForge faucet opened',
    }
    addLog(labels[mode])
    await new Promise((resolve) => window.setTimeout(resolve, 700))
    addLog('Prototype mode · contract execution is disabled', 'warning')
    setBusy(false)
  }

  const actionLabel = !account
    ? 'Connect wallet'
    : !onLitVM
      ? 'Switch to LitVM'
      : busy
        ? 'Preparing preview…'
        : mode === 'swap'
          ? 'Preview swap'
          : mode === 'add'
            ? 'Preview liquidity'
            : mode === 'remove'
              ? 'Preview withdrawal'
              : 'Open zkLTC faucet'

  const modeLabels: Record<Mode, string> = {
    swap: 'Swap',
    add: 'Add liquidity',
    remove: 'Remove',
    faucet: 'Faucet',
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Black Swap home">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span>BLACK/SWAP</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#trade">Trade</a>
          <a href="#pool">Pool</a>
          <a href="#console">Console</a>
          <a href="https://docs.litvm.com/" target="_blank" rel="noreferrer">Docs</a>
        </nav>
        <div className="network-cluster">
          <a className="network-status" href="https://liteforge.explorer.caldera.xyz" target="_blank" rel="noreferrer">
            <span className={`status-dot ${onLitVM ? 'live' : ''}`} />
            <span>LiteForge</span>
            <b>{onLitVM ? 'online' : 'chain 4441'}</b>
          </a>
          <button className="wallet-button" type="button" onClick={connectWallet}>
            {account ? shortAddress(account) : 'Connect wallet'}
          </button>
        </div>
      </header>

      <main id="top">
        <section className="intro" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">LITVM LIQUIDITY LAB / TESTNET</p>
            <h1 id="page-title">Liquidity,<br /><span>without noise.</span></h1>
          </div>
          <div className="intro-copy">
            <p>A focused AMM playground for swapping native zkLTC, testing pool mechanics, and learning how liquidity moves on Litecoin’s EVM layer.</p>
            <div className="protocol-line"><span>AMM</span><span>x · y = k</span><span>FEE 0.30%</span></div>
          </div>
        </section>

        <section className="workbench" id="trade" aria-label="Trading workbench">
          <article className="trade-panel">
            <div className="panel-heading">
              <div>
                <span className="panel-index">01</span>
                <h2>Execution</h2>
              </div>
              <span className="testnet-tag">TESTNET ONLY</span>
            </div>

            <div className="mode-tabs" role="tablist" aria-label="Transaction type">
              {(['swap', 'add', 'remove', 'faucet'] as Mode[]).map((item) => (
                <button
                  key={item}
                  className={mode === item ? 'active' : ''}
                  type="button"
                  role="tab"
                  aria-selected={mode === item}
                  onClick={() => setMode(item)}
                >
                  {modeLabels[item]}
                </button>
              ))}
            </div>

            {mode === 'faucet' ? (
              <div className="faucet-panel">
                <p className="faucet-kicker">LITEFORGE TESTNET GAS</p>
                <h3>Fund your wallet with zkLTC.</h3>
                <p>Use the official LiteForge faucet to receive native zkLTC for gas and test transactions on chain 4441.</p>
                <div className="faucet-token-row">
                  <span className="faucet-token-icon">Ł</span>
                  <div><b>zkLTC</b><small>Native testnet asset</small></div>
                  <span className="ready-badge">AVAILABLE</span>
                </div>
                <a className="primary-action faucet-action" href={LITVM_FAUCET_URL} target="_blank" rel="noreferrer" onClick={() => addLog('Opening official LiteForge zkLTC faucet', 'success')}>
                  <span>Open official faucet</span><ExternalLink />
                </a>
                <div className="pending-token"><span>mUSD test token</span><b>CONTRACT PENDING</b></div>
                <p className="prototype-note">The faucet opens LiteForge Hub. Black Swap does not request or custody your funds.</p>
              </div>
            ) : (
              <>
                <div className="token-input">
                  <div className="input-meta"><span>{mode === 'remove' ? 'LP shares' : mode === 'add' ? 'Deposit' : 'You pay'}</span><span>Balance —</span></div>
                  <div className="amount-row">
                    <input aria-label="Input amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
                    <button type="button" className="token-select">{mode === 'remove' ? 'LP zkLTC/mUSD' : 'zkLTC'} <span>⌄</span></button>
                  </div>
                  <span className="fiat-value">Native gas token · LiteForge</span>
                </div>

                <button className="direction-button" type="button" aria-label="Reverse token direction"><ArrowDown /></button>

                <div className="token-input output-input">
                  <div className="input-meta"><span>{mode === 'add' ? 'Pair deposit' : mode === 'remove' ? 'Estimated assets' : 'You receive'}</span><span>Demo quote</span></div>
                  <div className="amount-row">
                    <output>{mode === 'remove' ? (numericAmount * 6.41).toFixed(2) : output.toFixed(2)}</output>
                    <button type="button" className="token-select">mUSD <span>⌄</span></button>
                  </div>
                  <span className="fiat-value">1 zkLTC = 84.22 mUSD · demo rate</span>
                </div>

                <div className="execution-details">
                  <div><span>Price impact</span><b className={priceImpact > 1 ? 'warning' : ''}>{priceImpact.toFixed(2)}%</b></div>
                  <div><span>Minimum received</span><b>{(output * (1 - Number(slippage) / 100)).toFixed(2)} mUSD</b></div>
                  <label><span>Slippage tolerance</span><span className="slippage"><input value={slippage} onChange={(event) => setSlippage(event.target.value)} aria-label="Slippage tolerance" />%</span></label>
                </div>

                <button className="primary-action" type="button" onClick={runDemoAction} disabled={busy}>
                  <span>{actionLabel}</span><span aria-hidden="true">↗</span>
                </button>
                <p className="prototype-note">Preview only — mUSD and Black Swap pool contracts are not deployed yet.</p>
              </>
            )}
          </article>

          <aside className="telemetry" id="pool">
            <div className="panel-heading">
              <div><span className="panel-index">02</span><h2>Pool telemetry</h2></div>
              <span className="live-label demo"><span /> DEMO</span>
            </div>

            <div className="pair-heading">
              <div className="pair-symbol"><span>Ł</span><span>$</span></div>
              <div><h3>zkLTC / mUSD</h3><p>CONTRACT PENDING</p></div>
              <a href="https://liteforge.explorer.caldera.xyz" target="_blank" rel="noreferrer" aria-label="Open pool in explorer"><ExternalLink /></a>
            </div>

            <div className="metric-grid">
              <div><span>Total liquidity</span><strong>$2.10M</strong><small>+4.28% / 24H</small></div>
              <div><span>24H volume</span><strong>$481K</strong><small>1,284 swaps</small></div>
              <div><span>zkLTC reserve</span><strong>12,480</strong><small>49.8% of demo pool</small></div>
              <div><span>mUSD reserve</span><strong>1.05M</strong><small>50.2% of pool</small></div>
            </div>

            <div className="reserve-visual" aria-label="Demo pool reserve ratio: 49.8 percent zkLTC and 50.2 percent mUSD">
              <div><span>49.8%</span><b>zkLTC</b></div><div><span>50.2%</span><b>mUSD</b></div>
            </div>

            <div className="position-block">
              <div className="section-label"><span>Your position</span><b>{account ? 'CONNECTED' : 'NOT CONNECTED'}</b></div>
              <dl>
                <div><dt>LP share</dt><dd>{account ? '2.14%' : '—'}</dd></div>
                <div><dt>Position value</dt><dd>{account ? '$1,240.82' : '—'}</dd></div>
                <div><dt>Fees earned</dt><dd>{account ? '$18.44' : '—'}</dd></div>
              </dl>
            </div>
          </aside>
        </section>

        <section className="console" id="console" aria-labelledby="console-title">
          <div className="console-heading">
            <div><span className="panel-index">03</span><h2 id="console-title">Transaction console</h2></div>
            <span>SESSION / LOCAL</span>
          </div>
          <div className="log-list" aria-live="polite">
            {logs.map((log, index) => (
              <div className={`log ${log.tone}`} key={`${log.time}-${index}`}>
                <time>{log.time}</time><span>black@liteforge:~$</span><p>{log.message}</p>
              </div>
            ))}
            <div className="prompt-line"><span>black@liteforge:~$</span><i /></div>
          </div>
        </section>
      </main>

      <footer>
        <div><span>BLACK SWAP</span><b>v0.1.0</b></div>
        <div><span>NETWORK</span><b>LitVM LiteForge</b></div>
        <div><span>CHAIN ID</span><b>4441</b></div>
        <div><span>STATUS</span><b className="status-copy">PROTOTYPE</b></div>
      </footer>
    </div>
  )
}
