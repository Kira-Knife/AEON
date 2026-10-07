// ── Types matching Polina's GET /state spec (Excel, Oct 2026) ─────────────

export type Status = "unsecured" | "secured" | "violated" | "slashed" | "released";
export type Phase  = "active" | "challenge" | "returned" | "closed";
export type Mode   = "live" | "replay";

// ── GET /state response ───────────────────────────────────────────────────

export interface PolAgent {
  id:           string;
  address:      string;
  legacy_score: number | null;
  limit_x:      string | null;   // USDC 6 dec base units, null if no deposit
  bond:         string | null;   // USDC 6 dec base units
  spent:        string;          // USDC 6 dec base units
  utilization:  number;          // spent / limit_x (0-1), 0 if no limit
  status:       Status;
  bond_weight:  number;          // share of total bonded (0-1)
  period_end:   number;          // unix ms
  deposit_id:   number | null;
}

export interface PolIndex {
  legacy:        string[];  // agent id[]  sorted by legacy_score desc
  bond_weighted: string[];  // agent id[]  bonded first by bond desc, unsecured last
}

export interface PolState {
  as_of: number;            // unix ms
  mode:  Mode;
  agents: PolAgent[];
  index:  PolIndex;
}

// ── GET /events response ──────────────────────────────────────────────────

export type EventKind =
  | "declared"
  | "wallet_linked"
  | "payment"
  | "topup"
  | "violation"
  | "slashed"
  | "released";

export interface PolEvent {
  t:     number;            // unix ms → display as HH:MM:SS
  type:  EventKind;
  agent: string;            // agent id
  text:  string;            // display as-is
  tx?:   string;            // basescan tx hash; skip link if starts with "0xreplay"
  data:  Record<string, unknown>;
}

export interface PolEventsResponse {
  events: PolEvent[];
}

// ── Internal types (indexer reducer) ─────────────────────────────────────

export interface RegistryEntry {
  address:                  string;
  label:                    string;
  category?:                string;
  legacy_score:             number;
  historicalUnsecuredVolume?: string;
}

// Full internal snapshot (used by reducer, not sent to frontend directly)
export interface Snapshot {
  meta: {
    mode:        Mode;
    chainId:     84532;
    decimals:    6;
    block:       number;
    seq:         number;
    generatedAt: number;
    stale?:      boolean;
  };
  agents:   PolAgent[];
  payments: Payment[];
  feed:     FeedItem[];
  index:    PolIndex;
}

export interface Payment {
  txHash:    string;
  logIndex:  number;
  ts:        number;
  from:      string;
  to:        string;
  amount:    string;
  route:     "verifier" | "direct";
  counted:   boolean;
}

export interface FeedItem {
  seq:         number;
  t:           number;   // unix ms
  type:        EventKind;
  agent:       string;
  text:        string;
  tx?:         string;
  data:        Record<string, unknown>;
}

export interface NormalizedEvent {
  seq:         number;
  t:           number;
  kind:
    | "Deposited"
    | "ToppedUp"
    | "LimitDecreaseScheduled"
    | "PeriodRolled"
    | "Slashed"
    | "Returned"
    | "Spent"
    | "Flagged"
    | "Transfer";
  txHash:      string;
  logIndex:    number;
  blockNumber: number;
  payload:     Record<string, unknown>;
}
