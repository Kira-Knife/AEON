"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { DemoHeader } from "@/components/DemoHeader";
import { AgentRanking } from "@/components/AgentRanking";
import { VaultCard } from "@/components/VaultCard";
import { EventFeed } from "@/components/EventFeed";
import type { Snapshot, PolAgent, FeedItem } from "@/lib/indexer/types";

type Act = 1 | 2 | 3;
type IndexMode = "legacy" | "bond_weighted";

// ── Helpers ───────────────────────────────────────────────────────────────

const PERIOD = 10 * 60 * 1000;

function makeAgent(
  id: string, address: string, legacy_score: number,
  overrides: Partial<PolAgent> = {}
): PolAgent {
  return {
    id, address, legacy_score,
    limit_x: null, bond: null, spent: "0",
    utilization: 0, status: "unsecured",
    bond_weight: 0, period_end: Date.now() + PERIOD,
    deposit_id: null, ...overrides,
  };
}

const ADDR = {
  a7a41: "0x4f7c000000000000000000000000000000007a41",
  a2c9f: "0x9a3b000000000000000000000000000000002c9f",
  ab055: "0x1d2e000000000000000000000000000000b05500",
  a3fd8: "0x7c4a0000000000000000000000000000003fd800",
  a91b2: "0x2e8f00000000000000000000000000000091b200",
  ae4c7: "0xA83aae52E0c7826F8c4D394e2b934cc5ABA16E3A",
};

// ── Act 1 — static ────────────────────────────────────────────────────────

function buildAct1(): Snapshot {
  const t = Date.now();
  return {
    meta: { mode: "live", chainId: 84532, decimals: 6, block: 18423700, seq: 1, generatedAt: t },
    agents: [
      makeAgent("agent#3fd8", ADDR.a3fd8, 98),
      makeAgent("agent#91b2", ADDR.a91b2, 95),
      makeAgent("agent#7a41", ADDR.a7a41, 71),
      makeAgent("agent#2c9f", ADDR.a2c9f, 64),
      makeAgent("agent#b055", ADDR.ab055, 58),
      makeAgent("agent#e4c7", ADDR.ae4c7, 12),
    ],
    payments: [],
    feed: [
      { seq: 0, t: t - 5 * 60_000, type: "declared", agent: "agent#7a41", text: "agent#7a41 declared a limit of 5,000 USDC and posted a 5,000 USDC bond", tx: "0xreplay001", data: {} },
      { seq: 1, t: t - 4 * 60_000, type: "declared", agent: "agent#2c9f", text: "agent#2c9f declared a limit of 2,000 USDC and posted a 2,000 USDC bond", tx: "0xreplay002", data: {} },
      { seq: 2, t: t - 3 * 60_000, type: "declared", agent: "agent#b055", text: "agent#b055 declared a limit of 1,500 USDC and posted a 1,500 USDC bond", tx: "0xreplay003", data: {} },
    ],
    index: {
      legacy:        ["agent#3fd8", "agent#91b2", "agent#7a41", "agent#2c9f", "agent#b055", "agent#e4c7"],
      bond_weighted: ["agent#3fd8", "agent#91b2", "agent#7a41", "agent#2c9f", "agent#b055", "agent#e4c7"],
    },
  };
}

// ── Act 2 simulation steps ────────────────────────────────────────────────
// Each step: what changes in agent state + a feed event
// Ranking re-sorts automatically when bond_weight changes

interface SimStep {
  delayMs:   number;
  agentId:   string;
  patch:     Partial<PolAgent>;
  event:     Omit<FeedItem, "seq" | "t">;
  newBwOrder: string[]; // updated bond_weighted order after this step
}

// Initial Act 2 state (4 bonded, 2 unsecured)
function buildAct2Initial(): Snapshot {
  const t = Date.now();
  return {
    meta: { mode: "live", chainId: 84532, decimals: 6, block: 18423705, seq: 2, generatedAt: t },
    agents: [
      makeAgent("agent#7a41", ADDR.a7a41, 71, { limit_x: "5000.000000", bond: "5000.000000", spent: "1200.000000", utilization: 0.24, status: "secured", bond_weight: 5000, deposit_id: 0 }),
      makeAgent("agent#2c9f", ADDR.a2c9f, 64, { limit_x: "2000.000000", bond: "2000.000000", spent: "400.000000",  utilization: 0.20, status: "secured", bond_weight: 2000, deposit_id: 1 }),
      makeAgent("agent#b055", ADDR.ab055, 58, { limit_x: "1500.000000", bond: "1500.000000", spent: "200.000000",  utilization: 0.13, status: "secured", bond_weight: 1500, deposit_id: 2 }),
      makeAgent("agent#e4c7", ADDR.ae4c7, 12, { limit_x: "1000.000000", bond: "1000.000000", spent: "100.000000",  utilization: 0.10, status: "secured", bond_weight: 1000, deposit_id: 3 }),
      makeAgent("agent#3fd8", ADDR.a3fd8, 98, { bond_weight: 0 }),
      makeAgent("agent#91b2", ADDR.a91b2, 95, { bond_weight: 0 }),
    ],
    payments: [],
    feed: [
      { seq: 0, t: t - 4 * 60_000, type: "declared", agent: "agent#7a41", text: "agent#7a41 declared a limit of 5,000 USDC and posted a 5,000 USDC bond", tx: "0xreplay001", data: {} },
      { seq: 1, t: t - 3 * 60_000, type: "declared", agent: "agent#2c9f", text: "agent#2c9f declared a limit of 2,000 USDC and posted a 2,000 USDC bond", tx: "0xreplay002", data: {} },
      { seq: 2, t: t - 2 * 60_000, type: "declared", agent: "agent#b055", text: "agent#b055 declared a limit of 1,500 USDC and posted a 1,500 USDC bond", tx: "0xreplay003", data: {} },
      { seq: 3, t: t - 90_000,     type: "declared", agent: "agent#e4c7", text: "agent#e4c7 declared a limit of 1,000 USDC and posted a 1,000 USDC bond", tx: "0xreplay004", data: {} },
    ],
    index: {
      legacy:        ["agent#3fd8", "agent#91b2", "agent#7a41", "agent#2c9f", "agent#b055", "agent#e4c7"],
      bond_weighted: ["agent#7a41", "agent#2c9f", "agent#b055", "agent#e4c7", "agent#3fd8", "agent#91b2"],
    },
  };
}

// Simulation steps — payments change spent/utilization → rankings shift → final slash
const SIM_STEPS: SimStep[] = [
  // Step 1: e4c7 pays 300 → utilization 0.40, rises above b055 in ranking
  {
    delayMs: 3000,
    agentId: "agent#e4c7",
    patch: { spent: "400.000000", utilization: 0.40, bond_weight: 1000 },
    event: { type: "payment", agent: "agent#e4c7", text: "agent#e4c7 paid 300 USDC to 0xmerchant#a1 (total 400 USDC)", tx: "0xreplay005", data: {} },
    newBwOrder: ["agent#7a41", "agent#2c9f", "agent#b055", "agent#e4c7", "agent#3fd8", "agent#91b2"],
  },
  // Step 2: b055 tops up bond to 2500 → jumps above 2c9f
  {
    delayMs: 6000,
    agentId: "agent#b055",
    patch: { bond: "2500.000000", limit_x: "2500.000000", bond_weight: 2500 },
    event: { type: "topup", agent: "agent#b055", text: "agent#b055 topped up bond to 2,500 USDC", tx: "0xreplay006", data: {} },
    newBwOrder: ["agent#7a41", "agent#b055", "agent#2c9f", "agent#e4c7", "agent#3fd8", "agent#91b2"],
  },
  // Step 3: 2c9f pays 800 → utilization 0.60
  {
    delayMs: 9000,
    agentId: "agent#2c9f",
    patch: { spent: "1200.000000", utilization: 0.60 },
    event: { type: "payment", agent: "agent#2c9f", text: "agent#2c9f paid 800 USDC to 0xmerchant#b2 (total 1,200 USDC)", tx: "0xreplay007", data: {} },
    newBwOrder: ["agent#7a41", "agent#b055", "agent#2c9f", "agent#e4c7", "agent#3fd8", "agent#91b2"],
  },
  // Step 4: e4c7 pays 660 → overspend 1060 > 1000 → violated
  {
    delayMs: 12000,
    agentId: "agent#e4c7",
    patch: { spent: "1060.000000", utilization: 1.06, status: "violated" },
    event: { type: "violation", agent: "agent#e4c7", text: "Violation — agent#e4c7 exceeded limit: 1,060 > 1,000 USDC", tx: "0xreplay008", data: {} },
    newBwOrder: ["agent#7a41", "agent#b055", "agent#2c9f", "agent#e4c7", "agent#3fd8", "agent#91b2"],
  },
  // Step 5: flag() called → slash 90 USDC burned
  {
    delayMs: 15000,
    agentId: "agent#e4c7",
    patch: { bond: "910.000000", status: "slashed", bond_weight: 910 },
    event: { type: "slashed", agent: "agent#e4c7", text: "90 USDC burned from agent#e4c7 bond — 910 USDC remaining", tx: "0x7b3c000000000000000000000000000000000000000000000000000000deadbeef", data: {} },
    newBwOrder: ["agent#7a41", "agent#b055", "agent#2c9f", "agent#e4c7", "agent#3fd8", "agent#91b2"],
  },
];

// ── Act 3 — static final state ────────────────────────────────────────────

function buildAct3(): Snapshot {
  const t = Date.now();
  return {
    meta: { mode: "live", chainId: 84532, decimals: 6, block: 18423711, seq: 3, generatedAt: t },
    agents: [
      makeAgent("agent#7a41", ADDR.a7a41, 71, { limit_x: "5000.000000", bond: "5000.000000", spent: "3200.000000", utilization: 0.64, status: "secured", bond_weight: 5000, deposit_id: 0 }),
      makeAgent("agent#2c9f", ADDR.a2c9f, 64, { limit_x: "2000.000000", bond: "2000.000000", spent: "1100.000000", utilization: 0.55, status: "secured", bond_weight: 2000, deposit_id: 1 }),
      makeAgent("agent#b055", ADDR.ab055, 58, { limit_x: "2500.000000", bond: "2500.000000", spent: "400.000000",  utilization: 0.16, status: "secured", bond_weight: 2500, deposit_id: 2 }),
      makeAgent("agent#e4c7", ADDR.ae4c7, 12, { limit_x: "1000.000000", bond: "910.000000",  spent: "1060.000000", utilization: 1.06, status: "slashed", bond_weight: 910,  deposit_id: 3 }),
      makeAgent("agent#3fd8", ADDR.a3fd8, 98, { bond_weight: 0 }),
      makeAgent("agent#91b2", ADDR.a91b2, 95, { bond_weight: 0 }),
    ],
    payments: [],
    feed: [
      { seq: 0, t: t - 8 * 60_000, type: "declared",  agent: "agent#e4c7", text: "agent#e4c7 declared a limit of 1,000 USDC and posted a 1,000 USDC bond", tx: "0xreplay010", data: {} },
      { seq: 1, t: t - 6 * 60_000, type: "payment",   agent: "agent#e4c7", text: "agent#e4c7 paid 12 USDC to 0xmerchant#a1",                               tx: "0xreplay011", data: {} },
      { seq: 2, t: t - 4 * 60_000, type: "payment",   agent: "agent#e4c7", text: "agent#e4c7 paid 240 USDC to 0xmerchant#b3 (total 252 USDC)",              tx: "0xreplay012", data: {} },
      { seq: 3, t: t - 2 * 60_000, type: "payment",   agent: "agent#e4c7", text: "agent#e4c7 paid 808 USDC to 0xmerchant#c2 (total 1,060 USDC)",            tx: "0xreplay013", data: {} },
      { seq: 4, t: t - 90_000,     type: "violation", agent: "agent#e4c7", text: "Violation flagged — agent#e4c7 exceeded limit by 60 USDC",                tx: "0xreplay014", data: {} },
      { seq: 5, t: t - 60_000,     type: "slashed",   agent: "agent#e4c7", text: "90 USDC burned from agent#e4c7 bond — 910 USDC remaining",                tx: "0x7b3c000000000000000000000000000000000000000000000000000000deadbeef", data: {} },
    ],
    index: {
      legacy:        ["agent#3fd8", "agent#91b2", "agent#7a41", "agent#2c9f", "agent#b055", "agent#e4c7"],
      bond_weighted: ["agent#7a41", "agent#b055", "agent#2c9f", "agent#e4c7", "agent#3fd8", "agent#91b2"],
    },
  };
}

const ACT_LABELS: Record<Act, string> = {
  1: "Legacy — the market as it is",
  2: "Bond-weighted — live simulation",
  3: "Slash — overspend, flag, burn",
};

const ACT_INDEX_MODE: Record<Act, IndexMode> = { 1: "legacy", 2: "bond_weighted", 3: "bond_weighted" };
const ACT_FOCUS: Record<Act, string> = { 1: ADDR.a7a41, 2: ADDR.ae4c7, 3: ADDR.ae4c7 };

// ── Page ──────────────────────────────────────────────────────────────────

export default function MockupPage() {
  const [act, setAct]                 = useState<Act>(1);
  const [indexMode, setIndexMode]     = useState<IndexMode>("legacy");
  const [focusedAddr, setFocusedAddr] = useState(ACT_FOCUS[1]);
  const [snapshot, setSnapshot]       = useState<Snapshot>(buildAct1());

  const simTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const simSeqRef = useRef(0);

  // Clear all sim timers
  const clearSim = useCallback(() => {
    simTimers.current.forEach(clearTimeout);
    simTimers.current = [];
  }, []);

  // Run Act 2 simulation
  const runAct2Sim = useCallback(() => {
    const base = buildAct2Initial();
    setSnapshot(base);
    setFocusedAddr(ADDR.ae4c7); // focus on e4c7 from the start in Act 2
    simSeqRef.current = base.feed.length;

    SIM_STEPS.forEach(step => {
      const t = setTimeout(() => {
        setSnapshot(prev => {
          const seq = simSeqRef.current++;
          const now = Date.now();

          // Patch the agent
          const agents = prev.agents.map(a =>
            a.id === step.agentId ? { ...a, ...step.patch } : a
          );

          // New event
          const newEvent: FeedItem = { ...step.event, seq, t: now };
          const feed = [...prev.feed, newEvent];

          // Update bond_weighted index order from step
          return {
            ...prev,
            meta: { ...prev.meta, generatedAt: now },
            agents,
            feed,
            index: {
              ...prev.index,
              bond_weighted: step.newBwOrder,
            },
          };
        });
      }, step.delayMs);

      simTimers.current.push(t);
    });
  }, []);

  // Keyboard shortcuts: 1/2/3 to switch act
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "1") setAct(1);
      if (e.key === "2") setAct(2);
      if (e.key === "3") setAct(3);
      if (e.key === "r" || e.key === "R") {
        if (act === 2) { clearSim(); runAct2Sim(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, clearSim, runAct2Sim]);

  // Switch act
  useEffect(() => {
    clearSim();
    setIndexMode(ACT_INDEX_MODE[act]);
    setFocusedAddr(ACT_FOCUS[act]);

    if (act === 1) setSnapshot(buildAct1());
    else if (act === 2) runAct2Sim();
    else setSnapshot(buildAct3());

    return () => clearSim();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act]);

  const focusedAgent = snapshot.agents.find(
    a => a.address.toLowerCase() === focusedAddr.toLowerCase()
  );
  const burnTxHash = snapshot.feed.find(f => f.type === "slashed")?.tx;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg)" }}>
      <DemoHeader />

      {/* Act selector */}
      <div style={{
        background: "var(--bg-card)", borderBottom: "1px solid var(--border)",
        padding: "8px 24px", display: "flex", alignItems: "center", gap: 8,
      }}>
        <div style={{ display: "flex", gap: 4 }}>
          {([1, 2, 3] as Act[]).map(a => (
            <button key={a} onClick={() => setAct(a)} style={{
              padding: "5px 16px", borderRadius: 8, border: "none",
              cursor: "pointer", fontSize: 12, fontWeight: act === a ? 700 : 400,
              background: act === a ? "var(--blue)" : "var(--bg-card-2)",
              color: act === a ? "#fff" : "var(--text-secondary)",
              transition: "all 0.15s",
              outline: `1px solid ${act === a ? "var(--blue)" : "var(--border)"}`,
            }}>
              Act {a}
              <span className="mono" style={{
                marginLeft: 6, fontSize: 9, opacity: 0.6,
                background: "rgba(0,0,0,0.1)", borderRadius: 4, padding: "1px 4px",
              }}>{a}</span>
            </button>
          ))}
        </div>

        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {ACT_LABELS[act]}
          {act === 2 && (
            <span style={{ marginLeft: 8, color: "var(--blue)", fontWeight: 600 }}>
              · auto-playing
            </span>
          )}
        </span>

        <div style={{ flex: 1 }} />

        {/* Replay button for Act 2 */}
        {act === 2 && (
          <button onClick={() => { clearSim(); runAct2Sim(); }} style={{
            padding: "4px 12px", borderRadius: 8,
            background: "var(--blue-dim)", color: "var(--blue)",
            border: "1px solid var(--blue-mid)", cursor: "pointer",
            fontSize: 11, fontWeight: 600,
          }}>
            Restart
          </button>
        )}

        <span style={{
          padding: "3px 10px", borderRadius: 9999,
          fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
          background: "var(--amber-dim)", color: "var(--amber)",
          border: "1px solid var(--amber-mid)",
        }}>
          Mockup
        </span>
      </div>

      <main style={{
        flex: 1, display: "flex", flexDirection: "column",
        gap: 12, padding: 16,
        maxWidth: 1440, width: "100%", margin: "0 auto",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 12, alignItems: "flex-start" }}>
          <AgentRanking
            snapshot={snapshot}
            indexMode={indexMode}
            onToggle={setIndexMode}
            focusedAddress={focusedAddr}
            onFocus={setFocusedAddr}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {focusedAgent && (
              <VaultCard agent={focusedAgent} burnTxHash={burnTxHash} />
            )}
            <EventFeed items={snapshot.feed} />
          </div>
        </div>
      </main>
    </div>
  );
}
