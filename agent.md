# agent.md — Phase 1: Data Preparation & Model Training

Execution log for the agent working this phase. Records what was run, what
broke, and what a future agent must not re-litigate.

---

## Scope of this phase

Build and execute `train_model.py`. Produce `fraud_model.joblib`,
`classification_report.md`, and `test_holdout.csv`.

## Environment facts (verified, not assumed)

```
$ python3 -c "import pandas, sklearn, joblib"     # OK
$ python3 -c "import xgboost"
ModuleNotFoundError: No module named 'xgboost'

$ pip install xgboost --break-system-packages
ERROR: Could not find a version that satisfies the requirement xgboost
       (from versions: none)                      # no network egress

$ curl -s -m 3 https://example.com                # HTTP 403 — egress blocked
$ nproc                                           # 1 CPU
$ free -m                                         # ~4 GB RAM
```

**Consequence:** the phase was executed with a labeled sklearn fallback, not
real XGBoost. This is recorded in the report header and in the bundle's
`model_type` field so it can never be silently misread.

## Dataset verification (do this before trusting any result)

```
$ python3 -c "import pandas as pd; df=pd.read_csv('creditcard.csv'); ..."
shape:    (284807, 31)
columns:  Time, V1..V28, Amount, Class
Class:    0 -> 284315   |   1 -> 492      (0.173% fraud)
missing:  0
```

Schema matches what `train_model.py` expects exactly. No cleaning was needed —
no nulls, no type coercion, no duplicate-column issues.

## Execution log

```
$ python train_model.py --csv creditcard.csv --out fraud_model.joblib
Train rows: 227,845 | fraud: 394 | legit: 227,451
scale_pos_weight = 577.29

              precision    recall  f1-score   support
  Legitimate     1.00       1.00      1.00      56864
  Fraud          0.27       0.87      0.42         98
    accuracy                          1.00      56962

Confusion matrix:
 [[56639   225]
  [   13    85]]
ROC-AUC: 0.9779 | PR-AUC: 0.7230

Saved model bundle -> fraud_model.joblib
Saved classification_report.md
Saved streaming holdout set -> test_holdout.csv (56,962 rows)
```

**These are real numbers on the real dataset.** Not synthetic, not smoke-test.

## Failures hit and how they were resolved

### 1. Command timeout on first training attempt
`GradientBoostingClassifier` (the original fallback choice) is sequential and
took >300s on 227,845 rows, exceeding the environment's per-command limit. The
run was killed with partial output.

### 2. Backgrounding did not work
```
$ nohup python3 train_model.py ... > train_log.txt 2>&1 &
started PID 253
# next tool call:
$ pgrep -f train_model.py     # nothing
$ cat train_log.txt
Train rows: 227,845 | fraud: 394 | legit: 227451
scale_pos_weight = 577.29     # ...and then it just stops
```
No OOM in `dmesg`, no traceback, no exit code. **This sandbox tears down
background child processes between tool calls.** Do not attempt `nohup ... &`
for long jobs here — it fails silently, which is worse than failing loudly.

### 3. Resolution
Swapped the fallback to `HistGradientBoostingClassifier` — histogram-based,
same algorithm family as XGBoost/LightGBM, dramatically faster on this row
count. Completed the full 227K-row fit inside a single foreground command,
well within the limit.

```python
# train_model.py, build_model()
from sklearn.ensemble import HistGradientBoostingClassifier   # was GradientBoostingClassifier
return HistGradientBoostingClassifier(
    max_iter=300, max_depth=6, learning_rate=0.08, random_state=42
)
```

Note `HistGradientBoostingClassifier` has no `scale_pos_weight` parameter, so
imbalance is applied via a `sample_weight` array at `.fit()` time:
```python
sample_weight = np.where(y_train == 1, scale_pos_weight, 1.0)
model.fit(X_train, y_train, sample_weight=sample_weight)
```
Mathematically equivalent in effect. When `xgboost` imports successfully the
script uses native `scale_pos_weight` instead — **no code change needed.**

## Design decisions a future agent should not undo

| Decision | Reason |
|---|---|
| `scale_pos_weight`, not SMOTE/undersampling | Keeps the test split at true 0.173% fraud, so precision is a real-world number rather than an artifact of resampling |
| Model **and** `feature_names` in one joblib bundle | Phase 2 receives arbitrary JSON; the ordered list is the only safe way to rebuild the DataFrame. Silent column-order mismatch is the classic train/serve bug |
| Test split written to `test_holdout.csv` | Phase 2's streamer must replay data the model never trained on, or the demo is dishonest |
| `stratify=y` on the split | With 492 positives total, an unstratified split can skew fraud count badly between train and test |
| Accuracy reported but explicitly dismissed in the report | Prevents a reader from seeing "99.6%" and concluding the model is excellent |

## Validation performed beyond the training run

Loaded the saved bundle and pushed **real holdout rows** through the exact
scoring path Phase 2's `/predict` uses (dict → ordered DataFrame →
`predict_proba`):

```
model_type: sklearn_gb_fallback | n_features: 30
feature order: ['Time','V1','V2','V3','V4'] ... ['V27','V28','Amount']

-- FRAUD samples --
  amount=$0.01     p(fraud)=0.9672  verdict=Fraud       actual=1
  amount=$1.00     p(fraud)=0.9672  verdict=Fraud       actual=1
  amount=$124.53   p(fraud)=0.9672  verdict=Fraud       actual=1
-- LEGIT samples --
  amount=$23.00    p(fraud)=0.0322  verdict=Legitimate  actual=0
  amount=$11.85    p(fraud)=0.0320  verdict=Legitimate  actual=0
  amount=$76.07    p(fraud)=0.1179  verdict=Legitimate  actual=0
```

Serving path confirmed sound against the real model before Phase 2 depends on it.

## Handoff to Phase 2

Phase 2 may assume:
- `fraud_model.joblib` exists in project root and contains keys
  `model`, `feature_names`, `model_type`, `scale_pos_weight`, `metrics`.
- `feature_names` is a 30-element ordered list: `Time`, `V1`–`V28`, `Amount`.
  **`Class` is not a feature** — it is ground-truth label only.
- `test_holdout.csv` has 56,962 rows including a `Class` column, none of which
  were seen during training.

## Outstanding for the user

- [ ] `pip install xgboost` locally and re-run — expect precision to improve at
      comparable recall; the current 27% is a fallback-estimator result.
- [ ] Decide the operating point (see `prd.md` §7). Current setting is
      recall-maximizing and will generate ~3.6 reviews per caught fraud.
