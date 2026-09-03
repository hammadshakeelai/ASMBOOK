**Build with major changes.** Do not build the full 63-feature, 20-phase plan as written. The single most important reason is scope collapse for a solo + AI developer: the verification machine, pixel-perfect AFD CI, dual-lane differential testing, hardware depth, and teaching layer are each multi-month projects on their own. Combining them produces an unmaintainable monster that will stall long before a course can adopt it. Prior art already covers large pieces of the educational surface; the unique value (notebook + inspectable pure-JS 8086 + real DOS authenticity) is real but must be ruthlessly narrowed.

### 2. Corrections to factual claims

1. **Yjs + WebRTC “serverless” (no signaling):** Partially false. y-webrtc is peer-to-peer after connection, but discovery still requires signaling servers (public ones exist; you can also do manual SDP offer/answer copy-paste). Full mesh scales poorly beyond a handful of peers. Bundle is modest (Yjs core ~ tens of KB gzipped + y-webrtc). CodeMirror 6 has solid y-codemirror bindings. Viable only as an opt-in stretch with clear UX for manual signaling; not “truly serverless” in the zero-infrastructure sense claimed.

2. **Ready-made WASM NASM from x86-64-playground:** Exists. The repo ships a `musl_nasm` directory (static musl build of NASM compiled to WASM). NASM itself is 2-clause BSD. No inherent reason it would fail for `-f bin` .COM output; the playground uses it for exactly that class of work. Vendoring is practical.

3. **v86 headless in CI as oracle:** Viable for boot + run-to-completion, but extraction of precise register/memory state requires poking the JS API (`emulator.v86.cpu` registers, `mem8`, save_state). Single-stepping and the trap flag are explicitly missing; this does **not** break end-state differential testing after a program exits, but it does break any plan that needs instruction-precise breakpoints or trap-flag behavior inside the oracle. Use for coarse end-state checks only; do not rely on it for step-level parity.

4. **pixelmatch for byte-exact CI:** Suitable for controlled, identical-render cases, but brittle. It is pure-JS, widely used, and has anti-aliasing options, yet still produces false failures from font rasterization, subpixel, palette, timing, or canvas scaling. Faster/SIMD alternatives (odiff, pixel-buffer-diff) exist and are preferable for CI volume. For true byte-exact AFD fidelity you need a deterministic harness (fixed font bitmap, no AA, locked palette, no scroll animation, identical canvas size).

5. **js-dos 8.4.1:** `persist()` exists and dumps FS changes as a second bundle (OPFS in recent versions). Mouse support is present at the API level (`sendMouse*`); INT 33h depends on the DOSBox backend configuration. Full emulator save-state is more limited / backend-specific (DOSBox-X has some triggers). License is GPL-2.0. Known gotchas match Repo B (re-init, background tabs, DJGPP redirects).

6. **GPL-2 license conclusion:** Correct and forced. js-dos is GPL-2; the whole distributed work becomes GPL-2. ISC/MIT/BSD components are compatible. CC-BY-SA font requires attribution and share-alike on the font asset itself; no fundamental conflict if NOTICE and attribution are handled. Do not claim pure MIT/ISC freedom.

7. **“No living web-based 8086 notebook-style educational tool”:** Overstated. Multiple living browser 8086 simulators exist (EasyCPU with LEDs/7-seg/challenges, daohainam/emulator-8086-js with NASM-compatible assembler + VGA text, Amey-Thakur collection with step debugger, vgath-8086 Online IDE, others). None combine Jupyter-style multi-cell notebooks + pure inspectable JS kernel + real DOSBox verification + AFD pixel clone. Market gap is narrower than claimed but still real for the exact combination.

8. **WASM JWasm / OpenWatcom:** No ready-made public WASM builds found. JWasm is portable C (Sybase Open Watcom license). Compiling with Emscripten is feasible but non-trivial (build system, libc, output formats). Expect weeks of work, not a drop-in. Treat multi-assembler as late stretch.

### 3. Architecture review

**Bet 1 (client-side Jupyter-like message protocol):** Agree. Static hosting forces it. Keep the kernel pure and node-testable; the protocol is just an event bus.

**Bet 2 (transparent JS interpreter + DOSBox as authority + differential testing):** Agree on the principle, disagree on the cost. The dual-lane + golden corpus + public ledger is the highest-value differentiator and also the highest maintenance surface. Make differential testing a first-class CI gate from day one, not a late phase. Prefer js-dos as primary oracle for DOS fidelity; use v86 only for cheap end-state checks.

**Bet 3 (framework-free vanilla-TS DOM):** Disagree for a notebook of this complexity. 10+ panel types, dynamic cells, timeline scrubber, live visualizations, and AFD canvas will produce a brittle event-handler soup. Canvas-heavy updates do favor direct DOM, but the overall surface does not. Escape hatch to Svelte is realistic only if the kernel stays pure and the UI is a thin shell; once you have 5k+ lines of hand-rolled cell/state management the rewrite cost becomes high. Start with a lightweight framework or accept the risk of later rewrite.

**Bet 4 (every layer swappable):** Agree in theory; in practice the phases lock in too much concrete UI early. Enforce the pure-kernel boundary ruthlessly.

### 4. Missing features & features to cut

**Cut or defer hard:**
- Full pixel-perfect AFD + pixel-diff CI (P9) — high false-failure risk, huge harness work.
- Hardware depth beyond basic text + simple ports (P13 CGA/VGA, PC speaker, PIT, full mouse, custom ISR).
- Virtual I/O devices beyond a minimal LED/7-seg (P14).
- Multi-assembler dialects (P18).
- Most of P19b (Yjs pair-debug, what-if branching, gallery, achievements, AI tutor, FPU, Tauri, VS Code).
- Teacher-mode headless CLI auto-grading + EXE/boot-sector labs until after real classroom validation.
- Timeline what-if branches and full 100k-step recording.

**Keep / elevate:**
- Pure kernel + 375 tests + encoder/semantics differential tests.
- Notebook cells with state carry + CodeMirror.
- Basic debugger (step, breakpoints, registers, memory, stack).
- One-click DOS lane (assemble + run) with error gutter.
- `@expect` checkable cells and simple predict-then-run quizzes.
- Share-URL + localStorage.
- Accuracy ledger (even if initially sparse).

**Missing that students/teachers actually need:**
- Curriculum mapping to common textbooks / lab manuals.
- Export of student notebooks with results for grading (without server).
- Accessibility (keyboard-only, screen-reader labels on registers/flags).
- Simple “compare my run vs expected” without full dual-engine UI.
- Offline-first PWA shell.

### 5. Revised phase order

Collapse to ~8–10 real milestones. Rationale: get a usable educational core in front of real students before investing in authenticity theater or advanced viz.

1. Scaffold + CI + pure kernel port (375 tests green) + DESIGN.md.
2. Encoder differential tests + vendored WASM NASM + basic disassembler.
3. Minimal notebook UI (CodeMirror cells, run, register/memory output, state carry).
4. Persistence + share-URL + basic debugger (step/breakpoints).
5. DOS lane (lazy js-dos, assemble→run, error markers).
6. Differential end-state testing + accuracy ledger skeleton + golden corpus start.
7. Teaching layer (`@expect`, quizzes, one flagship Doomsday notebook).
8. Polish (visualizations that actually help, teacher mode basics, accessibility).
9+. Everything else only after classroom feedback.

### 6. Top-10 risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| 1 | Scope explosion kills progress | High | Critical | Hard cut list; MVP gate before any P10+ |
| 2 | Dual-lane differential CI flaky / expensive | High | High | Start with end-state only; js-dos primary; golden corpus growth controlled |
| 3 | Pixel-diff CI false failures | High | High | Defer or drop; use fixed-font deterministic canvas if kept |
| 4 | Vanilla-TS UI becomes unmaintainable | Medium-High | High | Enforce pure kernel; consider Svelte early or accept rewrite |
| 5 | GPL-2 contagion + attribution mistakes | Medium | Medium | NOTICE file, automated license check, no closed forks |
| 6 | js-dos re-init / background-tab / payload size | Medium | Medium | Keep proven iframe-per-run; lazy load; document traps |
| 7 | Solo + AI quality rot | High | High | Strict CI gates, test-first for kernel, human review of AI diffs |
| 8 | Adoption failure (no course picks it up) | Medium | High | Ship MVP, find 1–2 instructors early, measure usage |
| 9 | Performance <1 MIPS on real student machines | Medium | Medium | Typed arrays, pre-decode cache, measure early |
| 10 | Maintenance of vendored WASM toolchains | Medium | Medium | Pin versions, automated rebuild scripts, document upgrade path |

### 7. MVP definition and milestone

**Minimum Lovable Product:** Static site where a student can open a notebook, write multi-cell 8086 assembly, run it on the pure JS interpreter with register/memory/flag inspection and step debugging, save/share the notebook, run the same code through real NASM+DOSBox for authenticity check, and see a simple accuracy statement. Include the annotated Doomsday notebook and basic `@expect` cells.

This exists after revised phases 1–6/7. Hold the project to: “A real undergrad lab section can replace their current emulator with this for core instruction without the developer present.”

### 8. Concrete first-30-days execution advice

- Day 1–3: Repo scaffold (Vite + TS), CI (GitHub Actions), DESIGN.md that explicitly lists cut features and the pure-kernel boundary.
- Day 4–14: Port kernel from Repo A, get all 375 tests green under Node, add typed-array memory and basic pre-decode.
- Day 15–20: Vendored WASM NASM + encoder differential tests for the core instruction set.
- Day 21–28: Absolute minimal notebook (one CodeMirror cell → run → register dump). No debugger UI yet.
- Day 29–30: Deploy to GitHub Pages, write the accuracy ledger skeleton, invite one trusted reviewer.

Measure interpreter IPS on day 14. If you cannot hit several hundred kIPS with a clean design, stop and optimize before UI.

### 9. Open questions the developer must answer before Phase 0

1. Who is the first real user (specific course, instructor, or self)? What lab assignment must it support on day 1 of adoption?
2. What is the hard calendar deadline or burn-out limit? (e.g., “shippable MVP in 4 months or I stop”)
3. Will you accept a Svelte (or other) UI from the start, or is vanilla non-negotiable?
4. How will dual-lane CI run in practice on free GitHub Actions (time, flakiness, secrets for any DOS assets)?
5. What is the exact subset of INT 21h / BIOS that must work for the target curriculum?
6. Are you prepared to own GPL-2 forever, including any future commercial or closed educational forks?
7. How will you validate that the visualizations actually improve learning outcomes (pre/post or A/B with a real class)?
8. What is the fallback if js-dos becomes unmaintained or changes license?

The core idea—transparent inspectable 8086 + real DOS verification inside a notebook—is strong and under-served. The current plan tries to build three products at once. Cut until the educational loop is closed and used by real students; only then add authenticity theater and advanced features.