"""Audit a synthetic trajectory table for common silent data failures."""

from __future__ import annotations

from collections import defaultdict

import numpy as np


def build_records() -> list[dict[str, object]]:
    return [
        {"episode": 0, "time": 0.0, "action": [0.1, 0.0], "state": [0.0, 0.0]},
        {"episode": 0, "time": 0.1, "action": [0.2, 0.0], "state": [0.1, 0.0]},
        {"episode": 0, "time": 0.2, "action": [9.0, 0.0], "state": [0.2, 0.0]},
        {"episode": 1, "time": 0.0, "action": [-0.1, 0.0], "state": [1.0, 0.0]},
        {"episode": 1, "time": 0.2, "action": [-0.1, 0.0], "state": [0.9, float("nan")]},
        {"episode": 1, "time": 0.1, "action": [-0.1, 0.0], "state": [0.8, 0.0]},
    ]


def audit(records: list[dict[str, object]], action_limit: float = 2.0) -> list[str]:
    issues: list[str] = []
    by_episode: defaultdict[int, list[dict[str, object]]] = defaultdict(list)
    for row_index, record in enumerate(records):
        episode = int(record["episode"])
        by_episode[episode].append(record)
        action = np.asarray(record["action"], dtype=float)
        state = np.asarray(record["state"], dtype=float)
        if not np.isfinite(action).all() or not np.isfinite(state).all():
            issues.append(f"row {row_index}: non-finite value")
        if np.abs(action).max() > action_limit:
            issues.append(f"row {row_index}: action exceeds limit")

    for episode, rows in by_episode.items():
        times = np.asarray([float(row["time"]) for row in rows])
        if np.any(np.diff(times) <= 0):
            issues.append(f"episode {episode}: timestamps are not strictly increasing")
    return issues


def episode_leakage(train_episodes: set[int], test_episodes: set[int]) -> set[int]:
    return train_episodes & test_episodes


def main() -> None:
    records = build_records()
    issues = audit(records)
    leakage = episode_leakage({0, 1, 2}, {2, 3})
    assert len(issues) == 3
    assert leakage == {2}

    print("Audit issues:")
    for issue in issues:
        print(f"- {issue}")
    print(f"Episodes leaked across train/test: {sorted(leakage)}")
    print("Dataset audit lab: PASS")


if __name__ == "__main__":
    main()

