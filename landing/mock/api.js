// api.js — the ONLY place the page gets data from.
// Two sources, same shape:
//   real backend   →  open index.html normally       (http://localhost:8787)
//   mock files     →  open index.html?mock=1         (no backend needed)
//
// Usage from the page:
//   const state  = await api.getState();            // same JSON as GET /state
//   const events = await api.getEvents(sinceMs);    // same JSON as GET /events?since=
//   api.restart();                                  // rewinds the attack (act 3)
//
// Mock mode replays mock/replay_mock.json on a timer: the same 6 events, with the
// same gaps, as the backend's replay mode — so animations can be tested properly.

const api = (() => {
  const params = new URLSearchParams(location.search);
  const MOCK = params.has('mock');
  const BASE = params.get('api') || 'http://localhost:8787';

  // ---------- real backend ----------
  if (!MOCK) {
    return {
      mode: 'backend',
      getState: () => fetch(`${BASE}/state`).then((r) => r.json()),
      getEvents: (since = 0) => fetch(`${BASE}/events?since=${since}`).then((r) => r.json()),
      restart: () => fetch(`${BASE}/replay/restart`, { method: 'POST' }).then((r) => r.json()),
    };
  }

  // ---------- mock ----------
  let data = null;   // { states: [7 snapshots], events: [6 events with offset_ms] }
  let t0 = Date.now();

  async function load() {
    if (!data) data = await fetch('mock/replay_mock.json').then((r) => r.json());
    return data;
  }

  // how many events have "happened" since t0
  const fired = () => data.events.filter((e) => e.offset_ms <= Date.now() - t0);

  return {
    mode: 'mock',
    async getState() {
      await load();
      const n = fired().length;                 // 0..6
      const s = structuredClone(data.states[n]); // snapshot after n events
      s.as_of = Date.now();
      s.mode = 'replay';
      return s;
    },
    async getEvents(since = 0) {
      await load();
      const evs = fired().map((e) => ({ ...e, t: t0 + e.offset_ms }));
      return { events: evs.filter((e) => e.t > since) };
    },
    async restart() {
      t0 = Date.now();
      return { ok: true };
    },
  };
})();
