"""A complete deterministic PyTorch train/validate/save/reload loop."""

from __future__ import annotations

import random
import tempfile
from pathlib import Path

import numpy as np
import torch
from torch import nn


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


class Regressor(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.network = nn.Sequential(nn.Linear(1, 32), nn.Tanh(), nn.Linear(32, 1))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.network(x)


def main() -> None:
    set_seed(0)
    x = torch.linspace(-2.0, 2.0, 320).unsqueeze(1)
    noise = 0.03 * torch.randn_like(x)
    y = torch.sin(1.5 * x) + 0.25 * x + noise
    permutation = torch.randperm(len(x))
    train_indices = permutation[:240]
    validation_indices = permutation[240:]
    train_x, validation_x = x[train_indices], x[validation_indices]
    train_y, validation_y = y[train_indices], y[validation_indices]

    mean = train_x.mean()
    std = train_x.std().clamp_min(1e-6)
    train_x_norm = (train_x - mean) / std
    validation_x_norm = (validation_x - mean) / std

    model = Regressor()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-2)
    criterion = nn.MSELoss()

    model.train()
    for _ in range(500):
        optimizer.zero_grad(set_to_none=True)
        loss = criterion(model(train_x_norm), train_y)
        loss.backward()
        optimizer.step()

    model.eval()
    with torch.no_grad():
        validation_prediction = model(validation_x_norm)
        validation_mse = criterion(validation_prediction, validation_y).item()

    assert validation_mse < 0.08

    with tempfile.TemporaryDirectory() as directory:
        checkpoint_path = Path(directory) / "model.pt"
        torch.save(
            {"model": model.state_dict(), "normalization": {"mean": mean, "std": std}},
            checkpoint_path,
        )
        checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
        reloaded = Regressor()
        reloaded.load_state_dict(checkpoint["model"])
        reloaded.eval()
        with torch.no_grad():
            reloaded_prediction = reloaded(validation_x_norm)

    assert torch.equal(validation_prediction, reloaded_prediction)
    print(f"Final training MSE: {loss.item():.6f}")
    print(f"Validation MSE: {validation_mse:.6f}")
    print("Checkpoint reload predictions: identical")
    print("PyTorch regression lab: PASS")


if __name__ == "__main__":
    main()
