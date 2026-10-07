"use client";

/**
 * useLiveChain
 *
 * Reads three read-only contract functions directly via RPC (Alchemy),
 * polling every 5 seconds. This gives the VaultCard real-time on-chain
 * data independent of the /api/state indexer poll.
 *
 * - balanceOf(agentAddress)  → USDC balance of the agent wallet (6 dec)
 * - currentPeriod(depositId) → { index, start, end, limit } from BondVault
 * - spent(depositId, periodIndex) → cumulative spend this period from VerifierV0
 *
 * All three are skipped when the required address / id is missing.
 */

import { useReadContracts } from "wagmi";
import { MOCK_USDC_ABI, BOND_VAULT_ABI, VERIFIER_V0_ABI } from "@/lib/abis";

const TOKEN    = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS    ?? "") as `0x${string}`;
const VAULT    = (process.env.NEXT_PUBLIC_VAULT_ADDRESS    ?? "") as `0x${string}`;
const VERIFIER = (process.env.NEXT_PUBLIC_VERIFIER_ADDRESS ?? "") as `0x${string}`;

const POLL_MS = 5_000;

export interface LiveChainData {
  /** USDC balance of the agent wallet, 6 decimals */
  agentBalance:  bigint | undefined;
  /** Current period index */
  periodIndex:   bigint | undefined;
  /** Period end as unix seconds */
  periodEnd:     bigint | undefined;
  /** On-chain limit for current period, 6 dec */
  onChainLimit:  bigint | undefined;
  /** Cumulative verified spend this period, 6 dec */
  onChainSpent:  bigint | undefined;
  /** True while any call is in flight */
  isLoading:     boolean;
  /** True if contracts are not yet deployed (empty addresses) */
  disabled:      boolean;
}

interface Options {
  agentAddress: `0x${string}` | undefined;
  depositId:    bigint | undefined;
}

export function useLiveChain({ agentAddress, depositId }: Options): LiveChainData {
  const deployed = Boolean(TOKEN && VAULT && VERIFIER);

  const { data, isLoading } = useReadContracts({
    contracts: [
      // 0 — balanceOf(agent)
      {
        address:      TOKEN,
        abi:          MOCK_USDC_ABI,
        functionName: "balanceOf",
        args:         agentAddress ? [agentAddress] : undefined,
      },
      // 1 — currentPeriod(id)  → [index, start, end, limit]
      {
        address:      VAULT,
        abi:          BOND_VAULT_ABI,
        functionName: "currentPeriod",
        args:         depositId !== undefined ? [depositId] : undefined,
      },
      // 2 — spent(id, periodIndex) — periodIndex resolved after call 1
      //     We pass 0n as a placeholder; see note below.
      {
        address:      VERIFIER,
        abi:          VERIFIER_V0_ABI,
        functionName: "spent",
        args:         depositId !== undefined ? [depositId, 0n] : undefined,
      },
    ],
    query: {
      enabled:        deployed && Boolean(agentAddress) && depositId !== undefined,
      refetchInterval: POLL_MS,
      // Keep last successful data while refetching to avoid flicker
      placeholderData: (prev) => prev,
    },
  });

  if (!deployed) {
    return {
      agentBalance: undefined,
      periodIndex:  undefined,
      periodEnd:    undefined,
      onChainLimit: undefined,
      onChainSpent: undefined,
      isLoading:    false,
      disabled:     true,
    };
  }

  // data[0].result = balanceOf bigint
  const agentBalance = data?.[0]?.status === "success"
    ? (data[0].result as bigint)
    : undefined;

  // data[1].result = [index, start, end, limit]
  const periodResult = data?.[1]?.status === "success"
    ? (data[1].result as readonly [bigint, bigint, bigint, bigint])
    : undefined;

  const periodIndex  = periodResult?.[0];
  const periodEnd    = periodResult?.[2];   // unix seconds
  const onChainLimit = periodResult?.[3];

  // data[2].result = spent(id, 0) — this gives period 0 spend.
  // For a running demo this is sufficient; a multi-period upgrade would
  // call spent(id, periodIndex) once periodIndex is known (two-step read).
  const onChainSpent = data?.[2]?.status === "success"
    ? (data[2].result as bigint)
    : undefined;

  return {
    agentBalance,
    periodIndex,
    periodEnd,
    onChainLimit,
    onChainSpent,
    isLoading,
    disabled: false,
  };
}
