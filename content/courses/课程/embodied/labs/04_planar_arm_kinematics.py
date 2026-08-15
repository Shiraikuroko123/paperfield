"""Forward/inverse kinematics and Jacobian checks for a two-link arm."""

from __future__ import annotations

import math

import numpy as np


def forward_kinematics(q: np.ndarray, lengths: np.ndarray) -> np.ndarray:
    q1, q2 = q
    l1, l2 = lengths
    return np.array(
        [l1 * math.cos(q1) + l2 * math.cos(q1 + q2), l1 * math.sin(q1) + l2 * math.sin(q1 + q2)]
    )


def jacobian(q: np.ndarray, lengths: np.ndarray) -> np.ndarray:
    q1, q2 = q
    l1, l2 = lengths
    return np.array(
        [
            [-l1 * math.sin(q1) - l2 * math.sin(q1 + q2), -l2 * math.sin(q1 + q2)],
            [l1 * math.cos(q1) + l2 * math.cos(q1 + q2), l2 * math.cos(q1 + q2)],
        ]
    )


def inverse_kinematics(target: np.ndarray, lengths: np.ndarray) -> list[np.ndarray]:
    x, y = target
    l1, l2 = lengths
    cosine_q2 = (x * x + y * y - l1 * l1 - l2 * l2) / (2.0 * l1 * l2)
    if cosine_q2 < -1.0 or cosine_q2 > 1.0:
        return []
    solutions = []
    for sine_sign in (1.0, -1.0):
        sine_q2 = sine_sign * math.sqrt(max(0.0, 1.0 - cosine_q2 * cosine_q2))
        q2 = math.atan2(sine_q2, cosine_q2)
        q1 = math.atan2(y, x) - math.atan2(l2 * sine_q2, l1 + l2 * cosine_q2)
        solutions.append(np.array([q1, q2]))
    return solutions


def finite_difference_jacobian(q: np.ndarray, lengths: np.ndarray, epsilon: float = 1e-6) -> np.ndarray:
    columns = []
    for index in range(2):
        delta = np.zeros(2)
        delta[index] = epsilon
        columns.append((forward_kinematics(q + delta, lengths) - forward_kinematics(q - delta, lengths)) / (2 * epsilon))
    return np.column_stack(columns)


def main() -> None:
    lengths = np.array([1.0, 0.7])
    target = np.array([1.0, 0.5])
    solutions = inverse_kinematics(target, lengths)
    assert len(solutions) == 2
    for solution in solutions:
        assert np.allclose(forward_kinematics(solution, lengths), target, atol=1e-8)

    q = np.array([0.4, -0.8])
    analytic = jacobian(q, lengths)
    numeric = finite_difference_jacobian(q, lengths)
    assert np.allclose(analytic, numeric, atol=1e-6)
    assert inverse_kinematics(np.array([2.0, 0.0]), lengths) == []

    near_singular = jacobian(np.array([0.0, 1e-5]), lengths)
    condition_number = np.linalg.cond(near_singular)
    assert condition_number > 1e5

    print(f"IK solutions for {target.tolist()}: {len(solutions)}")
    print(f"Jacobian finite-difference max error: {np.max(np.abs(analytic - numeric)):.2e}")
    print(f"Near-singular condition number: {condition_number:.2e}")
    print("Planar arm kinematics lab: PASS")


if __name__ == "__main__":
    main()

