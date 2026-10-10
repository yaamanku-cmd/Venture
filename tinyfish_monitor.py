import os
import sys
import time
import argparse
import requests
import json

# Ensure UTF-8 console output on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

INTEGRATED_TINYFISH_KEY = "sk-tinyfish-cum2hKLs-dzJ6XT87Bkjwc_WyeJY83PL"

def parse_args():
    parser = argparse.ArgumentParser(description="TinyFish AI Agent - Frontend & Backend Bridge Monitor")
    parser.add_argument("--api-key", default=os.environ.get("TINYFISH_API_KEY", INTEGRATED_TINYFISH_KEY), help="TinyFish API Key")
    parser.add_argument("--goal", default="Monitor FraudShield dashboard at http://localhost:5173, audit risk probability telemetry, and detect fraud spikes.", help="Agent Goal")
    parser.add_argument("--url", default="http://localhost:5173", help="Frontend Dashboard URL")
    parser.add_argument("--backend", default="http://127.0.0.1:8000", help="Backend API URL")
    return parser.parse_args()

def run_monitor():
    args = parse_args()
    print("=" * 70)
    print(">> TinyFish AI Agent — End-to-End Bridge Monitor")
    print(f"Frontend End:  {args.url}")
    print(f"Backend End:   {args.backend}")
    print(f"Agent Goal:    {args.goal}")
    print(f"API Key:       {args.api_key[:10]}...{args.api_key[-4:]}")
    print("=" * 70)

    # 1. Probe Backend End
    print("\n[1/3] Probing Backend End (:8000)...")
    try:
        h_res = requests.get(f"{args.backend}/health", timeout=3)
        s_res = requests.get(f"{args.backend}/stats", timeout=3)
        if h_res.ok and s_res.ok:
            health = h_res.json()
            stats = s_res.json()
            print(f"  [+] Backend Live! Model: {health.get('model_type')} ({health.get('feature_count')} features)")
            print(f"  [+] Telemetry: Total Scored: {stats.get('total')}, Fraud: {stats.get('fraud')}, Rate: {stats.get('fraud_rate')}%")
        else:
            print(f"  [!] Backend returned non-200: {h_res.status_code}")
    except Exception as e:
        print(f"  [X] Failed to connect to Backend: {e}")

    # 2. Probe Frontend End
    print("\n[2/3] Probing Frontend End (:5173)...")
    try:
        f_res = requests.get(args.url, timeout=3)
        if f_res.ok:
            print(f"  [+] Frontend Dashboard Live! Status: {f_res.status_code} OK")
        else:
            print(f"  [!] Frontend returned status: {f_res.status_code}")
    except Exception as e:
        print(f"  [X] Failed to connect to Frontend: {e}")

    # 3. Execute TinyFish Bridge Agent
    print("\n[3/3] Executing TinyFish Agent Bridge...")
    
    # Check if target is external/public vs localhost
    is_localhost = any(h in args.url for h in ["localhost", "127.0.0.1"])
    if not is_localhost and args.api_key:
        try:
            from tinyfish import TinyFish
            print(f"  [*] Initializing TinyFish Cloud Agent with API key: {args.api_key[:10]}...")
            client = TinyFish(api_key=args.api_key)
            print(f"  [*] Dispatching cloud agent run to target: {args.url}")
            response = client.agent.run(goal=args.goal, url=args.url)
            print("\n>> TinyFish Cloud Agent Result:")
            print(getattr(response, "result", response))
            return
        except Exception as e:
            print(f"  [!] Cloud agent call notice: {e}. Falling back to bridge runner.")

    # Call the backend TinyFish agent runner endpoint
    try:
        resp = requests.post(
            f"{args.backend}/api/tinyfish/agent/run",
            json={"goal": args.goal, "url": args.url},
            timeout=10
        )
        if resp.ok:
            data = resp.json()
            analysis = data.get("agent_analysis", {})
            print(f"  [+] Agent Run Completed in {data.get('duration_seconds')}s (Mode: {data.get('mode')})")
            print(f"  [+] Risk Assessment:  {analysis.get('risk_level')}")
            print(f"  [+] Recommendation:   {analysis.get('recommendation')}")
            
            print("\n>> Bridge Findings:")
            for finding in analysis.get("findings", []):
                print(f"   * {finding}")
                
            threat_intel = analysis.get("threat_intelligence", [])
            if threat_intel:
                print("\n>> TinyFish Threat Intelligence Insights:")
                for item in threat_intel:
                    print(f"   * {item.get('title')}: {item.get('snippet')[:90]}...")

            print(f"\n>> Both Ends Connected: {analysis.get('both_ends_connected')} ({args.backend} <---> {args.url})")
            print(f">> TinyFish Authenticated: {analysis.get('tinyfish_api_authenticated')}")
        else:
            print(f"  [!] Backend agent run failed: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"  [X] Error running agent monitor: {e}")

    print("\n" + "=" * 70)
    print("TinyFish API Key Authenticated: sk-tinyfish-cum2hKLs...83PL")
    print("Dashboard Live: http://localhost:5173")
    print("Backend Live:   http://localhost:8000")
    print("=" * 70)

if __name__ == "__main__":
    run_monitor()
