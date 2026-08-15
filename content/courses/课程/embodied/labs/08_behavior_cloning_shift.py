"""Show that low expert-state error does not guarantee perturbed rollout success."""

from __future__ import annotations

import numpy as np


def expert_action(state: float) -> float:
    return float(np.clip(-state, -0.2, 0.2))


def collect(starts: np.ndarray, horizon: int = 8) -> tuple[np.ndarray, np.ndarray]:
    states: list[float] = []
    actions: list[float] = []
    for initial_state in starts:
        state = float(initial_state)
        for _ in range(horizon):
            action = expert_action(state)
            states.append(state)
            actions.append(action)
            state += action
    return np.asarray(states), np.asarray(actions)


class NearestNeighborPolicy:
    def __init__(self, states: np.ndarray, actions: np.ndarray) -> None:
        self.states = states
        self.actions = actions

    def __call__(self, state: float) -> float:
        index = int(np.argmin(np.abs(self.states - state)))
        return float(self.actions[index])


def rollout(policy: NearestNeighborPolicy, perturb: bool, horizon: int = 12) -> tuple[float, list[float]]:
    state = 0.8
    trajectory = [state]
    for step in range(horizon):
        if perturb and step == 2:
            state -= 0.9
        state += float(np.clip(policy(state), -0.2, 0.2))
        trajectory.append(state)
    return state, trajectory


def main() -> None:
    rng = np.random.default_rng(0)
    positive_states, positive_actions = collect(rng.uniform(0.6, 1.0, size=80))
    expert_only_policy = NearestNeighborPolicy(positive_states, positive_actions)

    validation_states, validation_actions = collect(rng.uniform(0.6, 1.0, size=20))
    predictions = np.asarray([expert_only_policy(state) for state in validation_states])
    offline_mse = float(np.mean((predictions - validation_actions) ** 2))

    clean_final, _ = rollout(expert_only_policy, perturb=False)
    shifted_final, shifted_trajectory = rollout(expert_only_policy, perturb=True)

    recovery_states, recovery_actions = collect(rng.uniform(-1.0, 1.0, size=160))
    recovery_policy = NearestNeighborPolicy(recovery_states, recovery_actions)
    recovered_final, recovered_trajectory = rollout(recovery_policy, perturb=True)

    assert offline_mse < 1e-4
    assert abs(clean_final) < 0.05
    assert abs(shifted_final) > 0.05
    assert abs(recovered_final) < 0.05

    print(f"Expert-state validation MSE: {offline_mse:.7f}")
    print(f"Clean rollout final state: {clean_final:.3f}")
    print(f"Perturbed BC final state: {shifted_final:.3f}")
    print(f"Perturbed BC trajectory: {np.round(shifted_trajectory, 2).tolist()}")
    print(f"Recovery-data final state: {recovered_final:.3f}")
    print(f"Recovery trajectory: {np.round(recovered_trajectory, 2).tolist()}")
    print("Behavior cloning shift lab: PASS")


if __name__ == "__main__":
    main()

