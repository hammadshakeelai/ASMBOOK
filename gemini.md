### 1. Executive Verdict

**BUILD WITH MAJOR SCOPE & ARCHITECTURAL CHANGES.**

The single most fatal flaw in the current plan is **runaway scope driven by the "Second-System Effect"**: attempting to build a multi-dialect assembler, a dual-engine differential execution matrix, a pixel-perfect CRT debugger clone, virtual hardware breadboards, and WebRTC collaboration—all as a client-side static site engineered by a solo developer.

If built as planned, the project will stall between Phases 9 and 12, bogged down by the maintenance overhead of headless CI emulators, DOM memory leaks, and pixel-rendering inconsistencies. However, the core vision—**an inspectable, notebook-driven 8086 educational environment for students struggling through x86 architecture courses**—is exceptionally strong and addresses an active pedagogical pain point.

---

### 2. Corrections to Factual Claims

* **Claim 1: "License: GPL-2.0 is compatible with the int10h CP437 font under CC-BY-SA."**
* **Refutation:** **CC-BY-SA 4.0 is legally incompatible with GPL-2.0.** In October 2015, Creative Commons and the Free Software Foundation established one-way compatibility from CC-BY-SA 4.0 into **GPLv3 only** (see [Creative Commons Compatibility Declaration](https://creativecommons.org/share-your-work/licensing-considerations/compatible-licenses)). CC-BY-SA 4.0 cannot be combined into a GPL-2.0-only codebase. Because js-dos 8 derives from DOSBox (which contains GPL-2.0-only code), bundling CC-BY-SA assets into a GPL-2.0 distribution triggers a copyleft contradiction.
* **Fix:** Replace the int10h font with a Public Domain (CC0) VGA bitmap dump or an Open Font License (OFL) CP437 font.


* **Claim 2: "Yjs + WebRTC is viable for serverless peer-to-peer editing without a backend."**
* **Refutation:** WebRTC cannot establish a peer-to-peer connection without an out-of-band signaling mechanism to exchange SDP offers, answers, and ICE candidates. While manual copy-paste exchange is theoretically possible, it requires exchanging 2–4 KB base64 blobs back and forth between users for *every* session. Furthermore, institutional networks (university eduroam, campus labs, CGNAT) routinely enforce symmetric NATs that completely block P2P WebRTC data channels without a dedicated **TURN relay server**. True "zero-backend" WebRTC does not work on campus Wi-Fi.


* **Claim 3: "v86 can be used headless in CI to boot FreeDOS and extract register/memory states after exit."**
* **Refutation:** 1. When a DOS program finishes via `INT 21h, AH=4Ch`, control returns to `COMMAND.COM`. The command interpreter immediately executes its own prologue routines, overwriting `AX`, `BX`, `CX`, `DX`, `SP`, and the arithmetic flags before any external harness can read them.
2. `v86` explicitly lacks single-step debugging and Trap Flag (`TF`) architectural support in its JIT engine.
3. Booting FreeDOS in `v86` takes 4–10 seconds per run; running 375+ tests sequentially in CI would take over 45 minutes and cause frequent headless browser timeouts.


* **Claim 4: "pixelmatch is suitable for byte-exact CI pixel-diffing against DOSBox."**
* **Refutation:** Canvas-rendered font rasterization in Headless Chromium (Blink/FreeType) differs at the subpixel level across OS runners (Linux CI vs. macOS/Windows dev machines). Furthermore, DOSBox text mode (VGA 720×400 or scaled 640×400) maps an 8×16 font into 9×16 character cells for box-drawing characters (`0xC0`–`0xDF`) via hardware column-duplication. Testing raster screenshots byte-for-byte guarantees continuous false-positive CI failures.


* **Claim 5: "WASM NASM readily outputs flat `.COM` binaries in the browser."**
* **Status:** Partially verified. The `musl_nasm` build from `x86-64-playground` compiles flat binaries using `-f bin`. However, Emscripten-compiled CLI executables rely on a single execution of `main()`. Once `main()` exits, linear memory is dirtied and cannot be re-invoked without either instantiating a fresh WebAssembly instance (a ~30–50ms memory allocation hit) or heavily refactoring NASM's global C state.


* **Claim 6: "No living tool combines an 8086 inspectable emulator, notebooks, and real DOS."**
* **Refutation:** While the specific Jupyter layout is novel for 16-bit DOS, tools such as **ASM80** (a full browser-based IDE and debugger for 8086/8080/Z80) and various open-source web emu8086 implementations already provide browser-based step debugging and memory visualization. The market gap is real in *curriculum UX*, but not in raw web emulation.



---

### 3. Architecture Review

```
                +------------------------------------+
                |       Notebook Reactive Shell      |
                |  (Preact / Lightweight Signals)   |
                +-----------------+------------------+
                                  |
            +---------------------+---------------------+
            |                                           |
            v                                           v
  +-------------------+                       +-------------------+
  | CodeMirror 6      |                       | Canvas Displays   |
  | (Editor Cells)    |                       | (AFD Skin, Memory)|
  +---------+---------+                       +-------------------+
            |
            | Web Worker Message Bus (Jupyter wire format)
            v
  +---------------------------------------------------------------+
  |                 Pure TS 8086 Virtual Kernel                   |
  |  - Lazy Flags Evaluation       - Circular Ring Delta Buffer   |
  |  - TypedArray 1MB RAM Space    - Fast Opcode Dispatch         |
  +-------------------------------+-------------------------------+
                                  | Parity Check
                                  v
                    +---------------------------+
                    | DOS Lane (js-dos Worker)  |
                    | (Lazy loaded, WASM NASM)  |
                    +---------------------------+

```

#### Bet 1: Client-side kernel speaking Jupyter-like message protocol

* **Verdict:** **AGREE (with caveat).**
* **Reasoning:** Decoupling execution from UI via a structured, asynchronous message bus (`execute_request`, `execute_reply`, `inspect_request`, `stream`) is standard practice. Running this kernel inside a dedicated **Web Worker** prevents UI freezes during infinite loops.
* **Caveat:** Jupyter's multi-cell model assumes a persistent, accumulative state. If Cell 1 defines `.DATA` and Cell 2 defines `.CODE`, your assembler/interpreter must support non-contiguous segment concatenation, or each cell will simply overwrite the program segment prefix (PSP) and reset CS:IP.

#### Bet 2: Dual-lane execution (Transparent JS interpreter vs. DOSBox authenticity lane)

* **Verdict:** **DISAGREE with parity at run time; AGREE with DOSBox as an on-demand audit lane.**
* **Reasoning:** Running both engines concurrently on every keystroke or single-step is an architectural trap. Synchronizing two separate memory spaces (one in JS `ArrayBuffer`, one inside DOSBox's internal C++ struct) across an asynchronous postMessage boundary will introduce race conditions, latency spikes, and frame drops.
* **Better pattern:** The JS interpreter is the primary interactive driver. The DOSBox lane should only run on explicit user request ("Verify against DOS") or during headless CI test suites.

#### Bet 3: Framework-free vanilla-TS DOM for a complex multi-panel notebook

* **Verdict:** **STRONGLY DISAGREE.**
* **Reasoning:** A notebook platform with draggable splitters, dynamic cell additions/deletions, CodeMirror instances, breakpoints, variable watches, and timeline scrubbers will quickly degenerate into spaghetti code under vanilla DOM imperative calls. Dangling event listeners and detached DOM trees will cause significant memory leaks during extended student sessions.
* **Alternative:** Use a micro-reactive UI layer (such as Preact with Signals or Svelte 5). Reserve raw canvas operations strictly for high-frequency rendering components: the 80×25 AFD display, the memory heatmap, and execution timelines. The "escape hatch" to swap to Svelte later is unrealistic; migrating 10 complex UI panels after the fact would require a near-total rewrite.

#### Bet 4: 1M+ instructions/sec target in JS/TS

* **Verdict:** **AGREE (Achievable, but requires specific low-level patterns).**
* **Reasoning:** Modern V8 engines can exceed 10M iterations/sec if you observe the following constraints:
* Allocate memory as a contiguous `Uint8Array(1024 * 1024)` (1MB real mode space).
* Use direct opcode jump tables (`switch(opcode)` inside a hot loop, or an array of 256 monomorphic function pointers).
* **Implement Lazy Flag Evaluation:** Never calculate `AF`, `OF`, `CF`, `SF`, `ZF`, and `PF` on every arithmetic instruction. Store the operands and operation type (`last_op`, `dest`, `src`), and compute the flags dynamically only when a conditional jump (`JNZ`, `JC`), `PUSHF`, or debugger read requests them.



#### Bet 5: Complete step-by-step history/rewind (100k steps)

* **Verdict:** **DISAGREE with naive storage; AGREE only with delta-compressed ring buffers.**
* **Reasoning:** Snapshotting 1MB of RAM per step is impossible ($100\text{k} \times 1\text{MB} = 100\text{GB}$). Even recording naive delta objects (`{ address, oldVal, newVal }`) creates severe GC pressure. String instructions (`REP MOVSW`, `REP STOSW`) can modify up to 128KB in a single instruction.
* **Correct pattern:** A fixed circular ring buffer (e.g., 5,000 steps max). Each step stores:
* IP and modified register mask + values.
* Micro-buffer for memory writes (packed as `uint32`: 20-bit address + 8-bit previous value).
* Block operations exceeding 32 bytes should fall back to saving coarse differential slices.



---

### 4. Missing Features & Features to Cut

| Action | Feature | Technical & Pedagogical Rationale |
| --- | --- | --- |
| **CUT** | Serverless WebRTC Pair-Debugging (P19b) | Broken by campus NATs without TURN servers; complex CRDT state sync with zero direct educational return. |
| **CUT** | Multi-assembler dialects: GNU-as, FASM, MASM (P18) | Massive parser bloat. Academic institutions teaching 8086 consistently use standard Intel/NASM syntax. |
| **CUT** | Virtual I/O breadboards: traffic light, 7-segment (P14) | High maintenance UI that distracts from the core curriculum: understanding registers, addressing modes, and memory. |
| **CUT** | Pixel-perfect screenshot diff CI (P9) | Endless false failures caused by font antialiasing and subpixel scaling. Replace with text-matrix diffing. |
| **CUT** | 8087 FPU, Gamepad, Tauri desktop, VS Code extension | Unfocused scope creep for a solo developer. |
| **ADD** | **Deterministic Text-Buffer Diffing Engine** | Compare the raw 80×25 ASCII + attribute memory buffer (`B800:0000`) between engines rather than rendered pixels. |
| **ADD** | **Segment Arithmetic & Effective Address Calculator** | Visually decompose `Physical = (Segment << 4) + Offset` and addressing modes (e.g., `[BX + SI + 04h]`). Students routinely struggle with this concept. |
| **ADD** | **Calling Convention & Stack Frame Visualizer** | Explicitly label `[BP+4]` (return address), `[BP+6]` (parameters), and `[BP-2]` (local variables) dynamically during `CALL`/`RET` and `ENTER`/`LEAVE`. |
| **ADD** | **Missing '$' Terminator Linting on INT 21h AH=09h** | The most common beginner bug in 8086 programming is printing a string without a trailing `$` delimiter, dumping memory garbage to the console. |
| **ADD** | **Structured CSV/JSON Auto-Grader Export** | Allows instructors to run student-submitted notebooks through a headless CLI grader for automated lab assignments. |

---

### 5. Revised Phase Order

The original plan deferred the actual notebook UI to Phase 5 and the real educational layer to Phase 15. The revised schedule prioritizes an early, testable Minimum Lovable Product (MLP).

```
  Phase 0: Scaffold, TypedArray Memory & Pure TS Kernel Port
     │
     ▼
  Phase 1: Worker Protocol, Lazy Flags & Micro-Reactive Notebook UI Shell
     │
     ▼
  Phase 2: CodeMirror 6 Editor Cells + Stack/Register/Flag Visualizers (MLP Release)
     │
     ▼
  Phase 3: Circular Step Rewind & Calling Convention Visualizer
     │
     ▼
  Phase 4: B800h Text-Buffer Engine & AFD Terminal Display (Text-Matrix CI)
     │
     ▼
  Phase 5: DOS Verification Lane (Lazy-loaded WASM NASM + js-dos Test Runner)
     │
     ▼
  Phase 6: Educational Layer (Interactive Quizzes, Assertion Cells, Error Explainer)
     │
     ▼
  Phase 7: Headless Auto-Grader CLI & Export Formats (.asmnb, JSON, HTML)

```

* **Phases 0–2 (Weeks 1–6):** Focus exclusively on getting code to execute cleanly in an interactive UI. Ships an MLP immediately.
* **Phases 3–4 (Weeks 7–10):** Add runtime debugging (scrubber, stack/call-frame views) and terminal emulation (AFD view verified via buffer-state testing).
* **Phases 5–7 (Weeks 11–16):** Bring in real DOS validation, interactive curriculum components, and instructor auto-grading tools.

---

### 6. Top-10 Risk Register

| # | Risk Description | Category | Prob. | Impact | Mitigation Strategy |
| --- | --- | --- | --- | --- | --- |
| **1** | **Multi-cell state fragmentation:** Code split across cells fails to assemble due to missing offset calculations. | Architectural | High | Critical | Treat cells as contiguous source blocks; concatenate into a unified translation unit before parsing, preserving source-map line offsets. |
| **2** | **GPL-2.0 / CC-BY-SA license collision:** Packaging CC-BY-SA 4.0 fonts with a GPL-2.0 codebase breaches distribution terms. | Legal | High | High | Replace int10h fonts with Public Domain (CC0) or SIL Open Font License (OFL) CP437 bitmaps. |
| **3** | **Memory bloat from execution history:** Tracking state changes during tight loops exhausts browser memory. | Technical | High | High | Enforce a strict ring-buffer limit (e.g., 5,000 instructions) and stop recording deltas when running in unbound "Run" mode. |
| **4** | **Unstable visual-regression tests:** Headless browser font rendering differences trigger false-positive CI failures. | Maintenance | High | High | Ditch pixel comparison. Assert against the 4,000-byte B800h video matrix (character byte + attribute byte). |
| **5** | **WASM NASM runtime state pollution:** Re-invoking WASM NASM without reallocating causes memory corruption. | Technical | High | Medium | Isolate WASM NASM in an ephemeral Web Worker that recycles itself after a set number of compilation jobs. |
| **6** | **Infinite loops locking the interface:** Student assembly code containing endless `JMP $` hangs the browser tab. | Technical | Low | High | Run the interpreter strictly inside a dedicated Web Worker; use an execution-budget watchdog to yield periodically. |
| **7** | **Zero instructor adoption:** Platform requires universities to rewrite their existing DOSBox/TASM lab curricula. | Adoption | High | High | Build a "TASM/MASM compatibility shim" and provide direct 1-click export to standalone `.ASM` files that build on real TASM. |
| **8** | **Memory leaks from dead iframe runners:** Spawning throwaway iframes for js-dos runs leaks memory in Chromium. | Technical | Med | Med | Reuse a single persistent hidden worker iframe running a DOS execution harness, communicating via postMessage. |
| **9** | **Lack of student engagement with visualizations:** Learners passively click "Run" without processing debugger feedback. | Pedagogical | High | Medium | Integrate active prediction gates: pause execution before branch operations and prompt the user to predict the destination flag. |
| **10** | **Solo maintainer burnout via scope explosion:** Broad feature sets stall development before core tools stabilize. | Process | High | Critical | Enforce a strict feature freeze. Ban peer-to-peer WebRTC, FPU emulation, desktop targets, and peripheral emulators. |

---

### 7. MVP Definition and Milestone Gate

The Minimum Lovable Product (MLP) must be delivered by **Phase 2 (End of Week 6)**.

**The MLP Scope:**

* A clean, single-page web app running in modern desktop browsers.
* **Three interactive cells:** Markdown instructions, editable assembly code cell, and an interactive output panel.
* CodeMirror 6 editor with syntax highlighting, inline breakpoint toggles, and NASM syntax linting.
* Client-side TS 8086 interpreter running in a Web Worker executing basic ALU, branch, stack, and string operations.
* Inspectable state panel: Register matrix (`AX`, `BX`, `CX`, `DX`, `SI`, `DI`, `BP`, `SP`, `CS`, `DS`, `SS`, `ES`, `IP`), 9 flag indicators, and a navigable memory dump table.
* Basic interrupt support: `INT 21h` functions `01h`, `02h`, `09h`, and `4Ch`.
* Step-Into, Run, and Reset execution controls.
* URL export/import using gzip/pako hash fragments.

**The Hard Gate Test:**
Assemble and step through an iterative GCD (Greatest Common Divisor) program across two cells, manually inspect register changes at each branch point, and display the output character via `INT 21h, AH=02h` without a single console error or UI thread frame drop.

---

### 8. Concrete First-30-Days Execution Advice

* **Days 1–5 (Repo Consolidation & Headless Core):**
* Set up a clean Vite + TypeScript monorepo using `pnpm`.
* Port Repo A's JS interpreter into `@asmbook/kernel` as DOM-free, strict TypeScript.
* Replace naive flag updates with lazy-evaluation structs.
* Run the 375 existing unit tests inside Node (`vitest`); verify 100% pass rate before touching any UI code.


* **Days 6–12 (Worker Architecture & Kernel Protocol):**
* Wrap `@asmbook/kernel` in a dedicated Web Worker.
* Implement an asynchronous JSON message schema:
```typescript
type KernelMessage = 
  | { type: 'LOAD_PROGRAM'; code: string }
  | { type: 'STEP' }
  | { type: 'RUN'; maxSteps?: number }
  | { type: 'SET_BREAKPOINT'; offset: number }
  | { type: 'INSPECT_MEM'; start: number; length: number };

```


* Implement execution yielding: interrupt the interpreter every 5,000 cycles to allow worker message handling and prevent execution lockup.


* **Days 13–20 (Notebook Shell & CodeMirror Integration):**
* Initialize a reactive UI layer (Preact + Signals) for the notebook layout.
* Integrate CodeMirror 6 with an 8086 NASM grammar mode.
* Connect cell execution buttons to the Web Worker pipeline.
* Render register values in a simple table; verify that stepping updates register values reactively.


* **Days 21–30 (Memory Model & MLP Validation):**
* Build a virtualized memory table component capable of rendering arbitrary slices of the 1MB address space without DOM slowdowns.
* Implement basic `INT 21h` console output hooks routed to an interactive cell output console.
* Build the URL sharing serializer using `pako`.
* Ship the Phase 2 MLP to GitHub Pages.



---

### 9. Open Questions the Developer Must Answer Before Phase 0

1. **Multi-Cell Compilation Semantics:** How will notebook execution handle split memory definitions? If Cell 1 defines `my_var dw 1234h` in `.DATA` and Cell 2 accesses `mov ax, [my_var]`, how are symbol tables preserved across independent execution blocks without full re-assembly?
2. **Memory Space Isolation:** Does restarting a cell reset the entire 1MB RAM and clear registers, or does state mutate continuously like a standard Python Jupyter kernel? If state mutates continuously, how will you prevent students from suffering silent stack-overflow bugs during repeated executions?
3. **Authentication & Auto-grading Workflows:** If this platform is targeted at universities, how will instructors collect assignments without a backend? Is local grading via cryptographic assertion tokens (`HMAC-SHA256` hash of successful test run) acceptable, or must there be a GitHub Classroom export action?
4. **License Path for Distribution:** Are you prepared to relicense the entire front-end application under GPL-2.0 to accommodate js-dos, or should the DOS verification engine remain completely detached (e.g., loaded dynamically via an external sandbox endpoint) to allow permissive MIT/Apache licensing of your custom kernel?
5. **Pedagogical Goal (Real Real-Mode vs. Abstract 8086):** Are you teaching the authentic, quirky IBM-PC architecture (complete with PIC, PIT, IVT addresses, and segment wrap-around) or an abstracted 16-bit algorithmic model? Answering this will dictate whether low-level hardware emulation is an absolute requirement or simply counterproductive overhead.