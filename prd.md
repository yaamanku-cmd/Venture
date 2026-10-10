# PRD — Phase 1: Data Preparation & Model Training

**Deliverable:** `train_model.py`, `fraud_model.joblib`, `classification_report.md`, `test_holdout.csv`
**Status:** ✅ Complete — trained on real `creditcard.csv` (284,807 rows)

---

## 1. Objective

Produce a serialized, imbalance-aware binary classifier that scores a credit
card transaction's probability of being fraudulent, plus an honest evaluation
report that a reviewer can use to judge whether the model is fit to deploy.

## 2. Problem Context

The reference dataset (Kaggle `creditcardfraud`) contains 284,807 transactions
of which 492 are fraud — a **0.173% positive rate**. This extreme imbalance is
the defining constraint of the phase:

- A degenerate model predicting "Legitimate" for every row scores **99.83%
  accuracy** while catching zero fraud. Accuracy is therefore a disqualified
  success metric.
- Features `V1`–`V28` are pre-computed PCA components (anonymized for privacy);
  only `Time` and `Amount` are raw. No feature engineering is in scope.

## 3. Functional Requirements

| ID | Requirement |
|---|---|
| FR1.1 | Read `creditcard.csv` from the project root; fail loudly with a clear message if absent |
| FR1.2 | Validate the `Class` target column exists (0 = legitimate, 1 = fraud) |
| FR1.3 | Split 80/20 train/test, **stratified on `Class`** so both splits retain the real fraud ratio |
| FR1.4 | Compute `scale_pos_weight = n_negative / n_positive` from the **training split only** (no test leakage) |
| FR1.5 | Train an `XGBClassifier` using that `scale_pos_weight` |
| FR1.6 | Persist model **and** its ordered feature-name list to `fraud_model.joblib` via `joblib.dump` |
| FR1.7 | Emit `classification_report.md` with per-class precision/recall/F1, confusion matrix, ROC-AUC, PR-AUC |
| FR1.8 | Persist the 20% test split to `test_holdout.csv` for Phase 2's traffic simulator |
| FR1.9 | Fix `random_state=42` across split and model for reproducibility |

## 4. Non-Functional Requirements

- **Reproducibility:** identical inputs → identical model and metrics.
- **Portability:** must run without network access once dependencies are installed.
- **Graceful degradation:** if `xgboost` is unavailable, fall back to an
  equivalent sklearn estimator rather than crashing — and *label the fallback
  clearly in the output report* so results are never misread as XGBoost's.

## 5. Explicitly Out of Scope

- SMOTE / ADASYN / random under- or over-sampling. **Rationale:** resampling the
  test set destroys the ability to measure real-world precision. `scale_pos_weight`
  achieves imbalance correction at training time while leaving evaluation honest.
- Hyperparameter search (grid/Bayesian). Fixed sensible defaults only.
- Cross-validation. Single stratified holdout is sufficient for a v1 demo.
- Feature engineering, PCA re-fitting, or drift handling.

## 6. Success Metrics

Ranked by importance given the 0.173% base rate:

| Metric | Why it matters | Achieved |
|---|---|---|
| **Recall (Fraud)** | Fraction of actual fraud caught. Misses are the expensive error. | **0.8673** (85/98) |
| **Precision (Fraud)** | Fraction of fraud alerts that are real. Drives analyst alert fatigue and false declines. | **0.2742** |
| **PR-AUC** | Threshold-independent quality under heavy imbalance; more honest than ROC-AUC here. | **0.7230** |
| F1 (Fraud) | Harmonic balance of the two above. | 0.4167 |
| ROC-AUC | Reported for convention; inflated by the huge true-negative mass. | 0.9779 |
| Accuracy | **Not a success metric.** Reported only to be dismissed. | 0.9958 |

### Acceptance criteria
- [x] Fraud-class recall ≥ 0.80
- [x] `fraud_model.joblib` loads and scores without error
- [x] Report distinguishes Fraud-class metrics from overall accuracy
- [x] Test split never touched during training or weight computation

## 7. Known Trade-off (requires a product decision)

The delivered model sits at **87% recall / 27% precision**: 310 transactions
flagged, of which 85 are real fraud and 225 are false alarms; 13 frauds slip
through.

This is a deliberate consequence of `scale_pos_weight = 577.29`. It is *not*
self-evidently the right operating point — it depends on your cost model:

- Cost of a missed fraud (chargeback, loss, remediation) → favors higher recall
- Cost of a false decline (customer friction, analyst hours) → favors higher precision

**Open question for stakeholders:** what is the acceptable review volume per
caught fraud? At present it is ~3.6 reviews per fraud. Lower `scale_pos_weight`
or raise the decision threshold to reduce it, at the cost of missing more fraud.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Fallback estimator mistaken for real XGBoost results | Model type is written into the report header and the joblib bundle's `model_type` key |
| Column order drift between training and serving | Ordered `feature_names` persisted *inside* the bundle; Phase 2 reconstructs DataFrames from it |
| Test-set leakage inflating metrics | `scale_pos_weight` computed from train split only; test split written out untouched |
| PCA components (`V1`–`V28`) are dataset-specific | Documented as a drift risk; out of scope for v1 |
