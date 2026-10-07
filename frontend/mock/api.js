// api.js — the ONLY place the page gets data from. Same JSON shape from every source.
//
// Where the data comes from, in order of preference:
//   ?api=https://host        that backend
//   same origin              when the page is served by the backend itself (http://localhost:8787/)
//   http://localhost:8787    a backend running next to a page opened from disk or another static server
//   bundled recording        when none of the above answers — the page still shows the whole demo
//   ?mock=1                  forces the bundled recording (rehearsals, offline)
//
// Usage from the page:
//   const state  = await api.getState();            // same JSON as GET /state
//   const events = await api.getEvents(sinceMs);    // same JSON as GET /events?since=
//   await api.restart();                            // rewinds the attack (act 3); live backend answers {ok:false}
//   api.mode                                        // 'backend' | 'mock' once resolved
//   api.base                                        // backend URL, or null for the recording
//
// The recording (mock/replay_mock.js → window.AEON_REPLAY) holds 7 state snapshots and the same 6 events
// as the backend's replay mode, with the same gaps. It starts paused: act 3 (restart) starts the clock.

const api = (() => {
  const params = new URLSearchParams(location.search);
  const FORCE_MOCK = params.has('mock');
  const candidates = [];
  if (params.get('api')) candidates.push(params.get('api').replace(/\/+$/, ''));
  else {
    if (/^https?:$/.test(location.protocol)) candidates.push(location.origin);
    // An https page cannot call http://localhost: the browser blocks it as mixed content.
    // Trying anyway costs a round trip and prints a red error in the console a judge may open.
    if (location.protocol !== 'https:') candidates.push('http://localhost:8787');
  }

  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  const getJson = (url) => fetch(url, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); });

  function backend(base) {
    return {
      mode: 'backend', base,
      getState: () => getJson(`${base}/state`),
      getEvents: (since = 0) => getJson(`${base}/events?since=${since}`),
      restart: () => fetch(`${base}/replay/restart`, { method: 'POST' }).then((r) => r.json()),
      rewind: () => Promise.resolve({ ok: false }), // a backend has no rewind. Acts 1 and 2 just show whatever it holds
    };
  }

  // ---------- bundled recording ----------
  let data = null, t0 = null; // t0 === null → paused at the pre-attack snapshot
  async function load() {
    if (data) return data;
    data = window.AEON_REPLAY || await getJson('mock/replay_mock.json');
    return data;
  }
  const fired = () => (t0 === null ? [] : data.events.filter((e) => e.offset_ms <= Date.now() - t0));
  const mock = {
    mode: 'mock', base: null,
    async getState() {
      await load();
      const s = structuredClone(data.states[fired().length]); // snapshot after n events
      s.as_of = Date.now(); s.mode = 'replay';
      return s;
    },
    async getEvents(since = 0) {
      await load();
      return { events: fired().map((e) => ({ ...e, t: t0 + e.offset_ms })).filter((e) => e.t > since) };
    },
    async restart() { t0 = Date.now(); return { ok: true }; },
    async rewind() { t0 = null; return { ok: true }; }, // back to the pre-attack snapshot, whatever happened before
  };

  // ---------- pick a source once, on first use ----------
  let impl = null, resolving = null;
  async function resolve() {
    if (impl) return impl;
    if (!resolving) resolving = (async () => {
      if (!FORCE_MOCK) for (const base of candidates) {
        try {
          const s = await withTimeout(getJson(`${base}/state`), 1500);
          if (s && Array.isArray(s.agents) && s.index) return (impl = backend(base));
        } catch { /* next candidate */ }
      }
      return (impl = mock);
    })();
    return resolving;
  }

  return {
    get mode() { return impl ? impl.mode : 'resolving'; },
    get base() { return impl ? impl.base : null; },
    getState: async () => (await resolve()).getState(),
    getEvents: async (since) => (await resolve()).getEvents(since),
    restart: async () => (await resolve()).restart(),
    rewind: async () => (await resolve()).rewind(),
  };
})();
