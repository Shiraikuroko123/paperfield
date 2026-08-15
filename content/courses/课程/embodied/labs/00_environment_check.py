"""Check the minimal CPU environment used by the textbook labs."""

from __future__ import annotations

import importlib
import platform
import sys


def main() -> None:
    print(f"Python: {sys.version.split()[0]}")
    print(f"Platform: {platform.platform()}")

    required = ("numpy", "matplotlib", "torch")
    missing: list[str] = []
    for name in required:
        try:
            module = importlib.import_module(name)
            print(f"{name}: {getattr(module, '__version__', 'unknown')}")
        except ImportError:
            missing.append(name)

    if missing:
        raise SystemExit(f"Missing packages: {', '.join(missing)}")

    import torch

    x = torch.tensor([1.0, 2.0], requires_grad=True)
    loss = (x.square()).sum()
    loss.backward()
    assert torch.allclose(x.grad, torch.tensor([2.0, 4.0]))

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"PyTorch device for labs: {device}")
    print("Environment check: PASS")


if __name__ == "__main__":
    main()

