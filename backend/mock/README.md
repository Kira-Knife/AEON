# Mock data for the ÆON demo page

Build the page against these files — no backend, no contracts, no wallet needed.
The JSON is captured from the real backend (replay mode), so the shape is exact.

## Files

| File | What it is |
|---|---|
| `api.js` | The page's only data source. `?mock=1` in the URL → reads these files; otherwise → real backend. |
| `replay_mock.json` | 7 snapshots of `/state` (before the attack, then after each event) + the 6 events with timing. `api.js` plays it. |
| `state_act1.json` | `GET /state` before the attack. Open it to see the field names. |
| `state_final.json` | `GET /state` after the burn (agent#e4c7 = slashed, bond 988). |
| `events.json` | `GET /events?since=0` after the whole attack (6 events). |

## How to run

```bash
cd frontend
npx serve .            # or: python3 -m http.server 8000
```

Open `http://localhost:3000/?mock=1` — mock mode.
Open `http://localhost:3000/` — real backend at `http://localhost:8787`
(`?api=https://...` to point elsewhere). The page code is identical in both cases.

## What the mock plays (same as the real replay)

| at | event | agent#e4c7 after it |
|---|---|---|
| 2 s | `declared` — limit 1000, bond 1000 | secured, spent 0 |
| 5 s | `payment` 12 | spent 12 |
| 8 s | `payment` 240 | spent 252 |
| 11 s | `payment` 760 (prompt-injected) | spent 1012 |
| 13 s | `violation` — 1012 > 1000, flag() called | violated |
| 14 s | `slashed` — 12 USDC burned | slashed, bond 988 |

`api.restart()` rewinds to 0 s (same as `POST /replay/restart` on the backend).

## Rules

- Poll `api.getState()` every 2–3 s and `api.getEvents(lastT)` with the `t` of the last event you received.
- Row order comes from `state.index.legacy` (act 1) and `state.index.bond_weighted` (act 2). Never sort on the client.
- Do not compute `bond_weight` or `utilization` — they are in the JSON.
- Field formats (numbers as strings with 6 decimals, statuses, colours) are in `AEON_Frontend_References.xlsx`.
