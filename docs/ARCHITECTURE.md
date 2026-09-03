# ASMBOOK — Architecture

## Layers

```
[.asmnb notebook format — JSON, versioned]
[Kernel message protocol — run/step/stepBack/setBreakpoint/peek/poke/snapshot]
[Pure TS kernel — CPU, parser, executor, INT services, timeline]  ← src/kernel
[Preact + Signals UI shell]   [canvas renderers: debugger screen, memory, timeline]
[DOS lane — js-dos in an isolated iframe; lazy-loaded]
```

## Hard boundaries

1. **`src/kernel` is DOM-free.** No `document`, no `window`, no Preact, no
   CodeMirror imports. It must run under Node (`npm test`) and inside a Web
   Worker. Enforced by review and by the test suite importing it from Node.
2. **Only one module knows js-dos exists.** The DOS lane is loaded lazily
   (the ~4 MB payload must never block first paint) and talks to the rest of
   the app through postMessage.
3. **Canvas renderers are imperative.** The debugger screen, memory hex view
   and timeline are pixel/row work — no component framework inside them.

## Kernel execution paths

Two paths, same semantics:

- **Trace path** — every step records a compact delta (changed registers,
  flags, memory writes) into a ring buffer. Powers rewind, timelines,
  per-cell outputs. Budgeted (records stop at the cap).
- **Fast path** — no recording, sparse events, used for run-to-breakpoint
  and whole-program runs.

The kernel runs inside a **Web Worker** with an execution budget (yield
roughly every 5,000 instructions) so an infinite student loop never freezes
the UI. The worker speaks the kernel message protocol over postMessage; the
same protocol is spoken in-process during tests.

## Notebook model

See [NOTEBOOK_SEMANTICS.md](NOTEBOOK_SEMANTICS.md) — the normative document.
Short version: the notebook is one live machine; cells are source regions;
the CPU cursor (IP) moves through them; edits re-assemble and patch memory.

## DOS lane

- js-dos 8.x in a dedicated iframe (isolation: hard kill, clean teardown —
  retained as an engineering choice; js-dos also exposes `props.stop()`).
- Flow: project snapshot → `fsWriteFile` into the emulated C: drive →
  `nasm -f bin prog.asm -o prog.com` → run. NASM diagnostics are parsed by a
  pure module and shown as gutter markers in the editor.
- The DOS lane consumes snapshots of the project workspace; it is a
  **mirrored workspace**, not a shared live filesystem.

## CI / verification

See [ACCURACY_POLICY.md](ACCURACY_POLICY.md). Tiers:
per-commit (fast Node tests) → per-PR (encoder differential vs NASM) →
nightly (DOSBox-X native oracle, v86 secondary) → release (full product smoke
via Playwright).
