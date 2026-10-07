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

Only needed if the contracts change or the testnet deployment is lost. The addresses
above are the defaults in the backend, so nothing has to be configured to run against them.

1. In Remix, compile `MockUSDC.sol`, deploy it, copy the address. No minting is needed
   here. `npm run attack` checks the agent wallet's balance and mints what the run
   requires, because `mint` is open to anyone.
2. Compile `AEON.sol`. In the contract dropdown pick **BondVault**, not Verifier. Set the
   constructor argument `_token` to the MockUSDC address and deploy. The constructor
   deploys the verifier itself, so there is only one deployment to make.
3. Read `verifier()` on the deployed BondVault. That is the Verifier address. Open the
   BondVault deployment transaction on Basescan and note the block number it was mined in.
4. Write the four values into `backend/.env`:

      TOKEN=0x...        MockUSDC, used by npm run attack
      VAULT=0x...        BondVault
      VERIFIER=0x...     the address returned by verifier()
      START_BLOCK=...    block of the BondVault deployment transaction

      `server.js` reads `VAULT`, `VERIFIER` and `START_BLOCK` and rebuilds the whole state from
      that block on every start. It never reads `TOKEN`. A `START_BLOCK` lower than the real one
      only costs a few seconds of catching up. A higher one silently loses the events before it.

5. The recorded replay still carries the transaction hashes of the previous deployment, so
   its Basescan links point at contracts that no longer exist. To refresh them, run
   `npm run attack` to the end, then `npm run live` in one terminal and `npm run stamp` in another.

| `AEON_v1.sol` | `BondVaultV1` + `VerifierV1`. DRAFT, not deployed. A separate deployment, not an upgrade: v1 counts the agent's own EIP-3009 authorizations instead of routing payments through `pay()`. |
