/**
 * Number formatting per Polina spec (Excel, Oct 2026)
 * Polina backend sends USDC as decimal strings: "1000.000000", "12.500000"
 * Our internal indexer sends base units: "1000000000"
 */

/** 
 * USDC display — handles both formats:
 * - Decimal string "1000.000000" → "1,000"
 * - Base units string "1000000000" → "1,000"
 * - Number already in human units
 */
export function fmtUsdc(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === "") return "0";
  const n = Number(raw);
  if (isNaN(n)) return "0";
  // If value has a decimal point → already in human units ("1000.000000")
  // If value >= 1_000_000 and integer → base units (1000000000)
  const human = String(raw).includes(".") ? n : n / 1_000_000;
  if (isNaN(human) || human === 0) return "0";
  // Strip trailing zeros: "12.500000" → "12.5", "1000.000000" → "1,000"
  const formatted = human.toLocaleString("en-US", {
    maximumFractionDigits: 6,
    useGrouping: true,
  });
  return formatted.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/** Utilization 0-1 → "62%" */
export function fmtPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** Unix ms → "12:01:34" local time */
export function fmtTime(ms: number): string {
  if (!ms) return "--:--:--";
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

/** Ms remaining → "05:12:44", "ended" if ≤ 0 */
export function fmtCountdown(periodEndMs: number): string {
  const secs = Math.floor((periodEndMs - Date.now()) / 1000);
  if (secs <= 0) return "ended";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** "0xe4c70000…0006" — keep first 6 + last 4 chars */
export function fmtAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/** Basescan tx link — skip if starts with "0xreplay" */
export function basescanTx(tx?: string): string | undefined {
  if (!tx || tx.startsWith("0xreplay")) return undefined;
  return `https://sepolia.basescan.org/tx/${tx}`;
}

/** Basescan address link */
export function basescanAddr(addr: string): string {
  return `https://sepolia.basescan.org/address/${addr}`;
}
