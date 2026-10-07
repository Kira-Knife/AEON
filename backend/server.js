// ÆON demo backend — indexer + event layer.
//
// Serves two endpoints for the demo page (format = the data spec):
//   GET /state                 world snapshot: agents, limits, bonds, statuses, index order
//   GET /events?since=<ms>     event feed newer than <ms> (unix milliseconds)
//   POST /replay/restart       rewinds the replay (replay mode only)
//
// Two modes, same endpoints, same JSON — the page never knows the difference:
//   node server.js --replay    plays replay.json when the page enters act 3 (stage fallback, works offline)
//   node server.js --live      polls Base Sepolia every POLL_MS and decodes our contract events
//
// "Polling" = a timer loop that asks the chain "any new blocks since last time?"
// every few seconds. No sockets, nothing to keep alive: if Wi-Fi blinks,
// the next tick simply works again.
//
// No database: the chain is the database. On restart the indexer re-reads every
// event from START_BLOCK and rebuilds the same state in well under a minute.

import './env.js'; // reads ./.env if present
import express from 'express';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http, parseAbi, decodeEventLog, formatUnits } from 'viem';

const argv = process.argv.slice(2);
const MODE = argv.includes('--live') ? 'live' : argv.includes('--replay') ? 'replay' : (process.env.MODE || 'replay');
const PORT = Number(process.env.PORT || 8787);
const POLL_MS = Number(process.env.POLL_MS || 2500);
const MAX_RANGE = BigInt(process.env.MAX_RANGE || 1000); // most RPC providers cap eth_getLogs at ~1000 blocks per call

// Deployed on Base Sepolia (chain 84532) on 6 Oct 2026, 17:44 SGT. Override in .env if redeployed.
const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
const VAULT = process.env.VAULT || '0xD42d1CAAa7BD9979c68933D2faF97eb8691E2e4C';
const VERIFIER = process.env.VERIFIER || '0xE67348E67A62C5CF3d2943A7dDbF6781767601e0';
const START_BLOCK = BigInt(process.env.START_BLOCK || 47755792); // block in which BondVault was deployed

// ---------- shared state ----------
const agents = new Map(); // id -> agent object (shape from the data spec)
const events = [];        // feed, oldest first
let sync = () => null;    // live mode fills this in (head block, indexed block)

const usdc = (raw) => Number(formatUnits(BigInt(raw), 6)).toFixed(6); // 1000000 -> "1.000000"
const num = (s) => (s == null ? 0 : Number(s));
const fmt = (raw) => Number(usdc(raw)).toLocaleString('en-US');
const agentId = (addr) => `agent#${addr.slice(2, 6).toLowerCase()}`;

function bondWeight(a) {
  // Rule from the data spec — the front end must not invent its own.
  if (a.status === 'secured') return Math.min(num(a.bond), num(a.limit_x));
  if (a.status === 'violated' || a.status === 'slashed') return num(a.bond); // bond = remaining after penalty
  return 0;
}

function snapshot() {
  const list = [...agents.values()].map((a) => ({
    ...a,
    utilization: a.limit_x ? Math.round((num(a.spent) / num(a.limit_x)) * 100) / 100 : 0,
    bond_weight: bondWeight(a),
  }));
  return {
    as_of: Date.now(),
    mode: MODE,
    sync: sync(),
    agents: list,
    index: {
      bond_weighted: [...list].sort((x, y) => y.bond_weight - x.bond_weight).map((a) => a.id),
      legacy: [...list].sort((x, y) => (y.legacy_score ?? 0) - (x.legacy_score ?? 0)).map((a) => a.id),
    },
  };
}

function blankAgent(id, address, legacy_score = null) {
  return { id, address, wallets: address ? [address] : [], legacy_score,
    limit_x: null, bond: null, spent: '0.000000', status: 'unsecured', period_end: 0, deposit_id: null };
}

// Applies one feed event to agent state. Used by both modes.
function apply(ev) {
  const a = agents.get(ev.agent) || blankAgent(ev.agent, null);
  const d = ev.data || {};
  switch (ev.type) {
    case 'declared':
      Object.assign(a, { limit_x: d.limit_x, bond: d.bond, spent: '0.000000', status: 'secured',
        deposit_id: d.deposit_id ?? a.deposit_id,
        period_end: d.period_end ?? (d.period_minutes ? (ev.t ?? Date.now()) + d.period_minutes * 60000 : a.period_end) });
      break;
    case 'wallet_linked': if (d.wallet && !a.wallets.includes(d.wallet)) a.wallets.push(d.wallet); break;
    case 'topup':     Object.assign(a, { bond: d.bond ?? a.bond, limit_x: d.limit_x ?? a.limit_x }); break;
    case 'payment':   a.spent = d.spent_total; break;
    case 'violation': a.status = 'violated'; break;
    case 'slashed':   Object.assign(a, { status: 'slashed', bond: d.remaining }); break;
    case 'released':  Object.assign(a, { status: 'released', bond: '0.000000' }); break;
  }
  agents.set(a.id, a);
  events.push({ t: ev.t ?? Date.now(), ...ev });
}

// Legacy scores for act 1 ("the market as it is"): registry_snapshot.json.
// Every listed address becomes an unsecured agent until it declares on chain.
function seedRegistry() {
  let snap;
  try { snap = JSON.parse(fs.readFileSync(new URL('./registry_snapshot.json', import.meta.url))); } catch { return 0; }
  for (const r of snap.agents || []) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(r.address)) continue;
    const id = r.id || agentId(r.address);
    agents.set(id, blankAgent(id, r.address, r.legacy_score ?? null));
  }
  return agents.size;
}

// ---------- MODE=replay ----------
function startReplay() {
  const file = JSON.parse(fs.readFileSync(new URL('./replay.json', import.meta.url)));
  const load = () => {
    agents.clear(); events.length = 0;
    for (const a of file.start_state.agents) agents.set(a.id, structuredClone(a));
  };
  load();
  // The replay starts PAUSED at the pre-attack state (acts 1 and 2 show the market before the attack).
  // The page's act 3 calls POST /replay/restart, which starts (or rewinds) the attack timeline.
  let t0 = null, next = 0;
  setInterval(() => {
    if (t0 === null) return;
    const elapsed = Date.now() - t0;
    while (next < file.timeline.length && file.timeline[next].offset_ms <= elapsed) {
      apply({ ...file.timeline[next].event, t: Date.now() });
      next++;
    }
  }, 250);
  app.post('/replay/restart', (_req, res) => { load(); t0 = Date.now(); next = 0; res.json({ ok: true }); });
  console.log(`replay: ${file.timeline.length} events, waiting for act 3 (POST /replay/restart)`);
}

// ---------- MODE=live ----------
// Event signatures — identical to contracts/AEON.sol (BondVault + Verifier).
const ABI = parseAbi([
  'event Declared(uint256 indexed depositId, address indexed depositor, uint256 bond, uint256 limit, uint64 periodEnd)',
  'event WalletLinked(uint256 indexed depositId, address wallet)',
  'event ToppedUp(uint256 indexed depositId, uint256 amount, uint256 newBond, uint256 newLimit)',
  'event Slashed(uint256 indexed depositId, uint256 excess, uint256 penalty, uint256 remaining)',
  'event Released(uint256 indexed depositId, uint256 amount)',
  'event Payment(uint256 indexed depositId, address indexed from, address indexed to, uint256 amount, uint256 spentTotal)',
  'event Violation(uint256 indexed depositId, uint256 spent, uint256 limit)',
]);

async function startLive() {
  const client = createPublicClient({ transport: http(RPC_URL) });
  const seeded = seedRegistry();

  const byDeposit = new Map(); // depositId -> agent id
  const blockTime = new Map(); // blockNumber -> unix ms (so the feed shows real chain time, also after a restart)
  let from = START_BLOCK, head = 0n, busy = false;
  sync = () => ({ head: Number(head), indexed: Number(from - 1n), rpc: new URL(RPC_URL).host });

  async function timeOf(blockNumber) {
    if (!blockTime.has(blockNumber)) {
      const b = await client.getBlock({ blockNumber });
      blockTime.set(blockNumber, Number(b.timestamp) * 1000);
    }
    return blockTime.get(blockNumber);
  }

  async function tick() {
    if (busy) return; // a long catch-up is still running — don't start a second one
    busy = true;
    try {
      head = await client.getBlockNumber();
      while (from <= head) {
        const to = from + MAX_RANGE - 1n < head ? from + MAX_RANGE - 1n : head;
        const logs = await client.getLogs({ address: [VAULT, VERIFIER], fromBlock: from, toBlock: to });
        for (const log of logs) await handle(log);
        from = to + 1n;
      }
    } catch (e) {
      console.error('poll error (will retry next tick):', e.shortMessage || e.message);
    } finally {
      busy = false;
    }
  }

  async function handle(log) {
    let ev;
    try { ev = decodeEventLog({ abi: ABI, data: log.data, topics: log.topics }); } catch { return; }
    const x = ev.args, tx = log.transactionHash, dep = Number(x.depositId);
    const t = await timeOf(log.blockNumber);

    if (ev.eventName === 'Declared') {
      const id = agentId(x.depositor);
      byDeposit.set(dep, id);
      if (!agents.has(id)) agents.set(id, blankAgent(id, x.depositor));
      const periodEnd = Number(x.periodEnd) * 1000;
      const minutes = Math.max(1, Math.round((periodEnd - t) / 60000));
      apply({ t, type: 'declared', agent: id, tx,
        text: `declaration published: limit ${fmt(x.limit)} USDC for ${minutes} min`,
        data: { limit_x: usdc(x.limit), bond: usdc(x.bond), deposit_id: dep, period_end: periodEnd } });
      return;
    }

    const id = byDeposit.get(dep);
    if (!id) return; // deposit declared before START_BLOCK — ignore
    if (agents.get(id)?.deposit_id !== dep) return; // event for an older deposit of the same agent — ignore
    switch (ev.eventName) {
      case 'WalletLinked': apply({ t, type: 'wallet_linked', agent: id, tx, text: `wallet linked ${x.wallet.slice(0, 8)}…`, data: { wallet: x.wallet } }); break;
      case 'ToppedUp':     apply({ t, type: 'topup', agent: id, tx, text: `bond topped up +${fmt(x.amount)} USDC`, data: { bond: usdc(x.newBond), limit_x: usdc(x.newLimit) } }); break;
      case 'Payment':      apply({ t, type: 'payment', agent: id, tx, text: `payment ${fmt(x.amount)} USDC`, data: { amount: usdc(x.amount), spent_total: usdc(x.spentTotal) } }); break;
      case 'Violation':    apply({ t, type: 'violation', agent: id, tx, text: `violation: ${fmt(x.spent)} > ${fmt(x.limit)} — flag() called, math re-checked`, data: { spent: usdc(x.spent), limit_x: usdc(x.limit) } }); break;
      case 'Slashed':      apply({ t, type: 'slashed', agent: id, tx, text: `bond burned: ${fmt(x.penalty)} USDC`, data: { excess: usdc(x.excess), penalty: usdc(x.penalty), remaining: usdc(x.remaining), burn_tx: tx } }); break;
      case 'Released':     apply({ t, type: 'released', agent: id, tx, text: `bond returned: ${fmt(x.amount)} USDC`, data: {} }); break;
    }
  }

  // In live mode there is nothing to rewind: a new attack = run scenario.mjs again.
  app.post('/replay/restart', (_req, res) => res.json({ ok: false, mode: 'live', hint: 'run `npm run attack` to produce a new attack on chain' }));

  console.log(`live: ${new URL(RPC_URL).host}, vault ${VAULT}, verifier ${VERIFIER}`);
  console.log(`live: ${seeded} agents seeded from registry_snapshot.json; indexing from block ${from} every ${POLL_MS} ms`);
  tick().then(() => console.log(`live: caught up — ${events.length} events, ${agents.size} agents, head block ${head}`));
  setInterval(tick, POLL_MS); // <- this line is the whole "polling"
}

// ---------- HTTP ----------
const app = express();
app.use((_req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); }); // open CORS for the demo page
app.use(express.static(fileURLToPath(new URL('../frontend', import.meta.url)))); // the demo page itself: http://localhost:8787/
app.get('/state', (_req, res) => res.json(snapshot()));
app.get('/events', (req, res) => {
  const since = Number(req.query.since || 0);
  res.json({ events: events.filter((e) => e.t > since) });
});
app.get('/', (_req, res) => res.send(`ÆON backend, mode=${MODE}. Try /state and /events?since=0`));

app.listen(PORT, () => console.log(`listening on http://localhost:${PORT}  (mode=${MODE})`));
if (MODE === 'live') startLive(); else startReplay();
