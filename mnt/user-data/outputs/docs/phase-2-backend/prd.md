# PRD — Phase 2: Backend API (FastAPI)

**Deliverable:** `backend/main.py`, `backend/streamer.py`
**Status:** ✅ Code complete · ✅ Scoring logic validated against the real model · ⏳ Live server run pending on user machine

---

## 1. Objective

Expose the Phase 1 model as a low-latency HTTP service that scores one
transaction per request, and provide a traffic generator that replays unseen
transactions against it to simulate a live production stream.

## 2. Users & Consumers

| Consumer | Interface used |
|---|---|
| `streamer.py` (simulated payment processor) | `POST /predict` |
| React dashboard (Phase 3) | `WS /ws/feed`, `GET /stats` |
| Ops / uptime checks | `GET /health` |

## 3. Functional Requirements

### 3.1 Service lifecycle
| ID | Requirement |
|---|---|
| FR2.1 | Load `fraud_model.joblib` **once at startup**, not per request |
| FR2.2 | Fail fast at startup with an actionable message if the model file is missing |
| FR2.3 | Hold model and `feature_names` in module-level memory for the process lifetime |

### 3.2 `POST /predict`
| ID | Requirement |
|---|---|
| FR2.4 | Accept a JSON body with `Time`, `V1`–`V28`, `Amount`; tolerate extra keys |
| FR2.5 | Accept an **optional** `Class` field as ground truth and **strip it before inference** — it must never reach the model |
| FR2.6 | Reconstruct a single-row DataFrame using the bundle's ordered `feature_names` |
| FR2.7 | Return `verdict` ∈ {`"Fraud"`, `"Legitimate"`} based on `predict_proba ≥ FRAUD_THRESHOLD` |
| FR2.8 | Return `fraud_probability`, `amount`, `time`, `ground_truth`, `timestamp` alongside the verdict |
| FR2.9 | Expose `FRAUD_THRESHOLD` as a single named constant, not a magic number inline |

### 3.3 Live feed & stats
| ID | Requirement |
|---|---|
| FR2.10 | Broadcast every scored transaction to all connected `WS /ws/feed` clients |
| FR2.11 | Drop dead WebSocket connections without failing the originating `/predict` call |
| FR2.12 | Maintain in-process counters (`total`, `fraud`, `legit`) served at `GET /stats` |
| FR2.13 | Permit CORS from `http://localhost:5173` so the Vite dev server can call the API |

### 3.4 Traffic simulator (`streamer.py`)
| ID | Requirement |
|---|---|
| FR2.14 | Replay `test_holdout.csv` — data the model has **never seen** — against `/predict` |
| FR2.15 | Default interval of **0.2 s** between requests; configurable via `--interval` |
| FR2.16 | Support `--shuffle`, because the raw dataset is time-ordered and fraud clusters unrealistically without it |
| FR2.17 | Support `--limit` to cap the run, and `--url` to retarget the endpoint |
| FR2.18 | Print a per-transaction line with amount, probability, and a fraud flag |
| FR2.19 | Survive transient request failures — count and continue, never abort the run |

## 4. Non-Functional Requirements

- **Latency:** < 50 ms per `/predict` on commodity hardware. Inference over 30
  features is trivial; network round-trip dominates in a local demo.
- **Statelessness:** no database. Counters are deliberately in-memory and
  reset on restart (see §7).
- **Isolation:** a slow or dead dashboard client must not degrade `/predict`.

## 5. API Contract

```http
POST /predict
Content-Type: application/json

{ "Time": 141243.0, "V1": -1.359, ..., "V28": -0.021, "Amount": 124.53, "Class": 1 }
```
```json
{
  "verdict": "Fraud",
  "fraud_probability": 0.967215,
  "amount": 124.53,
  "time": 141243.0,
  "ground_truth": "Fraud",
  "timestamp": 1757752800.123
}
```

| Endpoint | Method | Purpose |
|---|---|---|
| `/predict` | POST | Score one transaction; broadcasts to WS subscribers |
| `/stats` | GET | `{total, fraud, legit}` running counters |
| `/health` | GET | `{status, model_loaded}` liveness probe |
| `/ws/feed` | WS | Server-push stream of scored transactions |

## 6. Explicitly Out of Scope

- Authentication, API keys, rate limiting — **localhost demo only.**
- Batch prediction endpoint.
- Persistent transaction storage or audit log.
- Model hot-reload without restart.
- Horizontal scaling / multi-worker state sharing (see §7).

## 7. Known Limitations (accepted for v1)

| Limitation | Consequence |
|---|---|
| `_stats` is in-process memory | Resets on restart; **incorrect under multi-worker uvicorn** since each worker keeps its own counters |
| `_ws_clients` is a per-process set | Same multi-worker caveat — a client connected to worker A misses events scored by worker B |
| `FRAUD_THRESHOLD = 0.5` hardcoded | Naive default. Real systems tune this against a cost matrix (see Phase 1 PRD §7) |
| No auth on `/predict` | Must not be exposed beyond localhost as-is |

## 8. Success Criteria

- [x] Model loads once at startup and is reused across requests
- [x] `Class` is stripped before inference (verified — no label leakage into scoring)
- [x] Feature ordering reconstructed from the bundle, not from payload key order
- [x] Streamer replays only unseen holdout data
- [ ] Live end-to-end run under `uvicorn` — pending on user machine
