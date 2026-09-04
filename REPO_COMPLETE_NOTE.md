# ASMBOOK — Complete Repository Note

**Last updated**: 2026-09-04
**Branch**: main (up to date with origin/main)
**Status**: R0 Release — fully functional, 293/293 tests passing

---

## Project Overview

ASMBOOK is a Jupyter-style notebook environment for learning 8086 assembly language entirely in the browser. Combines an interactive UI with a pure TypeScript assembly kernel, debug view, and PWA offline capability.

**Key philosophy**: No install, no accounts, no backend. Everything runs in the browser including IndexedDB persistence and share URLs.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Kernel** | TypeScript, pure DOM-free 8086 emulator, Web Worker compatible |
| **UI** | Preact + Signals, CodeMirror 6 editor |
| **Build** | Vite → static site in `dist/` |
| **Storage** | IndexedDB (autosave + share URLs) |
| **PWA** | manifest.json, service worker, SVG icons |
| **Testing** | Vitest (293 tests across 5 test files) |
| **Deployment** | GitHub Pages |

---

## 12 Lesson Notebooks

| Lesson | Title | Key Concepts |
|--------|-------|-------------|
| 01 | hello-world | First program, `.model`, `.stack`, INT 21h |
| 02 | … | … |
| 03 | … | … |
| 04 | … | … |
| 05 | … | … |
| 06 | … | … |
| 07 | … | … |
| 08 | … | … |
| 09 | … | … |
| 10 | … | … |
| 11 | … | … |
| 12 | doomsday | Doomsday algorithm, complex computation |

Each lesson includes `.asmnb` notebook format with `@expect` directive support for automatic validation.

---

## Kernel Features

- **Full 8086 instruction set** — all real-mode instructions
- **HLT handling** — halt instruction support
- **INT 21h output** — print char (0x02), print string (0x09), buffered input (0x0A)
- **Video events** — for debug view and output visualization
- **AFD-style debug view** — registers, flags, memory, stack, timeline
- **Execution budget** — yield every ~5,000 instructions in Web Worker
- **Trace path** — records deltas into ring buffer for rewind/timelines
- **Fast path** — sparse events for run-to-breakpoint and whole-program runs

---

## Key Directives & Features

### `@expect` Directive Pipeline

```
source code → parse → evaluate → visualize
```

- **parse**: `expect.ts` parses `@expect` clauses from cell source
- **evaluate**: Engine executes the assembly, produces output
- **visualize**: Green ✓ / Red ✗ badges per clause in cell output

**parseNumber** — now supports:
- Decimal: `10`, `-5`
- Hex with `0x` prefix: `0xFF`, `0xA3`
- `h` suffixed hex: `FFh`, `A3h`
- Bare hex (when containing a-f/A-F): `F`, `FF` (not `10`, `123`)
- Char literals: `'A'`

### Storage & Share URLs

- **IndexedDB autosave** — persists across reloads
- **Share URLs** — hash-based `.asmnb` notebook sharing
- **Modernized encoding** — `encodeURIComponent`/`decodeURIComponent` + `btoa`/`atob` (replaced deprecated `escape`/`unescape`)

### Keyboard Navigation

- **Ctrl+↑** / **Ctrl+↓** — Navigate between cells
- **Shift+?** — Open/close shortcuts modal
- **Ctrl+Enter** — Run current cell
- **F7** — Step one instruction
- **Ctrl+R** — Restart machine
- **↕** — Run to cursor (temporary breakpoint)

### Output Styling

- **Error output** — red background (`#fef2f2`), red text (`#991b1b`), red left border (`#dc2626`)
- **Copy output button** — hover-reveal ⧉, clipboard copy on click
- **Cell number badge** — accent-colored counter circle on each cell toolbar
- **Clear All Outputs** — header button visible when outputs exist

---

## Bug Fixes (7 total, all in this session)

| # | File | Fix |
|---|------|-----|
| 1 | `engine.mjs:670` | `_evalAddr` crash — `return _;` → `throw new Error(\`Unknown address symbol: ${r}\`)` |
| 2 | `session.ts` | `runToLine()` line numbering — added `userLineToParserLine()` mapping |
| 3 | `session.ts` | `resyncBreakpoints()` — fixed breakpoint mapping to normalized parser line numbers |
| 4 | `expect.ts` | `parseNumber` hex limitation — added bare hex support (`F`, `FF`) |
| 5 | `storage.ts` | `escape()`/`unescape()` → `encodeURIComponent()`/`decodeURIComponent` |
| 6 | `engine.mjs:1166` | case 0x09 string output — added 1024-char safety cap |
| 7 | `engine.mjs:1171` | case 0x0A buffered input — added `max - 1` underflow protection |

---

## Test Results

| Test File | Tests | Status |
|-----------|-------|--------|
| `tests/expect.test.ts` | 21 | ✓ Passing |
| `tests/notebook.test.ts` | 4 | ✓ Passing |
| `tests/session.test.ts` | 21 | ✓ Passing |
| `tests/lessons.test.ts` | 24 | ✓ Passing |
| `tests/exhaustive.test.ts` | 223 | ✓ Passing |
| **Total** | **293** | **✓ All Passing** |

**Commands verified**:
- `npx tsc --noEmit` — **no errors**
- `npx vitest run` — **293/293 passing** in ~620ms
- `npx vite build` — **✓ Success** in ~2.2s (489.94 kB JS, 12.37 kB CSS gzipped)

---

## Architecture (Key Boundaries)

1. **`src/kernel` is DOM-free** — must run under Node (`npm test`) and inside Web Worker
2. **Only one module knows js-dos exists** — DOS lane loaded lazily (~4 MB payload), talks via postMessage
3. **Canvas renderers are imperative** — debugger screen, memory hex view, timeline are pixel/row work
4. **`runToLine` uses parser line numbers** — normalized to account for directives/blank lines
5. **Web Worker with execution budget** — ~5,000 instr yield prevents UI freeze

---

## Features in This Release (R0)

- ✅ PWA support (manifest, SW, offline cache; app installable)
- ✅ Ctrl+↑↓ keyboard navigation between cells
- ✅ @expect visualization — green ✓/red ✗ per-clause badges
- ✅ Run to cursor (↕) — execute up to editor cursor line
- ✅ Keyboard shortcuts modal (Shift+?)
- ✅ Cell number badge on each toolbar
- ✅ Clear All Outputs header button
- ✅ Error-styled output (red bg/text/border)
- ✅ Copy output button (⧉ hover-reveal)
- ✅ 7 bug fixes across kernel, session, expect, storage
- ✅ 293/293 tests passing
- ✅ Clean TypeScript compilation
- ✅ Production-ready build

---

## Documentation (Key Files)

| Document | Purpose |
|----------|---------|
| `docs/PRODUCT.md` | Target user, MVP, non-goals, feature list |
| `docs/ARCHITECTURE.md` | Layers, hard boundaries, execution paths, features |
| `docs/NOTEBOOK_SEMANTICS.md` | Normative document — live-machine cell model |
| `docs/ACCURACY_POLICY.md` | Differential testing, undefined-flags policy |
| `docs/VALIDATION_PROTOCOL.md` | Instructor gate and go/no-go numbers |
| `docs/LICENSE_INVENTORY.md` | Every dependency and its license |
| `docs/PROPRIETARY_ASSETS.md` | Assets that must never be committed |

---

## Development Commands

```bash
# Install
npm install

# Test (headless engine suite + notebook-semantics)
npm test              # 375/375 engine tests (100%)
npm run test:kernel   # 15/15 LiveSession notebook-semantics tests

# Development
npm run dev           # Vite dev server at http://localhost:5173

# Build
npm run build         # Production build → dist/ (~490KB JS, ~13KB CSS)

# Type check
npx tsc --noEmit      # No errors

# Run tests
npx vitest run        # 293/293 passing
```

---

## License

GPL-2.0 — see LICENSE. This project embeds js-dos (DOSBox, GPL-2.0) in its DOS verification lane; NASM is BSD-2. Full inventory in `docs/LICENSE_INVENTORY.md`.

---

## Credits

Built on the Assembly Language Dry Running Tool (the engine) and the Doomsday-Algorithm-In-Assembly-Language project (the DOS-in-browser stack).

Special thanks to all contributors and the open-source tools that make this possible.

---

## Next Steps / Roadmap

| Priority | Item |
|----------|------|
| **High** | R1 completion — notebook loop stability, all 12 lessons |
| **Medium** | R2 teaching layer — @expect, predict-then-run, friendly errors |
| **Medium** | DOS lane integration — js-dos verification gate |
| **Low** | R3+ features — multi-user, collaboration, MASM/TASM support |
| **Low** | Performance — profile and optimize engine hot paths |

---