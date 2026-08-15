from __future__ import annotations

import numpy as np


def logsumexp(values: np.ndarray) -> float:
    maximum = float(np.max(values))
    return maximum + float(np.log(np.exp(values - maximum).sum()))


def stable_log_softmax(values: np.ndarray) -> np.ndarray:
    return values - logsumexp(values)


def main() -> None:
    logits = np.array([2.0, 1.0, -1.0], dtype=np.float64)
    log_probs = stable_log_softmax(logits)
    probs = np.exp(log_probs)
    target = 0

    print("logits:", logits)
    print("probabilities:", np.round(probs, 6))
    print("target cross-entropy:", round(float(-log_probs[target]), 6))
    assert np.isclose(probs.sum(), 1.0)

    extreme = np.array([1000.0, 999.0, -1000.0], dtype=np.float64)
    stable = stable_log_softmax(extreme)
    with np.errstate(over="ignore", invalid="ignore", divide="ignore"):
        naive = np.log(np.exp(extreme) / np.exp(extreme).sum())

    print("naive extreme log-softmax:", naive)
    print("stable extreme log-softmax:", np.round(stable, 6))
    assert np.isfinite(stable).all()
    assert not np.isfinite(naive).all()


if __name__ == "__main__":
    main()
