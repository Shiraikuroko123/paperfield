from __future__ import annotations

import platform
import sys

import numpy as np
import torch


def main() -> None:
    print(f"Python: {sys.version.split()[0]}")
    print(f"Platform: {platform.platform()}")
    print(f"NumPy: {np.__version__}")
    print(f"PyTorch: {torch.__version__}")
    print(f"CUDA available: {torch.cuda.is_available()}")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    x = torch.arange(6, dtype=torch.float32, device=device).reshape(2, 3)
    y = x @ x.T
    assert y.shape == (2, 2)
    assert torch.isfinite(y).all()
    print(f"Tensor smoke test passed on {device}: shape={tuple(y.shape)}")


if __name__ == "__main__":
    main()
