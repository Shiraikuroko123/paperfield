"""Fuse a noisy position sensor with a constant-velocity Kalman filter."""

from __future__ import annotations

import numpy as np


def main() -> None:
    rng = np.random.default_rng(0)
    dt = 0.1
    steps = 250
    true_state = np.array([0.0, 1.0])
    transition = np.array([[1.0, dt], [0.0, 1.0]])
    observation = np.array([[1.0, 0.0]])
    process_covariance = np.diag([1e-4, 3e-3])
    measurement_variance = 0.35**2

    estimate = np.array([0.0, 0.0])
    covariance = np.eye(2)
    identity = np.eye(2)
    true_positions: list[float] = []
    measurements: list[float] = []
    estimates: list[float] = []

    for step in range(steps):
        acceleration = 0.12 * np.sin(step * dt * 0.7)
        true_state[0] += true_state[1] * dt + 0.5 * acceleration * dt**2
        true_state[1] += acceleration * dt
        measured_position = true_state[0] + rng.normal(0.0, np.sqrt(measurement_variance))

        estimate = transition @ estimate
        covariance = transition @ covariance @ transition.T + process_covariance
        innovation = measured_position - float(observation @ estimate)
        innovation_covariance = float(observation @ covariance @ observation.T + measurement_variance)
        kalman_gain = (covariance @ observation.T / innovation_covariance).reshape(2)
        estimate = estimate + kalman_gain * innovation
        covariance = (identity - np.outer(kalman_gain, observation)) @ covariance

        true_positions.append(true_state[0])
        measurements.append(measured_position)
        estimates.append(estimate[0])

    truth = np.asarray(true_positions)
    raw_rmse = float(np.sqrt(np.mean((np.asarray(measurements) - truth) ** 2)))
    filter_rmse = float(np.sqrt(np.mean((np.asarray(estimates) - truth) ** 2)))
    assert filter_rmse < raw_rmse * 0.6

    print(f"Raw measurement RMSE: {raw_rmse:.3f}")
    print(f"Kalman estimate RMSE: {filter_rmse:.3f}")
    print(f"Final position variance: {covariance[0, 0]:.5f}")
    print("Sensor fusion lab: PASS")


if __name__ == "__main__":
    main()

