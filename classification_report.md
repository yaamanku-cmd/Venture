# Model Classification Report

**Model Type:** `xgboost`  
**Trained on:** `creditcard.csv` (284,807 rows)  
**Evaluation:** 20% Stratified Holdout (56,962 rows, 98 real frauds)  
**Imbalance weight (`scale_pos_weight`):** 577.29

## Performance Metrics

| Class | Precision | Recall | F1-Score | Support |
|---|---|---|---|---|
| Legitimate (0) | 0.9997 | 0.9996 | 0.9997 | 56,864 |
| **Fraud (1)** | **0.7810** | **0.8367** | **0.8079** | **98** |
| Macro Avg | 0.8903 | 0.9182 | 0.9038 | 56,962 |
| Weighted Avg | 0.9993 | 0.9993 | 0.9993 | 56,962 |

- **ROC-AUC:** `0.9747`
- **PR-AUC (Precision-Recall AUC):** `0.8650`
- **Accuracy (dismissed due to 0.173% baseline):** `0.9993`

## Confusion Matrix

| | Predicted Legit | Predicted Fraud |
|---|---|---|
| **Actual Legit** | 56,841 (True Negative) | 23 (False Positive) |
| **Actual Fraud** | 16 (False Negative / Missed) | 82 (True Positive / Caught) |

### Key Takeaway
The engine caught **82 of 98 frauds (83.7% recall)** with 23 false alarms.
