"""Matrix shapes, gradient descent, and a Wilson confidence interval."""

from __future__ import annotations

import math

import numpy as np


def wilson_interval(successes: int, trials: int, z: float = 1.96) -> tuple[float, float]:
    if not 0 <= successes <= trials or trials <= 0:
        raise ValueError("Require 0 <= successes <= trials and trials > 0")
    p = successes / trials
    denominator = 1.0 + z * z / trials
    center = (p + z * z / (2.0 * trials)) / denominator
    margin = z * math.sqrt(p * (1.0 - p) / trials + z * z / (4.0 * trials**2)) / denominator
    return center - margin, center + margin


def fit_line(learning_rate: float, steps: int = 300) -> tuple[float, float, float]:
    rng = np.random.default_rng(0)
    x = np.linspace(-1.0, 1.0, 200)
    y = 2.5 * x - 0.7 + rng.normal(0.0, 0.05, size=x.shape)
    weight, bias = 0.0, 0.0

    for _ in range(steps):
        prediction = weight * x + bias
        error = prediction - y
        grad_weight = 2.0 * np.mean(error * x)
        grad_bias = 2.0 * np.mean(error)
        weight -= learning_rate * grad_weight
        bias -= learning_rate * grad_bias

    mse = float(np.mean((weight * x + bias - y) ** 2))
    return weight, bias, mse


def main() -> None:
    matrix = np.arange(12).reshape(4, 3)
    vector = np.array([1.0, 2.0, 3.0])
    product = matrix @ vector
    assert product.shape == (4,)

    weight, bias, mse = fit_line(learning_rate=0.1)
    assert abs(weight - 2.5) < 0.05
    assert abs(bias + 0.7) < 0.05

    lower, upper = wilson_interval(16, 20)
    assert 0.57 < lower < 0.59
    assert 0.91 < upper < 0.93

    print(f"Matrix product shape: {product.shape}")
    print(f"Fitted line: y = {weight:.3f} x + {bias:.3f}; MSE={mse:.5f}")
    print(f"16/20 Wilson 95% CI: [{lower:.3f}, {upper:.3f}]")
    print("Math and optimization lab: PASS")


if __name__ == "__main__":
    main()

