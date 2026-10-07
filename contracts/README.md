# Contracts

| File | What |
|---|---|
| `AEON.sol` | `BondVault` (immutable, no owner) + `Verifier` v0. Deploy **only** `BondVault`; its constructor deploys the verifier. |
| `MockUSDC.sol` | Test token: ERC-20, 6 decimals, anyone can `mint`. Stands in for USDC on the testnet. |
| `test/` | Local test harness: compiles both files with solc and runs the full scenario on ganache. `npm install && npm test`. |

Solidity ^0.8.20, OpenZeppelin 5. Deployed from Remix (Injected Provider → MetaMask, Base Sepolia, chain ID 84532).

## Deployed (Base Sepolia)

| | Address | Block |
|---|---|---|
| MockUSDC | `0x1e66BE4dB904D011Ee40E9151E5F9727FEe7375B` | |
| BondVault | `0xD42d1CAAa7BD9979c68933D2faF97eb8691E2e4C` | `47755792` |
| Verifier | `0xE67348E67A62C5CF3d2943A7dDbF6781767601e0` | `47755792` |

## Interface

```
BondVault
  declare(limit, periodSeconds) -> id      lock K*limit; emits Declared
  linkWallet(id, wallet)                   another wallet counts toward the same limit
  topUp(id, amount)                        more bond -> higher limit; reverts if already over limit
  release(id)                              after periodEnd + CHALLENGE_WINDOW; returns remaining bond
  slash(id, excess)                        only the Verifier
  K = 1, M = 1, CHALLENGE_WINDOW = 600, BURN = 0x…dEaD

Verifier
  pay(id, to, amount)                      transfers token and counts it; wallet must be linked
  flag(id)                                 anyone; reverts unless spent > limit; then vault.slash(spent - limit)
  spent(id)                                running total
```

## Redeploy

1. Remix - compile `MockUSDC.sol` - deploy - copy address.
2. Compile `AEON.sol` → select **BondVault** in the contract dropdown → `_token` = MockUSDC address → deploy.
3. Read `verifier()` on the deployed BondVault → that is the Verifier address.
4. Put the three addresses and the deploy block into `backend/.env` (or update the defaults in `backend/server.js`).

| `AEON_v1.sol` | `BondVaultV1` + `VerifierV1`. DRAFT, not deployed. A separate deployment, not an upgrade: v1 counts the agent's own EIP-3009 authorizations instead of routing payments through `pay()`. |
