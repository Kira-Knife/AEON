"use client";

import { useEffect, useState } from "react";
import type { PolAgent } from "@/lib/indexer/types";

import { fmtUsdc } from "@/lib/fmt";

const BASESCAN = "https://sepolia.basescan.org";

function Countdown({ periodEndMs }: { periodEndMs: number }) {
  const [secs, setSecs] = useState(Math.max(0, Math.floor((periodEndMs - Date.now()) / 1000)));
  useEffect(() => {
    const id = setInterval(
      () => setSecs(Math.max(0, Math.floor((periodEndMs - Date.now()) / 1000))),
      1000,
    );
    return () => clearInterval(id);
  }, [periodEndMs]);
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return (
    <span className="mono" style={{ color: secs < 60 ? "var(--slash-red)" : "var(--text-primary)" }}>
      {m}:{s}
    </span>
  );
}

interface Props {
  /** PolAgent from /api/state snapshot */
  agent: PolAgent;
  /** Live balanceOf from RPC (6-dec bigint string). Replaces snapshot bond when present. */
  liveBalance?: bigint;
  burnTxHash?: string;
}

export function VaultCard({ agent, liveBalance, burnTxHash }: Props) {
  // utilization is 0-1 from backend
  const pct        = Math.min(agent.utilization * 100, 100);
  const isOver     = agent.status === "violated" || agent.status === "slashed";
  const isSlashed  = agent.status === "slashed";
  const isViolated = agent.status === "violated";

  // Bond display: prefer live RPC value when available
  // Handle both Polina format ("5000.000000") and base-unit format ("5000000000")
  const bondNum = liveBalance !== undefined
    ? Number(liveBalance) / 1e6
    : Number(agent.bond ?? "0");  // Polina sends human decimal already

  const spentNum  = Number(agent.spent   ?? "0");
  const limitNum  = Number(agent.limit_x ?? "0");
  const mBps      = 15000;
  const excessNum = Math.max(0, spentNum - limitNum);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const penaltyNum = Math.min(excessNum * mBps / 10000, bondNum);
  const mLabel    = `${mBps / 10000}x`;
  const barColor  = isOver ? "var(--red)" : pct >= 80 ? "var(--amber)" : "var(--green)";

  return (
    <div className="card" style={{ height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 26, height: 26, borderRadius: "50%",
            background: "var(--blue-dim)", color: "var(--blue)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700,
          }}>2</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Vault of {agent.id}</div>
            <div className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {agent.address.slice(0, 10)}...{agent.address.slice(-6)}
            </div>
          </div>
        </div>
        {isSlashed  && <span className="badge badge-slashed">slashed</span>}
        {isViolated && <span className="badge badge-violated">violated</span>}
        {!isSlashed && !isViolated && <span className="badge badge-secured">secured</span>}
      </div>

      {/* Spent / limit gauge */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Spent this period</span>
          <span style={{
            fontSize: 20, fontWeight: 700,
            color: isOver ? "var(--slash-red)" : "var(--text-primary)",
            transition: "color 0.3s",
          }}>
            {fmtUsdc(agent.spent)}
            <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-muted)" }}>
              {agent.limit_x ? ` / ${fmtUsdc(agent.limit_x)} USDC` : " USDC"}
            </span>
          </span>
        </div>
        {agent.limit_x ? (
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%`, background: barColor }} />
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
            No bond declared — unsecured
          </div>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          {
            label: "Bond left",
            // show live RPC balance if available, else snapshot bond
            value: `${bondNum.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`,
            alert: isSlashed,
          },
          { label: "Multiplier",     value: mLabel,                                    alert: false },
          { label: "Period ends in", value: <Countdown periodEndMs={agent.period_end} />, alert: false },
        ].map(({ label, value, alert }) => (
          <div key={label} style={{
            background: "var(--bg-card-2)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "10px 12px",
          }}>
            <div style={{
              fontSize: 10, color: "var(--text-muted)", marginBottom: 4,
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}>
              {label}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: alert ? "var(--slash-red)" : "var(--text-primary)" }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Excess + penalty preview */}
      {isOver && (
        <div style={{
          background: "var(--red-dim)", border: "1px solid var(--red-mid)",
          borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13,
        }}>
          <span style={{ color: "var(--text-secondary)" }}>Excess: </span>
          <span style={{ color: "var(--slash-red)", fontWeight: 600 }}>{excessNum.toFixed(2)} USDC</span>
          <span style={{ color: "var(--text-secondary)" }}> — penalty preview ({mLabel}): </span>
          <span style={{ color: "var(--slash-red)", fontWeight: 600 }}>{Math.min(excessNum * mBps / 10000, bondNum).toFixed(2)} USDC</span>
        </div>
      )}

      {/* CTA row */}
      <div style={{ display: "flex", gap: 8 }}>
        {isSlashed ? (
          <>
            <div style={{
              flex: 1, padding: "10px 0", borderRadius: 8, textAlign: "center",
              background: "var(--slash-red)", color: "#fff",
              fontWeight: 700, fontSize: 13, letterSpacing: "0.06em",
            }}>
              SLASHED
            </div>
            {burnTxHash && (
              <a href={`${BASESCAN}/tx/${burnTxHash}`} target="_blank" rel="noopener noreferrer" style={{
                flex: 1, padding: "10px 0", borderRadius: 8, textAlign: "center",
                background: "var(--bg-card-2)", border: "1px solid var(--border)",
                color: "var(--blue)", fontWeight: 600, fontSize: 12,
                textDecoration: "none", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 4,
              }}>
                Basescan: burn tx
              </a>
            )}
          </>
        ) : isViolated ? (
          <div style={{
            flex: 1, padding: "10px 0", borderRadius: 8, textAlign: "center",
            background: "var(--amber-dim)", border: "1px solid var(--amber-mid)",
            color: "var(--amber)", fontWeight: 700, fontSize: 13,
          }}>
            VIOLATION DETECTED
          </div>
        ) : (
          <div style={{
            flex: 1, padding: "10px 0", borderRadius: 8, textAlign: "center",
            background: "var(--green-dim)", border: "1px solid var(--green-mid)",
            color: "var(--green)", fontWeight: 600, fontSize: 12,
          }}>
            Within limit
          </div>
        )}
      </div>
    </div>
  );
}
