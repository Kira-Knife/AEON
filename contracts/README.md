# Contracts

| File | What |
|---|---|
| `AEON.sol` | `BondVault` (immutable, no owner) + `Verifier` v0. Deploy only `BondVault`. Its constructor deploys the verifier. |
| `AEON_v1.sol` | `BondVaultV1` + `VerifierV1`. **Deployed against Circle's USDC, not exercised end to end.** A separate deployment rather than an upgrade: v1 counts the agent's own EIP-3009 authorizations instead of routing payments through `pay()`. |
| `MockUSDC.sol` | Test token: ERC-20, 6 decimals, anyone can `mint`. Stands in for USDC on the testnet. |
| `test/` | Local test harness: compiles v0 with solc and runs the full scenario on ganache. `npm install && npm test`. `node compile_v1.cjs` compiles the v1 draft. |

Solidity ^0.8.20, OpenZeppelin 5. Deployed from Remix (Injected Provider with MetaMask, Base Sepolia, chain ID 84532).

## Deployed (Base Sepolia)

| | Address | Block |
|---|---|---|
| MockUSDC | `0x1e66BE4dB904D011Ee40E9151E5F9727FEe7375B` | |
| BondVault | `0xD42d1CAAa7BD9979c68933D2faF97eb8691E2e4C` | `47755792` |
| Verifier | `0xE67348E67A62C5CF3d2943A7dDbF6781767601e0` | `47755792` |

## Interface

```
BondVault
  declare(limit, periodSeconds) -> id      locks K*limit, emits Declared
  linkWallet(id, wallet)                   another wallet counts toward the same limit
  topUp(id, amount)                        more bond, higher limit. Reverts if already over limit
  release(id)                              after periodEnd + CHALLENGE_WINDOW, returns the remaining bond
  slash(id, excess)                        only the Verifier
  K = 1, M = 1, CHALLENGE_WINDOW = 600, BURN = 0x…dEaD

Verifier
  pay(id, to, amount)                      transfers the token and counts it. The wallet must be linked
  flag(id)                                 anyone. Reverts unless spent > limit, then calls vault.slash(spent - limit)
  spent(id)                                running total
```

## Redeploy

Only needed if the contracts change or the testnet deployment is lost. The addresses above are the defaults in the backend, so nothing has to be configured to run against them.

1. In Remix, compile `MockUSDC.sol`, deploy it, copy the address. No minting is needed here. `npm run attack` checks the agent wallet's balance and mints what the run requires, because `mint` is open to anyone.
2. Compile `AEON.sol`. In the contract dropdown pick **BondVault**, not Verifier. Set the constructor argument `_token` to the MockUSDC address and deploy. The constructor deploys the verifier itself, so there is only one deployment to make.
3. Read `verifier()` on the deployed BondVault. That is the Verifier address. Open the BondVault deployment transaction on Basescan and note the block number it was mined in.
4. Write the four values into `backend/.env`:

```
TOKEN=0x...        MockUSDC, used by npm run attack
VAULT=0x...        BondVault
VERIFIER=0x...     the address returned by verifier()
START_BLOCK=...    block of the BondVault deployment transaction
```

`server.js` reads `VAULT`, `VERIFIER` and `START_BLOCK` and rebuilds the whole state from that block on every start. It never reads `TOKEN`. A `START_BLOCK` lower than the real one only costs a few seconds of catching up. A higher one silently loses the events before it.

5. The recorded replay still carries the transaction hashes of the previous deployment, so its Basescan links point at contracts that no longer exist. To refresh them, run `npm run attack` to the end, then `npm run live` in one terminal and `npm run stamp` in another.

## Verifier v1 (draft)

v0 counts only payments routed through `Verifier.pay()`, so a transfer made straight from the agent's
wallet is invisible. v1 closes that for every x402-style payment: the agent's own EIP-3009 authorization
is the evidence. The verifier rebuilds the EIP-712 digest from the token's own domain separator, recovers
the signer with `ecrecover`, requires that wallet to be linked to the deposit, asks the token whether the
authorization was executed (`authorizationState(signer, nonce)`), records the nonce so one payment cannot
be counted twice, and adds the value to the running total. `flag()` is unchanged: pure arithmetic,
callable by anyone.

Versions are separate deployments, not upgrades. Each vault deploys and pins its own verifier in its
constructor, and both are immutable and ownerless. v1 runs beside v0 at new addresses, and no deposit
or bond moves between them.

### Token

v1 is deployed against Circle's own USDC on Base Sepolia, not against `MockUSDC`. The mock has no
EIP-3009, so `submit()` could never do its job there. Circle's token is a verified `FiatTokenProxy`
with 6 decimals and it exposes both functions v1 depends on, `DOMAIN_SEPARATOR()` and
`authorizationState(address,bytes32)`.

| | Address |
|---|---|
| USDC (Circle, Base Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| BondVaultV1 | `0x9E46Fb4E11C4019b524ccE4c9f4c8559DaAe0bBd` |
| VerifierV1 | read `verifier()` on the vault |

Test USDC comes from `https://faucet.circle.com`, which sends 20 USDC per address per chain every two
hours and needs no account. That cap sets the scale of a v1 run: a 5 USDC limit, not the 1000 of the v0
demo. Gas is Base Sepolia ETH and comes from a separate faucet.

### Deploy

1. In Remix, compile `AEON_v1.sol`. In the contract dropdown pick **BondVaultV1**, not VerifierV1. Set
   the constructor argument `_token` to the USDC address above and deploy. The constructor deploys the
   verifier itself.
2. Read `verifier()` on the deployed vault. That is the VerifierV1 address. Verify both on Basescan.
3. To put a live bond in it: `approve(vault, 5000000)` on the USDC contract, then `declare(5000000, 1800)`
   on the vault. 5000000 is 5 USDC at 6 decimals. The bond comes back with `release(id)` once the period
   and the 600 second challenge window have passed.

Check that it compiles:

```bash
cd test && npm install && node compile_v1.cjs
# BondVaultV1    9,142 bytes
# VerifierV1     4,561 bytes
```

Known limits of the v1 draft, stated plainly:

- A token records *that* an authorization was executed, never *when*. v1 therefore requires the
  signature's own validity window to sit inside the declared period. An agent that signs with a wider
  window is not counted. That gap has to close before this is more than a draft.
- A plain `transfer()` is still invisible. That needs the receipt path, which is out of scope here.
- No authorization has been pushed through `submit()` on a live network yet. The path is written and it
  compiles, and the token it points at supports every call it makes, but the end to end run against
  Circle's USDC is not done. Treat the evidence path as unproven.
- Cost is roughly 30k gas per payment: `ecrecover`, the external call for the authorization state, and
  the nonce write. Unaudited.
