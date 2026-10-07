// stamp-replay.mjs — puts the REAL tx hashes of the last on-chain attack into the replay files,
// so the "Basescan: burn tx" button and the feed links work even in offline replay mode.
//
// Usage (backend running in live mode in another terminal, caught up):
//   npm run live            # terminal 1
//   npm run stamp           # terminal 2
// Optional: API=http://host:port npm run stamp
//
// Takes the most recent declaration and the events after it for the same agent
// (declared, 3 payments, violation, slashed) and copies their tx hashes, in order,
// into backend/replay.json, frontend/mock/replay_mock.json and frontend/mock/events.json.

import fs from 'node:fs';

const API = process.env.API || 'http://localhost:8787';
const FILES = {
  replay: new URL('./replay.json', import.meta.url),
  mock: new URL('../frontend/mock/replay_mock.json', import.meta.url),
  events: new URL('../frontend/mock/events.json', import.meta.url),
};

const { events } = await fetch(`${API}/events?since=0`).then((r) => r.json()).catch(() => {
  console.error(`cannot reach ${API} — start the backend first: npm run live`);
  process.exit(1);
});

const lastDecl = events.map((e) => e.type).lastIndexOf('declared');
if (lastDecl < 0) { console.error('no declaration in the live feed yet — run npm run attack first'); process.exit(1); }
const hero = events[lastDecl].agent;
const run = events.slice(lastDecl).filter((e) => e.agent === hero);

const isHash = (h) => /^0x[0-9a-fA-F]{64}$/.test(h || '');
const queue = {}; // type -> [tx, tx, ...] in chain order
for (const e of run) if (isHash(e.tx)) (queue[e.type] ||= []).push(e.tx);

const need = { declared: 1, payment: 3, violation: 1, slashed: 1 };
const missing = Object.entries(need).filter(([t, n]) => (queue[t]?.length || 0) < n).map(([t]) => t);
if (missing.length) {
  console.error(`last attack run (${hero}) is incomplete, missing: ${missing.join(', ')}. Run npm run attack to the end, then retry.`);
  process.exit(1);
}

// Replace tx hashes in a list of events, matching by type in order.
function stamp(list, getEv) {
  const q = Object.fromEntries(Object.entries(queue).map(([t, a]) => [t, [...a]]));
  let n = 0;
  for (const item of list) {
    const ev = getEv(item);
    const tx = q[ev.type]?.shift();
    if (!tx) continue;
    ev.tx = tx;
    if (ev.type === 'slashed') (ev.data ||= {}).burn_tx = tx;
    n++;
  }
  return n;
}

const write = (url, obj) => fs.writeFileSync(url, JSON.stringify(obj, null, 1) + '\n');

const replay = JSON.parse(fs.readFileSync(FILES.replay));
console.log(`replay.json:       ${stamp(replay.timeline, (x) => x.event)} events stamped`);
write(FILES.replay, replay);

for (const key of ['mock', 'events']) {
  if (!fs.existsSync(FILES[key])) { console.log(`${key}: file not found, skipped`); continue; }
  const obj = JSON.parse(fs.readFileSync(FILES[key]));
  console.log(`${key === 'mock' ? 'replay_mock.json' : 'events.json'}: ${stamp(obj.events, (x) => x).toString().padStart(2)} events stamped`);
  write(FILES[key], obj);
  if (key === 'mock') { // the page loads this copy with a <script> tag, so it also works when opened from disk
    const js = new URL('../frontend/mock/replay_mock.js', import.meta.url);
    fs.writeFileSync(js, '// Generated from replay_mock.json by backend/stamp-replay.mjs.\n' +
      '// Loaded with a <script> tag so the page also works when opened from disk (file://), where fetch() is blocked.\n' +
      'window.AEON_REPLAY = ' + JSON.stringify(obj, null, 1) + ';\n');
    console.log('replay_mock.js:    regenerated');
  }
}

console.log(`\nburn tx: https://sepolia.basescan.org/tx/${queue.slashed[0]}`);
console.log('Done. Restart `npm run replay` to pick up the new hashes.');
