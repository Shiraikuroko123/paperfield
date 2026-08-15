# Vendored browser dependencies

These fixed-version browser bundles keep formulas and Mermaid diagrams usable
when the unified Paperfield platform is offline.

| Dependency | Version | Included files | License | npm tarball SHA-256 |
| --- | --- | --- | --- | --- |
| MathJax | 3.2.2 | `es5/tex-mml-chtml.js`, CHTML WOFF fonts | Apache-2.0 | `1b9c0a1c44df864e915690558e72adb9cc5203360daefd385084ced3b6c64c09` |
| Mermaid | 11.16.1 | `dist/mermaid.min.js` | MIT | `ebd9885111092c78cefc79a76f6c1dc34ed5b834b02ae8f338227ce79c003de4` |

The files were taken from the corresponding npm release tarballs. Upgrade the
versioned directory and this manifest together; do not replace these paths with
a CDN URL because the course is part of a local-first product.
