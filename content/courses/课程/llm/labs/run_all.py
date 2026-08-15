from __future__ import annotations

import subprocess
import sys
from pathlib import Path


LABS = [
    "00_environment_check.py",
    "01_math_and_logprob.py",
    "02_autograd_training.py",
    "03_tiny_attention.py",
    "04_sampling.py",
    "05_sft_masks.py",
    "06_policy_gradient.py",
]


def main() -> None:
    lab_directory = Path(__file__).resolve().parent
    for lab in LABS:
        print(f"\n=== {lab} ===", flush=True)
        subprocess.run([sys.executable, str(lab_directory / lab)], check=True)
    print("\nAll CPU labs passed.")


if __name__ == "__main__":
    main()
