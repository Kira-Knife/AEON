import { NextResponse } from "next/server";
import { makeClient } from "@/lib/indexer/source-live";

const RPC = process.env.BASE_SEPOLIA_RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? "";

export async function GET() {
  const start = Date.now();
  let rpcOk   = false;
  let block   = 0;

  try {
    const client = makeClient(RPC);
    block  = Number(await client.getBlockNumber());
    rpcOk  = true;
  } catch {
    rpcOk = false;
  }

  const lagSec = (Date.now() - start) / 1000;

  return NextResponse.json({
    mode:   "live",
    block,
    rpcOk,
    lagSec: Number(lagSec.toFixed(2)),
    stale:  !rpcOk,
    ts:     Date.now(),
  });
}
