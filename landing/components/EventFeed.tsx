"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedItem } from "@/lib/indexer/types";
import { basescanTx } from "@/lib/fmt";

const HIGHLIGHT_KINDS = new Set(["slashed", "violation"]);

const KIND_DOT: Record<string, string> = {
  declared:      "var(--blue)",
  payment:       "var(--text-muted)",
  violation:     "var(--amber)",
  slashed:       "var(--slash-red)",
  released:      "var(--green)",
  topup:         "var(--blue)",
  wallet_linked: "var(--text-muted)",
};

const KIND_COLOR: Record<string, string> = {
  violation: "var(--amber)",
  slashed:   "var(--slash-red)",
};

/** Format unix ms → HH:MM:SS — client only to avoid hydration mismatch */
function useFormattedTime(ms: number): string {
  const [label, setLabel] = useState("--:--:--");
  useEffect(() => {
    if (!ms) return;
    setLabel(new Date(ms).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }));
  }, [ms]);
  return label;
}

function EventRow({ item }: { item: FeedItem }) {
  const timeLabel  = useFormattedTime(item.t);
  const highlight  = HIGHLIGHT_KINDS.has(item.type);
  const explorerUrl = basescanTx(item.tx);
  return (
    <div className="fade-in" style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "7px 8px", borderRadius: 8,
      background: highlight ? "var(--red-dim)" : "transparent",
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%", flexShrink: 0, marginTop: 5,
        background: KIND_DOT[item.type] ?? "var(--text-muted)",
      }} />
      <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 56, paddingTop: 1 }}>
        {timeLabel}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 13,
          color: highlight ? (KIND_COLOR[item.type] ?? "var(--slash-red)") : "var(--text-primary)",
          fontWeight: highlight ? 600 : 400,
        }}>
          {item.text}
        </span>
        {explorerUrl && (
          <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="mono" style={{
            display: "block", fontSize: 10, color: "var(--blue)",
            marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {item.tx?.slice(0, 20)}... view on Basescan
          </a>
        )}
      </div>
    </div>
  );
}

export function EventFeed({ items }: { items: FeedItem[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length]);

  return (
    <div className="card" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{
          width: 26, height: 26, borderRadius: "50%",
          background: "var(--blue-dim)", color: "var(--blue)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, flexShrink: 0,
        }}>3</span>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Event feed</span>
        <div style={{ flex: 1 }} />
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "3px 10px", borderRadius: 9999,
          fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
          background: "var(--green-dim)", color: "var(--green)",
          border: "1px solid var(--green-mid)",
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%",
            background: "var(--green)", display: "inline-block",
            animation: "pulse-dot 1.2s ease infinite",
          }} />
          live
        </span>
      </div>

      {/* Feed */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {items.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}>No events yet</p>
        ) : (
          items.map((item, i) => <EventRow key={`${item.seq}-${i}`} item={item} />)
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
