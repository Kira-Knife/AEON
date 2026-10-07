"use client";

import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { PolAgent, PolIndex, Snapshot } from "@/lib/indexer/types";
import { fmtUsdc } from "@/lib/fmt";

type IndexMode = "legacy" | "bond_weighted";
type Status    = PolAgent["status"];

// ── Status badge with transition animation ────────────────────────────────

const STATUS_STYLE: Record<Status, { bg: string; color: string; border: string }> = {
  secured:   { bg: "var(--green-dim)",  color: "var(--green)",      border: "1px solid var(--green-mid)" },
  unsecured: { bg: "var(--bg-card-2)",  color: "var(--text-muted)", border: "1px solid var(--border)" },
  violated:  { bg: "var(--amber-dim)",  color: "var(--amber)",      border: "1px solid var(--amber-mid)" },
  slashed:   { bg: "var(--red-dim)",    color: "var(--slash-red)",  border: "1px solid var(--red-mid)" },
  released:  { bg: "var(--bg-card-2)",  color: "var(--text-muted)", border: "1px solid var(--border)" },
};

function statusAnimClass(prev: Status | undefined, next: Status): string {
  if (!prev || prev === next) return "";
  if (prev === "unsecured" && next === "secured")   return "anim-to-green";
  if (prev === "secured"   && next === "violated")  return "anim-to-violated";
  if ((prev === "secured" || prev === "violated") && next === "slashed") return "anim-to-red";
  return "";
}

function StatusBadge({ agentId, status }: { agentId: string; status: Status }) {
  const prevRef = useRef<Status | undefined>(undefined);
  const [animCls, setAnimCls] = useState("");

  useEffect(() => {
    const cls = statusAnimClass(prevRef.current, status);
    if (cls) {
      setAnimCls(cls);
      const t = setTimeout(() => setAnimCls(""), 700);
      prevRef.current = status;
      return () => clearTimeout(t);
    }
    prevRef.current = status;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const s = STATUS_STYLE[status] ?? STATUS_STYLE.unsecured;
  return (
    <span key={agentId} className={`badge ${animCls}`}
      style={{ background: s.bg, color: s.color, border: s.border }}>
      {status}
    </span>
  );
}

// ── Utilization bar ───────────────────────────────────────────────────────

function UtilBar({ pct, status }: { pct: number; status: Status }) {
  const isOver  = status === "slashed" || status === "violated";
  const isNear  = pct >= 80 && !isOver;
  const color   = isOver ? "var(--red)" : isNear ? "var(--amber)" : "var(--green)";
  return (
    <div className="progress-bar" style={{ width: 80 }}>
      <div className="progress-fill"
        style={{ width: `${Math.min(pct, 100)}%`, background: color,
          transition: "width 0.5s ease, background 0.6s ease" }} />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

interface Props {
  snapshot:       Snapshot;
  indexMode:      IndexMode;
  onToggle:       (m: IndexMode) => void;
  focusedAddress: string;
  onFocus:        (addr: string) => void;
}

export function AgentRanking({ snapshot, indexMode, onToggle, focusedAddress, onFocus }: Props) {
  const idOrder: string[] = snapshot.index[indexMode as keyof PolIndex] as string[];
  const agentById = new Map(snapshot.agents.map(a => [a.id, a]));

  // Ordered agents array for Reorder
  const ordered: PolAgent[] = idOrder
    .map(id => agentById.get(id))
    .filter((a): a is PolAgent => !!a);

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 26, height: 26, borderRadius: "50%",
            background: "var(--blue-dim)", color: "var(--blue)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700,
          }}>1</span>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Agent ranking</span>
        </div>

        {/* Toggle */}
        <div style={{
          display: "flex", gap: 2, padding: 3,
          background: "var(--bg-card-2)", borderRadius: 9999,
          border: "1px solid var(--border)",
        }}>
          {(["legacy", "bond_weighted"] as IndexMode[]).map(m => (
            <button key={m} onClick={() => onToggle(m)} style={{
              padding: "4px 12px", borderRadius: 9999, border: "none",
              cursor: "pointer", fontSize: 11, fontWeight: 600,
              transition: "all 0.2s",
              background: indexMode === m ? "var(--blue)" : "transparent",
              color:      indexMode === m ? "#fff" : "var(--text-secondary)",
            }}>
              {m === "legacy" ? "Legacy" : "Bond-weighted"}
            </button>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "2fr 0.6fr 0.8fr 0.8fr 1fr 0.8fr",
        padding: "6px 8px",
        borderBottom: "1px solid var(--border)",
        gap: 8,
      }}>
        {["AGENT", "SCORE", "LIMIT X", "BOND B", "UTILIZATION", "STATUS"].map(h => (
          <div key={h} style={{
            fontSize: 11, fontWeight: 600, color: "var(--text-muted)",
            letterSpacing: "0.06em",
            textAlign: h === "UTILIZATION" ? "center" : "left",
          }}>{h}</div>
        ))}
      </div>

      {/* Animated rows — FLIP via framer-motion layout */}
      <AnimatePresence initial={false}>
        {ordered.map(agent => {
          const pct       = agent.utilization * 100;
          const isGrey    = agent.status === "unsecured" && indexMode === "bond_weighted";
          const isSlashed = agent.status === "slashed";
          const isFocused = agent.address.toLowerCase() === focusedAddress.toLowerCase();

          return (
            <motion.div
              key={agent.id}
              layout
              transition={{ duration: 0.7, ease: "easeInOut" }}
              animate={{
                opacity: isGrey ? 0.35 : 1,
                backgroundColor: isSlashed
                  ? "rgba(196,78,82,0.06)"
                  : isFocused
                  ? "var(--blue-dim)"
                  : "transparent",
              }}
              onClick={() => onFocus(agent.address)}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 0.6fr 0.8fr 0.8fr 1fr 0.8fr",
                padding: "10px 8px",
                gap: 8,
                borderBottom: "1px solid var(--border-soft)",
                cursor: "pointer",
                alignItems: "center",
              }}
            >
              {/* Agent */}
              <div>
                <div style={{
                  fontSize: 13, fontWeight: 600,
                  color: isGrey ? "var(--text-muted)" : "var(--text-primary)",
                }}>
                  {agent.id}
                </div>
                <div className="mono" style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                  {agent.address.slice(0, 8)}...{agent.address.slice(-4)}
                </div>
              </div>

              {/* Score */}
              <div style={{ fontSize: 13, color: isGrey ? "var(--text-muted)" : "var(--text-secondary)" }}>
                {agent.legacy_score ?? "—"}
              </div>

              {/* Limit X */}
              <div style={{ fontSize: 13, color: isGrey ? "var(--text-muted)" : "var(--text-secondary)" }}>
                {agent.limit_x ? fmtUsdc(agent.limit_x) : <span style={{ color: "var(--text-muted)" }}>—</span>}
              </div>

              {/* Bond B */}
              <motion.div
                animate={{ color: isSlashed ? "var(--slash-red)" : isGrey ? "var(--text-muted)" : "var(--text-primary)" }}
                transition={{ duration: 0.4 }}
                style={{ fontSize: 13, fontWeight: isSlashed ? 600 : 400 }}
              >
                {agent.bond ? fmtUsdc(agent.bond) : "0"}
              </motion.div>

              {/* Utilization */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                {agent.limit_x
                  ? <UtilBar pct={pct} status={agent.status} />
                  : <span style={{ color: "var(--text-muted)" }}>—</span>
                }
              </div>

              {/* Status */}
              <div>
                <StatusBadge agentId={agent.id} status={agent.status} />
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      <p style={{ marginTop: 12, fontSize: 10, color: "var(--text-muted)", fontStyle: "italic" }}>
        ordering from <span className="mono">/api/state</span> (backend-computed) — front end only animates re-sort
      </p>
    </div>
  );
}
