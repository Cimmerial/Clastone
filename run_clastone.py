#!/usr/bin/env python3
from __future__ import annotations

import os
import subprocess
import sys
import time
import urllib.request


PORT = 6001
URL = f"http://localhost:{PORT}"


def wait_for_http(url: str, timeout_s: int = 45) -> bool:
  start = time.time()
  while time.time() - start < timeout_s:
    try:
      with urllib.request.urlopen(url, timeout=1) as res:
        return 200 <= getattr(res, "status", 200) < 500
    except Exception:
      time.sleep(0.4)
  return False


def main() -> int:
  if sys.platform != "darwin":
    print("This launcher currently targets macOS (uses `open -a Arc`).")

  repo_root = os.path.abspath(os.path.dirname(__file__))
  npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
  proc = subprocess.Popen(
    [npm_cmd, "run", "dev:ui"],
    cwd=repo_root,
    stdout=sys.stdout,
    stderr=sys.stderr,
  )

  try:
    ready = wait_for_http(URL, timeout_s=60)
    if ready:
      subprocess.run(["open", "-a", "Arc", URL], check=False)
      print(f"Opened {URL} in Arc.")
    else:
      print(f"Dev server didn't respond in time at {URL}.")
      print("It may still be starting; check the terminal output.")

    print("Dev server is running. Press Ctrl+C to stop.")
    proc.wait()
    return proc.returncode or 0
  except KeyboardInterrupt:
    proc.terminate()
    try:
      proc.wait(timeout=5)
    except Exception:
      proc.kill()
    return 0


if __name__ == "__main__":
  raise SystemExit(main())

