// scenario.mjs — runs act 3 on chain, from the terminal, no Remix clicking:
//
//   npm run attack                 declare → payment 12 → 240 → 760 → flag()   (≈ 30 s)
//   npm run release -- <depositId> give the remaining bond back (works 40 min after declare)
//
// Needs in .env:  AGENT_KEY=0x…   FLAGGER_KEY=0x…   (private keys of the two TEST wallets)
// Both wallets need a little Base Sepolia ETH for gas. Never commit .env.
//
// Every transaction is printed with its Basescan link — these are the links the jury sees.

import './env.js';
import { createPublicClient, createWalletClient, http, parseAbi, decodeEventLog, defineChain, formatUnits, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
const TOKEN = process.env.TOKEN || '0x1e66BE4dB904D011Ee40E9151E5F9727FEe7375B';
const VAULT = process.env.VAULT || '0xD42d1CAAa7BD9979c68933D2faF97eb8691E2e4C';
const VERIFIER = process.env.VERIFIER || '0xE67348E67A62C5CF3d2943A7dDbF6781767601e0';

const LIMIT = parseUnits(process.env.LIMIT || '1000', 6);            // declared limit X, in mUSDC
const PERIOD = BigInt(process.env.PERIOD_SEC || 1800);               // 30 min
const PAYMENTS = (process.env.PAYMENTS || '12,240,760').split(',').map((s) => parseUnits(s.trim(), 6));
const DELAY = Number(process.env.PAY_DELAY_MS || 4000);              // pause between payments, so the audience can follow

const tokenAbi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function mint(address to, uint256 amount)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);
const vaultAbi = parseAbi([
  'function declare(uint256 limit, uint64 periodSeconds) returns (uint256)',
  'function release(uint256 id)',
  'function deposits(uint256) view returns (address depositor, uint256 bond, uint256 limit, uint64 periodEnd, bool slashed, bool released)',
  'event Declared(uint256 indexed depositId, address indexed depositor, uint256 bond, uint256 limit, uint64 periodEnd)',
]);
const verifierAbi = parseAbi([
  'function pay(uint256 depositId, address to, uint256 amount)',
  'function flag(uint256 depositId)',
  'function spent(uint256) view returns (uint256)',
]);

const key = (name) => {
  const v = (process.env[name] || '').trim();
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(v)) { console.error(`✖ ${name} is missing or not a 64-hex private key — put it in .env`); process.exit(1); }
  return v.startsWith('0x') ? v : `0x${v}`;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const m = (raw) => Number(formatUnits(raw, 6)).toLocaleString('en-US');

const pub = createPublicClient({ transport: http(RPC_URL) });
const chainId = await pub.getChainId();
const onBase = chainId === 84532;
const chain = onBase ? baseSepolia : defineChain({ id: chainId, name: 'local', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } });
const link = (hash) => (onBase ? `https://sepolia.basescan.org/tx/${hash}` : hash);

const agent = privateKeyToAccount(key('AGENT_KEY'));
const flagger = privateKeyToAccount(key('FLAGGER_KEY'));
const wallet = (account) => createWalletClient({ account, chain, transport: http(RPC_URL) });
const shop = process.env.SHOP || flagger.address; // who receives the payments; any address works

async function send(account, label, call) {
  const hash = await wallet(account).writeContract(call);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`${label} reverted: ${link(hash)}`);
  console.log(`✔ ${label.padEnd(26)} ${link(hash)}`);
  return r;
}

async function needGas(account, role) {
  const bal = await pub.getBalance({ address: account.address });
  if (bal === 0n) { console.error(`✖ ${role} wallet ${account.address} has 0 ETH — send it a little Base Sepolia ETH for gas`); process.exit(1); }
}

const sub = process.argv[2];

if (sub === 'release') {
  const id = BigInt(process.argv[3] || 0);
  if (!id) { console.error('usage: npm run release -- <depositId>'); process.exit(1); }
  await needGas(agent, 'agent');
  const [, bond, , periodEnd] = await pub.readContract({ address: VAULT, abi: vaultAbi, functionName: 'deposits', args: [id] });
  const openAt = Number(periodEnd) + 600;
  const now = Number((await pub.getBlock()).timestamp); // chain time, which is what the contract checks
  if (now < openAt) { console.error(`✖ too early: release opens at ${new Date(openAt * 1000).toLocaleTimeString()} (period end + 10 min)`); process.exit(1); }
  await send(agent, `release #${id} (${m(bond)} mUSDC back)`, { address: VAULT, abi: vaultAbi, functionName: 'release', args: [id] });
  process.exit(0);
}

// ---------- the attack ----------
console.log(`chain ${chainId}${onBase ? ' (Base Sepolia)' : ''} · agent ${agent.address} (page shows it as agent#${agent.address.slice(2, 6).toLowerCase()}) · flagger ${flagger.address}`);
await needGas(agent, 'agent');
await needGas(flagger, 'flagger');

const total = PAYMENTS.reduce((a, b) => a + b, 0n);
const need = LIMIT + total;
const bal = await pub.readContract({ address: TOKEN, abi: tokenAbi, functionName: 'balanceOf', args: [agent.address] });
if (bal < need) await send(agent, `mint ${m(need)} mUSDC`, { address: TOKEN, abi: tokenAbi, functionName: 'mint', args: [agent.address, need] });

await send(agent, `approve vault ${m(LIMIT)}`, { address: TOKEN, abi: tokenAbi, functionName: 'approve', args: [VAULT, LIMIT] });
await send(agent, `approve verifier ${m(total)}`, { address: TOKEN, abi: tokenAbi, functionName: 'approve', args: [VERIFIER, total] });

const r = await send(agent, `declare limit ${m(LIMIT)}, ${PERIOD / 60n} min`, { address: VAULT, abi: vaultAbi, functionName: 'declare', args: [LIMIT, PERIOD] });
let depositId;
for (const log of r.logs) {
  try { const e = decodeEventLog({ abi: vaultAbi, data: log.data, topics: log.topics }); if (e.eventName === 'Declared') depositId = e.args.depositId; } catch {}
}
if (depositId === undefined) throw new Error('Declared event not found in receipt');
console.log(`  depositId = ${depositId}   (bond ${m(LIMIT)} mUSDC locked)`);

let spent = 0n;
for (const amount of PAYMENTS) {
  await sleep(DELAY);
  spent += amount;
  const over = spent > LIMIT ? '   ← over the limit' : '';
  await send(agent, `pay ${m(amount)} (spent ${m(spent)})${over}`, { address: VERIFIER, abi: verifierAbi, functionName: 'pay', args: [depositId, shop, amount] });
}

await sleep(DELAY);
await send(flagger, `flag(#${depositId}) by stranger`, { address: VERIFIER, abi: verifierAbi, functionName: 'flag', args: [depositId] });

const [, bond, limit, periodEnd, slashed] = await pub.readContract({ address: VAULT, abi: vaultAbi, functionName: 'deposits', args: [depositId] });
console.log(`\nresult: deposit #${depositId} slashed=${slashed}, burned ${m(limit - bond)} mUSDC, remaining bond ${m(bond)} mUSDC`);
console.log(`release opens at ${new Date((Number(periodEnd) + 600) * 1000).toLocaleTimeString()}:  npm run release -- ${depositId}`);
process.exit(0);
