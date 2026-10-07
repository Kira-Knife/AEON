/* eslint-disable @typescript-eslint/no-explicit-any */
import { createPublicClient, http, parseAbiItem } from "viem";
import { baseSepolia } from "viem/chains";
import type { NormalizedEvent } from "./types";

const RPC_PRIMARY  = process.env.BASE_SEPOLIA_RPC_URL  ?? process.env.NEXT_PUBLIC_RPC_URL ?? "";
const RPC_FALLBACK = process.env.BASE_SEPOLIA_RPC_FALLBACK ?? "https://sepolia.base.org";

export function makeClient(rpcUrl: string) {
  return createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
}

// Block timestamp cache — fetch once per unique block
const blockTsCache = new Map<bigint, number>();

async function getBlockTs(client: ReturnType<typeof makeClient>, blockNumber: bigint): Promise<number> {
  if (blockTsCache.has(blockNumber)) return blockTsCache.get(blockNumber)!;
  try {
    const block = await client.getBlock({ blockNumber });
    const ts = Number(block.timestamp) * 1000;
    blockTsCache.set(blockNumber, ts);
    return ts;
  } catch {
    return Date.now();
  }
}

const VAULT_ABI_EVENTS = [
  parseAbiItem("event Deposited(uint256 indexed id, address indexed agent, address returnTo, address verifier, uint256 amount, uint256 limit, uint64 periodStart, uint64 periodLength, uint64 challengeWindow, uint32 mBps)"),
  parseAbiItem("event ToppedUp(uint256 indexed id, uint256 amount, uint256 newBond, uint256 newLimit)"),
  parseAbiItem("event LimitDecreaseScheduled(uint256 indexed id, uint256 newLimit)"),
  parseAbiItem("event PeriodRolled(uint256 indexed id, uint64 periodIndex, uint256 limit, uint64 periodStart)"),
  parseAbiItem("event Slashed(uint256 indexed id, uint64 indexed periodIndex, uint256 newExcess, uint256 penalty, uint256 bondLeft)"),
  parseAbiItem("event Returned(uint256 indexed id, address indexed to, uint256 amount)"),
] as const;

const VERIFIER_ABI_EVENTS = [
  parseAbiItem("event Spent(uint256 indexed id, uint64 indexed periodIndex, address to, uint256 amount, uint256 periodTotal)"),
  parseAbiItem("event Flagged(uint256 indexed id, uint64 indexed periodIndex, uint256 totalSpent, uint256 limit, uint256 excess, address indexed flagger)"),
] as const;

const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

// Map event name to NormalizedEvent.kind
const KIND_MAP: Record<string, NormalizedEvent["kind"]> = {
  Deposited:              "Deposited",
  ToppedUp:               "ToppedUp",
  LimitDecreaseScheduled: "LimitDecreaseScheduled",
  PeriodRolled:           "PeriodRolled",
  Slashed:                "Slashed",
  Returned:               "Returned",
  Spent:                  "Spent",
  Flagged:                "Flagged",
  Transfer:               "Transfer",
};

export interface SourceResult {
  events: NormalizedEvent[];
  latestBlock: number;
  rpcOk: boolean;
}

export async function fetchEvents(
  vaultAddress: `0x${string}`,
  verifierAddress: `0x${string}`,
  tokenAddress: `0x${string}`,
  deployBlock: bigint,
): Promise<SourceResult> {
  let client = makeClient(RPC_PRIMARY);
  let rpcOk  = true;

  let latestBlock = 0n;
  try {
    latestBlock = await client.getBlockNumber();
  } catch {
    rpcOk  = false;
    client = makeClient(RPC_FALLBACK);
    try { latestBlock = await client.getBlockNumber(); } catch { /* stay 0 */ }
  }

  const CHUNK = 10000n;
  const allLogs: NormalizedEvent[] = [];
  const seen = new Set<string>();

  async function fetchRange(
    address: `0x${string}`,
    events: readonly ReturnType<typeof parseAbiItem>[],
    from: bigint,
    to: bigint,
  ) {
    // Chunk to avoid RPC limits
    for (let start = from; start <= to; start += CHUNK) {
      const end = start + CHUNK - 1n < to ? start + CHUNK - 1n : to;
      try {
        const logs = await client.getLogs({
          address,
          events: events as any,
          fromBlock: start,
          toBlock: end,
        });
        for (const log of logs) {
          const key = `${log.transactionHash}-${log.logIndex}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const ts = await getBlockTs(client, log.blockNumber ?? 0n);
          const eventName = (log as any).eventName as string;
          allLogs.push({
            seq: 0,
            t: ts,
            kind: KIND_MAP[eventName] ?? "Spent",
            txHash: log.transactionHash ?? "",
            logIndex: log.logIndex ?? 0,
            blockNumber: Number(log.blockNumber ?? 0),
            payload: { ...(log as any).args },
          });
        }
      } catch {
        // chunk failed — skip silently
      }
    }
  }

  if (latestBlock > 0n) {
    await Promise.all([
      fetchRange(vaultAddress,    VAULT_ABI_EVENTS,    deployBlock, latestBlock),
      fetchRange(verifierAddress, VERIFIER_ABI_EVENTS, deployBlock, latestBlock),
      fetchRange(tokenAddress,    [TRANSFER_EVENT],    deployBlock, latestBlock),
    ]);
  }

  // Sort by block then logIndex, assign seq
  allLogs.sort((a, b) => a.blockNumber !== b.blockNumber
    ? a.blockNumber - b.blockNumber
    : a.logIndex - b.logIndex
  );
  allLogs.forEach((e, i) => { e.seq = i; });

  return { events: allLogs, latestBlock: Number(latestBlock), rpcOk };
}
