"""Inspect attention shapes and train a tiny one-dimensional flow model."""

from __future__ import annotations

import math

import torch
from torch import nn


def scaled_dot_product_attention(
    query: torch.Tensor, key: torch.Tensor, value: torch.Tensor
) -> tuple[torch.Tensor, torch.Tensor]:
    scores = query @ key.transpose(-1, -2) / math.sqrt(query.shape[-1])
    weights = torch.softmax(scores, dim=-1)
    return weights @ value, weights


class VelocityField(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(2, 48),
            nn.Tanh(),
            nn.Linear(48, 48),
            nn.Tanh(),
            nn.Linear(48, 1),
        )

    def forward(self, x_t: torch.Tensor, time: torch.Tensor) -> torch.Tensor:
        return self.network(torch.cat([x_t, time], dim=-1))


def sample_bimodal(batch_size: int) -> torch.Tensor:
    signs = torch.where(torch.rand(batch_size, 1) < 0.5, -1.0, 1.0)
    return signs * 2.0 + 0.25 * torch.randn(batch_size, 1)


def main() -> None:
    torch.manual_seed(0)
    query = torch.randn(2, 4, 8)
    key = torch.randn(2, 4, 8)
    value = torch.randn(2, 4, 6)
    attended, weights = scaled_dot_product_attention(query, key, value)
    assert attended.shape == (2, 4, 6)
    assert weights.shape == (2, 4, 4)
    assert torch.allclose(weights.sum(dim=-1), torch.ones(2, 4), atol=1e-6)

    model = VelocityField()
    optimizer = torch.optim.Adam(model.parameters(), lr=2e-3)
    for _ in range(1_000):
        noise = torch.randn(256, 1)
        data = sample_bimodal(256)
        time = torch.rand(256, 1)
        x_t = (1.0 - time) * noise + time * data
        target_velocity = data - noise
        loss = (model(x_t, time) - target_velocity).square().mean()
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()

    with torch.no_grad():
        generated = torch.randn(4_000, 1)
        integration_steps = 25
        for step in range(integration_steps):
            time = torch.full_like(generated, step / integration_steps)
            generated += model(generated, time) / integration_steps

    positive_fraction = (generated > 0).float().mean().item()
    generated_std = generated.std().item()
    assert 0.35 < positive_fraction < 0.65
    assert generated_std > 1.4

    print(f"Attention weights shape: {tuple(weights.shape)}")
    print(f"Flow training loss: {loss.item():.4f}")
    print(f"Generated positive fraction: {positive_fraction:.3f}")
    print(f"Generated standard deviation: {generated_std:.3f}")
    print("Attention and generation lab: PASS")


if __name__ == "__main__":
    main()

