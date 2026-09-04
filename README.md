# Black Swap

Black Swap is a terminal-inspired AMM interface prototype for the LitVM LiteForge testnet. It is designed as a learning project for swap, liquidity, wallet, and pool-accounting flows.

## Current scope

- Responsive LiteForge Console interface
- MetaMask/Rabby-compatible wallet connection
- Automatic LitVM LiteForge network add/switch
- Familiar DEX flow using the `zkLTC / mUSD` pair
- Working link to the official LiteForge zkLTC faucet
- Constant-product quote preview (`x * y = k` with a 0.30% demo fee)
- Pool telemetry and local transaction console
- Explicit prototype safeguards: no approval or contract transaction is submitted yet

## Network

| Field | Value |
| --- | --- |
| Network | LitVM LiteForge |
| Chain ID | `4441` |
| Native token | `zkLTC` |
| RPC | `https://liteforge.rpc.caldera.xyz/http` |
| Explorer | `https://liteforge.explorer.caldera.xyz` |
| Faucet | `https://liteforge.hub.caldera.xyz` |

## Run locally

```bash
npm install
npm run dev
```

Build the production bundle:

```bash
npm run build
```

## Important

This repository currently contains an interactive frontend prototype. Pool values, balances, quotes, and positions are demo data. Contract execution is intentionally disabled until audited contract addresses and ABIs are added.

## Planned contract phase

1. Deploy the mock `mUSD` ERC-20 token.
2. Deploy an mUSD test-token faucet (native zkLTC already uses the official LiteForge faucet).
3. Deploy and test the Black Swap constant-product pool.
4. Replace demo telemetry with contract reads.
5. Enable approval, swap, add-liquidity, and remove-liquidity transactions.
