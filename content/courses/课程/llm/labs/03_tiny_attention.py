from __future__ import annotations

import math

import torch


def attention(
    query: torch.Tensor,
    key: torch.Tensor,
    value: torch.Tensor,
    causal: bool = True,
) -> tuple[torch.Tensor, torch.Tensor]:
    scores = query @ key.T / math.sqrt(query.shape[-1])
    if causal:
        future = torch.triu(torch.ones_like(scores, dtype=torch.bool), diagonal=1)
        scores = scores.masked_fill(future, float("-inf"))
    weights = torch.softmax(scores, dim=-1)
    return weights @ value, weights


def main() -> None:
    query = torch.tensor([[1.0, 0.0], [0.0, 1.0], [1.0, 1.0]])
    key = torch.tensor([[1.0, 0.0], [0.0, 1.0], [1.0, -1.0]])
    value = torch.tensor([[1.0, 2.0], [3.0, 0.0], [-1.0, 1.0]])

    output, weights = attention(query, key, value, causal=True)
    noncausal_output, noncausal_weights = attention(query, key, value, causal=False)

    print("causal weights:\n", torch.round(weights * 10_000) / 10_000)
    print("causal output:\n", torch.round(output * 10_000) / 10_000)
    print("non-causal first-row weights:", noncausal_weights[0])
    print("non-causal first-row output:", noncausal_output[0])

    assert torch.allclose(weights.sum(dim=-1), torch.ones(3))
    assert weights[0, 1].item() == 0.0
    assert weights[0, 2].item() == 0.0
    assert noncausal_weights[0, 1].item() > 0.0


if __name__ == "__main__":
    main()
