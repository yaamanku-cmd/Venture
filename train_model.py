import argparse
import os
import sys
import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    roc_auc_score,
    precision_recall_curve,
    auc,
)

def parse_args():
    parser = argparse.ArgumentParser(description="Train imbalance-aware Fraud Detection Model")
    parser.add_argument("--csv", default="creditcard.csv", help="Path to creditcard.csv")
    parser.add_argument("--out", default="fraud_model.joblib", help="Output path for joblib model bundle")
    parser.add_argument("--holdout", default="test_holdout.csv", help="Output path for test holdout CSV")
    parser.add_argument("--report", default="classification_report.md", help="Output path for classification report")
    return parser.parse_args()

def build_and_train_model(X_train, y_train, scale_pos_weight):
    try:
        import xgboost as xgb
        print(f"Training XGBClassifier with scale_pos_weight = {scale_pos_weight:.2f}...")
        model = xgb.XGBClassifier(
            n_estimators=100,
            max_depth=6,
            learning_rate=0.1,
            scale_pos_weight=scale_pos_weight,
            random_state=42,
            eval_metric="logloss",
            n_jobs=-1,
        )
        model.fit(X_train, y_train)
        return model, "xgboost"
    except ImportError:
        from sklearn.ensemble import HistGradientBoostingClassifier
        print(f"XGBoost not found. Falling back to HistGradientBoostingClassifier with sample_weight (scale_pos_weight={scale_pos_weight:.2f})...")
        model = HistGradientBoostingClassifier(
            max_iter=300,
            max_depth=6,
            learning_rate=0.08,
            random_state=42,
        )
        sample_weight = np.where(y_train == 1, scale_pos_weight, 1.0)
        model.fit(X_train, y_train, sample_weight=sample_weight)
        return model, "sklearn_hist_gb_fallback"

def main():
    args = parse_args()

    if not os.path.exists(args.csv):
        print(f"ERROR: Dataset '{args.csv}' not found in current directory.", file=sys.stderr)
        print("Please ensure creditcard.csv exists or run 'python download_dataset.py'.", file=sys.stderr)
        sys.exit(1)

    print(f"Loading dataset from '{args.csv}'...")
    df = pd.read_csv(args.csv)

    if "Class" not in df.columns:
        print("ERROR: Expected target column 'Class' not found in dataset.", file=sys.stderr)
        sys.exit(1)

    # Validate and enforce ordered feature list
    feature_names = [col for col in df.columns if col != "Class"]
    if len(feature_names) != 30 or "Time" not in feature_names or "Amount" not in feature_names:
        print(f"Warning: Expected 30 standard features (Time, V1..V28, Amount), found {len(feature_names)}.")

    X = df[feature_names]
    y = df["Class"].astype(int)

    n_total = len(df)
    n_fraud = int(y.sum())
    n_legit = n_total - n_fraud
    print(f"Total rows: {n_total:,} | Legit: {n_legit:,} | Fraud: {n_fraud:,} ({n_fraud / n_total * 100:.3f}% base rate)")

    # Stratified 80/20 train/test split
    print("Splitting dataset (80% train / 20% test holdout, stratified on Class, random_state=42)...")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )

    n_train_pos = int(y_train.sum())
    n_train_neg = len(y_train) - n_train_pos
    scale_pos_weight = float(n_train_neg / n_train_pos)
    print(f"Train split: {len(X_train):,} rows | fraud: {n_train_pos} | legit: {n_train_neg}")
    print(f"Computed scale_pos_weight from train split only: {scale_pos_weight:.2f}")

    # Train model
    model, model_type = build_and_train_model(X_train, y_train, scale_pos_weight)

    # Evaluate on holdout split
    print(f"Evaluating model on test holdout ({len(X_test):,} rows)...")
    y_pred_proba = model.predict_proba(X_test)[:, 1]
    y_pred = (y_pred_proba >= 0.5).astype(int)

    roc_auc = float(roc_auc_score(y_test, y_pred_proba))
    precision_curve, recall_curve, _ = precision_recall_curve(y_test, y_pred_proba)
    pr_auc = float(auc(recall_curve, precision_curve))
    cm = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = cm.ravel()
    report_dict = classification_report(
        y_test, y_pred, target_names=["Legitimate", "Fraud"], output_dict=True
    )

    print("\n--- Model Evaluation Summary ---")
    print(f"Model type: {model_type}")
    print(f"Fraud Recall:    {report_dict['Fraud']['recall']:.4f} ({tp}/{tp + fn} frauds caught, {fn} missed)")
    print(f"Fraud Precision: {report_dict['Fraud']['precision']:.4f} ({tp} true alerts, {fp} false alarms)")
    print(f"Fraud F1-Score:  {report_dict['Fraud']['f1-score']:.4f}")
    print(f"ROC-AUC:         {roc_auc:.4f}")
    print(f"PR-AUC:          {pr_auc:.4f}")
    print(f"Confusion Matrix: TN={tn:,}, FP={fp:,}, FN={fn:,}, TP={tp:,}")

    # Save model bundle
    bundle = {
        "model": model,
        "feature_names": feature_names,
        "model_type": model_type,
        "scale_pos_weight": scale_pos_weight,
        "metrics": {
            "roc_auc": roc_auc,
            "pr_auc": pr_auc,
            "precision_fraud": float(report_dict["Fraud"]["precision"]),
            "recall_fraud": float(report_dict["Fraud"]["recall"]),
            "f1_fraud": float(report_dict["Fraud"]["f1-score"]),
            "tp": int(tp),
            "fp": int(fp),
            "fn": int(fn),
            "tn": int(tn),
        },
    }
    joblib.dump(bundle, args.out)
    print(f"Saved model bundle -> {args.out}")

    # Save holdout split
    test_df = df.loc[X_test.index].copy()
    test_df.to_csv(args.holdout, index=False)
    print(f"Saved holdout dataset -> {args.holdout} ({len(test_df):,} rows)")

    # Save classification report
    report_md = f"""# Model Classification Report

**Model Type:** `{model_type}`  
**Trained on:** `{args.csv}` ({n_total:,} rows)  
**Evaluation:** 20% Stratified Holdout ({len(X_test):,} rows, {int(y_test.sum())} real frauds)  
**Imbalance weight (`scale_pos_weight`):** {scale_pos_weight:.2f}

## Performance Metrics

| Class | Precision | Recall | F1-Score | Support |
|---|---|---|---|---|
| Legitimate (0) | {report_dict['Legitimate']['precision']:.4f} | {report_dict['Legitimate']['recall']:.4f} | {report_dict['Legitimate']['f1-score']:.4f} | {int(report_dict['Legitimate']['support']):,} |
| **Fraud (1)** | **{report_dict['Fraud']['precision']:.4f}** | **{report_dict['Fraud']['recall']:.4f}** | **{report_dict['Fraud']['f1-score']:.4f}** | **{int(report_dict['Fraud']['support']):,}** |
| Macro Avg | {report_dict['macro avg']['precision']:.4f} | {report_dict['macro avg']['recall']:.4f} | {report_dict['macro avg']['f1-score']:.4f} | {len(X_test):,} |
| Weighted Avg | {report_dict['weighted avg']['precision']:.4f} | {report_dict['weighted avg']['recall']:.4f} | {report_dict['weighted avg']['f1-score']:.4f} | {len(X_test):,} |

- **ROC-AUC:** `{roc_auc:.4f}`
- **PR-AUC (Precision-Recall AUC):** `{pr_auc:.4f}`
- **Accuracy (dismissed due to 0.173% baseline):** `{report_dict['accuracy']:.4f}`

## Confusion Matrix

| | Predicted Legit | Predicted Fraud |
|---|---|---|
| **Actual Legit** | {tn:,} (True Negative) | {fp:,} (False Positive) |
| **Actual Fraud** | {fn:,} (False Negative / Missed) | {tp:,} (True Positive / Caught) |

### Key Takeaway
The engine caught **{tp} of {tp + fn} frauds ({report_dict['Fraud']['recall']*100:.1f}% recall)** with {fp} false alarms.
"""
    with open(args.report, "w", encoding="utf-8") as f:
        f.write(report_md)
    print(f"Saved classification report -> {args.report}")

if __name__ == "__main__":
    main()
