# TRD: Capital-in-the-Loop

Version 0.1 | Solidity on Base Sepolia (chain id 84532) | Owner: Phantom
Everything here is a draft written from the team's short Solidity brief (V.1, 27 Aug). The detailed interface spec mentioned in that brief was not in the file we received, so sections marked **(proposed)** must be reconciled with the original spec.

## 1. Architecture

```
Agent wallet --approve--> VerifierV0 --pay(id,to,amt)--> merchant
                              |  records spent[id][period]
Flagger --flag(id)----------->|  excess = spent - limit
                              v
                          BondVault --token.burn(penalty)   (outcome 2)
                              |-----token.transfer(returnTo) (outcome 1, release)
                              '----nothing                   (outcome 3)
Events (Vault + Verifier + MockUSDC) --> indexer (Next.js API) --> one-screen UI
```

Two main contracts plus the mock token. VerifierV0 doubles as the spend meter so we stay at two core contracts.

## 2. Stack

| Layer | Choice |
|-------|--------|
| Contracts | Solidity 0.8.x, OpenZeppelin (ERC20, ERC20Burnable, SafeERC20, ReentrancyGuard) |
| Tooling | Foundry (forge test, fuzz, invariant, script), Slither |
| Frontend | Next.js App Router, TypeScript, Tailwind, wagmi + viem, Recharts |
| Indexer | Next.js API route reading logs with viem |
| Infra | Alchemy RPC (Base Sepolia), Basescan verification, Vercel hosting |

## 3. Repo structure (single repo)

```
capital-in-the-loop/
├── README.md
├── DESIGN.md             # UI design system (Apple-based, plus our project adaptation)
├── .env.example
├── docs/                 # BRD.md, PRD.md, TRD.md, BACKEND.md
├── contracts/            # Foundry project
│   ├── src/              # MockUSDC.sol, BondVault.sol, VerifierV0.sol
│   ├── test/             # scenario tests, handler, invariant tests
│   ├── script/           # Deploy.s.sol
│   └── foundry.toml
├── web/                  # Next.js app
│   ├── app/              # page.tsx and api/state/route.ts
│   ├── components/       # DeclarationPanel, UsageGauge, EventFeed, FlaggerPanel, IndexTable
│   └── lib/              # abis, wagmi config, indexer, index math
└── scripts/              # agent-sim.ts and helpers
```

## 4. Contracts

### 4.1 MockUSDC
ERC-20, 6 decimals, ERC20Burnable. Public `mint(to, amount)` with a per-call cap (for example 1,000 USDC). Testnet only. Vault burns by calling `burn(penalty)` on its own balance, so total supply visibly drops on the explorer.
Note: real USDC cannot be burned by a holder. On a real token the burn would be a transfer to a dead address, which must then be documented as the single allowed non-return outflow.

### 4.2 BondVault

```solidity
struct Deposit {
    address agent; address returnTo; address verifier;   // fixed at deposit
    uint256 bond; uint256 limit; uint256 pendingLimit;   // pendingLimit 0 = none
    uint64 periodStart; uint64 periodLength; uint64 challengeWindow;
    uint32 mBps;            // penalty multiplier, 10_000 = 1.0x
    uint64 periodIndex;     // current period counter
    uint256 slashedExcess;  // excess already punished in current period
    bool closed;
}
function deposit(address returnTo, address verifier, uint256 amount, uint256 limit,
                 uint64 periodLength, uint64 challengeWindow, uint32 mBps) external returns (uint256 id);
function topUp(uint256 id, uint256 amount, uint256 newLimit) external;      // agent only, newLimit >= limit
function scheduleLimitDecrease(uint256 id, uint256 newLimit) external;      // agent only, applies at rollover
function rollover(uint256 id) external;   // agent only, after period end + window, applies pendingLimit
function release(uint256 id) external;    // anyone, after period end + window, bond to returnTo only
function slash(uint256 id, uint64 periodIndex, uint256 totalExcess) external; // verifier only
function currentPeriod(uint256 id) external view returns (uint64 index, uint64 start, uint64 end, uint256 limit);
```

Rules
- No owner, roles, proxy or upgrade. Token address is immutable.
- `slash`: `penalty = min(bond, (totalExcess - slashedExcess) * mBps / 10_000)`. Update state first, then `token.burn(penalty)`. Incremental, so calling again with the same excess does nothing and further overspend is punished once.
- `release` is permissionless so the default path needs nobody's decision. It requires `now >= periodEnd + challengeWindow`.
- Lowering the limit is only scheduled, and takes effect at `rollover`.

Events (indexer spec **proposed**)
```
Deposited(uint256 indexed id, address indexed agent, address returnTo, address verifier,
          uint256 amount, uint256 limit, uint64 periodStart, uint64 periodLength,
          uint64 challengeWindow, uint32 mBps)
ToppedUp(uint256 indexed id, uint256 amount, uint256 newBond, uint256 newLimit)
LimitDecreaseScheduled(uint256 indexed id, uint256 newLimit)
PeriodRolled(uint256 indexed id, uint64 periodIndex, uint256 limit, uint64 periodStart)
Slashed(uint256 indexed id, uint64 periodIndex, uint256 newExcess, uint256 penalty, uint256 bondLeft)
Returned(uint256 indexed id, address indexed to, uint256 amount)
```

### 4.3 VerifierV0 (proposed)
The brief says v0 uses a "simplified verification path fixed in the spec" but does not say which. A contract cannot read past ERC-20 transfers, so on-chain sums need a meter. Proposal: the verifier is also the payment router.

- `pay(id, to, amount)`: only the deposit's agent. Does `transferFrom(agent, to, amount)` and adds to `spent[id][periodIndex]`. It never blocks overspend, because the point is economic consequence, not prevention.
- `flag(id)`: anyone. Reads limit and period from the vault, `totalExcess = max(0, spent - limit)`, requires something to punish, calls `vault.slash(id, periodIndex, totalExcess)`.
- Events: `Spent(id, periodIndex, to, amount, periodTotal)` and `Flagged(id, periodIndex, spent, limit, excess, flagger)`.

Known gap: payments made outside the router are invisible. That is exactly the inclusion-proof work the brief marks as "in development", so say it openly. Fallback if time runs out: a verifier that takes a signed attestation, but that is an oracle and contradicts the "no oracle" claim, so only use it with a clear label.

### 4.4 Challenge window (proposed, important)
If the bond can be returned the instant a period ends, an agent can overspend and call `release` in the same block before any flagger reacts. Fix: `release` and `rollover` require `periodEnd + challengeWindow`, and `slash` is allowed until that moment. For the demo use short values (period 10 min, window 2 min).

### 4.5 Edge cases
Rounding down on penalty. Zero amounts, zero addresses and `mBps` above a sane maximum revert. CEI order and `nonReentrant` on all state-changing functions. Fee-on-transfer tokens unsupported. Penalty capped at bond. One deposit per id, many deposits per agent allowed.

## 5. Evaluation of the team Solidity brief

| Item in the brief | Verdict | Note |
|-------------------|---------|------|
| Vault with exactly three outcomes | Fits | Matches the design diagram |
| Return address fixed at deposit, verifier fixed per deposit | Fits | Needs a deposit id, since verifier is per deposit |
| Limit up by top-up, down only at period boundary | Fits, needs detail | Requires pendingLimit and a rollover step (4.2) |
| Return as default path with nobody's decision | Needs a change | Unsafe without a challenge window (4.4) |
| Verifier v0 "simplified path" | Undefined | Spec not in the file. Our proposal in 4.3 |
| Mock USDC | Fits | Add public capped mint and burn |
| Foundry scenario tests and fuzzed invariant | Fits | Test list in section 9 |
| Slither and Sepolia deploy scripts | Fits | Base Sepolia, not Ethereum Sepolia |
| External review as a mandatory gate | Not feasible in 36 hours | Replace with Slither, fuzzing and the self-review checklist |
| Timeline: contracts 15-30 Sep, integration to 6 Oct | Conflicts with hackathon rules | Code before kickoff is ineligible. Write everything from zero after kickoff |
| Environment prep (3 wallets, Base Sepolia, RPC key) | Fits | Wallet roles in section 10 |

## 6. Indexer and index math

Full backend spec (indexer rules, shared JSON contract, feed text, replay, resilience) lives in `docs/BACKEND.md`. Summary:

- Stateless indexer inside the Next.js app: `/api/state` reads logs with viem from `DEPLOY_BLOCK`, reduces them in memory and caches for a few seconds. Vercel has no persistent disk, so no SQLite.
- Two spend totals: `spentVerified` from VerifierV0 events (slashable on-chain) and `spentObserved` from USDC Transfers of linked wallets (display only). Bond deposits and top-ups are not spending.
- One reducer for live and replay, so a recorded run can be served through the same code path as a fallback.
- Index (proposed): `secured_i = min(spent_i, limit_i)` while a bond is active, `unsecured_i = spent_i - secured_i` plus all volume of agents without a bond, `share_i = bond_i / sum(bond)`. Unsecured volume has weight zero.

## 7. Frontend
wagmi config with `baseSepolia`. Components per PRD section 6. Visual rules (tokens, status colors, gauge, burn moment) come from `DESIGN.md` at the repo root. Define its tokens as CSS variables in Tailwind, never inline hex, and use Inter through `next/font` on non-Apple platforms. Every transaction hash links to `https://sepolia.basescan.org/tx/<hash>`. The wallet UI signs with MetaMask for operator and flagger actions.

## 8. Agent simulator
`scripts/agent-sim.ts` (viem, key from `AGENT_PK`): approves the verifier, then calls `pay` in steps. Modes: `--within` (stays under the limit) and `--overspend` (crosses it). The demo's "agent" is this script.

## 9. Testing

Scenario tests (Foundry)
- default return after period and window
- release blocked during the challenge window
- slash burns `min(bond, m x excess)` and reduces total supply
- slash is incremental and idempotent
- slash only from the fixed verifier
- top-up raises bond and limit
- limit decrease applies only at rollover
- release sends only to `returnTo`

Invariants (handler with fuzzed actors and time warps)
1. `token.balanceOf(vault) == sum of deposit bonds`
2. Outflows are only releases to `returnTo` and burns. Ghost variables show no other address gains tokens through the vault
3. `deposited + topped up == returned + burned + remaining`
4. Penalty never exceeds bond
5. Limit never decreases outside rollover

Config: fuzz runs 1000, invariant runs 256, depth 50. Run `slither .` in `contracts/` and fix or document findings.

## 10. Environment and deploy

Wallets (testnet only, never commit keys): **deployer** (deploys contracts), **agent** (posts bond, approves verifier, spends), **flagger** (calls `flag`).

`.env.example`
```
BASE_SEPOLIA_RPC_URL=
DEPLOYER_PK=
AGENT_PK=
FLAGGER_PK=
BASESCAN_API_KEY=
NEXT_PUBLIC_VAULT_ADDRESS=
NEXT_PUBLIC_VERIFIER_ADDRESS=
NEXT_PUBLIC_TOKEN_ADDRESS=
DEPLOY_BLOCK=
```

Commands
```
forge test -vvv
forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify
```

## 11. Security notes and limits
- Testnet only, mock token, no real funds.
- Spend is only measured through VerifierV0. Off-router payments are not covered in v0.
- Burn implemented via token `burn`. A real token needs a dead-address transfer.
- Flagger has no reward in v0, so liveness depends on someone caring. Roadmap item.
- No external audit. We rely on fuzzing, Slither and review by both teammates.