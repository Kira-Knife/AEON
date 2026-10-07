# BACKEND: Capital-in-the-Loop

Version 0.1 | Owner: Phantom (indexer and API), Polina (JSON contract review, registry snapshot, replay recording)
Related: TRD section 6 (summary), PRD section 6 (screen), DESIGN.md (UI rules)
Items marked **(proposed)** are our draft and must be agreed by everyone who touches the JSON.

## 1. Purpose

The backend turns on-chain events into one stable JSON feed for the single demo screen, and keeps the demo alive for the whole event. It has three jobs:
1. Index spending and contract events on Base Sepolia.
2. Serve a shared JSON contract (snapshot, payments, human-readable feed, index).
3. Replay a recorded run through the same code path as the live run, as a built-in fallback.

Non-goals: database, authentication, WebSocket, multi-chain, anything that decides penalties. The backend only observes. Penalties come from contract arithmetic.

## 2. Architecture

```
Base Sepolia                         Backend (inside the Next.js app)                   Front end
 BondVault events ----+                                                                  
 VerifierV0 events ---+--> LiveSource ---+                                            
 MockUSDC Transfers --+                  +--> normalize --> reducer --> snapshot --> /api/state --> demo screen
 recorded run (JSON) ---> ReplaySource --+                     ^
                                                    registry.json (from Polina)
```

One reducer serves both sources. Live and replay differ only in where the normalized events come from, so the front end sees identical JSON in both modes.

## 3. Data sources

| Source | Events | Used for |
|--------|--------|----------|
| BondVault | Deposited, ToppedUp, LimitDecreaseScheduled, PeriodRolled, Slashed, Returned | Declarations, bonds, limits, periods, outcomes |
| VerifierV0 | Spent, Flagged | Verified spend (what the contract can slash), violation flags |
| MockUSDC | Transfer | Observed spend from linked wallets, including payments outside the router |
| registry.json | static snapshot | Labels and extra volume for the bond-weighted index |

Linked wallets are derived automatically from `Deposited.agent`. Extra addresses may be added through `LINKED_WALLETS`.

## 4. Indexer rules

1. **Cursor and chunks**: read logs from `DEPLOY_BLOCK` to latest. If the RPC limits log ranges, request in chunks. Dedupe by `(txHash, logIndex)`.
2. **Timestamps**: Transfer logs carry no time. Fetch each unique block's timestamp once and cache it.
3. **What counts as observed spend**: a Transfer whose `from` is a linked wallet. Exclude:
   - `to` is the vault (bond deposit and top-up are not spending)
   - `to` is another linked wallet (self-transfers)
   - mints (`from` is the zero address) and burns (`to` is the zero address)
4. **Per-period totals**: assign each payment to the agent's period using the block timestamp and the period window from the vault. Reset totals when `PeriodRolled` fires.
5. **Two totals per agent**: `spentVerified` (from VerifierV0 `Spent`, slashable on-chain) and `spentObserved` (from Transfers, display only). If observed exceeds the limit but verified does not, show the violation as "not provable on-chain in v0". This is the router gap from TRD 4.3, shown honestly.
6. **Status (proposed)**:
   - `unsecured`: no active deposit, or phase is returned or closed
   - `violated`: `spentObserved > limit` in the current period
   - `secured`: otherwise
   Usage warning at 80% is derived by the front end from `usagePct` (see DESIGN.md).
7. **Phase**: `active` (before period end), `challenge` (period ended, window open), `returned`, `closed`.

## 5. API (shared JSON contract, proposed)

Polling only, every 2 seconds. Vercel serverless does not support WebSocket.

| Endpoint | Purpose |
|----------|---------|
| `GET /api/state?mode=live` | Full snapshot from chain |
| `GET /api/state?mode=replay&t=<ms>` | Snapshot of the recorded run at elapsed time `t` |
| `GET /api/health` | `{ mode, block, rpcOk, lagSec, stale }` |

Amounts are base-unit integer strings (USDC has 6 decimals). Timestamps are unix seconds.

```ts
type Status = "unsecured" | "secured" | "violated";
type Phase  = "active" | "challenge" | "returned" | "closed";

interface Snapshot {
  meta: { mode: "live" | "replay"; chainId: 84532; decimals: 6; block: number;
          seq: number; generatedAt: number; replayT?: number; stale?: boolean };
  agents: Agent[];
  payments: Payment[];
  feed: FeedItem[];
  index: IndexRow[];
}
interface Agent {
  address: string; label?: string; depositId: string | null;
  limit: string; pendingLimit: string | null; bond: string;
  periodIndex: number; periodStart: number; periodEnd: number; challengeEnd: number;
  spentVerified: string; spentObserved: string; usagePct: number;
  excess: string; penaltyPreview: string;      // min(bond, m * excess)
  provableOnChain: boolean;                    // spentVerified > limit
  status: Status; phase: Phase; slashed: boolean;
}
interface Payment {
  txHash: string; logIndex: number; ts: number; from: string; to: string;
  amount: string; route: "verifier" | "direct"; counted: boolean;
}
interface FeedItem {
  seq: number; ts: number; kind: string; agent: string;
  text: string; txHash?: string; explorerUrl?: string;
}
interface IndexRow {
  address: string; label?: string; bond: string; share: number;  // bond / total bonds
  secured: string; unsecured: string; weight: number;           // unsecured weight is 0
}
```

Field names and shapes must be agreed with Polina and the front end before coding starts.

## 6. Human-readable feed

| Kind | Example text |
|------|--------------|
| Deposited | "Agent 0xAB..12 declared a limit of 100 USDC per 10 min and posted a 200 USDC bond" |
| Payment | "Agent paid 60 USDC to 0xCD..34 (60% of limit)" |
| Limit crossed | "Agent exceeded its limit by 30 USDC" |
| Flagged | "Violation flagged by 0xEF..56: excess 30 USDC" |
| Slashed | "45 USDC of the bond was burned" with the Basescan link |
| Returned | "Bond of 200 USDC returned to 0x..." |

"Limit crossed" is generated by the reducer when observed spend first passes the limit in a period.

## 7. Replay and resilience

**Normalized events.** Both sources emit `{ seq, t, kind, ...payload }`. Live uses block time as `t`. A recorded run stores `t` as milliseconds since its first event.

**Recording.** `scripts/record-run.ts` runs once during a successful real run and writes `web/data/replay/run-001.json`. The file must come from a run made during the 36 hours.

**Replay.** `/api/state?mode=replay&t=...` feeds all events with `t` at or below the requested time into the same reducer. The front end owns the replay clock, so the server stays stateless.

**Switching with no pause.** The front end holds the mode. It swaps the query string and keeps rendering the same schema. Auto-fallback: after 3 failed live polls, flip to replay and show a small "replay" badge.

**Stability for 36 hours**
- Cache snapshots for 3 seconds and dedupe in-flight requests.
- Primary RPC (Alchemy) plus a public Base Sepolia fallback RPC. On total failure serve the last good snapshot with `stale: true`.
- Keep demo values short (period 10 min, window 2 min) so the full story fits in a recording.
- No database, so nothing to corrupt. Redeploy is safe.

## 8. Code layout

```
web/
├── app/api/state/route.ts     # mode switch, caching, health
├── app/api/health/route.ts
├── lib/indexer/
│   ├── types.ts               # contract above
│   ├── source-live.ts         # getLogs, timestamps, filtering rules
│   ├── source-replay.ts       # reads run-001.json
│   ├── reducer.ts             # events -> Snapshot
│   ├── feed.ts                # text for each kind
│   └── index-math.ts          # secured, unsecured, share
└── data/
    ├── registry.json          # from Polina
    └── replay/run-001.json    # recorded in the hackathon window
scripts/record-run.ts
```

## 9. Environment

```
BASE_SEPOLIA_RPC_URL=
BASE_SEPOLIA_RPC_FALLBACK=
VAULT_ADDRESS=
VERIFIER_ADDRESS=
TOKEN_ADDRESS=
DEPLOY_BLOCK=
LINKED_WALLETS=            # optional, comma separated
```

## 10. Testing

- Reducer fixtures: deposit, spends, crossing the limit, flag, slash, period end, return.
- Filter tests: bond deposit and top-up are not counted as spend, self-transfers and mints are ignored.
- Parity test: replay at `t = infinity` equals live for the same events.
- Idempotence: feeding the same logs twice produces the same snapshot.
- Manual: kill the RPC and confirm the front end falls back to replay.

## 11. Registry snapshot (proposed)

`registry.json` is a list of `{ address, label, category?, historicalUnsecuredVolume? }` provided by Polina. It only labels agents and adds context volume for the index. Bond and secured volume always come from the chain. Format to be confirmed with Polina.

## 12. Open questions

1. Final JSON field names, agreed by Phantom, Polina and whoever builds the screen.
2. Do we show "violated but not provable on-chain" in the main UI or only in the notes?
3. Registry snapshot format and how many seeded agents we need for the index.