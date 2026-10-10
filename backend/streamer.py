import argparse
import sys
import time
import random
import pandas as pd
import requests

# Ensure console supports utf-8 if possible
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

def parse_args():
    parser = argparse.ArgumentParser(description="Stream transactions from test_holdout.csv to API")
    parser.add_argument("--csv", default="test_holdout.csv", help="Path to holdout CSV")
    parser.add_argument("--url", default="http://127.0.0.1:8000/predict", help="Prediction API URL")
    parser.add_argument("--interval", type=float, default=0.2, help="Seconds between requests (default: 0.2)")
    parser.add_argument("--shuffle", action="store_true", default=True, help="Shuffle dataset before streaming")
    parser.add_argument("--no-shuffle", dest="shuffle", action="store_false", help="Do not shuffle dataset")
    parser.add_argument("--limit", type=int, default=None, help="Maximum number of transactions to send")
    parser.add_argument("--loop", action="store_true", default=False, help="Loop indefinitely over the dataset")
    return parser.parse_args()

def stream_transactions():
    args = parse_args()
    print("=" * 70)
    print(">> Real-Time Fraud Detection Streamer")
    print(f"Target URL:    {args.url}")
    print(f"Dataset:       {args.csv}")
    print(f"Interval:      {args.interval}s (~{1/max(0.01, args.interval):.1f} req/s)")
    print(f"Shuffle:       {args.shuffle}")
    print(f"Limit:         {args.limit or 'Unlimited'}")
    print(f"Looping:       {args.loop}")
    print("=" * 70)

    try:
        df = pd.read_csv(args.csv)
    except Exception as e:
        print(f"Error loading {args.csv}: {e}", file=sys.stderr)
        sys.exit(1)

    records = df.to_dict(orient="records")
    print(f"Loaded {len(records):,} transactions from {args.csv}.")
    
    total_sent = 0
    fraud_flagged = 0
    actual_frauds = 0
    failures = 0

    while True:
        if args.shuffle:
            random.shuffle(records)

        for row in records:
            if args.limit is not None and total_sent >= args.limit:
                print(f"\nReached specified limit of {args.limit} transactions.")
                return

            payload = {k: (float(v) if pd.notnull(v) else 0.0) for k, v in row.items()}
            actual_class = int(row.get("Class", 0)) if "Class" in row else None
            
            try:
                resp = requests.post(args.url, json=payload, timeout=5.0)
                if resp.status_code == 200:
                    data = resp.json()
                    verdict = data.get("verdict", "Unknown")
                    p_fraud = data.get("fraud_probability", 0.0)
                    amount = data.get("amount", 0.0)
                    total_sent += 1
                    
                    if verdict == "Fraud":
                        fraud_flagged += 1
                    if actual_class == 1:
                        actual_frauds += 1

                    # Pure ASCII formatting safe on all Windows cp1252 consoles
                    if verdict == "Fraud" and actual_class == 1:
                        status_tag = "[!] [FRAUD DETECTED - TP]"
                    elif verdict == "Fraud" and actual_class == 0:
                        status_tag = "[?] [FALSE ALARM - FP]"
                    elif verdict == "Legitimate" and actual_class == 1:
                        status_tag = "[X] [MISSED FRAUD - FN]"
                    else:
                        status_tag = "[+] [OK]"

                    print(
                        f"#{total_sent:05d} | "
                        f"Amt: ${amount:8.2f} | "
                        f"P(Fraud): {p_fraud:6.4f} | "
                        f"Verdict: {verdict:10s} | "
                        f"Actual: {'Fraud' if actual_class == 1 else 'Legit':5s} | "
                        f"{status_tag}"
                    )
                else:
                    failures += 1
                    print(f"[!] HTTP {resp.status_code}: {resp.text[:80]}")
            except requests.exceptions.RequestException as e:
                failures += 1
                print(f"[!] Connection error: {e}. Retrying in 2 seconds...")
                time.sleep(2.0)
                continue

            time.sleep(args.interval)

        if not args.loop:
            break

    print("\n" + "=" * 70)
    print("Stream Completed")
    print(f"Total Sent:        {total_sent}")
    print(f"Frauds Flagged:    {fraud_flagged} ({(fraud_flagged/max(1, total_sent))*100:.2f}%)")
    print(f"Actual Frauds:     {actual_frauds}")
    print(f"Total Failures:    {failures}")
    print("=" * 70)

if __name__ == "__main__":
    stream_transactions()
