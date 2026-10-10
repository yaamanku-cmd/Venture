# PRD — Phase 4: End-to-End Verification & Artifacts

**Deliverable:** Running system + screenshot evidence of the live dashboard
**Status:** ⛔ **Blocked in the build sandbox — must be executed on the user's machine.** Runbook and acceptance checklist below.

---

## 1. Objective

Prove the four components work **together**: model → API → traffic simulator →
dashboard. Each phase validated its own piece in isolation; this phase is the
only one that demonstrates the system actually functions as a system.

## 2. Why this phase is blocked here

| Requirement | Blocker |
|---|---|
| Start FastAPI on :8000 | `fastapi`/`uvicorn` not installed; no network egress to install them |
| Start Vite dev server on :5173 | `npm install` requires the npm registry; no network egress |
| Browse to `localhost:5173` | No browser tool available in this environment |
| Screenshot the dashboard | Nothing to screenshot; and no port in this container is reachable from the user's browser |

The build sandbox is an isolated container, separate from the user's machine.
Servers started here would be invisible to the user regardless of installs.

**A screenshot could not be produced. None was fabricated.** This is the one
deliverable in the project that cannot be substituted with static validation —
its entire purpose is visual proof of a live render, so a mock-up would defeat
the point.

## 3. Functional Requirements (for the user's run)

| ID | Requirement |
|---|---|
| FR4.1 | FastAPI serving on `:8000`; `/health` returns `model_loaded: true` |
| FR4.2 | Vite dev server serving on `:5173` |
| FR4.3 | `streamer.py` POSTing holdout transactions at 0.2 s intervals |
| FR4.4 | Dashboard connected — live indicator green |
| FR4.5 | Rows appear in the feed without manual refresh |
| FR4.6 | At least one `Fraud`-verdicted row renders in red |
| FR4.7 | Stat cards increment; fraud rate computes |
| FR4.8 | Chart plots probability over the rolling window |
| FR4.9 | Screenshot captured as the review artifact |

## 4. Runbook

Three terminals, started in this order. Order matters: the dashboard tolerates
a missing backend, but the streamer exits immediately if `/predict` is
unreachable.

```bash
# --- one-time setup ---
python3 -m venv venv
source venv/bin/activate              # Windows: venv\Scripts\activate
pip install -r requirements.txt
python train_model.py                 # needs creditcard.csv in project root

# --- terminal 1: API ---
uvicorn backend.main:app --reload --port 8000
curl http://localhost:8000/health     # expect {"status":"ok","model_loaded":true}

# --- terminal 2: dashboard ---
cd frontend && npm install && npm run dev

# --- terminal 3: traffic ---
python backend/streamer.py --shuffle
```

Then open `http://localhost:5173`.

## 5. Acceptance Checklist

- [ ] `/health` → `{"status":"ok","model_loaded":true}`
- [ ] Dashboard live indicator is green (not "Reconnecting…")
- [ ] Rows stream in continuously without refresh
- [ ] Total-scored counter increments at ~5/sec
- [ ] At least one red fraud row visible
- [ ] Fraud rate card shows a non-zero percentage
- [ ] Probability chart is drawing a line
- [ ] Screenshot captured

## 6. Expected Behaviour Worth Anticipating

**Fraud rows are genuinely rare.** The holdout contains 98 frauds in 56,962
rows (0.17%). At 0.2 s per transaction that is roughly **one true fraud every
2 minutes** of streaming.

However, the model flags at ~27% precision — 310 flags per 98 real frauds — so
**red rows appear roughly every 35–40 seconds**, most of them false positives.
That is correct behaviour at the current operating point, not a bug. If the
board looks inert for the first 30 seconds, keep it running.

Use `--shuffle` (default in the runbook). Without it the replay follows the
dataset's original time ordering and fraud arrives in unrealistic clusters.

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Board stuck on "Reconnecting…" | Backend not running | Start terminal 1 first |
| Streamer: `test_holdout.csv not found` | Phase 1 never run | `python train_model.py` |
| API startup: `fraud_model.joblib not found` | Same | Same |
| Rows arrive, all green, none red | Working as intended early on | Wait ~40 s; see §6 |
| CORS error in browser console | Frontend on a port other than 5173 | Add the origin to `allow_origins` in `backend/main.py` |
| Counters reset unexpectedly | `--reload` restarted the API; `_stats` is in-memory | Expected; see Phase 2 PRD §7 |

## 8. Out of Scope

- Automated E2E tests (Playwright/Cypress).
- Load or latency benchmarking.
- Containerisation (`docker-compose`) — would remove the manual three-terminal
  step and is the obvious next improvement, but was not requested.
- CI pipeline.

## 9. Recommended Follow-up

`docker-compose.yml` bringing up API + frontend + streamer as one command would
make this phase reproducible for any reviewer and remove the ordering
footgun in §4. Recommended before this is shown to anyone else.
