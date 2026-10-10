import os
import sys
import time
import urllib.request

DATASET_URL = "https://huggingface.co/datasets/JEFFREY-VERDIERE/Creditcard/resolve/feac26da102fcef433202e29a528e3bfb6a62a04/creditcard.csv"
DEST_FILE = "creditcard.csv"

def download_dataset():
    if os.path.exists(DEST_FILE) and os.path.getsize(DEST_FILE) > 100_000_000:
        print(f"{DEST_FILE} already exists ({os.path.getsize(DEST_FILE):,} bytes). Skipping download.")
        return

    print(f"Downloading {DEST_FILE} from Hugging Face...")
    req = urllib.request.Request(DATASET_URL, headers={"User-Agent": "Mozilla/5.0"})
    start_time = time.time()
    
    with urllib.request.urlopen(req, timeout=30) as resp:
        total_size = int(resp.headers.get("Content-Length", 0))
        downloaded = 0
        chunk_size = 1024 * 1024  # 1MB
        last_log = time.time()
        
        temp_file = DEST_FILE + ".tmp"
        with open(temp_file, "wb") as f:
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                
                if time.time() - last_log > 3:
                    pct = (downloaded / total_size * 100) if total_size else 0
                    mb = downloaded / (1024 * 1024)
                    total_mb = total_size / (1024 * 1024)
                    print(f"Progress: {mb:.1f} MB / {total_mb:.1f} MB ({pct:.1f}%) - {mb / (time.time() - start_time):.2f} MB/s")
                    last_log = time.time()
        
        if os.path.exists(DEST_FILE):
            os.remove(DEST_FILE)
        os.rename(temp_file, DEST_FILE)
        print(f"Download complete! Saved to {DEST_FILE} ({os.path.getsize(DEST_FILE):,} bytes) in {time.time() - start_time:.1f}s")

if __name__ == "__main__":
    download_dataset()
