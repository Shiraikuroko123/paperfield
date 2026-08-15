from __future__ import annotations

import argparse

import torch


def train(fault: str) -> tuple[float, float]:
    torch.manual_seed(7)
    x = torch.linspace(-1.0, 1.0, 128).unsqueeze(1)
    y = 3.0 * x - 0.5
    model = torch.nn.Linear(1, 1)
    learning_rate = 5.0 if fault == "high_lr" else 0.05
    optimizer = torch.optim.SGD(model.parameters(), lr=learning_rate)
    criterion = torch.nn.MSELoss()

    with torch.no_grad():
        initial_loss = float(criterion(model(x), y))

    for step in range(160):
        if fault != "no_zero":
            optimizer.zero_grad(set_to_none=True)
        prediction = model(x)
        if fault == "detach":
            prediction = prediction.detach()
        loss = criterion(prediction, y)
        if not torch.isfinite(loss):
            print(f"step={step} non-finite loss={loss.item()}")
            break
        loss.backward()
        grad_norm = torch.nn.utils.clip_grad_norm_(model.parameters(), 10.0)
        optimizer.step()
        if step in {0, 1, 10, 40, 159}:
            print(
                f"step={step:03d} loss={loss.item():.6f} "
                f"grad_norm={float(grad_norm):.6f}"
            )

    with torch.no_grad():
        final_loss = float(criterion(model(x), y))
        weight = float(model.weight.item())
        bias = float(model.bias.item())
    print(f"weight={weight:.4f} bias={bias:.4f}")
    return initial_loss, final_loss


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--fault",
        choices=("none", "high_lr", "no_zero", "detach"),
        default="none",
    )
    args = parser.parse_args()

    try:
        initial, final = train(args.fault)
    except RuntimeError as error:
        if args.fault == "detach":
            print(f"Expected detach failure: {error}")
            return
        raise

    print(f"initial_loss={initial:.6f} final_loss={final:.6f}")
    if args.fault == "none":
        assert final < initial * 1e-3


if __name__ == "__main__":
    main()
