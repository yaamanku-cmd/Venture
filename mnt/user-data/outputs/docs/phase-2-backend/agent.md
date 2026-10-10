# agent.md — Phase 2: Backend API (FastAPI)

Execution log for the agent working this phase.

---

## Scope of this phase

Write `backend/main.py` (FastAPI service wrapping the Phase 1 model) and
`backend/streamer.py` (traffic simulator). Validate the scoring path.

## Environment facts (verified)

```
$ python3 -c "import fastapi"
ModuleNotFoundError: No module named 'fastapi'
$ pip install fastapi uvicorn --break-system-packages
ERROR: No matching distribution found       # no network egress
```

**Consequence:** `uvicorn backend.main:app` could not be launched in this
sandbox, and no port opened here is reachable from the user's browser anyway
(isolated container, no exposed ports). The service code is complete and its
*scoring logic* was validated directly against the real model bundle — see
"Validation" below. The live server run is a user-machine task.

Do not fabricate a "server started successfully" claim for this environment.

## What was built

### `backend/main.py`

Module-level state loaded once in a `startup` hook:
```python
_bundle = joblib.load(MODEL_PATH)
_model = _bundle["model"]
_feature_names = _bundle["feature_names"]
```

The core scoring function — this is the piece that matters:
```python
def _score(payload: dict) -> tuple[str, float]:
    row = {feat: payload.get(feat, 0.0) for feat in _feature_names}
    X = pd.DataFrame([row], columns=_feature_names)   # order enforced here
    proba = float(_model.predict_proba(X)[0, 1])
    return ("Fraud" if proba >= FRAUD_THRESHOLD else "Legitimate"), proba
```

Endpoints: `POST /predict`, `GET /stats`, `GET /health`, `WS /ws/feed`.

### `backend/streamer.py`

Reads `test_holdout.csv`, optionally shuffles, POSTs each row to `/predict`
every 0.2 s, prints a verdict line per transaction, tolerates request failures.

## Design decisions a future agent should not undo

| Decision | Reason |
|---|---|
| **Rebuild the DataFrame from `_feature_names`, never from payload keys** | JSON objects have no guaranteed key order. Feeding columns in payload order silently produces garbage predictions with no error — the single most dangerous bug available in this phase |
| **Pop `Class` before scoring** | The payload carries ground truth so the dashboard can show "was it actually fraud?". If it reached the model as a feature the demo would be a lie. It is removed in the handler, before `_score()` is ever called |
| `extra="allow"` on the Pydantic model | The payload carries 30+ fields (`V1`–`V28`); enumerating every one in the schema adds no safety and much noise. `Time`/`Amount` are validated explicitly |
| Model loaded at **startup**, not per request | `joblib.load` on every call would dominate latency and defeat the "real-time" premise |
| WebSocket push, not dashboard polling | The dashboard must update the instant a transaction is scored. Polling at 0.2 s granularity would mean ~5 req/s per open tab purely for liveness |
| `/stats` kept **despite** having WebSockets | Reconciliation fallback: a tab opened mid-stream missed every prior WS event. Polling `/stats` every 3 s repairs the counters without replaying history |
| Broadcast failures swallowed per-client | A dead browser tab must not cause the payment processor's `POST /predict` to fail. Dead sockets are collected and discarded after the loop |
| `FRAUD_THRESHOLD` as a named module constant | It *will* need tuning. Buried magic numbers do not get tuned |

## Validation performed

`fastapi`/`uvicorn` are unavailable here, so the HTTP layer could not be
exercised. The **scoring logic** — the part with real failure modes — was
validated directly against the real Phase 1 model using the exact
dict → ordered DataFrame → `predict_proba` path from `_score()`:

```
model_type: sklearn_gb_fallback | n_features: 30
feature order: ['Time','V1','V2','V3','V4'] ... ['V27','V28','Amount']
holdout shape: (56962, 31) | fraud in holdout: 98

-- FRAUD samples --
  amount=$0.01     p(fraud)=0.9672  verdict=Fraud       actual_class=1
  amount=$1.00     p(fraud)=0.9672  verdict=Fraud       actual_class=1
  amount=$124.53   p(fraud)=0.9672  verdict=Fraud       actual_class=1
-- LEGIT samples --
  amount=$23.00    p(fraud)=0.0322  verdict=Legitimate  actual_class=0
  amount=$11.85    p(fraud)=0.0320  verdict=Legitimate  actual_class=0
  amount=$76.07    p(fraud)=0.1179  verdict=Legitimate  actual_class=0
```

Then the **streamer replay loop** was emulated end-to-end (same shuffle,
same per-row scoring, same running counters) over 25 real holdout rows:

```
   amount=$  109.42  p(fraud)=0.0322  verdict=Legitimate  actual=Legitimate ✓
   amount=$   21.69  p(fraud)=0.0296  verdict=Legitimate  actual=Legitimate ✓
   ... (25/25 correct)
Running stats: {'total': 25, 'fraud': 0, 'legit': 25}
```

Zero fraud in a random 25-row sample is expected at a 0.173% base rate — not
a sign the model is inert. The targeted fraud-sample test above is what
demonstrates it fires correctly.

**Not validated here:** HTTP request/response cycle, Pydantic coercion of a
real JSON body, WebSocket handshake and broadcast, CORS preflight, startup
hook. All require a running `uvicorn`.

## Run instructions (user machine)

```bash
pip install -r requirements.txt          # fastapi, uvicorn, requests, ...
uvicorn backend.main:app --reload --port 8000

# verify before wiring up the frontend:
curl http://localhost:8000/health
# -> {"status":"ok","model_loaded":true}

python backend/streamer.py --shuffle --limit 200
```

Run the streamer with `--shuffle`. Without it the replay follows the dataset's
original time ordering, and fraud arrives in unrealistic clusters.

## Handoff to Phase 3

Phase 3 may assume:
- `ws://localhost:8000/ws/feed` pushes one JSON object per scored transaction,
  shaped exactly like the `POST /predict` response body.
- `http://localhost:8000/stats` returns `{total, fraud, legit}`.
- CORS is open for `http://localhost:5173` on both origins (`localhost` and
  `127.0.0.1`).
- `ground_truth` may be `null` if the caller omitted `Class`; the UI must
  render that case rather than assuming it is present.

## Outstanding for the user

- [ ] Run `uvicorn` and confirm `/health` reports `model_loaded: true`
- [ ] Tune `FRAUD_THRESHOLD` once an operating point is chosen (Phase 1 PRD §7)
- [ ] Add auth + rate limiting before exposing `/predict` off localhost
- [ ] If running multi-worker uvicorn, move `_stats`/`_ws_clients` to Redis —
      per-process state is incorrect across workers
