# Flowloom Figure Benchmarks

This directory is the durable source bundle for the six paper-figure review cases that predate the Paperfield monorepo migration.

- `figure-benchmark-gold.json` contains the benchmark protocol, paper locators, expected semantic plans, and training roles.
- `human-reviews/` contains the exported human review records.
- `../public/benchmarks/compiled/` contains the browser review pages and editable SVG artifacts shipped with Flowloom.

The only case currently marked `trainingRole: "gold"` is `imitation-diffusion-policy` (Diffusion Policy, arXiv `2303.04137`, Figure 2 in PDF v5, page 3). `vla-rt2-overview` is a `gold-candidate`; the other four cases are hard negatives.

Reference paper images remain remote analysis-only resources and are not copied into the product bundle. The compiled SVGs and review metadata are local.
