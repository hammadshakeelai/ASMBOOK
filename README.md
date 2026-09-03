<p align="center">
  <b>ASMBOOK</b><br>
  A Jupyter-style notebook for learning 8086 assembly on a fully inspectable virtual machine.
</p>

---

# ASMBOOK

Write 8086 assembly in notebook cells, run it on a transparent virtual CPU,
watch every register, flag and byte of memory change — and verify the same
program on **real NASM inside real DOS** (DOSBox, in your browser).

No install. No accounts. No backend. Nothing leaves your browser.

## Status

**R0 — Foundation.** The 8086 kernel is ported and fully green:

```
npm test        →  375/375 engine tests pass (100%)
npm run build   →  static site in docs/
```

The notebook UI is the next milestone (R1). See [DESIGN.md](DESIGN.md) for the
full roadmap and the review-hardened decisions behind it.

## Development

```bash
npm install
npm test        # headless engine test suite (10 case files)
npm run dev     # Vite dev server
npm run build   # production build → dist/
```

## Layout

```
src/kernel/    the 8086 engine (pure, DOM-free, node-testable)
src/ui/        the Preact notebook shell (R1)
tests/         engine test suite — 375 cases, ported from the
               Assembly Language Dry Running Tool
docs/          governance documents (product, architecture, semantics…)
dist/          build output (not committed; CI deploys it)
```

## Governance documents

| Document | What it decides |
|---|---|
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | target user, MVP, non-goals |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | layers, kernel boundary, worker plan |
| [`docs/NOTEBOOK_SEMANTICS.md`](docs/NOTEBOOK_SEMANTICS.md) | the live-machine cell model (normative) |
| [`docs/ACCURACY_POLICY.md`](docs/ACCURACY_POLICY.md) | differential testing, undefined-flags policy |
| [`docs/LICENSE_INVENTORY.md`](docs/LICENSE_INVENTORY.md) | every dependency and its license |
| [`docs/PROPRIETARY_ASSETS.md`](docs/PROPRIETARY_ASSETS.md) | assets that must never be committed |
| [`docs/VALIDATION_PROTOCOL.md`](docs/VALIDATION_PROTOCOL.md) | the instructor gate and its go/no-go numbers |

## License

GPL-2.0 — see [LICENSE](LICENSE). This project embeds js-dos (DOSBox, GPL-2.0)
in its DOS verification lane; NASM is BSD-2. Full inventory in
[`docs/LICENSE_INVENTORY.md`](docs/LICENSE_INVENTORY.md).

## Credits

Built on the Assembly Language Dry Running Tool (the engine) and the
Doomsday-Algorithm-In-Assembly-Language project (the DOS-in-browser stack).
