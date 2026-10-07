// ── Agent ─────────────────────────────────────────────────────────────────

export type AgentStatus = "secured" | "unsecured" | "violated" | "slashed";

export interface Agent {
  id: string;           // registry id, e.g. "agent#7a41"
  address: string;      // short hex, e.g. "0x4f7c…e4c7"
  legacyScore: number;  // ERC-8004 registry snapshot score
  limitX: number;       // declared spending limit in USDC (6 dec, stored as human number)
  bondB: number;        // current bond balance in USDC
  spentPeriod: number;  // cumulative spend this period
  status: AgentStatus;
  depositId?: number;   // BondVault deposit id (undefined = unbonded)
}

// bond-weighted index share, computed by backend
export interface IndexEntry {
  agentId: string;
  legacyRank: number;       // rank in legacy ordering
  bondWeightedRank: number; // rank in bond-weighted ordering
  bondShare: number;        // 0–1, share of total bonded
}

// ── State from /api/state ─────────────────────────────────────────────────

export interface AppState {
  agents: Agent[];
  index: {
    legacy: IndexEntry[];
    bond_weighted: IndexEntry[];
  };
  focusedDepositId: number;   // which deposit to show in Zone 2
  totalBonded: number;
  totalSecured: number;
  totalUnsecured: number;
}

// ── Vault (Zone 2) ────────────────────────────────────────────────────────

export interface VaultState {
  depositId: number;
  agentId: string;
  agentAddress: string;
  bond: number;
  limit: number;
  spentPeriod: number;
  periodEnd: number;        // unix timestamp seconds
  mBps: number;             // e.g. 15000 = 1.5x
  status: AgentStatus;
  burnTxHash?: string;      // set after slash
  slashPenalty?: number;
}

// ── Events (Zone 3) ───────────────────────────────────────────────────────

export type EventKind =
  | "declaration"
  | "payment"
  | "violation"
  | "flag"
  | "burn"
  | "returned"
  | "topup";

export interface DemoEvent {
  id: string;
  ts: string;            // display time, e.g. "12:01"
  kind: EventKind;
  text: string;          // human-readable, ready to show
  txHash?: string;
  highlight?: boolean;   // true = red text
}

// ── Demo mode ─────────────────────────────────────────────────────────────

export type DemoMode = "live" | "replay";
export type IndexMode = "legacy" | "bond_weighted";
export type Act = 1 | 2 | 3;
