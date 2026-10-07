"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { DemoHeader } from "@/components/DemoHeader";
import { AgentRanking } from "@/components/AgentRanking";
import { VaultCard } from "@/components/VaultCard";
import { EventFeed } from "@/components/EventFeed";
import type { Snapshot, FeedItem, PolAgent } from "@/lib/indexer/types";

type IndexMode = "legacy" | "bond_weighted";

const POLL_MS = 3000;

function emptySnapshot(): Snapshot {
  return {
    meta: { mode: "live", chainId: 84532, decimals: 6, block: 0, seq: 0, generatedAt: Date.now() },
    agents: [], payments: [], feed: [],
    index: { legacy: [], bond_weighted: [] },
  };
}

function Placeholder({ zone, label }: { zone: number; label: string }) {
  return (
    <div className="card" style={{
      minHeight: 200, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 10,
    }}>
      <span style={{
        width: 26, height: 26, borderRadius: "50%",
        background: "var(--blue-dim)", color: "var(--blue)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700,
      }}>{zone}</span>
      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "var(--blue)", animation: "pulse-dot 1.2s ease infinite",
        }} />
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          Polling /api/state every 3s
        </span>
      </span>
    </div>
  );
}

export default function AppPage() {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot());
  const [events,   setEvents]   = useState<FeedItem[]>([]);
  const [indexMode, setIndexMode] = useState<IndexMode>("bond_weighted");
  const [focusedAddr, setFocusedAddr] = useState("");
  const [manualFocus, setManualFocus] = useState(false);
  const [loading, setLoading] = useState(true); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [stale,   setStale]   = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const sinceRef  = useRef(0);   // last event timestamp for ?since= (future use)
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pick focus: latest event agent → slashed → violated → highest bond
  const pickFocus = useCallback((s: Snapshot, evs: FeedItem[], current: string): string => {
    if (manualFocus && current && s.agents.find(a => a.address.toLowerCase() === current.toLowerCase())) {
      return current;
    }
    // Latest event with a known agent id
    const latest = [...evs].reverse().find(f => f.agent);
    if (latest) {
      const match = s.agents.find(a => a.id === latest.agent || a.address.toLowerCase() === latest.agent.toLowerCase());
      if (match) return match.address;
    }
    const slashed  = s.agents.find(a => a.status === "slashed");
    const violated = s.agents.find(a => a.status === "violated");
    const bonded   = [...s.agents].sort((a, b) => Number(BigInt(b.bond ?? "0") - BigInt(a.bond ?? "0")))[0];
    return (slashed ?? violated ?? bonded)?.address ?? "";
  }, [manualFocus]);

  useEffect(() => {
    async function poll() {
      try {
        // 1. Fetch state
        const stateRes = await fetch("/api/state");
        if (stateRes.ok) {
          const s = await stateRes.json() as Snapshot;
          setSnapshot(s);
          setStale(s.meta.stale ?? false);
          setLoading(false);
          setIndexMode(prev => prev); // keep user's toggle choice

          // Use feed from state directly (events already included)
          setEvents(s.feed ?? []);

          // Auto-focus
          setFocusedAddr(prev => pickFocus(s, events, prev));
        }
      } catch {
        // keep last state
      }
    }

    poll();
    pollRef.current = setInterval(poll, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusedAgent: PolAgent | undefined = snapshot.agents.find(
    a => a.address.toLowerCase() === focusedAddr.toLowerCase()
  ) ?? snapshot.agents[0];

  const burnTxHash = events.find(f => f.type === "slashed")?.tx;

  const hasData = snapshot.agents.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg)" }}>
      <DemoHeader />

      {/* Sub-header: index mode toggle + block */}
      <div style={{
        background: "var(--bg-card)", borderBottom: "1px solid var(--border)",
        padding: "8px 24px", display: "flex", alignItems: "center", gap: 8,
      }}>
        {/* Index mode toggle */}
        <div style={{
          display: "flex", gap: 2, padding: 3,
          background: "var(--bg)", borderRadius: 9999,
          border: "1px solid var(--border)",
        }}>
          {(["legacy", "bond_weighted"] as IndexMode[]).map(m => (
            <button key={m} onClick={() => setIndexMode(m)} style={{
              padding: "3px 12px", borderRadius: 9999, border: "none",
              cursor: "pointer", fontSize: 11, fontWeight: 600,
              background: indexMode === m ? "var(--blue)" : "transparent",
              color: indexMode === m ? "#fff" : "var(--text-secondary)",
              transition: "all 0.15s",
            }}>
              {m === "legacy" ? "Legacy" : "Bond-weighted"}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {stale && (
          <span style={{ fontSize: 11, color: "var(--amber)", fontWeight: 600 }}>RPC stale</span>
        )}
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {snapshot.meta.block > 0 ? `Block ${snapshot.meta.block.toLocaleString()}` : "Waiting for chain..."}
        </span>
      </div>

      <main style={{
        flex: 1, display: "flex", flexDirection: "column",
        gap: 12, padding: 16,
        maxWidth: 1440, width: "100%", margin: "0 auto",
      }}>
        {/* 2-column layout: Zone 1 kiri | Zone 2 + Zone 3 kanan (stack) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 12, alignItems: "flex-start" }}>
          {/* Zone 1 — Agent ranking */}
          <div>
            {!hasData ? (
              <Placeholder zone={1} label="Waiting for on-chain data" />
            ) : (
              <AgentRanking
                snapshot={snapshot}
                indexMode={indexMode}
                onToggle={setIndexMode}
                focusedAddress={focusedAddr}
                onFocus={addr => { setFocusedAddr(addr); setManualFocus(true); }}
              />
            )}
          </div>

          {/* Right column: Zone 2 + Zone 3 stacked */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              {!hasData || !focusedAgent ? (
                <Placeholder zone={2} label="No deposit yet" />
              ) : (
                <VaultCard agent={focusedAgent} burnTxHash={burnTxHash} />
              )}
            </div>
            <EventFeed items={events} />
          </div>
        </div>
      </main>
    </div>
  );
}
