from __future__ import annotations

import numpy as np


def sigmoid(value: float) -> float:
    return 1.0 / (1.0 + np.exp(-value))


def gradient_samples(
    theta: float,
    reward_probabilities: np.ndarray,
    count: int,
    seed: int,
) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    action_one_probability = sigmoid(theta)
    actions = rng.binomial(1, action_one_probability, size=count)
    rewards = rng.binomial(1, reward_probabilities[actions])
    score = actions - action_one_probability
    raw_gradient = rewards * score
    baseline_gradient = (rewards - rewards.mean()) * score
    return raw_gradient, baseline_gradient


def main() -> None:
    reward_probabilities = np.array([0.2, 0.8])
    raw, centered = gradient_samples(
        theta=0.0,
        reward_probabilities=reward_probabilities,
        count=100_000,
        seed=19,
    )
    print(f"raw gradient mean={raw.mean():.6f} variance={raw.var():.6f}")
    print(
        f"baseline gradient mean={centered.mean():.6f} "
        f"variance={centered.var():.6f}"
    )
    assert abs(raw.mean() - centered.mean()) < 0.005
    assert centered.var() < raw.var()


if __name__ == "__main__":
    main()
