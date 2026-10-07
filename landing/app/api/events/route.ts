import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "";

// Cache for events — 2s
let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 2000;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  // Proxy to Polina's backend
  if (BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/events`, {
        next: { revalidate: 0 },
        headers: { "Accept": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        cache = { data, ts: now };
        return NextResponse.json(data);
      }
    } catch (err) {
      console.error("[/api/events] backend proxy failed:", err);
    }
  }

  // Fallback: derive events from /api/state feed
  try {
    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    const res = await fetch(`${base}/api/state`, { next: { revalidate: 0 } });
    if (res.ok) {
      const state = await res.json();
      const events = (state.feed ?? []).map((f: Record<string, unknown>) => ({
        t:     f.t,
        type:  f.type,
        agent: f.agent,
        text:  f.text,
        tx:    f.tx,
        data:  f.data ?? {},
      }));
      const result = { events };
      cache = { data: result, ts: now };
      return NextResponse.json(result);
    }
  } catch (err) {
    console.error("[/api/events] fallback failed:", err);
  }

  return NextResponse.json({ events: [] });
}
