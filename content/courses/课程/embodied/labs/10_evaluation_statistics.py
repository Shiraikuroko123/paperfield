"""Confidence intervals, two-proportion power, and seed-aware summaries."""

from __future__ import annotations

import math
from statistics import NormalDist

import numpy as np


def wilson_interval(successes: int, trials: int, z: float = 1.96) -> tuple[float, float]:
    p = successes / trials
    denominator = 1.0 + z * z / trials
    center = (p + z * z / (2.0 * trials)) / denominator
    margin = z * math.sqrt(p * (1.0 - p) / trials + z * z / (4.0 * trials**2)) / denominator
    return center - margin, center + margin


def two_proportion_sample_size(
    p1: float, p2: float, alpha: float = 0.05, power: float = 0.80
) -> int:
    if p1 == p2:
        raise ValueError("The target difference must be non-zero")
    normal = NormalDist()
    z_alpha = normal.inv_cdf(1.0 - alpha / 2.0)
    z_power = normal.inv_cdf(power)
    pooled = (p1 + p2) / 2.0
    numerator = (
        z_alpha * math.sqrt(2.0 * pooled * (1.0 - pooled))
        + z_power * math.sqrt(p1 * (1.0 - p1) + p2 * (1.0 - p2))
    ) ** 2
    return math.ceil(numerator / (p1 - p2) ** 2)


def main() -> None:
    lower, upper = wilson_interval(16, 20)
    required_per_group = two_proportion_sample_size(0.80, 0.75)
    assert 1_050 <= required_per_group <= 1_150

    rng = np.random.default_rng(0)
    latent_seed_rates = np.array([0.62, 0.78, 0.91, 0.73, 0.84])
    results = np.vstack([rng.binomial(1, rate, size=100) for rate in latent_seed_rates])
    per_seed = results.mean(axis=1)
    pooled_rate = results.mean()
    seed_standard_deviation = per_seed.std(ddof=1)

    print(f"16/20 Wilson 95% CI: [{lower:.3f}, {upper:.3f}]")
    print(f"Approximate n/group for 80% vs 75%: {required_per_group}")
    print(f"Per-seed success rates: {np.round(per_seed, 2).tolist()}")
    print(f"Pooled rollout rate: {pooled_rate:.3f}")
    print(f"Between-seed standard deviation: {seed_standard_deviation:.3f}")
    print("Evaluation statistics lab: PASS")


if __name__ == "__main__":
    main()

