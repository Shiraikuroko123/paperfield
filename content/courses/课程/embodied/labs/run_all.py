"""Run all textbook labs in isolated Python processes."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys


def main() -> None:
    lab_directory = Path(__file__).resolve().parent
    scripts = sorted(lab_directory.glob("[0-9][0-9]_*.py"))
    if not scripts:
        raise SystemExit("No lab scripts found")

    environment = os.environ.copy()
    environment["PYTHONHASHSEED"] = "0"
    environment["PYTHONUTF8"] = "1"
    for script in scripts:
        print(f"\n=== {script.name} ===")
        completed = subprocess.run(
            [sys.executable, str(script)],
            cwd=lab_directory.parent,
            env=environment,
            text=True,
            capture_output=True,
            timeout=120,
            check=False,
        )
        print(completed.stdout.rstrip())
        if completed.returncode != 0:
            print(completed.stderr.rstrip(), file=sys.stderr)
            raise SystemExit(f"{script.name} failed with exit code {completed.returncode}")

    print(f"\nAll {len(scripts)} labs passed.")


if __name__ == "__main__":
    main()
