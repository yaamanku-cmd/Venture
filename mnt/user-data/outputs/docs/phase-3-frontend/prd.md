# PRD — Phase 3: Frontend Dashboard (React)

**Deliverable:** `frontend/` — Vite + React + Tailwind + Recharts
**Status:** ✅ Code complete · ⏳ `npm install` and browser render pending on user machine

---

## 1. Objective

Give a fraud analyst a live, glanceable view of the transaction stream: what is
arriving, what the model is flagging, and at what rate — updating without any
manual refresh.

## 2. Primary User

**Fraud analyst / ops operator.** Watches the board during a shift. Needs to
notice a fraud flag within a second of it happening, and needs the aggregate
rate to spot when something is going wrong (e.g. flag rate spiking).

Secondary user: **the reviewer of this project**, who needs visual proof the
pipeline is live rather than a static mock.

## 3. Functional Requirements

### 3.1 Connection
| ID | Requirement |
|---|---|
| FR3.1 | Connect to `ws://localhost:8000/ws/feed` on mount |
| FR3.2 | Display a live/disconnected indicator that reflects real socket state |
| FR3.3 | Auto-reconnect on socket close (2 s retry), indefinitely |
| FR3.4 | Poll `GET /stats` every 3 s to reconcile counters missed before connection |
| FR3.5 | Tear down socket, timers, and polling interval on unmount |

### 3.2 Live feed table
| ID | Requirement |
|---|---|
| FR3.6 | Newest transaction at the top |
| FR3.7 | Cap the rendered rows (40) — unbounded growth degrades the browser over a long stream |
| FR3.8 | **Rows verdicted `Fraud` render in red** with a distinct badge |
| FR3.9 | Briefly flash a newly-arrived fraud row so it is noticeable without staring |
| FR3.10 | Columns: sequence #, Time, Amount, P(fraud), Verdict, Actual (ground truth) |
| FR3.11 | Render an explicit empty state instructing the user to start `streamer.py` |
| FR3.12 | Render `—` when `ground_truth` is null rather than crashing or showing `undefined` |

### 3.3 Chart
| ID | Requirement |
|---|---|
| FR3.13 | Line chart of fraud probability over the stream (Recharts) |
| FR3.14 | Y-axis pinned to `[0, 1]` — an auto-scaled axis makes a 0.03 baseline look alarming |
| FR3.15 | Rolling window of the last 60 points |
| FR3.16 | Animation disabled — re-animating on every 0.2 s tick causes visible jitter |

### 3.4 Summary cards
| ID | Requirement |
|---|---|
| FR3.17 | Total scored, Legitimate count, Flagged fraud count, Fraud rate % |
| FR3.18 | Colour-code: legit green, fraud red, rate amber |

## 4. Non-Functional Requirements

- **Sustained performance:** must stay responsive at 5 transactions/sec for a
  long session. Both the table and chart use bounded buffers to guarantee this.
- **Resilience:** backend restart must not require a page reload.
- **No build-time backend dependency:** the app builds and renders (empty
  state) whether or not the API is up.

## 5. Tech Stack & Rationale

| Choice | Why |
|---|---|
| Vite | Fast dev server, required by the brief |
| Tailwind | Required by the brief; conditional row colouring is concise in utility classes |
| Recharts | Required by the brief; `ResponsiveContainer` + `LineChart` covers the need directly |
| Native `WebSocket` | No library needed for a single unauthenticated socket |
| React `useState`/`useRef` | No global state manager warranted for one view |

## 6. Explicitly Out of Scope

- Routing / multiple pages.
- Historical query, date filtering, or search.
- Analyst actions (approve / decline / escalate) — display only.
- Authentication.
- Mobile-optimised layout (desktop ops board assumed; grid degrades to single
  column but the table is not reworked for narrow screens).
- Persisting feed across page reloads.

## 7. Key Design Decisions

| Decision | Reason |
|---|---|
| WebSocket for the feed, polling only for `/stats` | Push gives instant row appearance; the 3 s stats poll exists purely to repair counters for a tab that connected late |
| Bounded buffers (40 rows / 60 points) | At 5 txn/s an unbounded feed reaches 18,000 rows in an hour and the tab dies |
| Fraud styling is driven by `verdict`, not `ground_truth` | The board must show **what the model decided**. Colouring by truth would hide false positives — exactly what an analyst needs to see |
| `ground_truth` shown in a separate muted column | Lets a reviewer spot FP/FN at a glance without it influencing the primary alert styling |
| Y-axis fixed `[0, 1]` | Probabilities are absolute; auto-scaling a 0.03–0.05 baseline to full height would falsely imply volatility |

## 8. Success Criteria

- [x] Fraud rows visually unmistakable (red background + badge + flash)
- [x] Buffers bounded
- [x] Reconnect logic present with cleanup on unmount
- [x] Empty state guides the user to the next action
- [ ] Renders live data in a browser at `localhost:5173` — pending user run

## 9. Risks

| Risk | Mitigation |
|---|---|
| Backend down at page load | Empty state + auto-reconnect; no crash |
| WS and `/stats` counters disagree | `/stats` is authoritative and overwrites on each poll |
| Long session memory growth | Bounded buffers on both feed and chart |
| Fraud is rare — board looks inert | Run streamer with `--shuffle`; fraud rate card confirms the stream is live even with no current flags |
