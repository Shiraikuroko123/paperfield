from __future__ import annotations

import numpy as np


def softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - logits.max()
    values = np.exp(shifted)
    return values / values.sum()


def filtered_distribution(
    logits: np.ndarray,
    temperature: float = 1.0,
    top_k: int | None = None,
    top_p: float | None = None,
) -> np.ndarray:
    if temperature <= 0:
        raise ValueError("temperature must be positive")
    probabilities = softmax(logits / temperature)

    if top_k is not None and top_k < len(probabilities):
        keep = np.argpartition(probabilities, -top_k)[-top_k:]
        mask = np.zeros_like(probabilities, dtype=bool)
        mask[keep] = True
        probabilities = np.where(mask, probabilities, 0.0)

    if top_p is not None and top_p < 1.0:
        order = np.argsort(probabilities)[::-1]
        cumulative = np.cumsum(probabilities[order])
        count = int(np.searchsorted(cumulative, top_p, side="left")) + 1
        keep = order[:count]
        mask = np.zeros_like(probabilities, dtype=bool)
        mask[keep] = True
        probabilities = np.where(mask, probabilities, 0.0)

    return probabilities / probabilities.sum()


def main() -> None:
    rng = np.random.default_rng(17)
    logits = np.array([2.0, 1.0, 0.3, -1.0], dtype=np.float64)
    configs = {
        "base": {},
        "cold": {"temperature": 0.5},
        "top_k_2": {"top_k": 2},
        "top_p_08": {"top_p": 0.8},
    }

    for name, config in configs.items():
        probabilities = filtered_distribution(logits, **config)
        samples = rng.choice(len(logits), size=20_000, p=probabilities)
        frequencies = np.bincount(samples, minlength=len(logits)) / len(samples)
        print(name, "p=", np.round(probabilities, 4), "freq=", np.round(frequencies, 4))
        assert np.max(np.abs(probabilities - frequencies)) < 0.02


if __name__ == "__main__":
    main()
