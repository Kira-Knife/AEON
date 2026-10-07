import type { AppState, VaultState, DemoEvent } from "./types";

// ── Agents ────────────────────────────────────────────────────────────────
// Act 1: legacy ranking — agents with inflated scores but no bond sit at top.
// Act 2: bond-weighted — unbonded agents collapse to bottom.
// Act 3: agent#e4c7 overspends → slashed.

export const MOCK_STATE: AppState = {
  agents: [
    {
      id: "agent#7a41",
      address: "0x4f7c…7a41",
      legacyScore: 71,
      limitX: 5000,
      bondB: 5000,
      spentPeriod: 3200,
      status: "secured",
      depositId: 0,
    },
    {
      id: "agent#2c9f",
      address: "0x9a3b…2c9f",
      legacyScore: 64,
      limitX: 2000,
      bondB: 2000,
      spentPeriod: 1100,
      status: "secured",
      depositId: 1,
    },
    {
      id: "agent#b055",
      address: "0x1d2e…b055",
      legacyScore: 58,
      limitX: 1500,
      bondB: 1500,
      spentPeriod: 400,
      status: "secured",
      depositId: 2,
    },
    {
      id: "agent#3fd8",
      address: "0x7c4a…3fd8",
      legacyScore: 98,   // inflated legacy score, no bond
      limitX: 0,
      bondB: 0,
      spentPeriod: 0,
      status: "unsecured",
      depositId: undefined,
    },
    {
      id: "agent#91b2",
      address: "0x2e8f…91b2",
      legacyScore: 95,   // inflated legacy score, no bond
      limitX: 0,
      bondB: 0,
      spentPeriod: 0,
      status: "unsecured",
      depositId: undefined,
    },
    {
      id: "agent#e4c7",
      address: "0x5a1c…e4c7",
      legacyScore: 12,
      limitX: 1000,
      bondB: 988,        // post-slash bond (200 - 45 penalty, then topped up for demo; here simplified)
      spentPeriod: 1012, // overspent: 1012 > 1000
      status: "slashed",
      depositId: 3,
    },
  ],
  index: {
    // Legacy: sort by legacyScore desc
    legacy: [
      { agentId: "agent#3fd8", legacyRank: 1, bondWeightedRank: 5, bondShare: 0 },
      { agentId: "agent#91b2", legacyRank: 2, bondWeightedRank: 6, bondShare: 0 },
      { agentId: "agent#7a41", legacyRank: 3, bondWeightedRank: 1, bondShare: 0.526 },
      { agentId: "agent#2c9f", legacyRank: 4, bondWeightedRank: 2, bondShare: 0.210 },
      { agentId: "agent#b055", legacyRank: 5, bondWeightedRank: 3, bondShare: 0.158 },
      { agentId: "agent#e4c7", legacyRank: 6, bondWeightedRank: 4, bondShare: 0.104 },
    ],
    bond_weighted: [
      { agentId: "agent#7a41", legacyRank: 3, bondWeightedRank: 1, bondShare: 0.526 },
      { agentId: "agent#2c9f", legacyRank: 4, bondWeightedRank: 2, bondShare: 0.210 },
      { agentId: "agent#b055", legacyRank: 5, bondWeightedRank: 3, bondShare: 0.158 },
      { agentId: "agent#e4c7", legacyRank: 6, bondWeightedRank: 4, bondShare: 0.104 },
      { agentId: "agent#3fd8", legacyRank: 1, bondWeightedRank: 5, bondShare: 0 },
      { agentId: "agent#91b2", legacyRank: 2, bondWeightedRank: 6, bondShare: 0 },
    ],
  },
  focusedDepositId: 3, // agent#e4c7
  totalBonded: 9488,
  totalSecured: 4700,
  totalUnsecured: 1012,
};

// ── Vault card for focused agent ─────────────────────────────────────────

export const MOCK_VAULT: VaultState = {
  depositId: 3,
  agentId: "agent#e4c7",
  agentAddress: "0x5a1c…e4c7",
  bond: 988,
  limit: 1000,
  spentPeriod: 1012,
  periodEnd: Math.floor(Date.now() / 1000) + 5 * 60 + 44, // ~5:44 from now
  mBps: 15000, // 1.5x
  status: "slashed",
  burnTxHash: "0xburn0000000000000000000000000000000000000000000000000000deadbeef",
  slashPenalty: 18, // (1012-1000)*1.5 = 18 USDC burned
};

// ── Event feed ────────────────────────────────────────────────────────────

export const MOCK_EVENTS: DemoEvent[] = [
  {
    id: "e1",
    ts: "12:01",
    kind: "declaration",
    text: "declaration published — limit 1,000 USDC · bond 1,000 USDC",
    txHash: "0xdecl000000000000000000000000000000000000000000000000000000000001",
  },
  {
    id: "e2",
    ts: "12:04",
    kind: "payment",
    text: "payment 12 USDC → merchant#a1",
    txHash: "0xpay0000000000000000000000000000000000000000000000000000000000002",
  },
  {
    id: "e3",
    ts: "12:29",
    kind: "payment",
    text: "payment 240 USDC → merchant#b3",
    txHash: "0xpay0000000000000000000000000000000000000000000000000000000000003",
  },
  {
    id: "e4",
    ts: "12:37",
    kind: "violation",
    text: "violation: spent 1,012 > limit 1,000",
    highlight: true,
  },
  {
    id: "e5",
    ts: "12:37",
    kind: "flag",
    text: "flag() called — math re-checked on-chain",
    txHash: "0xflag000000000000000000000000000000000000000000000000000000000005",
  },
  {
    id: "e6",
    ts: "12:38",
    kind: "burn",
    text: "bond burned — 18 USDC · penalty 1.5 × 12 excess",
    txHash: "0xburn0000000000000000000000000000000000000000000000000000deadbeef",
    highlight: true,
  },
];

// ── Replay sequence ───────────────────────────────────────────────────────
// Each step: delay in ms + partial state patch for the demo

export interface ReplayStep {
  delayMs: number;
  events: DemoEvent[];         // events to append
  vaultPatch?: Partial<VaultState>;
  act?: 1 | 2 | 3;
}

export const REPLAY_SCRIPT: ReplayStep[] = [
  {
    delayMs: 0,
    act: 1,
    events: [MOCK_EVENTS[0]], // declaration
  },
  {
    delayMs: 3000,
    act: 1,
    events: [MOCK_EVENTS[1]], // payment 12
    vaultPatch: { spentPeriod: 12, status: "secured" },
  },
  {
    delayMs: 7000,
    act: 2,
    events: [MOCK_EVENTS[2]], // payment 240
    vaultPatch: { spentPeriod: 252, status: "secured" },
  },
  {
    delayMs: 13000,
    act: 3,
    events: [MOCK_EVENTS[3]], // violation
    vaultPatch: { spentPeriod: 1012, status: "violated" },
  },
  {
    delayMs: 16000,
    act: 3,
    events: [MOCK_EVENTS[4]], // flag
  },
  {
    delayMs: 19000,
    act: 3,
    events: [MOCK_EVENTS[5]], // burn
    vaultPatch: { spentPeriod: 1012, bond: 988, status: "slashed", slashPenalty: 18, burnTxHash: MOCK_VAULT.burnTxHash },
  },
];
