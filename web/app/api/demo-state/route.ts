/**
 * GET /api/demo-state
 * Returns hardcoded demo snapshot for the /mockup page only.
 * Never used by /app.
 */
import { NextResponse } from "next/server";
import type { Snapshot } from "@/lib/indexer/types";
import demoRaw from "@/data/demo-state.json";

export async function GET() {
  const now    = Date.now();
  const period = 10 * 60 * 1000;
  const demo   = demoRaw as unknown as Snapshot;

  // Hydrate with fresh timestamps each request
  const feedCount = demo.feed.length;
  const snapshot: Snapshot = {
    ...demo,
    meta: { ...demo.meta, generatedAt: now },
    agents: demo.agents.map(a => ({
      ...a,
      period_end: now + period - 3 * 60 * 1000,
    })),
    feed: demo.feed.map((f, i) => ({
      ...f,
      t: now - (feedCount - i) * 90_000,
    })),
  };

  return NextResponse.json(snapshot);
}
