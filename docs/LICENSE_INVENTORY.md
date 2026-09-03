# ASMBOOK — License inventory

The project license is **GPL-2.0** (LICENSE). Rule: every third-party artifact
committed to this repository is listed here with name, version, source,
license, and the reason it is GPL-2-compatible. If it is not listed, it must
not be committed.

## Code

| Artifact | Version | License | Compatibility | Source |
|---|---|---|---|---|
| preact | 10.x | MIT | ✅ | npm |
| @preact/signals | 1.x | MIT | ✅ | npm |
| vite | 5.x | MIT | ✅ (dev-time only) | npm |
| typescript | 5.x | Apache-2.0 | ✅ (dev-time only) | npm |
| @preact/preset-vite | 2.x | MIT | ✅ (dev-time only) | npm |

## Planned (vendor at the phase that needs them — update this table then)

| Artifact | License | Note |
|---|---|---|
| js-dos 8.x (DOSBox WASM) | GPL-2.0 | DOS lane; same version already vetted in the Doomsday project |
| NASM 2.16.03 WASM build | BSD-2 | assembler authority; rebuild reproducibly, record build env + SHA256 |
| NDISASM | BSD-2 | encoder differential CI |
| CodeMirror 6 | MIT | editor (R1) |
| pixelmatch | ISC | diff *images* only for debugging artifacts — semantic goldens are the assertion |
| marked + DOMPurify | MIT / Apache-2.0 | markdown cells, sanitized |
| pako | MIT | share-URL compression |
| jszip | MIT | export bundles |
| FreeDOS DEBUG / lDebug | MIT (verify exact file headers at vendoring time) | optional debugger in DOS lane |

## Data & fonts

| Asset | License | Note |
|---|---|---|
| CP437 / VGA bitmap font | **must be CC0/public domain or GPL-2-compatible** — CC-BY-SA 4.0 is NOT usable in a GPL-2-only work | verify the specific bitmap provenance before committing |
| Ralf Brown's Interrupt List | free redistribution with specific conditions — read rbil copyright page before republishing any portion | used as engineering reference; hover-docs text is written by us |

## Kernel provenance

`src/kernel/engine.mjs` is ported from the author's own
*Assembly Language Dry Running Tool* repository (same author, no license
conflict; this repo is its designated successor).
