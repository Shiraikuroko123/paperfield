"""Simulate a second-order joint under P/PD control and command delay."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass

import numpy as np


@dataclass
class Result:
    final_error: float
    overshoot: float
    settling_time: float | None
    maximum_absolute_position: float


def simulate(kp: float, kd: float, delay_ms: float = 0.0, dt: float = 0.002, duration: float = 3.0) -> Result:
    inertia = 1.0
    physical_damping = 0.15
    target = 1.0
    position = 0.0
    velocity = 0.0
    positions: list[float] = []
    delay_steps = max(0, round(delay_ms / 1000.0 / dt))
    command_queue: deque[float] = deque([0.0] * (delay_steps + 1), maxlen=delay_steps + 1)

    for _ in range(round(duration / dt)):
        command = kp * (target - position) - kd * velocity
        command_queue.append(command)
        delayed_command = command_queue[0]
        acceleration = (delayed_command - physical_damping * velocity) / inertia
        velocity += acceleration * dt
        position += velocity * dt
        positions.append(position)

    values = np.asarray(positions)
    within_band = np.abs(values - target) < 0.02
    settling_time = None
    for index in range(len(values)):
        if within_band[index] and within_band[index:].all():
            settling_time = index * dt
            break
    return Result(
        final_error=abs(values[-1] - target),
        overshoot=max(0.0, float(values.max() - target)),
        settling_time=settling_time,
        maximum_absolute_position=float(np.abs(values).max()),
    )


def main() -> None:
    proportional = simulate(kp=20.0, kd=0.0)
    pd = simulate(kp=20.0, kd=8.0)
    delayed = simulate(kp=20.0, kd=8.0, delay_ms=80.0)
    aggressive = simulate(kp=200.0, kd=1.0, delay_ms=80.0)

    assert pd.overshoot < proportional.overshoot
    assert delayed.final_error > pd.final_error
    assert aggressive.maximum_absolute_position > 2.0

    print(f"P overshoot: {proportional.overshoot:.3f}")
    print(f"PD overshoot: {pd.overshoot:.3f}; final error: {pd.final_error:.4f}")
    print(f"PD + 80 ms delay final error: {delayed.final_error:.4f}")
    print(f"Aggressive delayed max |q|: {aggressive.maximum_absolute_position:.2f}")
    print("PID control lab: PASS")


if __name__ == "__main__":
    main()

