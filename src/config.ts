import { defineChain, getAddress, type Address } from 'viem'

export const liteforge = defineChain({
  id: 4441,
  name: 'LitVM LiteForge',
  nativeCurrency: { name: 'zkLTC', symbol: 'zkLTC', decimals: 18 },
  rpcUrls: { default: { http: ['https://liteforge.rpc.caldera.xyz/http'] } },
  blockExplorers: { default: { name: 'LiteForge Explorer', url: 'https://liteforge.explorer.caldera.xyz' } },
  testnet: true,
})

export const ROUTER_ADDRESS = getAddress('0xf2CA3a3A42136Fd103346914A37b30f3991315EA')
export const FACTORY_ADDRESS = getAddress('0x301D649fE86d5CAE665944B3C7942bF9f29B81Ca')
export const WRAPPED_ZKLTC_ADDRESS = getAddress('0xA13C8Ea8E4084AeEbcdb1B951dEDF2d641567ed0')
export const BLUSD_ADDRESS = getAddress('0xd333A14204007b9444739BF0AeF6C0562d919552')

export interface TokenConfig {
  symbol: string
  name: string
  address?: Address
  decimals: 18
  native?: boolean
}

export const TOKENS: TokenConfig[] = [
  { symbol: 'zkLTC', name: 'LiteForge zkLTC', decimals: 18, native: true },
  { symbol: 'BLUSD', name: 'Black USD', address: BLUSD_ADDRESS, decimals: 18 },
  { symbol: 'LITIUMDEX', name: 'LitiumDEX', address: getAddress('0xDdD1b31912b700E5962a3676F285e32212c7C035'), decimals: 18 },
  { symbol: 'MON', name: 'Monad', address: getAddress('0xa12C18847c41ECE267155ffAe112b8951AbbcA1C'), decimals: 18 },
  { symbol: 'HYPE', name: 'Hyperliquid', address: getAddress('0xBB3B44EB672650Fb4a1Cf6D9dc5d3b7494F333AB'), decimals: 18 },
]

export const tokenBySymbol = (symbol: string) => TOKENS.find((token) => token.symbol === symbol) ?? TOKENS[0]
export const routerAddressFor = (token: TokenConfig) => token.native ? WRAPPED_ZKLTC_ADDRESS : token.address!

