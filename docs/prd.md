# PRD: Capital-in-the-Loop

Version 0.1 | TOKEN2049 Origins Hackathon | Base Sepolia, main track
Items marked **(proposed)** are our additions on top of the team spec and must be confirmed by both of us.

## 1. Overview

An AI agent publishes an on-chain declaration, "my total spending will not exceed X in period T", and backs it with a bond in test USDC. If it overspends, anyone can prove it by comparing on-chain sums, and a penalty proportional to the overspend is burned.

### Goals
1. A working end-to-end demo of declare, bond, spend, overspend, flag, burn.
2. A vault that is immutable by design: no owner, no roles, no upgrades, exactly three outcomes (return, burn, nothing).
3. A one-screen UI that makes the mechanism obvious to someone new to blockchain in under a minute.

### Non-goals (v0)
- Full inclusion-proof coverage of every payment route (marked "in development").
- Real USDC, mainnet, external audit, governance, flagger rewards, multi-token support.

## 2. Personas

| Persona | Goal | Actions in the demo |
|---------|------|---------------------|
| Agent operator | Let the agent spend more without a human approving each payment | Mints test USDC, declares a limit, posts the bond, tops up |
| Flagger | Prove overspend and trigger the penalty | Presses "Flag violation" |
| Observer (judge, investor, API provider) | See which agents are actually backed | Reads the bond-weighted index and the explorer links |

## 3. Definitions

- **Declaration**: limit X and period length T, fixed per deposit.
- **Bond B**: test USDC locked in the vault.
- **Excess**: max(0, spent in period minus limit).
- **Penalty**: min(B, m x excess), burned. m is set per deposit, default 1.5 **(proposed)**.
- **Challenge window W**: time after a period ends during which a violation can still be flagged before the bond can be returned **(proposed, see TRD 4.4)**.
- **Secured volume**: min(spent, limit) while a bond is active. Everything else is unsecured and has weight zero.
- **Bond-weighted index**: share of each agent = its bond divided by total bonds, shown next to secured and unsecured volume **(proposed formula)**.

## 4. User stories and acceptance criteria

| ID | Story | Acceptance criteria |
|----|-------|---------------------|
| US-1 | As an operator I mint test USDC to my agent wallet | Balance increases, per-call mint cap enforced |
| US-2 | I declare a limit and post a bond | `Deposited` event emitted, bond locked, return address, verifier, limit, period fixed and shown in the UI |
| US-3 | I top up to raise my limit | New limit is at least the old one, bond increases, `ToppedUp` event |
| US-4 | I lower my limit | Change is only scheduled and takes effect at the next period boundary, UI shows it as pending |
| US-5 | My agent spends and I watch usage | Spend is recorded per period, gauge updates within a few seconds |
| US-6 | A flagger proves a violation | Works only when spent exceeds limit, burns min(B, m x excess), emits `Flagged` and `Slashed`, shows a Basescan link, repeating without new excess does nothing |
| US-7 | When the period and window end, the bond returns | Anyone can trigger release, funds go only to the return address fixed at deposit |
| US-8 | An observer reads the index | Agents without a bond, and spend above the limit, show weight zero |
| US-9 | Anyone verifies on-chain | Each action links to the transaction on Basescan |

## 5. Features

| Priority | Feature |
|----------|---------|
| P0 | MockUSDC (public mint with cap, burnable) |
| P0 | BondVault: deposit, topUp, release, slash |
| P0 | VerifierV0: pay (records spend) and flag (computes excess, commands burn) |
| P0 | Foundry scenario tests and the fuzzed invariant "funds never reach a third address" |
| P0 | Deploy scripts and verified contracts on Base Sepolia |
| P0 | One-screen demo: declaration panel, live spend gauge, flag button, burn link |
| P0 | Agent simulator script (spends, then overspends) |
| P1 | Scheduled limit decrease and period rollover |
| P1 | Bond-weighted index panel fed by an event indexer |
| P1 | Slither run and a short self-review checklist |
| P2 | Several seeded agents so the index looks alive |
| P2 | x402-style 402 payment wrapper around the simulator |
| P2 | Dune panel showing the market data from the BRD |

## 6. UX: one screen

Visual language is defined in `DESIGN.md` (Apple-based, with a project adaptation for status colors, the gauge and the burn moment).

- **Header**: network badge (Base Sepolia), wallet connect, links to contracts.
- **Left, Agent panel**: mint test USDC, declare form (limit, period, bond), top-up.
- **Center, Live usage**: gauge of spent versus limit, event feed (Spent, Flagged, Slashed, Returned).
- **Right, Flagger panel**: "Flag violation" button, computed excess and penalty preview, burn transaction link.
- **Bottom, Index**: table and bar chart of agents by bond, with unsecured volume greyed out at weight zero.

## 7. Demo script (3 minutes, screen recording)

Live demos on stage are not allowed, so record this and embed the video in the slides.

| Time | Step |
|------|------|
| 0:00 | Hook: agents spend real money and nothing backs their behavior |
| 0:15 | Index shows an unbonded agent with weight zero |
| 0:35 | Operator declares limit 100, bond 200, short period. `Deposited` on Basescan |
| 1:05 | Agent spends 60. Gauge at 60% |
| 1:25 | Agent spends 70. Total 130, gauge turns red |
| 1:45 | Flagger presses flag. Excess 30, penalty 1.5 x 30 = 45 burned. Basescan shows the burn |
| 2:20 | Index updates, bond now 155 |
| 2:35 | Second agent stays under its limit and its bond returns at period end |
| 2:50 | Roadmap: full inclusion proofs, "in development" |

Use short demo values (for example period 10 minutes, window 2 minutes) so the return path can be shown.

## 8. 36-hour plan and cut list

Window: kickoff 6 Oct 12:00 (GMT+8), submit by 23:59 on 7 Oct. Plan in blocks, adjust to real start time.

| Block | Phantom | Polina |
|-------|---------|--------|
| 0-2h | Repo, env, wallets (deployer, agent, flagger), freeze TRD | Freeze PRD and BRD, start data sourcing |
| 2-10h | MockUSDC, BondVault, scenario tests | Dune query, verified sources, slide skeleton |
| 10-18h | VerifierV0, fuzz invariant, deploy to Base Sepolia | Demo script, index formula check |
| 18-26h | Frontend one screen, indexer API | Agent simulator checks, copy and visuals |
| 26-31h | Integration, bug fixes, end-to-end run on Sepolia | Screen recording, write-up |
| 31-34h | Freeze code, README, verify contracts | Slides (.ppt or .keynote) with embedded video |
| 34-36h | Buffer and submit | Buffer and submit |

Never cut: vault, fuzzed invariant, flag and burn demo, slides, video, submission.
Cut in this order if behind: x402 wrapper, Dune panel, seeded agents, index chart (keep a table), period rollover UI, scheduled limit decrease.

## 9. Submission checklist

- [ ] Both of us are in the same BuilderBase team (submissions are team-only)
- [ ] Main track submitted first
- [ ] Public GitHub repo (or judge access) with README and docs
- [ ] Live project link (hosted frontend)
- [ ] Slides as .ppt or .keynote on Google Drive (Google Slides links are not accepted)
- [ ] Demo video embedded in the slides, not linked
- [ ] Every number on slides has a source
- [ ] Nothing changes after the deadline, so freeze early

## 10. Open questions

1. Verifier v0 path: what exactly does the simplified path in the team spec say? Our proposal is in TRD 4.3.
2. Default m, period T, window W for the demo.
3. Final index formula.
4. Do we run a separate indexer or compute from logs on request (TRD 6)?