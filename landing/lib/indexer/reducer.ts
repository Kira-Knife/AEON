/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  FeedItem, NormalizedEvent, Payment, PolAgent, PolIndex,
  RegistryEntry, Snapshot, Status,
} from "./types";
import { eventToFeedItem, resetFeedSeq } from "./feed";

interface AgentState {
  id:             string;
  address:        string;
  depositId:      number | null;
  limit:          bigint;
  pendingLimit:   bigint | null;
  bond:           bigint;
  mBps:           number;
  periodIndex:    number;
  periodStart:    number;   // unix seconds
  periodLength:   number;
  challengeWindow:number;
  spentVerified:  bigint;
  spentObserved:  bigint;
  slashed:        boolean;
  closed:         boolean;
  legacy_score:   number;
  label:          string;
}

function statusOf(s: AgentState): Status {
  if (s.depositId === null || (s.closed && !s.slashed)) return "unsecured";
  if (s.closed && s.slashed) return "released";
  if (s.slashed) return "slashed";
  if (s.spentVerified > s.limit) return "violated";
  if (s.bond > 0n) return "secured";
  return "unsecured";
}

function periodEndMs(s: AgentState): number {
  return (s.periodStart + s.periodLength) * 1000;
}

export function reduce(
  events: NormalizedEvent[],
  registry: RegistryEntry[],
  nowMs: number,
  chainId: number,
  latestBlock: number,
): Snapshot {
  resetFeedSeq();

  const regMap  = new Map(registry.map((r) => [r.address.toLowerCase(), r]));
  const agents  = new Map<string, AgentState>();
  const linked  = new Set<string>();
  const payments: Payment[] = [];
  const feed: FeedItem[] = [];

  for (const ev of events) {
    const p = ev.payload as any;

    switch (ev.kind) {
      case "Deposited": {
        const addr = String(p.agent ?? "").toLowerCase();
        const reg  = regMap.get(addr);
        const id   = `agent#${String(p.agent).slice(-4)}`;
        agents.set(addr, {
          id, address: p.agent,
          depositId:      Number(p.id ?? 0),
          limit:          BigInt(p.limit ?? 0),
          pendingLimit:   null,
          bond:           BigInt(p.amount ?? 0),
          mBps:           Number(p.mBps ?? 15000),
          periodIndex:    0,
          periodStart:    Number(p.periodStart ?? Math.floor(nowMs / 1000)),
          periodLength:   Number(p.periodLength ?? 600),
          challengeWindow:Number(p.challengeWindow ?? 120),
          spentVerified:  0n,
          spentObserved:  0n,
          slashed:        false,
          closed:         false,
          legacy_score:   reg?.legacy_score ?? 0,
          label:          reg?.label ?? id,
        });
        linked.add(addr);
        break;
      }
      case "ToppedUp": {
        const a = [...agents.values()].find((x) => x.depositId === Number(p.id));
        if (a) { a.bond = BigInt(p.newBond ?? a.bond); a.limit = BigInt(p.newLimit ?? a.limit); }
        break;
      }
      case "PeriodRolled": {
        const a = [...agents.values()].find((x) => x.depositId === Number(p.id));
        if (a) {
          a.periodIndex  = Number(p.periodIndex);
          a.periodStart  = Number(p.periodStart ?? Math.floor(nowMs / 1000));
          a.spentVerified = 0n;
          if (a.pendingLimit !== null) { a.limit = a.pendingLimit; a.pendingLimit = null; }
        }
        break;
      }
      case "Slashed": {
        const a = [...agents.values()].find((x) => x.depositId === Number(p.id));
        if (a) { a.bond = BigInt(p.bondLeft ?? 0); a.slashed = true; }
        break;
      }
      case "Returned": {
        const a = [...agents.values()].find((x) => x.depositId === Number(p.id));
        if (a) { a.bond = 0n; a.closed = true; }
        break;
      }
      case "Spent": {
        const a = [...agents.values()].find((x) => x.depositId === Number(p.id));
        if (a) a.spentVerified = BigInt(p.periodTotal ?? 0);
        payments.push({
          txHash: ev.txHash, logIndex: ev.logIndex, ts: Math.floor(ev.t / 1000),
          from: p.agent ?? "", to: p.to ?? "", amount: String(p.amount ?? 0),
          route: "verifier", counted: true,
        });
        break;
      }
      case "Transfer": {
        const from = String(p.from ?? "").toLowerCase();
        if (linked.has(from)) {
          const a = agents.get(from);
          if (a) a.spentObserved += BigInt(p.value ?? 0);
          payments.push({
            txHash: ev.txHash, logIndex: ev.logIndex, ts: Math.floor(ev.t / 1000),
            from: p.from, to: p.to, amount: String(p.value ?? 0),
            route: "direct", counted: true,
          });
        }
        break;
      }
      default: break;
    }

    const agentAddr = (p.agent ?? p.from ?? "") as string;
    const agentState = agents.get(String(agentAddr).toLowerCase());
    const item = eventToFeedItem(ev, agentState?.label ?? agentState?.id);
    if (item) feed.push(item);
  }

  // Add registry agents not yet on-chain
  for (const reg of registry) {
    const addr = reg.address.toLowerCase();
    if (!agents.has(addr)) {
      agents.set(addr, {
        id:             reg.label,
        address:        reg.address,
        depositId:      null,
        limit:          0n,
        pendingLimit:   null,
        bond:           0n,
        mBps:           15000,
        periodIndex:    0,
        periodStart:    0,
        periodLength:   600,
        challengeWindow:120,
        spentVerified:  0n,
        spentObserved:  0n,
        slashed:        false,
        closed:         false,
        legacy_score:   reg.legacy_score,
        label:          reg.label,
      });
    }
  }

  const agentList = [...agents.values()];
  const totalBond = agentList.reduce((s, a) => s + a.bond, 0n);

  // Build PolAgent[]
  const polAgents: PolAgent[] = agentList.map((s) => {
    const utilization = s.limit > 0n
      ? Number(s.spentVerified * 10000n / s.limit) / 10000
      : 0;
    const bond_weight = totalBond > 0n && s.bond > 0n
      ? Number(s.bond * 10000n / totalBond) / 10000
      : 0;

    return {
      id:           s.label,
      address:      s.address,
      legacy_score: s.legacy_score,
      limit_x:      s.limit > 0n ? s.limit.toString() : null,
      bond:         s.bond > 0n ? s.bond.toString() : null,
      spent:        s.spentVerified.toString(),
      utilization:  Math.min(utilization, 99),
      status:       statusOf(s),
      bond_weight,
      period_end:   periodEndMs(s),
      deposit_id:   s.depositId,
    };
  });

  // Build index (arrays of agent ids)
  const index: PolIndex = {
    legacy: [...polAgents]
      .sort((a, b) => (b.legacy_score ?? 0) - (a.legacy_score ?? 0))
      .map((a) => a.id),
    bond_weighted: [...polAgents]
      .sort((a, b) => {
        if (a.bond_weight === 0 && b.bond_weight > 0) return 1;
        if (b.bond_weight === 0 && a.bond_weight > 0) return -1;
        return b.bond_weight - a.bond_weight;
      })
      .map((a) => a.id),
  };

  return {
    meta: { mode: "live", chainId: 84532, decimals: 6, block: latestBlock, seq: 0, generatedAt: nowMs },
    agents: polAgents,
    payments,
    feed: feed.sort((a, b) => a.seq - b.seq),
    index,
  };
}
