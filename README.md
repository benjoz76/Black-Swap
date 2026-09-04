# Black Swap

Black Swap is a transaction-enabled AMM workbench for the LitVM LiteForge testnet. The interface can create/fund pools, swap assets, add or remove liquidity, claim BLUSD from a separately deployed faucet, and clean up token allowances after execution.

## Live features

- MetaMask/Rabby-compatible wallet connection and disconnect
- Automatic LitVM LiteForge network add/switch
- Live balances and direct router quotes
- Native zkLTC ↔ ERC-20 and ERC-20 ↔ ERC-20 swaps
- Pool creation through the first add-liquidity transaction
- Add and remove liquidity
- Exact-amount approvals instead of unlimited allowances
- Automatic `approve(router, 0)` cleanup when an allowance remains
- BLUSD-only faucet with a fixed 250 BLUSD / 24-hour rule
- On-chain pool reserves, LP supply, and connected-wallet LP balance

Every write requires confirmation in the connected wallet. Testnet assets have no monetary value.

## Network and execution contracts

| Field | Value |
| --- | --- |
| Network | LitVM LiteForge |
| Chain ID | `4441` (`0x1159`) |
| Native token | `zkLTC` |
| RPC | `https://liteforge.rpc.caldera.xyz/http` |
| Explorer | `https://liteforge.explorer.caldera.xyz` |
| Native faucet | `https://liteforge.hub.caldera.xyz` |
| Wrapped zkLTC | `0xA13C8Ea8E4084AeEbcdb1B951dEDF2d641567ed0` |
| DEX Factory | `0x301D649fE86d5CAE665944B3C7942bF9f29B81Ca` |
| DEX Router | `0xf2CA3a3A42136Fd103346914A37b30f3991315EA` |
| BLUSD Faucet | `0x50C4f7f402f93A64dc63DBE4EE4F126C98D96051` |

The Factory, Router, and wrapped-native addresses are the source-pinned LiteForge deployment published by Lester Labs. Black Swap is an independent interface and does not own those contracts.

## Token registry

| Token | Address |
| --- | --- |
| BLUSD | `0xd333A14204007b9444739BF0AeF6C0562d919552` |
| LITIUMDEX | `0xDdD1b31912b700E5962a3676F285e32212c7C035` |
| MON | `0xa12C18847c41ECE267155ffAe112b8951AbbcA1C` |
| HYPE | `0xBB3B44EB672650Fb4a1Cf6D9dc5d3b7494F333AB` |

All registered tokens report 18 decimals. MON and HYPE are third-party testnet contracts; inclusion in the selector is not an endorsement or security guarantee.

## Run locally

```bash
npm install
npm run dev -- --host 0.0.0.0
```

Open the forwarded Vite port (normally `5173`). The browser must have an injected EVM wallet such as MetaMask or Rabby.

Production check:

```bash
npm run build
```

## Deploy and fund the BLUSD faucet

The deployed faucet is already configured in the frontend at `0x50C4f7f402f93A64dc63DBE4EE4F126C98D96051`. The claim amount and cooldown cannot be changed by an admin. It must hold BLUSD before claims can succeed.

1. Open the contract in Remix and compile with Solidity `0.8.20` or newer.
2. Select **Injected Provider** and confirm LiteForge chain `4441`.
3. Deploy `BLUSDFaucet` using the BLUSD address below as the constructor argument:

   ```text
   0xd333A14204007b9444739BF0AeF6C0562d919552
   ```

4. Transfer BLUSD from the deployer wallet to the newly deployed faucet contract.
5. Open Black Swap → **Faucet** and claim directly. The deployed address is pinned in the frontend configuration.

## First pool transaction

No registered pair existed in the configured factory when this integration was prepared. Open **Add liquidity**, choose a pair, enter both amounts, and confirm the approval plus add-liquidity transactions. The first deposit creates the pair and defines its starting price. After confirmation, the Swap tab will return a live quote.

Recommended initial pairs:

- `zkLTC / BLUSD`
- `LITIUMDEX / BLUSD`
- `MON / BLUSD`
- `HYPE / BLUSD`

For existing pools, Black Swap automatically calculates the second deposit from the current reserve ratio.

## Approval behavior

ERC-20 inputs are approved only for the requested amount. If the router leaves any allowance after a successful transaction, Black Swap asks for an additional wallet confirmation to revoke it to zero. Native zkLTC does not require approval.

Auto-revoke reduces lingering allowances but does not make unknown token or router contracts inherently safe. Review every wallet confirmation before signing.
