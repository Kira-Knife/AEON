/* eslint-disable @typescript-eslint/no-explicit-any */
import { createPublicClient, http, parseAbiItem } from "viem";
import { baseSepolia } from "viem/chains";
import { BOND_VAULT_ABI, VERIFIER_V0_ABI } from "./abis"; // eslint-disable-line @typescript-eslint/no-unused-vars

const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS as `0x${string}`;
const VERIFIER_ADDRESS = process.env.NEXT_PUBLIC_VERIFIER_ADDRESS as `0x${string}`;
const DEPLOY_BLOCK = BigInt(process.env.DEPLOY_BLOCK ?? "0");

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
});

export type DepositState = {
  id: bigint;
  agent: string;
  returnTo: string;
  bond: bigint;
  limit: bigint;
  periodIndex: bigint;
  spent: bigint;
  slashedTotal: bigint;
  returnedTotal: bigint;
  closed: boolean;
};

export type AppState = {
  deposits: DepositState[];
  events: EventEntry[];
  totalBonded: bigint;
  totalSecured: bigint;
  totalUnsecured: bigint;
};

export type EventEntry = {
  type: "Deposited" | "Spent" | "Flagged" | "Slashed" | "Returned" | "ToppedUp";
  txHash: string;
  blockNumber: bigint;
  data: Record<string, unknown>;
};

/** Stateless reducer: fetch all logs from DEPLOY_BLOCK, reduce in memory. */
export async function fetchAppState(): Promise<AppState> {
  const [depositedLogs, slashedLogs, returnedLogs, spentLogs, flaggedLogs, toppedUpLogs] =
    await Promise.all([
      publicClient.getLogs({
        address: VAULT_ADDRESS,
        event: parseAbiItem(
          "event Deposited(uint256 indexed id, address indexed agent, address returnTo, address verifier, uint256 amount, uint256 limit, uint64 periodStart, uint64 periodLength, uint64 challengeWindow, uint32 mBps)"
        ),
        fromBlock: DEPLOY_BLOCK,
        toBlock: "latest",
      }),
      publicClient.getLogs({
        address: VAULT_ADDRESS,
        event: parseAbiItem(
          "event Slashed(uint256 indexed id, uint64 indexed periodIndex, uint256 newExcess, uint256 penalty, uint256 bondLeft)"
        ),
        fromBlock: DEPLOY_BLOCK,
        toBlock: "latest",
      }),
      publicClient.getLogs({
        address: VAULT_ADDRESS,
        event: parseAbiItem(
          "event Returned(uint256 indexed id, address indexed to, uint256 amount)"
        ),
        fromBlock: DEPLOY_BLOCK,
        toBlock: "latest",
      }),
      publicClient.getLogs({
        address: VERIFIER_ADDRESS,
        event: parseAbiItem(
          "event Spent(uint256 indexed id, uint64 indexed periodIndex, address to, uint256 amount, uint256 periodTotal)"
        ),
        fromBlock: DEPLOY_BLOCK,
        toBlock: "latest",
      }),
      publicClient.getLogs({
        address: VERIFIER_ADDRESS,
        event: parseAbiItem(
          "event Flagged(uint256 indexed id, uint64 indexed periodIndex, uint256 totalSpent, uint256 limit, uint256 excess, address indexed flagger)"
        ),
        fromBlock: DEPLOY_BLOCK,
        toBlock: "latest",
      }),
      publicClient.getLogs({
        address: VAULT_ADDRESS,
        event: parseAbiItem(
          "event ToppedUp(uint256 indexed id, uint256 amount, uint256 newBond, uint256 newLimit)"
        ),
        fromBlock: DEPLOY_BLOCK,
        toBlock: "latest",
      }),
    ]);

  // Build deposit map
  const depositMap = new Map<string, DepositState>();

  for (const log of depositedLogs) {
    const { id, agent, returnTo, amount, limit } = log.args as any;
    depositMap.set(id.toString(), {
      id,
      agent,
      returnTo,
      bond: amount,
      limit,
      periodIndex: 0n,
      spent: 0n,
      slashedTotal: 0n,
      returnedTotal: 0n,
      closed: false,
    });
  }

  // Apply top-ups
  for (const log of toppedUpLogs) {
    const { id, newBond, newLimit } = log.args as any;
    const d = depositMap.get(id.toString());
    if (d) {
      d.bond = newBond;
      d.limit = newLimit;
    }
  }

  // Track latest spent per deposit (use last Spent event's periodTotal)
  const spentMap = new Map<string, bigint>();
  for (const log of spentLogs) {
    const { id, periodTotal } = log.args as any;
    spentMap.set(id.toString(), periodTotal);
  }
  for (const [id, spent] of spentMap) {
    const d = depositMap.get(id);
    if (d) d.spent = spent;
  }

  // Apply slashes (accumulate penalty to get slashedTotal, update bond via bondLeft)
  for (const log of slashedLogs) {
    const { id, penalty, bondLeft } = log.args as any;
    const d = depositMap.get(id.toString());
    if (d) {
      d.slashedTotal += penalty;
      d.bond = bondLeft;
    }
  }

  // Apply returns
  for (const log of returnedLogs) {
    const { id, amount } = log.args as any;
    const d = depositMap.get(id.toString());
    if (d) {
      d.returnedTotal += amount;
      d.bond = 0n;
      d.closed = true;
    }
  }

  const deposits = Array.from(depositMap.values());

  // Compute index totals
  let totalBonded = 0n;
  let totalSecured = 0n;
  let totalUnsecured = 0n;

  for (const d of deposits) {
    if (!d.closed) totalBonded += d.bond;
    const secured = d.spent < d.limit ? d.spent : d.limit;
    const unsecured = d.spent > d.limit ? d.spent - d.limit : 0n;
    totalSecured += secured;
    totalUnsecured += unsecured;
  }

  // Build unified event feed, sorted by block number desc
  const events: EventEntry[] = [
    ...depositedLogs.map((l) => ({
      type: "Deposited" as const,
      txHash: l.transactionHash ?? "",
      blockNumber: l.blockNumber ?? 0n,
      data: l.args as Record<string, unknown>,
    })),
    ...spentLogs.map((l) => ({
      type: "Spent" as const,
      txHash: l.transactionHash ?? "",
      blockNumber: l.blockNumber ?? 0n,
      data: l.args as Record<string, unknown>,
    })),
    ...flaggedLogs.map((l) => ({
      type: "Flagged" as const,
      txHash: l.transactionHash ?? "",
      blockNumber: l.blockNumber ?? 0n,
      data: l.args as Record<string, unknown>,
    })),
    ...slashedLogs.map((l) => ({
      type: "Slashed" as const,
      txHash: l.transactionHash ?? "",
      blockNumber: l.blockNumber ?? 0n,
      data: l.args as Record<string, unknown>,
    })),
    ...returnedLogs.map((l) => ({
      type: "Returned" as const,
      txHash: l.transactionHash ?? "",
      blockNumber: l.blockNumber ?? 0n,
      data: l.args as Record<string, unknown>,
    })),
    ...toppedUpLogs.map((l) => ({
      type: "ToppedUp" as const,
      txHash: l.transactionHash ?? "",
      blockNumber: l.blockNumber ?? 0n,
      data: l.args as Record<string, unknown>,
    })),
  ].sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));

  return { deposits, events, totalBonded, totalSecured, totalUnsecured };
}
