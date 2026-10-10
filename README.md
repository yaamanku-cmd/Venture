# Real-Time Fraud Detection Engine — Phase Documentation

Each phase has two documents:

- **`prd.md`** — what the phase must do and why: objectives, requirements,
  scope boundaries, success metrics, trade-offs, risks.
- **`agent.md`** — what actually happened: commands run, output, failures hit,
  design decisions not to undo, what was and wasn't validated, handoff notes.

| Phase | Docs | Status |
|---|---|---|
| 1 — Data Prep & Model Training | [`prd`](phase-1-training/prd.md) · [`agent`](phase-1-training/agent.md) | ✅ Trained on real 284,807-row dataset |
| 2 — Backend API (FastAPI) | [`prd`](phase-2-backend/prd.md) · [`agent`](phase-2-backend/agent.md) | ✅ Code complete, scoring validated · ⏳ live run pending |
| 3 — Frontend Dashboard (React) | [`prd`](phase-3-frontend/prd.md) · [`agent`](phase-3-frontend/agent.md) | ✅ Code complete · ⏳ `npm install` pending |
| 4 — End-to-End Verification | [`prd`](phase-4-verification/prd.md) · [`agent`](phase-4-verification/agent.md) | ⛔ Blocked in build sandbox — user runbook provided |

## Headline result (Phase 1, real data)

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| Legitimate | 0.9998 | 0.9960 | 0.9979 | 56,864 |
| **Fraud** | **0.2742** | **0.8673** | **0.4167** | **98** |

ROC-AUC 0.9779 · PR-AUC 0.7230 · `scale_pos_weight` 577.29

Catches 85 of 98 frauds (13 missed) at the cost of 225 false positives.
Accuracy (0.9958) is reported but **is not a success metric** — predicting
"Legitimate" for everything scores 99.83% on this dataset.

## Two caveats carried across all phases

1. **Fallback estimator, not real XGBoost.** The build sandbox has no network,
   so `xgboost` could not be installed. `train_model.py` auto-falls back to
   `HistGradientBoostingClassifier` (same algorithm family) with `sample_weight`
   standing in for `scale_pos_weight`. Installing `xgboost` locally and re-running
   the unchanged script will likely improve precision at comparable recall.

2. **Phase 4 was not executed.** No servers were started and no screenshot was
   taken or fabricated. See `phase-4-verification/agent.md` for the verified
   blockers and `prd.md` for the runbook to complete it yourself.

## Architecture

```
creditcard.csv
      │
      ▼
train_model.py ──► fraud_model.joblib (model + ordered feature schema + metrics)
      │                          │
      └──► test_holdout.csv      ▼
                 │        backend/main.py (FastAPI)
                 │          ├─ POST /predict   score one txn
                 │          ├─ GET  /stats     running counters
                 │          ├─ GET  /health    liveness
                 │          └─ WS   /ws/feed   push live verdicts
                 │                     ▲       │
                 ▼                     │       ▼
      backend/streamer.py ─────────────┘   frontend/ (React + Vite + Tailwind + Recharts)
      POST every 0.2s                      WebSocket client → live table + chart
```

## Quick start

```bash
pip install -r requirements.txt
python train_model.py                              # needs creditcard.csv in root

uvicorn backend.main:app --reload --port 8000      # terminal 1
cd frontend && npm install && npm run dev          # terminal 2
python backend/streamer.py --shuffle               # terminal 3
```
Open `http://localhost:5173`.
