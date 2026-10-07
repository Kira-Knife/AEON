import type { FeedItem, NormalizedEvent } from "./types";

function fmt6(v: unknown): string {
  const n = Number(v);
  return isNaN(n) ? "?" : (n / 1e6).toFixed(2);
}

function short(addr: unknown): string {
  const s = String(addr ?? "");
  return s.length > 10 ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;
}

let _seq = 0;

export function resetFeedSeq() { _seq = 0; }

export function eventToFeedItem(ev: NormalizedEvent, label?: string): FeedItem | null {
  const agent = label ?? short(ev.payload.agent ?? ev.payload.from ?? "");
  const tx = ev.txHash && !ev.txHash.startsWith("0xreplay") ? ev.txHash : undefined;
  const base = { seq: _seq++, t: ev.t, agent, tx, data: ev.payload };

  switch (ev.kind) {
    case "Deposited":
      return {
        ...base,
        type: "declared",
        text: `${agent} declared a limit of ${fmt6(ev.payload.limit)} USDC per period and posted a ${fmt6(ev.payload.amount)} USDC bond`,
      };

    case "ToppedUp":
      return {
        ...base,
        type: "topup",
        text: `${agent} topped up bond to ${fmt6(ev.payload.newBond)} USDC, limit now ${fmt6(ev.payload.newLimit)} USDC`,
      };

    case "Spent":
      return {
        ...base,
        type: "payment",
        text: `${agent} paid ${fmt6(ev.payload.amount)} USDC to ${short(ev.payload.to)} (period total ${fmt6(ev.payload.periodTotal)} USDC)`,
      };

    case "Flagged": {
      const excess = Number(ev.payload.excess ?? 0) / 1e6;
      return {
        ...base,
        type: "violation",
        text: `Violation flagged by ${short(ev.payload.flagger)}: ${agent} exceeded limit by ${excess.toFixed(2)} USDC`,
      };
    }

    case "Slashed": {
      const penalty = Number(ev.payload.penalty ?? 0) / 1e6;
      const bondLeft = Number(ev.payload.bondLeft ?? 0) / 1e6;
      return {
        ...base,
        type: "slashed",
        text: `${penalty.toFixed(2)} USDC of ${agent} bond burned — ${bondLeft.toFixed(2)} USDC remaining`,
      };
    }

    case "Returned":
      return {
        ...base,
        type: "released",
        text: `Bond of ${fmt6(ev.payload.amount)} USDC returned to ${short(ev.payload.to)}`,
      };

    case "PeriodRolled":
      return {
        ...base,
        type: "declared",
        text: `${agent} period ${ev.payload.periodIndex} started — limit ${fmt6(ev.payload.limit)} USDC`,
      };

    default:
      return null;
  }
}
