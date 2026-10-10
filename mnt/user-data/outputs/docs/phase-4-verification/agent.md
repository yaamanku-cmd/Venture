# agent.md — Phase 4: End-to-End Verification & Artifacts

Execution log for the agent working this phase.

---

## Scope of this phase

Start the API, start the dev server, run the streamer, open a browser at
`localhost:5173`, screenshot the live dashboard.

## Outcome: not executable in this environment

This is the one phase that **could not be completed**, and it could not be
partially substituted either. Phases 1–3 each had a meaningful piece that
could be validated offline (model training, scoring logic, static code review).
Phase 4's entire deliverable is *visual proof of a live render*. A mock-up, a
hand-drawn HTML approximation, or a described-but-not-taken screenshot would
invert the purpose of the phase.

**No screenshot was produced and none was fabricated.**

## Blockers (each verified, not assumed)

```
$ curl -s -m 3 https://example.com -o /dev/null -w "HTTP %{http_code}\n"
HTTP 403                                    # egress blocked

$ pip install fastapi uvicorn --break-system-packages
ERROR: No matching distribution found for fastapi

$ python3 -c "import fastapi"
ModuleNotFoundError: No module named 'fastapi'
```

| Task | Blocker |
|---|---|
| `uvicorn backend.main:app --port 8000` | `fastapi`/`uvicorn` not installed; cannot install without network |
| `npm run dev` on :5173 | `npm install` needs the registry; unavailable |
| Navigate to `localhost:5173` | No browser tool in this environment |
| Screenshot | Nothing rendering; and no container port is reachable from the user's browser |

The deeper issue is not the missing packages. This sandbox is an **isolated
container, separate from the user's machine**. Even with every dependency
installed, a server bound to `:5173` here would not be the `:5173` the user's
browser resolves. Verification is inherently a user-machine task.

## Secondary blocker discovered in Phase 1 (relevant here)

Long-running background processes do not survive between tool calls:

```
$ nohup python3 train_model.py > train_log.txt 2>&1 &
started PID 253
# next tool call:
$ pgrep -f train_model.py        # nothing
# no OOM in dmesg, no traceback, no exit code — silently reaped
```

So even a short-lived "start server, curl it, kill it" demonstration is not
possible across tool calls. A server started in one call is gone by the next.

## What was done instead

Rather than fake the phase, its value was front-loaded into Phases 1–3 as
component-level validation against **real data and the real trained model**:

| Component | How it was validated offline |
|---|---|
| Model training | Executed for real on 284,807-row `creditcard.csv`; real metrics in `classification_report.md` |
| `/predict` scoring path | Real fraud + real legit holdout rows pushed through the exact dict → ordered DataFrame → `predict_proba` logic from `_score()`; verdicts correct |
| Streamer replay loop | 25 real holdout transactions replayed end-to-end with running counters; 25/25 correct |
| Model bundle contract | `feature_names` order and `model_type` confirmed; `Class` confirmed excluded from features |
| Frontend | Static review: imports, Tailwind globs, config version pairing, hook deps, cleanup paths, API contract match |

**Still unproven end-to-end:** HTTP request/response cycle, Pydantic coercion
of a real body, WebSocket handshake and broadcast, CORS preflight, FastAPI
startup hook, browser render, `npm install` resolution, Tailwind JIT output,
Recharts layout.

These are integration-surface risks, not logic risks. The failure modes that
would have been *silent and dangerous* — column-order mismatch between train
and serve, label leakage via `Class`, resampling corrupting the precision
figure — were the ones deliberately validated offline, because those are the
ones a screenshot would not have caught anyway.

## What the user must run

Full runbook, acceptance checklist, and troubleshooting table are in
`prd.md` alongside this file. Summary:

```bash
pip install -r requirements.txt
python train_model.py

# terminal 1
uvicorn backend.main:app --reload --port 8000
# terminal 2
cd frontend && npm install && npm run dev
# terminal 3
python backend/streamer.py --shuffle
```
Open `http://localhost:5173`.

## Expectation to set before the user judges the UI

Fraud is 0.17% of the stream — about **one true fraud every 2 minutes** at
0.2 s intervals. But at ~27% precision the model emits roughly 3.6 flags per
real fraud, so **red rows should appear every ~35–40 seconds**, mostly false
positives.

If the board shows only green for the first half-minute, that is correct
behaviour, not a broken pipeline. The "Total Scored" counter incrementing is
the real liveness signal.

## Note for a future agent picking this up

If you are running in an environment **with** network and a browser tool, this
phase is straightforward — run the three commands in `prd.md` §4 and capture
the screenshot. Do not re-derive the blockers above; they are specific to the
build sandbox, not to the project.

If you are in the same sandbox: do not attempt `nohup`, do not claim a server
started, and do not generate a representative-looking dashboard image as a
stand-in for the screenshot artifact.

## Outstanding for the user

- [ ] Run the three processes and open the dashboard
- [ ] Walk the acceptance checklist in `prd.md` §5
- [ ] Capture the screenshot artifact
- [ ] Consider `docker-compose.yml` to collapse the three-terminal startup into
      one command before showing this to anyone else
