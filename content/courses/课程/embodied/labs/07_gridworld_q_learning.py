"""Tabular Q-learning in a deterministic GridWorld."""

from __future__ import annotations

import numpy as np


GRID_SIZE = 5
START = (0, 0)
GOAL = (4, 4)
OBSTACLES = {(1, 1), (1, 2), (3, 3)}
ACTIONS = ((-1, 0), (1, 0), (0, -1), (0, 1))


def transition(state: tuple[int, int], action_index: int) -> tuple[tuple[int, int], float, bool]:
    row = state[0] + ACTIONS[action_index][0]
    column = state[1] + ACTIONS[action_index][1]
    candidate = (row, column)
    if not (0 <= row < GRID_SIZE and 0 <= column < GRID_SIZE) or candidate in OBSTACLES:
        return state, -0.10, False
    if candidate == GOAL:
        return candidate, 1.0, True
    return candidate, -0.01, False


def greedy_path(q_values: np.ndarray, max_steps: int = 30) -> list[tuple[int, int]]:
    state = START
    path = [state]
    for _ in range(max_steps):
        action = int(np.argmax(q_values[state]))
        state, _, done = transition(state, action)
        path.append(state)
        if done:
            break
    return path


def main() -> None:
    rng = np.random.default_rng(0)
    q_values = np.zeros((GRID_SIZE, GRID_SIZE, len(ACTIONS)), dtype=np.float64)
    alpha, gamma = 0.25, 0.97

    for episode in range(3_000):
        state = START
        epsilon = max(0.05, 1.0 - episode / 2_000)
        for _ in range(80):
            if rng.random() < epsilon:
                action = int(rng.integers(len(ACTIONS)))
            else:
                action = int(np.argmax(q_values[state]))
            next_state, reward, done = transition(state, action)
            target = reward if done else reward + gamma * float(np.max(q_values[next_state]))
            q_values[state][action] += alpha * (target - q_values[state][action])
            state = next_state
            if done:
                break

    path = greedy_path(q_values)
    assert path[-1] == GOAL
    assert len(path) <= 11
    assert not any(state in OBSTACLES for state in path)

    print(f"Learned path ({len(path) - 1} actions): {path}")
    print(f"Start-state Q values: {np.round(q_values[START], 3).tolist()}")
    print("GridWorld Q-learning lab: PASS")


if __name__ == "__main__":
    main()

