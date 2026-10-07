import { NextResponse } from "next/server";
import { fetchEvents } from "@/lib/indexer/source-live";
import { reduce } from "@/lib/indexer/reducer";
import type { RegistryEntry, Snapshot } from "@/lib/indexer/types";
import registryRaw from "@/data/registry.json";

const registry     = registryRaw as RegistryEntry[];
const BACKEND_URL  = process.env.BACKEND_URL ?? "";
const VAULT        = (process.env.NEXT_PUBLIC_VAULT_ADDRESS    ?? "") as `0x${string}`;
const VERIFIER     = (process.env.NEXT_PUBLIC_VERIFIER_ADDRESS ?? "") as `0x${string}`;
const TOKEN        = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS    ?? "") as `0x${string}`;
const DEPLOY_BLOCK = BigInt(process.env.DEPLOY_BLOCK ?? "0");

let cache: { snapshot: Snapshot; ts: number } | null = null;
const CACHE_TTL = 3000;

function ser(v: unknown) {
  return JSON.parse(JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x));
}

function emptySnapshot(block = 0): Snapshot {
  return {
    meta: { mode: "live", chainId: 84532, decimals: 6, block, seq: 0, generatedAt: Date.now() },
    agents: [], payments: [], feed: [],
    index: { legacy: [], bond_weighted: [] },
  };
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL) {
    return NextResponse.json(ser(cache.snapshot));
  }

  // ── 1. Proxy to Polina's backend ─────────────────────────────────────────
  if (BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/state`, {
        next: { revalidate: 0 },
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json() as Snapshot;
        const regMap = new Map(registry.map(r => [r.address.toLowerCase(), r]));
        data.agents = (data.agents ?? []).map(a => ({
          ...a,
          legacy_score: a.legacy_score ?? regMap.get(a.address.toLowerCase())?.legacy_score ?? 0,
          id: a.id ?? regMap.get(a.address.toLowerCase())?.label ?? `agent#${a.address.slice(-4)}`,
        }));
        cache = { snapshot: data, ts: now };
        return NextResponse.json(data);
      }
    } catch (err) {
      console.error("[/api/state] backend proxy failed:", err);
    }
  }

  // ── 2. Built-in indexer ───────────────────────────────────────────────────
  if (VAULT && VERIFIER && TOKEN) {
    try {
      const { events, latestBlock, rpcOk } = await fetchEvents(VAULT, VERIFIER, TOKEN, DEPLOY_BLOCK);
      const snapshot = reduce(events, registry, now, 84532, latestBlock);
      if (!rpcOk) snapshot.meta.stale = true;
      cache = { snapshot, ts: now };
      return NextResponse.json(ser(snapshot));
    } catch (err) {
      console.error("[/api/state] indexer error:", err);
      // Return stale cache if available, otherwise empty
      if (cache) {
        cache.snapshot.meta.stale = true;
        return NextResponse.json(ser(cache.snapshot));
      }
      return NextResponse.json(ser(emptySnapshot()));
    }
  }

  // ── 3. Nothing configured — return empty (no demo data here) ─────────────
  return NextResponse.json(ser(emptySnapshot()));
}
