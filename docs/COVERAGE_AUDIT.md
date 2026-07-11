# Venue Coverage Audit

Audit date: 2026-07-11

## Result

Paperfield's catalog contains 62 conferences and journals. The local database currently has research records for 61 of them (98.4% indexed coverage). Of those, 59 have papers whose publication date is visible today (95.2% current readable coverage).

The remaining current-zero states are not equivalent:

- `COLM`: OpenReview requires browser challenge verification. Paperfield records this as `blocked` and does not bypass the challenge.
- `SIGIR`: 51 records are indexed with a Crossref publication date of 2026-07-19, later than the audit date, so they stay out of the current feed.
- `Machine Learning`: one record is indexed with a 2026-09 publication date and is hidden for the same reason.

Counts change as metadata sources update and publication dates arrive. `/api/coverage` is the authoritative local snapshot.

## Why Many Venues Previously Showed Zero

The first implementation treated `venues.json` as both a desired catalog and proof of collection. In reality, only broad arXiv, OpenAlex, Crossref, PMLR, and CVF queries were active. This caused four failure modes:

1. Desired venues were listed before a platform-specific collector existed.
2. Broad topic queries did not reliably return venue-specific proceedings.
3. Crossref relevance was weakened when generic date sorting displaced container-title matches.
4. Proceedings and journals use different metadata platforms and naming conventions.

## Connectors Added

- Dedicated Crossref collection for ACM MM proceedings.
- Dedicated Crossref collection for IEEE Transactions on Robotics (`IEEE T-RO`).
- Targeted Crossref container-title queries for the general catalog.
- Fixed DBLP XML archives for selected venues that Crossref does not cover reliably.
- Multiword proceedings-title normalization and canonical venue aliases.

## Interpretation Limits

- A nonzero count means Paperfield has relevant candidate records, not that it mirrors every item published by that venue.
- Public metadata can be incomplete, delayed, duplicated, or future-dated.
- PDF availability is separate from metadata coverage and remains limited to legal public copies.
- Institution badges depend on affiliation metadata supplied by OpenAlex or Crossref and will not appear on every paper.
