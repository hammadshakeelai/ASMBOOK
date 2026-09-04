# ASMBOOK — Design & roadmap

Written 2026-09-03. This is the plan the project is building, after
adversarial review by three independent AI auditors (ChatGPT, Gemini, Grok —
 transcripts in the repository root, kept as decision history).

## What this is

A Jupyter-style notebook for 8086 assembly education: one live, fully
inspectable virtual machine per notebook; a classic-DOS-styled debugger of
our own design; one-click verification on real NASM inside real DOSBox; a
teaching layer (predict-then-run, checkable cells, lessons); static site,
no backend. Full decisions: [docs/PRODUCT.md](docs/PRODUCT.md),
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Decisions locked (and who forced them)

| Decision | Choice | Forced by |
|---|---|---|
| Notebook semantics | one live machine; cells are views; edits are RAM patches; run-to-cell = prefix execution | user's original vision + review round 2 (cell-fragment assembly would fork from real NASM semantics) |
| UI framework | Preact + Signals shell; canvas stays imperative; kernel pure | 3/3 reviewers against vanilla at this complexity; Preact won on AI-assist + stability |
| Editor | CodeMirror 6 | gutter breakpoints, inline NASM diagnostics |
| Kernel transport | Web Worker + message protocol + execution budgets | infinite student loops must never freeze the UI |
| Debugger identity | own design, "inspired by classic DOS debuggers" | AFD.EXE is proprietary (AdTec GmbH); see PROPRIETARY_ASSETS |
| Screen goldens | semantic 80×25 char+attribute matrix; raw-RGBA only vs our own renders | pixel-diff vs DOSBox screenshots = false-failure trap (3/3 reviewers) |
| Accuracy | CI tiers + RESULT.BIN guest instrumentation + undefined-flags policy + public ledger | "accurate" must be machine-checked, oracle ≠ spec |
| Oracle chain | NASM (encoding) → DOSBox-X native (nightly semantics) → v86 (independent secondary) → js-dos (product smoke) | deterministic, CI-affordable, independent |
| Persistence | IndexedDB/OPFS; versioned `.asmnb`; share-URL only for small notebooks | localStorage limits; URL length reality |
| Expansion | instructor validation gate (~week 8–12) before any advanced feature; evidence-gated dialect support | 3/3 reviewers: scope was the #1 project-killer risk |

## Roadmap

| Milestone | Delivers | Exit criterion |
|---|---|---|
| **R0** (done) | repo, docs, CI, kernel ported | **375/375 tests green; static build works** |
| **R1** (done) | notebook loop: cells, run/restart/step/breakpoints, registers/flags/memory/stack, B800h text, IndexedDB autosave, import/export | a student completes a normal intro 8086 exercise without DOSBox — **15/15 session-semantics tests + 375/375 engine green** |
| R2 | teaching layer: @expect, predict-then-run, friendly errors, 8–12 lessons, a11y baseline | one complete vertical lesson validated with real beginners |
| **GATE 1** | instructor pilot (VALIDATION_PROTOCOL.md) | numeric go/no-go |
| R3 | accuracy infra: coverage matrix, execution ledger, semantic goldens, encoder differential vs NASM, oracle lanes | **ledger + matrix launched** in-progress (99.7%, see docs/ACCURACY.md); encoder differential pending GATE 1 | 1,000+ encoder cases pass |
| R4 | DOS lane: lazy js-dos, whole-program verify, gutter diagnostics | kernel vs DOS end-state agreement on Tier-3 corpus |
| R5 | advanced debugger: rewind, watch, conditionals, visualizations | only visualizations tied to observed learning problems |
| R6 | verification hardening: nightly oracles, fuzzing, perf suite | nightly green; ≥1M ips fast path |
| R7 | course productization: CLI grader, offline ZIP, LMS export | GATE 2: 2 instructors, 30–50+ students |
| R8 | evidence-gated expansion: graphics, devices, dialects, collab, frontier | chosen by pilot data, not ambition |

The original 63-feature catalog is preserved in the review transcripts and
this repo's history; features enter the roadmap only through R8's evidence
gate.

## Traps inherited from the predecessor projects

(js-dos background-tab freeze; NASM `-s` for reliable error reporting; no
shell-redirect of DJGPP tools; lazy-load the 4 MB DOS payload; iframe-per-run
retained as isolation despite `props.stop()` existing) — see
Doomsday-Algorithm-In-Assembly-Language DESIGN.md.
