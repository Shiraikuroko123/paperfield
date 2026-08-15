from __future__ import annotations

import torch
import torch.nn.functional as functional


def masked_loss(
    logits: torch.Tensor,
    labels: torch.Tensor,
    mask: torch.Tensor,
) -> tuple[torch.Tensor, int]:
    token_loss = functional.cross_entropy(
        logits.reshape(-1, logits.shape[-1]),
        labels.reshape(-1),
        reduction="none",
    ).reshape_as(labels)
    denominator = int(mask.sum().item())
    return (token_loss * mask).sum() / mask.sum(), denominator


def main() -> None:
    torch.manual_seed(5)
    logits = torch.randn(1, 8, 11, requires_grad=True)
    labels = torch.tensor([[1, 4, 2, 8, 3, 6, 9, 0]])
    assistant_only = torch.tensor([[0, 0, 0, 1, 1, 1, 1, 0]], dtype=torch.float32)
    all_non_padding = torch.tensor([[1, 1, 1, 1, 1, 1, 1, 0]], dtype=torch.float32)
    all_positions = torch.ones_like(assistant_only)

    for name, mask in (
        ("assistant_only", assistant_only),
        ("prompt_and_assistant", all_non_padding),
        ("including_padding", all_positions),
    ):
        loss, denominator = masked_loss(logits, labels, mask)
        print(f"{name}: valid_tokens={denominator} loss={loss.item():.6f}")

    correct_loss, correct_count = masked_loss(logits, labels, assistant_only)
    wrong_loss, wrong_count = masked_loss(logits, labels, all_positions)
    assert correct_count == 4
    assert wrong_count == 8
    assert not torch.isclose(correct_loss, wrong_loss)


if __name__ == "__main__":
    main()
