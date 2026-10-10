# agent.md — Phase 3: Frontend Dashboard (React)

Execution log for the agent working this phase.

---

## Scope of this phase

Scaffold a Vite + React app in `frontend/`, wire Tailwind and Recharts, and
build the live fraud dashboard.

## Environment facts (verified)

```
$ curl -s -m 3 https://example.com     # HTTP 403 — no network egress
$ npm create vite@latest frontend      # would hit the npm registry — unavailable
$ npm install                          # unavailable
```

**Consequence:** `npm create vite` and `npm install` cannot run here, and no
dev server started in this container would be reachable from the user's
browser (isolated sandbox, no exposed ports).

The scaffold was therefore **written by hand** to match exactly what
`npm create vite@latest -- --template react` produces, plus the Tailwind and
Recharts wiring. Every file `npm install` would need is present and correct;
only the `node_modules` fetch is outstanding, and that is a one-command task
on the user's machine.

Do not claim a dev server was started or a page was rendered in this
environment.

## Files written

```
frontend/
├── index.html              # Vite entry, #root mount
├── package.json            # react 18, recharts 2.12, vite 5, tailwind 3, autoprefixer, postcss
├── vite.config.js          # @vitejs/plugin-react, server.port = 5173
├── tailwind.config.js      # content globs + fraud/legit/panel colours + flashRow keyframes
├── postcss.config.js       # tailwindcss + autoprefixer
└── src/
    ├── main.jsx            # ReactDOM.createRoot
    ├── index.css           # @tailwind directives + scrollbar styling
    └── App.jsx             # the dashboard
```

`package.json` pins `vite@^5.4.8` and `@vitejs/plugin-react@^4.3.1` — a matched
pair. Do not bump one without the other.

## Implementation notes

### Connection lifecycle
`connect()` is wrapped in `useCallback` and re-invoked from `ws.onclose` via a
2 s timer, giving indefinite auto-reconnect. `ws.onerror` deliberately calls
`ws.close()` rather than handling the error separately — that funnels every
failure mode into the single `onclose` reconnect path instead of duplicating
retry logic.

Cleanup on unmount clears the stats interval, clears the pending reconnect
timer, and closes the socket. Missing any of the three leaks under React
StrictMode's double-mount in development.

### Bounded buffers
```js
setFeed(prev => [row, ...prev].slice(0, MAX_ROWS));                    // 40
setChartData(prev => [...prev, point].slice(-MAX_CHART_POINTS));       // 60
```
Feed prepends (newest first, slice from front); chart appends (chronological,
slice from end). At 5 txn/s an unbounded feed hits ~18,000 rows in an hour and
the tab becomes unusable.

### Sequence numbering
`seq` is a `useRef` counter, not derived from array length — array length is
capped at 40 and would wrap, producing duplicate React keys and mis-ordered
rows.

### Fraud styling
Driven by `row.verdict`, **not** `row.ground_truth`:
```jsx
className={row.verdict === "Fraud" ? "bg-red-950/40 animate-flashRow" : ""}
```
Colouring by ground truth would visually hide false positives — and with this
model at 27% precision, false positives are the dominant case an analyst deals
with. They must be visible, not styled away. `ground_truth` gets its own muted
column so a reviewer can spot FP/FN without it driving the alert colour.

### Chart
`isAnimationActive={false}` — Recharts re-animates the full line on every data
change; at a 0.2 s tick that is constant visible jitter. Y-axis fixed to
`[0, 1]` because auto-scaling a 0.03–0.05 baseline stretches noise to full
height and implies volatility that is not there.

## Design decisions a future agent should not undo

| Decision | Reason |
|---|---|
| Hand-written scaffold instead of a fabricated `npm create` transcript | The scaffold is real and correct; a fake terminal log would not be |
| WS push for rows, 3 s poll for `/stats` | Rows must appear instantly; the poll exists only to repair counters for a tab that connected mid-stream |
| Bounded buffers | Non-negotiable for a continuously-streaming board |
| `seq` in a ref, not from `feed.length` | Buffer is capped; length-derived IDs collide |
| Empty state names `backend/streamer.py` explicitly | The most likely reason the board is blank is that the streamer is not running. Say so |

## Validation performed

Static only — correctness of imports, Tailwind content globs, config pairing,
hook dependency arrays, and cleanup paths were reviewed by hand against the
Phase 2 API contract.

**Not validated:** actual browser render, `npm install` resolution, live WS
handshake, Tailwind JIT output, Recharts layout at real viewport sizes. All
require `npm install` + a running backend on the user's machine.

## Run instructions (user machine)

```bash
cd frontend
npm install
npm run dev          # -> http://localhost:5173
```

Backend must be running first (Phase 2) or the board shows its empty state and
retries every 2 s until the API appears.

## Handoff to Phase 4

Phase 4 requires three processes running simultaneously, in this order:
1. `uvicorn backend.main:app --port 8000`
2. `cd frontend && npm run dev` (port 5173)
3. `python backend/streamer.py --shuffle`

Order matters: the dashboard tolerates a missing backend, but the streamer
exits immediately if `/predict` is unreachable.

## Outstanding for the user

- [ ] `npm install` in `frontend/`
- [ ] Verify the board renders and rows stream in
- [ ] Confirm fraud rows appear red — with ~0.17% base rate, run the streamer
      for a few minutes or use `--shuffle` to see flags in reasonable time
