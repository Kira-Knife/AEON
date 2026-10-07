# ÆON

Bonded spending limits for AI agents.

An agent declares a spending limit X for a period and locks a bond. Payments go through a verifier contract
that keeps the running total. If the total exceeds X, anyone can call `flag()`. The contract re-checks the total
and burns the excess from the bond. No judge, oracle or administrator is involved.

Built at TOKEN2049 Origins (Singapore, 6 to 8 October 2026). Deployed on Base Sepolia (testnet). No real funds.

## The problem

AI agents already make payments through x402 and similar protocols. Nothing economic backs their behaviour:

- Reputation has no cost. A new agent identity is free, and registry scores can be gamed without putting capital at risk.
- Spending policies are not verifiable. Caps live in config files or provider dashboards, so a counterparty cannot rely on them.
- Manual approval does not scale. A common setup is a hard cap plus human approval above a threshold, which removes the automation the agent exists for.

## The mechanism

| Step | What happens | On chain |
|---|---|---|
| Declare | The agent publishes limit X for a period and locks bond = K·X | `BondVault.declare(limit, period)` emits `Declared` |
| Spend | Payments go through the verifier, which keeps the running total | `Verifier.pay(id, to, amount)` emits `Payment` |
| Prove | Anyone compares the total to X. If total > X, `flag()` succeeds. Otherwise it reverts | `Verifier.flag(id)` emits `Violation` |
| Burn | The vault burns M·excess from the bond to `0x…dEaD`. There is no beneficiary, so flagging gives no reward | `BondVault.slash` emits `Slashed` |
| Release | After the period plus a challenge window, the remaining bond goes back to the agent | `BondVault.release(id)` emits `Released` |

Demo parameters: K = 1, M = 1, challenge window = 10 min.

Ranking. The demo ranks agents by `bond_weight`: `min(bond, X)` for a secured agent, `0` for an unsecured agent,
the remaining bond after a penalty. An agent without a bond has zero weight regardless of its reputation score.

## Contracts (Base Sepolia, chain ID 84532)

| Contract | Address |
|---|---|
| MockUSDC (test token, 6 decimals, free mint) | [`0x1e66BE4dB904D011Ee40E9151E5F9727FEe7375B`](https://sepolia.basescan.org/address/0x1e66BE4dB904D011Ee40E9151E5F9727FEe7375B) |
| BondVault (immutable, no owner) | [`0xD42d1CAAa7BD9979c68933D2faF97eb8691E2e4C`](https://sepolia.basescan.org/address/0xD42d1CAAa7BD9979c68933D2faF97eb8691E2e4C) |
| Verifier v0 (deployed by the vault) | [`0xE67348E67A62C5CF3d2943A7dDbF6781767601e0`](https://sepolia.basescan.org/address/0xE67348E67A62C5CF3d2943A7dDbF6781767601e0) |
| Deploy block | `47755792` |

Source: [`contracts/AEON.sol`](contracts/AEON.sol) (BondVault and Verifier), [`contracts/MockUSDC.sol`](contracts/MockUSDC.sol).

## Repository

```
contracts/      AEON.sol (BondVault and Verifier v0), MockUSDC.sol, local test harness
backend/        indexer (polls Base Sepolia, serves GET /state and GET /events), replay mode, attack script
frontend/       demo page: ranking (legacy and bond-weighted), vault card, event feed
docs/           specs (contracts, backend, frontend), hackathon plan, Verifier v1 design, roadmap
```

## How to run

Backend (Node 18 or newer):

```bash
cd backend
npm install
npm run live      # polls Base Sepolia every 2.5 s, serves http://localhost:8787
npm run replay    # offline: replays a recorded run on the same endpoints, started by act 3 on the page
```

Check `http://localhost:8787/state` and `http://localhost:8787/events?since=0`. There is no database. On restart
the indexer rebuilds the state from the deploy block. Details in [`backend/README.md`](backend/README.md).

Attack scenario (what the live demo shows): mint, approve, declare 1000 USDC for 30 min, pay 12, 240 and 760,
then `flag()` from a second wallet. Result: 12 USDC burned, 988 remain.

```bash
cd backend
cp .env.example .env        # put two TEST wallet keys in, never commit it
npm run attack
```

Every transaction is printed with its Basescan link.

Frontend: `frontend/index.html`, one static file, no build step. With the backend running, open
http://localhost:8787/ (the backend serves the page). The page picks its data source in this order:
`?api=https://…`, then the same origin, then `http://localhost:8787`. If no backend answers, it plays a bundled
recording of a real run, so the page also works when opened from disk or from static hosting. `?mock=1` forces
the recording. Keys 1, 2 and 3 switch the acts. Act 3 starts the attack. In live mode the attack is produced by
`npm run attack`.

Contract tests (local chain, no testnet needed):

```bash
cd contracts/test
npm install
npm test
```

Covers: flag before overspend reverts, pay from an unlinked wallet reverts, topUp after overspend reverts,
slash by a stranger reverts, second flag reverts, early release reverts, and the full declare, pay, flag, burn,
release path with the exact demo numbers. Also checks that the backend ABI decodes every emitted event.

## Demo

Three acts on one screen:

1. Legacy: the ranking by reputation score, as registries rank agents today.
2. Bond-weighted: the same agents ranked by `bond_weight`. Agents without a bond get zero weight.
3. Live attack: an agent declares a 1000 USDC limit, spends 1012, a second wallet calls `flag()`, 12 USDC are burned on chain. Every number links to Basescan.

## Limitations

- Verifier v0 counts only payments routed through `Verifier.pay()`. A payment made directly from the agent's wallet
  is not counted. This is the shortest path to a provable burn today. It is not the target design.
- Verifier v1 closes that gap: the agent's own EIP-3009 signature is the evidence. The verifier recovers the signer
  with `ecrecover`, asks USDC `authorizationState(signer, nonce)` whether the authorization was executed, sums the
  amounts and slashes. No Merkle proofs, no trust in a facilitator, about 30k gas per payment. This covers every
  x402 payment. A plain `transfer()` still needs the receipt path. v1 is written, compiles and is deployed on Base
  Sepolia against Circle's USDC, but no authorization has been pushed through it end to end yet. Addresses and the
  known limits are in [`contracts/README.md`](contracts/README.md).
  Design note: [`docs/AEON_Verifier_v1_RU.docx`](docs/AEON_Verifier_v1_RU.docx).
- v0 runs on a test token. All contracts are unaudited. Do not deploy to Base mainnet in this state.
- The legacy scores in act 1 are a sample registry, not a live ERC-8004 feed.

## Roadmap

1. Verifier v1 end to end: push a real EIP-3009 authorization through `submit()` on Base Sepolia and slash on it. Versions are separate deployments, not upgrades: each vault deploys and pins its own verifier, both immutable, no owner. v1 runs beside v0 at its own addresses.
2. Chainlink CRE: a workflow watches spending and calls `flag()` automatically, so no human flagger is on the critical path.
3. Hosting: backend and page on a server with a production RPC key, so the stand works without a laptop.

## Team

- Polina Lanina: mechanism, contracts, backend, specs, demo script, deck. [github.com/Kira-Knife](https://github.com/Kira-Knife)
- Wayan: landing page and demo page UI.

## Tooling

AI assistants (Claude) were used for code drafting and documentation. The mechanism, the specifications, the
research and every design decision are the authors' own, and the authors reviewed, deployed and tested everything
that shipped. The full treatment of the mechanism is in the preprint on capital-in-the-loop.
