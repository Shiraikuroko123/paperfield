# Synthetic Asset Provenance

This file records the illustrative raster assets used by Flowloom's VLA and
world-model flagship templates. These assets are synthetic placeholders. They
are suitable for demonstrating figure composition and editable diagram
structure, but they are not experimental observations, robot logs, benchmark
results, or execution evidence.

Project metadata declares the generator as `gpt-image-2 via local CCSwitch
endpoint`. The current verification session did not reproduce the generation
request or obtain provider-side request logs, so that generator declaration is
not independently attested here. Replace these files with experiment media and
update the provenance fields before presenting a figure as measured evidence.

Print derivatives were produced from the corresponding source JPEG with 2x
Lanczos resampling. Resampling increases export resolution only. It does not
add measurement detail or turn a synthetic source into evidence.

## VLA Storyboard

Purpose: an illustrative same-camera manipulation rollout. `vla-front.jpg`
shows the task context. The four portrait frames show an observation, approach,
grasp, and placed-object state. The sequence is a designed visual narrative,
not a recorded execution trace.

| Asset | Use | Dimensions | Derivation | SHA-256 |
| --- | --- | ---: | --- | --- |
| `vla-front.jpg` | Initial task observation | 600x600 | Synthetic source | `ffc0f92818715c563076e5a5fd46cf6143df1da7514cc9cf016994c8e97c79dd` |
| `vla-observe.jpg` | Rollout frame tau 0 | 400x600 | Synthetic source | `82f2330b816b8fa8662e92453af01772a1668494879d24f3e9ea790ec4d582f1` |
| `vla-observe-print.jpg` | Print rollout frame tau 0 | 800x1200 | 2x Lanczos from `vla-observe.jpg` | `21759e14cf2d5867b248ad9e5e2726ff869d68fc840c12c6102ef9fadf734aa9` |
| `vla-approach.jpg` | Rollout frame tau 4 | 400x600 | Synthetic source | `a5b0668a1e822e8c5af1e0e253f0a9941ff4b24669b149a11e589940bf34f4d0` |
| `vla-approach-print.jpg` | Print rollout frame tau 4 | 800x1200 | 2x Lanczos from `vla-approach.jpg` | `f36d0d602195f3acb35966721dea6b0f8034cc150b86f63017c03c77755af77c` |
| `vla-grasp.jpg` | Rollout frame tau 8 | 400x600 | Synthetic source | `65b2dd81ba4581b8845dff88b4954c01f40c5ef22deb64246e92c228d24e6bf0` |
| `vla-grasp-print.jpg` | Print rollout frame tau 8 | 800x1200 | 2x Lanczos from `vla-grasp.jpg` | `f2bdf5aaeeba922a18553068cf6b7771b48992c5a1e7977bf9f6f3af53a08f80` |
| `vla-place.jpg` | Next-observation frame | 400x600 | Synthetic source | `6602a60d93c5715198dafcfcf2429f5b3c860d37fada2b984c0f41dc8419f05a` |
| `vla-place-print.jpg` | Print next-observation frame | 800x1200 | 2x Lanczos from `vla-place.jpg` | `9c646656c4dcbce9647399a3e73c27c8287a6cc4be51b50e25dc7ec560ce34dc` |

Prompt intent: a consistent tabletop robot scene with a red object, target
tray, fixed camera, coherent lighting, and visible state progression. This is a
composition reference only. Do not infer success rate, timing, control
accuracy, or physical feasibility from the images.

## World Model Counterfactuals

Purpose: illustrative same-scene counterfactual futures for a latent
world-model diagram. Candidate A depicts goal progress, B depicts contact risk,
and C depicts an occluded or epistemically uncertain state. The selected
next-observation image reuses the synthetic success scene. None of the images
contains a measured cost or calibrated uncertainty value.

| Asset | Use | Dimensions | Derivation | SHA-256 |
| --- | --- | ---: | --- | --- |
| `world-observed.jpg` | Current scene observation | 400x600 | Synthetic source | `8d75c243a534755ab575357adafd7c4f452a4f7d9a635bec8b30f34822f82846` |
| `world-observed-print.jpg` | Print current observation | 800x1200 | 2x Lanczos from `world-observed.jpg` | `14ba2014cf2238172982a53fe006623f1adf7675a4152a3aa0a04178b591a8ed` |
| `world-success.jpg` | Candidate A and illustrative next observation | 400x600 | Synthetic source | `73c5f53fb66df13151f3933448bc910a01b8cdaabed004600eeab4397a7839d2` |
| `world-success-print.jpg` | Print candidate A and next observation | 800x1200 | 2x Lanczos from `world-success.jpg` | `12d425a9bf40c6497acdc8ce4dab8f2ee4261ffa724c25d6c6b5eaacb57c355d` |
| `world-collision.jpg` | Candidate B contact-risk scene | 400x600 | Synthetic source | `1a6a42e8a88b15b2844fcede4a5636d130184d3cbf1d413d225b04d70cf105fc` |
| `world-collision-print.jpg` | Print candidate B | 800x1200 | 2x Lanczos from `world-collision.jpg` | `4abf4396ed3e1eb3341433ca17984994c184f9a4b819ea074f4193332a20a7b2` |
| `world-occluded.jpg` | Candidate C epistemic-uncertainty scene | 400x600 | Synthetic source | `fcff2fc179195053390bf8001fa222cd261a6fb7d88cd0564c8c50da4f6f51c5` |
| `world-occluded-print.jpg` | Print candidate C | 800x1200 | 2x Lanczos from `world-occluded.jpg` | `6e5b45a8bd5255ae1369abdb10d9152e53cfc2ac3a4478474ed9d4bb4900c50f` |

Prompt intent: preserve the same robot, table, object, target, viewpoint, and
lighting while changing only the counterfactual outcome. The visual categories
are explanatory labels, not ground-truth annotations. Do not report the assets
as observed rollouts or use them to support quantitative claims.

## Replacement Rule

For a paper or talk that makes experimental claims, replace every referenced
synthetic asset with source media tied to a run identifier, timestamp, dataset
or robot log, license, and immutable checksum. Set the node asset state to
`measured-evidence` only after that traceable replacement is complete.
