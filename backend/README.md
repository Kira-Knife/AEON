# ÆON backend: indexer and event layer

Reads the contract events from Base Sepolia and serves two endpoints to the demo page:

| Endpoint | What it returns |
|---|---|
| `GET /state` | world snapshot: agents, limits, bonds, statuses, `index.legacy` / `index.bond_weighted` (row order), `sync` (head block, indexed block) |
| `GET /events?since=<ms>` | events newer than `<ms>`: `declared`, `payment`, `violation`, `slashed`, `released` |
| `POST /replay/restart` | rewinds the replay (replay mode only) |

There is no database. State lives in memory. On restart the indexer re-reads every event from `START_BLOCK`
and rebuilds the same state (a few seconds now, under a minute by Thursday).

## Contracts (Base Sepolia, chain 84532)

| | Address |
|---|---|
| MockUSDC | `0x1e66BE4dB904D011Ee40E9151E5F9727FEe7375B` |
| BondVault | `0xD42d1CAAa7BD9979c68933D2faF97eb8691E2e4C` |
| Verifier | `0xE67348E67A62C5CF3d2943A7dDbF6781767601e0` |
| Deploy block | `47755792` |

These are the defaults in `server.js`. Override them in `.env` only if the contracts are redeployed.

## Run

Needs Node 18+ (https://nodejs.org, LTS).

```bash
npm install
npm run live          # connects to Base Sepolia, polls every 2.5 s
```

Check: open http://localhost:8787/state. `sync.head` should grow every few seconds, and
`sync.indexed` should equal it after the first catch-up. http://localhost:8787/events?since=0 lists every event so far.

```bash
npm run replay        # stage fallback: plays replay.json, works offline, no contracts needed
                      # starts paused at the pre-attack state, act 3 on the page (POST /replay/restart) starts it
```

Same endpoints, same JSON. The page cannot tell the modes apart except for `mode` in `/state`.

The backend also serves the demo page: open http://localhost:8787/. One process, no CORS.

## Run the attack from the terminal (act 3)

`scenario.mjs` does what you would otherwise click in Remix: mint, approve, declare 1000 for 30 min,
pay 12, 240 and 760, then `flag()` from a second wallet. About 30 s on Base Sepolia. Every tx is printed with its Basescan link.

1. Copy `.env.example` to `.env`.
2. Put the private keys of the two **test** wallets into `.env`: `AGENT_KEY=…`, `FLAGGER_KEY=…`
   (MetaMask: account menu, Account details, Show private key). Both wallets need a little Base Sepolia ETH.
   `.env` is git-ignored. Never commit it, never share it.
3. `npm run attack`

Run it as many times as you like (each run = a new deposit). To get the remaining bond back 40 min after a declare:
`npm run release -- <depositId>`.

Real hashes for the offline replay. After a successful attack, with `npm run live` still running:

```bash
npm run stamp
```

copies the tx hashes of the last attack run into `replay.json` and `../frontend/mock/*.json`, so the feed links
and the "Basescan: burn tx" button work in replay mode too. Restart `npm run replay` afterwards.

## Act 1 data: `registry_snapshot.json`

Legacy scores for act 1. Every address listed becomes an unsecured agent with that score until it declares on chain.
Put the attack wallet first with a low score, so that in act 2 a low-score agent with a bond ranks above high-score
agents without one. The other entries are sample registry entries. Replace them with real ERC-8004 registry addresses
if there is time, otherwise say "sample registry" on stage.

## `.env` (optional)

| Key | Default | |
|---|---|---|
| `RPC_URL` | `https://sepolia.base.org` | an Alchemy/QuickNode URL is more reliable on stage |
| `PORT` | `8787` | hosting platforms set this themselves |
| `POLL_MS` | `2500` | polling interval |
| `MAX_RANGE` | `1000` | blocks per `eth_getLogs`. Lower it if the RPC complains about the range |
| `VAULT`, `VERIFIER`, `TOKEN`, `START_BLOCK` | deployed values | only if redeployed |
| `AGENT_KEY`, `FLAGGER_KEY` | none | attack script only |

## Hosting (so the stand stays up until Thu 16:00)

Railway / Render / Fly, Node service, start command `npm start` (= live mode). No volume, no database.
Add `RPC_URL` as an environment variable if you use Alchemy. Give the page the public URL via `?api=https://…`.

## How polling works

`setInterval(tick, 2500)`: every 2.5 s `tick()` asks the RPC for the latest block, fetches the contract logs since
the last block it saw (at most 1000 blocks per request), decodes them with the ABI and updates the state. If a request fails it
logs the error and retries on the next tick. A tick never overlaps with a still-running catch-up. No WebSockets.

## Folder

```
server.js               indexer + HTTP (replay and live)
scenario.mjs            attack / release script
env.js                  tiny .env loader
registry_snapshot.json  legacy scores for act 1
replay.json             recorded run for the stage fallback
```
