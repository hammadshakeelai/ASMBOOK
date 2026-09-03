# ASMBOOK technical due-diligence review

**Research date: September 3, 2026**

## 1. Executive verdict

### Verdict: **BUILD WITH CHANGES**

The fundamental project is feasible. The current plan is not.

The single biggest problem is **scope architecture, not emulator feasibility**. The proposal currently combines at least four substantial products:

1. an accurate 8086 emulator/toolchain;
2. a Jupyter-like IDE/notebook;
3. a professional debugger plus AFD-Pro compatibility clone;
4. an educational platform/LMS/hardware laboratory.

Then it adds collaboration, multiple assembler dialects, grading, boot sectors, VGA, PIT, speaker, mouse, virtual electronics, AI tutoring, desktop packaging, VS Code integration, 8087, galleries, achievements, etc. 

For one developer, even AI-assisted, I would **not approve the 20-phase roadmap as written**.

I would approve this project on one condition:

> **ASMBOOK must prove that instructors and students want the notebook learning workflow before you build the emulator/hardware/theme empire around it.**

A compelling course-ready product could exist in roughly **8–14 focused full-time weeks**. The full roadmap as written is more like **18–30 months full-time**, with 2–3 years being a more credible total once curriculum, testing, cross-browser issues, documentation, pilots and maintenance are included. Part-time, it can easily become a four-year project.

The strongest product positioning is also narrower than the current “market gap” claim:

> **“A notebook-first 8086 learning environment with inspectable execution state, guided pedagogy, reversible execution, and independently verified NASM/real-DOS compatibility.”**

That is interesting and differentiated.

“8086 assembler/debugger running in the browser” is **already occupied territory**.

---

# 2. Corrections to factual claims

## 2.1 Yjs + WebRTC is not really “no backend required”

**Verdict: partially false.**

`y-webrtc` sends document updates peer-to-peer once peers are connected, but its normal discovery mechanism explicitly requires a **signaling server**. The project even ships a signaling server and defaults to public signaling infrastructure. ([GitHub][1])

You *could* build a manual WebRTC flow where two students exchange SDP offers/answers/ICE information by QR code or copy/paste, but that would be custom connection machinery rather than stock “drop in `y-webrtc` and have truly serverless collaboration.”

CodeMirror 6 integration is mature enough: `y-codemirror.next` provides CM6 synchronization, remote cursors/selections and shared undo. The current project recommends stable Yjs 13 integration for most users while Yjs 14 support remains on its newer branch. ([GitHub][2])

Bundle-size claims also need precision. Yjs 13.6.27's npm package is about **2.3 MB unpacked**, while y-webrtc is about **1.9 MB unpacked**. Those are *npm package sizes*, not the amount your users download after tree-shaking/minification/compression. Measure the production Vite chunk before putting a bundle-size number in DESIGN.md. ([npm][3])

**Recommendation:** cut collaborative editing from the first year. If it later proves valuable, either operate a tiny signaling service or deliberately implement manual session pairing.

---

## 2.2 A real WASM NASM build does now exist

**Verdict: confirmed, but update your prior-art reference.**

This has improved substantially in 2026.

`WorkbenchNP2` now contains:

* upstream NASM 2.16.03 source;
* an Emscripten `nasm.js` / `nasm.wasm`;
* reproducible build scripts;
* no upstream NASM source patches;
* verification against host NASM for byte-identical output;
* `.asm → WASM NASM → .COM` operation in a browser. ([GitHub][4])

NASM itself is under the **2-clause BSD license**, and the official documentation explicitly supports:

```text
nasm -f bin myfile.asm -o myfile.com
```

for DOS `.COM` binaries. ([NASM][5])

So there is no architectural reason your browser NASM should fail on `-f bin`; it is one of NASM's native use cases. ([NASM][6])

### What I would do

Do **not** merely copy an opaque WASM binary.

Reproduce the Emscripten build yourselves from a pinned upstream NASM release, preserve the exact source hash and build environment, and compare a corpus of outputs against official native NASM.

That becomes part of your supply-chain story.

---

## 2.3 v86 is viable as a CI oracle, but not in the way your plan suggests

**Verdict: yes for final-state differential testing; poor for interactive stepping.**

v86 explicitly lacks hardware-style single stepping via the trap flag/debug registers. ([GitHub][7])

But its public API gives you useful CI hooks including:

* `read_memory()`;
* `write_memory()`;
* `create_file()`;
* `read_file()`;
* screen-wait operations. ([GitHub][8])

What it does **not** give you as a clean documented public API is a simple:

```ts
emulator.getRegisters()
```

for AX/BX/CX/etc.

### Correct CI approach

Generate a tiny guest-side test harness.

Before exiting, have each test program serialize:

* AX/BX/CX/DX;
* SI/DI/BP/SP;
* CS/DS/ES/SS;
* FLAGS;
* selected memory ranges or hashes;

into either:

* a known guest memory structure; or
* a result file such as `RESULT.BIN`.

Then retrieve that from the host.

That removes almost all dependence on v86 internals.

### Does missing single-step break your plan?

For:

> execute program → compare final machine state

**No.**

For:

> compare custom interpreter and v86 at arbitrary matched instruction breakpoints

**Yes.**

Someone has already maintained a v86 fork specifically adding an `int3` single-step debugging mechanism, which shows both that it can be done and that it requires emulator modification. ([GitHub][9])

**Recommendation:** v86 = structured final-state oracle.
Do not make it your live debugging oracle.

---

## 2.4 Pixelmatch is good, but “byte-exact pixelmatch” is the wrong concept

Pixelmatch is deliberately a **perceptual image comparison** library. It supports thresholds and anti-alias detection; its default threshold is not strict binary equality. ([GitHub][10])

So:

> “byte-exact pixel-diff CI using pixelmatch”

should be rewritten.

Use:

1. **raw RGBA equality** or hashes for byte-exact assertions;
2. **pixelmatch** to produce useful visual failure images.

That gives you both correctness and debugging ergonomics.

---

## 2.5 The js-dos “iframe per run because it can't restart” claim is now outdated

Current js-dos documentation explicitly exposes:

```text
props.stop()
```

and says it disposes the player and frees its resources. To restart, dispose the current instance and instantiate another. ([JS-DOS][11])

So the hard statement:

> js-dos cannot reinitialize twice in one document

is no longer something I would build an architecture around.

An iframe can still be a **valuable containment boundary** because it gives you:

* hard kill;
* isolated DOM;
* fewer leak consequences;
* cleaner teardown;
* simpler crash recovery.

But it should be documented as an engineering isolation choice, not a js-dos API requirement.

---

## 2.6 js-dos persistence is primarily filesystem persistence, not general emulator rewind

The current API has very useful functionality:

* filesystem read/write/delete;
* filesystem tree inspection;
* screenshots;
* keyboard/mouse injection;
* pause/resume;
* persistence. ([JS-DOS][12])

However, normal js-dos save/load works by serializing **filesystem changes** and reapplying them to the original bundle. ([JS-DOS][13])

DOSBox-X exposed through js-dos can offer exact emulator-state saving through its UI, but that is not the same thing as a stable generic host API you should build ASMBOOK's rewind architecture upon. ([JS-DOS][13])

So:

**Custom interpreter rewind:** yes.
**Assume js-dos provides programmable arbitrary CPU/RAM snapshots:** no.

Also note that `fsWriteFile` is serialized and the docs warn that you will usually need to remount C: before DOS sees changes. ([JS-DOS][14])

That directly affects your “shared virtual filesystem” plan.

---

## 2.7 Mouse support: likely fine, but test INT 33h instead of assuming it

js-dos exposes mouse input from JavaScript, including relative/absolute motion and mouse buttons. ([JS-DOS][12])

That establishes host-input plumbing.

But your product requirement is specifically **DOS INT 33h behavior**, which belongs to the DOSBox/backend implementation rather than the JS API contract.

Build an automated INT 33h conformance fixture for exactly the functions you need. Don't turn “DOSBox has mouse support” into “every INT 33h behavior ASMBOOK needs has been verified.”

---

# 2.8 The GPL conclusion is too simplistic—and there are worse licensing problems

This part needs attention **before Phase 0**.

### js-dos

The current js-dos emulator repositories are GPL-2.0. ([GitHub][15])

But “js-dos is GPL, therefore absolutely everything in the repository must automatically be GPL-2” is oversimplified.

GPL distinguishes a combined work from **mere aggregation**; where that boundary lies depends in part on how components communicate and are combined. GNU's own GPLv2 FAQ explicitly makes that distinction. ([GNU][16])

Making ASMBOOK GPL-2 is a conservative and reasonable choice if the pieces are tightly integrated, but document the actual reasoning rather than saying “forced because js-dos exists.”

### NASM, CodeMirror, MIT/ISC/BSD dependencies

No serious issue. NASM's BSD-2 license is permissive. ([NASM][5])

### CC-BY-SA font

This one is **not** as clean as your plan says.

Creative Commons' official compatibility table lists **GPLv3** as a BY-SA 4.0 compatible license. It does **not** list GPLv2. ([Creative Commons][17])

That does not necessarily make it impossible to ship a separately licensed, unmodified font asset beside GPL code, but it absolutely invalidates the blanket statement:

> “everything is GPL-2-compatible.”

Keep the font legally separate under its own CC-BY-SA terms and get the precise packaging reviewed—or replace it with a bitmap whose provenance/license is simpler.

### Ralf Brown's Interrupt List

This claim is much better.

RBIL's Release 61 copyright notice explicitly grants use and redistribution—including format conversion—provided author/contributor names and release information are preserved. It even waives the credit requirement for excerpts under 2,000 lines. Contributed programs have their own rights. ([fd.lod.bz][18])

So RBIL can be used, but don't blindly relicense the entire corpus as GPL.

### JWasm / UASM

This is a larger problem than the plan recognizes.

JWasm is a MASM-compatible assembler, while UASM is derived from JWasm. UASM's repository explicitly states that its code is subject to the **Sybase Open Watcom Public License 1.0**. ([GitHub][19])

The Free Software Foundation classifies that license as **non-free** because its definition of “Deploy” can impose source-publication requirements on private use. ([GNU][20])

I would **remove JWasm/UASM from the committed roadmap until licensing has been separately cleared**.

### AFD-Pro — your biggest overlooked copyright issue

This is potentially worse than everything above.

A documented AFD-Pro 2.00 screen states:

> “Copyright AdTec GmbH 1990 / all rights reserved.”

([Virtual University of Pakistan][21])

Websites describing it as abandonware do not grant redistribution rights. ([Vetusware][22])

You therefore need to investigate rights to:

* redistribute `AFD.EXE`;
* redistribute AFD documentation;
* use captured reference screens;
* closely reproduce its visual assets.

**Do not publicly ship AFD.EXE simply because it is old.**

The same audit applies to every historical executable in the bundle.

This deserves a **release blocker**.

---

# 2.9 The market-gap claim needs narrowing

I did not find an exact living product that duplicates the whole concept:

> 8086 + notebook cells + stateful pedagogical execution + real-DOS parity + curriculum.

So that narrow statement remains defensible.

But the broader competitive premise is no longer true.

### XIDE

There is already an online x86 assembly IDE for students combining:

* NASM;
* AFD;
* DOSBox/WASM;
* browser editing;
* execution/debugging. ([github.com][23])

That is especially important because it attacks almost exactly the “students shouldn't install NASM/AFD/DOSBox” problem.

### 8086 Online IDE

Another live browser tool provides:

* 8086 editing;
* 1 MB memory;
* breakpoints;
* register/flag views;
* stack;
* execution highlighting;
* **step backward/rewind**;
* 51 examples. ([8086 Online IDE][24])

So rewind is not itself a market differentiator either.

### WorkbenchNP2

A 2026 browser retro-development environment already combines CodeMirror, real WASM NASM, `.COM` generation and in-browser execution/debugging. ([GitHub][4])

### x86-64-playground

It shows the broader architecture works: static client-side assembly, multiple assemblers and debugger UX entirely in the browser. ([GitHub][25])

### Your real moat

ASMBOOK's differentiation is:

**notebook semantics + transparent state + pedagogy + verification discipline.**

Protect that.

---

# 2.10 JWasm → WASM is technically plausible; licensing is the blocker

I found no maintained, ready-made JWasm WebAssembly distribution comparable to WorkbenchNP2's NASM build.

JWasm is portable C and already builds with GCC/Clang across Linux, Windows, DOS and OS/2. ([GitHub][26])

So an Emscripten port is probably technically manageable.

You would need to adapt:

* `main()`;
* stdin/stdout/stderr;
* exit handling;
* MEMFS/virtual paths;
* file includes;
* command-line arguments;
* generated output extraction;
* regression suite;
* browser worker isolation.

A rough engineering estimate:

* proof of concept: **2–5 days**;
* production-quality port: **2–4 weeks**.

But I would spend **zero days** doing it before resolving the licensing question.

---

# 2.11 DOSBox should not be described as the ultimate 8086 truth oracle

Use it as a **compatibility oracle**, not a silicon oracle.

For example, DOSBox-X explicitly states that it is **not cycle accurate**. ([DOSBox-X][27])

And x86 itself contains instructions where particular flags are architecturally undefined under certain conditions. Intel's documentation, for example, defines OF/AF as undefined for several shift scenarios. ([Intel][28])

Your differential system therefore needs result classes:

* `MUST_MATCH`
* `IMPLEMENTATION_DEFINED`
* `UNDEFINED_DONT_COMPARE`
* `NOT_SUPPORTED`

Otherwise you will eventually “fix” your emulator to imitate arbitrary behavior from an oracle in places where the architecture does not prescribe that behavior.

Also: **drop “cycle-accurate” implications** unless you intend to emulate bus/prefetch behavior. Educational nominal cycle tables are fine; call them nominal instruction timings.

---

# 3. Architecture review

## Bet 1 — Pure DOM-free TypeScript kernel

### Strongly agree.

This is one of the best decisions in the entire plan.

Make the kernel behave like a deterministic machine:

```text
Input:
  initial machine state
  program bytes / parsed IR
  execution request

Output:
  resulting state
  events
  memory writes
  faults
  traces
```

No DOM. No CodeMirror. No localStorage. No UI callbacks.

And put it in a **Web Worker from near the beginning**, not after performance problems appear.

A student will eventually write:

```asm
jmp $
```

Your kernel must not freeze the notebook UI.

---

# Bet 2 — Jupyter-like message protocol

### Agree, but drastically reduce it.

Do **not** implement Jupyter's entire kernel protocol just because the product looks like Jupyter.

Define something like:

```ts
type KernelRequest =
  | RunRequest
  | StepRequest
  | ResetRequest
  | ReadMemoryRequest
  | SetBreakpointRequest;

type KernelEvent =
  | StateChanged
  | OutputProduced
  | BreakpointHit
  | ProgramExited
  | FaultRaised;
```

Use the same protocol whether transport is:

* same-thread during unit testing;
* Worker `postMessage`;
* someday WebSocket;
* someday a true Jupyter kernel.

That gives you the useful architectural property without reproducing years of Jupyter machinery.

---

# Bet 3 — Transparent interpreter + DOS authenticity lane

### Strongly agree, with one wording change.

The custom interpreter should be the **teaching engine**.

DOSBox/js-dos should be the **compatibility engine**.

NASM should be the **assembly encoding authority** for supported NASM syntax.

None should be called the universal truth oracle.

That three-part separation is excellent:

```text
        ASMBOOK interpreter
             │
             │ semantic comparison
             ▼
      structured test corpus
       ↙               ↘
 NASM encoding       DOS/v86 behavior
```

And every discrepancy should become a permanent fixture.

That is substantially more credible than claiming “375 tests therefore accurate.”

---

# Bet 4 — Framework-free vanilla TypeScript UI

### I would reject this decision.

For Repo A, vanilla JS is completely reasonable.

For your proposed ASMBOOK UI, it becomes increasingly dangerous around roughly **P7–P10**.

You will have:

* arbitrary notebook cells;
* cell creation/deletion/reordering;
* markdown;
* editors;
* multiple output types;
* state timelines;
* register panels;
* memory panels;
* stack views;
* source synchronization;
* dirty-state propagation;
* breakpoints;
* expandable panels;
* different execution modes;
* async DOS state;
* focus management;
* keyboard shortcuts;
* undo domains;
* virtualized scrolling;
* accessibility state.

You will eventually create your own informal framework consisting of:

* event listeners;
* lifecycle conventions;
* DOM selectors;
* mutable stores;
* manual invalidation;
* cleanup code.

Except your homemade framework will have fewer tools and worse diagnostics.

### My recommendation

Use **Svelte** for the application shell.

Keep:

* emulator rendering;
* VGA rendering;
* animations;
* heavy timeline graphics;

in Canvas/WebGL or custom imperative renderers where appropriate.

Svelte does not require you to virtual-DOM-render every CPU instruction.

### “We'll swap vanilla for Svelte later” is not a good escape hatch

After notebook/editor/panel state has leaked into DOM code, that migration becomes a rewrite.

Make the decision before P5.

---

# The missing architectural problem: what does an assembly “notebook cell” actually mean?

This is possibly the biggest technical design question not answered by the roadmap.

Consider:

### Cell 1

```asm
mov ax, 10
```

### Cell 2

```asm
add ax, 5
```

Easy. State carries.

But now:

### Cell 1

```asm
my_data dw 1234
```

### Cell 2

```asm
mov ax, [my_data]
```

Who owns `my_data`?

Where was it assembled?

What if Cell 1 is edited?

What if Cell 2 was already executed?

What if:

```asm
jmp function_in_cell_7
```

What if `%include` is involved?

What if you run Cell 7 before Cell 2?

NASM is fundamentally assembling translation units, not maintaining a Jupyter-style incremental linker/symbol universe.

You need to decide this **before designing the notebook file format**.

### Recommended MLP solution

Separate the concepts:

**ASMBOOK pedagogical kernel**

* can execute fragments;
* maintains pedagogical register/memory state;
* manages a persistent educational symbol table where supported.

**Real-NASM lane**

* assembles a selected complete program/notebook projection;
* does not pretend that NASM itself is executing cells incrementally.

Expose that distinction to users.

Do not manufacture fake Jupyter semantics and later discover NASM cannot reproduce them.

---

# Performance: can TypeScript hit 1M instructions/sec?

### Yes, probably—under the right definition.

One million instructions/sec is not aggressive for a well-written modern-JS interpreter on desktop hardware **in fast-run mode**.

It is not a reasonable universal target if every instruction also produces:

* debugger events;
* strings;
* snapshots;
* rendered UI updates;
* heap objects.

Have two execution paths:

### Fast path

* no tracing;
* very sparse event callbacks;
* batched interrupt checks.

### Trace path

* memory deltas;
* register deltas;
* source positions;
* timeline events.

Important optimizations:

* `Uint8Array` / `Uint16Array` memory/state;
* monomorphic hot functions;
* no object allocation in the inner loop;
* avoid strings/Maps in opcode execution;
* decode once when possible;
* predecoded instruction/basic-block cache;
* invalidate cached decode on self-modifying memory;
* batch UI events;
* Worker execution;
* opcode dispatch via optimized switch/generated handlers.

### Performance CI

Do not gate:

> `>= 1,000,000 ips`

on arbitrary GitHub-hosted runners.

Shared CI machines fluctuate.

Instead:

* warm up JIT first;
* run multiple samples;
* compare medians;
* keep a benchmark corpus;
* flag relative regressions, e.g. >15%;
* use a pinned/self-hosted runner if an absolute number matters.

---

# Rewind/timeline design

A 100,000-instruction history is feasible.

The wrong implementation is:

```ts
history.push(structuredClone(cpuState))
```

100,000 times.

### Compact delta log

Per instruction store approximately:

```text
sequence number
old IP
changed-register bit mask
old values of changed registers
old FLAGS where necessary
memory-delta offset
memory-delta count
event flags
```

With typed-array/chunked storage, an ordinary instruction might average roughly **12–30 bytes of execution metadata**, so 100k instructions could be on the order of **1.2–3 MB**, before memory-write records/checkpoints.

The catch is instructions such as:

```asm
rep movsw
rep stosw
```

A single architectural instruction can alter tens of thousands of bytes.

You therefore need a defined granularity:

* instruction-level;
* REP-iteration level;
* or page-copy/COW semantics for huge mutations.

### Linear rewind

A ring buffer is excellent.

### What-if branching

A simple ring buffer stops being sufficient.

Use a persistent history structure:

```text
checkpoint A
  │
chunk 1
  │
chunk 2
  ├──── branch B → chunks B1, B2
  │
  └──── branch C → chunks C1, C2
```

Branches share immutable prefix chunks.

Combine that with:

* periodic checkpoints;
* copy-on-write memory pages;
* compact deltas between checkpoints.

But **what-if branching belongs very late**. Rewind is useful. Timeline branching is research-toy territory until users demand it.

---

# Pixel-perfect AFD: technically achievable, strategically questionable

Your screenshot CI can fail because of:

* different font bitmap;
* browser font anti-aliasing;
* GPU driver;
* CSS interpolation;
* devicePixelRatio;
* Canvas vs WebGL;
* browser version;
* color management/gamma;
* cursor blink phase;
* text blink;
* screenshot timing;
* aspect-ratio correction;
* scaling from DOS 720×400 to 4:3;
* focus outlines;
* scrollbars;
* caret position;
* alpha premultiplication.

### Stable harness

Do not render the AFD clone with browser text.

Use:

```text
fixed bitmap font
        ↓
integer glyph blitter
        ↓
fixed VGA palette
        ↓
ImageData / Canvas at exact native dimensions
```

Then:

1. fix DPR to 1;
2. disable animation/blinking or set phase explicitly;
3. pin Chromium;
4. use fixed dimensions;
5. capture internal `ImageData`, not a desktop screenshot;
6. wait for an explicit `"frame-ready"` event;
7. raw-RGBA compare;
8. pixelmatch only for the diff artifact.

Even better:

### Primary golden representation

Store the semantic screen:

```text
80 × 25:
  character byte
  attribute byte
```

### Secondary golden

Store rendered pixels.

Then when a test fails you know whether:

* AFD contents are wrong;
* or rendering is wrong.

---

# Differential-testing CI architecture

I would build four layers.

### Tier 1 — every commit, seconds

Node:

* all 375 existing tests;
* parser tests;
* instruction properties;
* arithmetic edge cases;
* encoder fixtures;
* `assemble → disassemble → assemble`;
* custom interpreter generated tests.

### Tier 2 — every PR

WASM/native NASM:

```text
generated source
    ↓
NASM
    ↓
expected bytes
    ↔
ASMBOOK encoder
```

No browser emulator needed.

### Tier 3 — nightly/full oracle tests

Generate small `.COM` tests that write a structured final-state packet:

```text
magic
AX BX CX DX
SI DI BP SP
FLAGS
selected memory hash
```

Then run them in FreeDOS/v86 or another stable DOS oracle.

Retrieve `RESULT.BIN`.

No screenshot parsing.
No AFD automation.
No OCR.

### Tier 4 — product integration smoke

Playwright:

```text
ASMBOOK UI
→ js-dos
→ write ASM file
→ real NASM
→ run COM
→ retrieve output
```

Only a smaller set should need the actual product stack.

### Which oracle?

**v86:** better for structured automated semantics testing.

**js-dos:** better for testing what your actual users will run.

Use both for different purposes.

The fragile part is not assembly. It is **obtaining deterministic machine-state observations from a black-box DOS execution environment**.

Solve that with guest instrumentation rather than keyboard scripting.

---

# Shared filesystem between lanes

### Achievable, but don't actually share one live filesystem.

Make ASMBOOK own a canonical workspace:

```ts
interface ProjectFS {
  read(path): Uint8Array
  write(path, data): void
  list(path): Entry[]
}
```

Back it with IndexedDB/OPFS.

Both lanes consume snapshots.

### Custom interpreter

Reads directly.

### DOS lane

Before run:

```text
ProjectFS
    ↓
copy changed files
    ↓
js-dos fsWriteFile()
    ↓
remount/synchronize
    ↓
NASM/DOS
```

Do **one-way synchronization first**.

The difficult details include:

* DOS 8.3 filenames;
* case-insensitivity;
* `/` vs `\`;
* encoding/code pages;
* include search paths;
* timestamps;
* text newline normalization;
* binary files;
* concurrent writes;
* DOS-generated output;
* serialized js-dos filesystem operations;
* remount requirements. ([JS-DOS][14])

“Shared virtual filesystem” should be renamed to **mirrored project workspace**.

---

# Persistence: don't make localStorage your notebook database

Your locked plan currently says localStorage autosave. 

I would change that immediately.

Use:

* **IndexedDB or OPFS:** notebooks/projects;
* **localStorage:** tiny settings, last-opened ID, UI preferences.

Reasons include capacity, synchronous behavior and lack of robust structured transactional storage.

You also need from day one:

```json
{
  "formatVersion": 1,
  "kernelVersion": "...",
  "assembler": {
    "name": "nasm",
    "version": "..."
  }
}
```

Otherwise a notebook created today may silently behave differently after an interpreter update next year.

---

# Share URLs

`pako`-compressed URL sharing is nice for tiny demos.

It is not reliable as the universal sharing/storage mechanism for:

* multi-cell curricula;
* screenshots;
* projects;
* binary files;
* long lessons.

Keep it as:

> **“Quick share for small notebooks.”**

Use `.asmnb` download/import as the durable universal interchange.

Prefer URL fragments rather than query parameters for embedded source where practical, so shared code is less likely to be sent in HTTP request URLs/referrers.

---

# Security issue missing from the plan

A static application is not automatically security-free.

Your notebooks may contain:

* markdown;
* teacher-authored content;
* imported files;
* error messages;
* generated outputs.

Use:

* DOMPurify;
* strict CSP;
* preferably Trusted Types;
* no arbitrary notebook HTML/JS;
* no `eval()` for educational outputs.

A malicious `.asmnb` must not become arbitrary JavaScript execution.

---

# A static app cannot have genuinely hidden client-side tests

This is a major contradiction in P17.

If ASMBOOK has:

* no backend;
* all application code shipped to the student;
* hidden test data shipped in the browser;

then the student can inspect the tests.

Obfuscation doesn't change that.

You have three choices:

1. call them **private UI tests**, accepting that determined students can inspect them;
2. use a teacher-side CLI grader;
3. introduce a grading server/LMS integration.

For a first version I strongly recommend **teacher-side CLI grading**.

---

# 4. Missing features and features to cut

## Missing or under-specified features

These matter more than most of P13–P19.

### 1. Deterministic `Reset` / `Restart kernel`

Students need to know how to get back to a clean CPU.

### 2. “Run all from top”

Essential for reproducibility.

### 3. Dirty/out-of-order cell state

If a student executes cells:

```text
1 → 2 → 3
```

then edits cell 1, outputs from 2/3 are stale.

Show that visibly.

### 4. Execution counters

Jupyter got this right:

```text
In [4]
```

It tells users *when* state was created.

### 5. State provenance

At minimum:

> “This output was generated with kernel state revision 82.”

### 6. Notebook schema migrations

Mandatory.

### 7. Kernel/assembler version pinning

Mandatory for assignments.

### 8. Corrupt-autosave recovery

Keep previous autosave snapshots.

### 9. Execution budgets

Student code needs:

* instruction limit;
* wall-time budget;
* Stop button;
* hard Worker restart.

### 10. Keyboard accessibility

WCAG requires functionality to remain keyboard-operable. A UI combining CodeMirror, panels and retro debugger controls needs this designed up-front, not patched in at P19. ([W3C][29])

### 11. Modern accessible UI alongside AFD skin

AFD should be a **theme/mode**, not the only UI.

### 12. Assignment format

An assignment should include:

```text
instructions
starter notebook
allowed instruction subset
visible expectations
grader configuration
version requirements
```

### 13. Reproducible student submission

A teacher needs a single file/zip that contains everything necessary to re-run the submission.

### 14. Browser/device support statement

Say explicitly, for example:

> Chrome/Edge/Firefox current desktop; Safari best effort; mobile editing unsupported initially.

Trying to make the full debugger pleasant on phones will consume time with almost no educational payoff.

---

## Features I would remove from the first year

* pixel-perfect AFD as an initial release gate;
* full AFD command console;
* run-vs-run diff;
* memory heatmaps;
* decorative shift animations;
* CGA/VGA graphics modes beyond what courses require;
* PC speaker;
* PIT/INT 08;
* mouse;
* custom ISR laboratory;
* traffic-light/LED/7-segment virtual electronics;
* EXE loader laboratory;
* boot-sector booting;
* FASM;
* GNU as;
* JWasm/MASM compatibility;
* Yjs collaboration;
* community gallery;
* achievements;
* GIF/WebM export;
* BYO-AI tutor;
* 8087;
* joystick/gamepad;
* Tauri;
* VS Code extension.

None of those is a bad idea.

The problem is **opportunity cost**.

---

# Pedagogy: animations aren't automatically educational

The strongest research I found points more convincingly toward:

* worked examples;
* guided self-explanation;
* prediction;
* fading scaffolds;
* feedback;

than toward adding more animated visualizations.

A 2025 ACM Transactions on Computing Education study with 75 novice university programming students found worked examples reduced extraneous cognitive load, and guided self-explanation improved transfer. ([ERIC][30])

That supports features like:

```text
What will AX contain after line 6?
[ answer ]

Run
```

and:

```asm
; Why is ZF set here?
; ____________________
```

much more directly than a beautiful bit-rotation animation.

So P15 is strategically more important than P10.

Move pedagogy **earlier**.

---

# 5. Scope, estimates and revised phase order

## Approximate effort for the original roadmap

These are solo full-time engineering estimates, assuming the existing repositories are genuinely usable starting points.

| Phase                           | Estimated effort | Risk                      |
| ------------------------------- | ---------------: | ------------------------- |
| P0 Scaffold/CI/design           |           1 week | Low                       |
| P1 Kernel TS port               |        2–4 weeks | Medium                    |
| P2 Protocol + rewind            |        3–5 weeks | High                      |
| P3 Encoder/NASM/disassembler    |        3–6 weeks | High                      |
| P4 interrupts/cycles/video text |        4–8 weeks | **Very high**             |
| P5 Notebook UI                  |        3–5 weeks | High                      |
| P6 persistence/share            |        1–2 weeks | Medium                    |
| P7 rich outputs                 |        3–5 weeks | Medium                    |
| P8 debugger                     |        5–8 weeks | **Very high**             |
| P9 AFD fidelity                 |        3–6 weeks | High                      |
| P10 visualizations              |        4–8 weeks | High                      |
| P11 DOS lane                    |        3–6 weeks | High                      |
| P12 verification machine        |       6–10 weeks | **Very high**             |
| P13 hardware depth              |     12–20+ weeks | **Extreme**               |
| P14 virtual I/O                 |        3–5 weeks | Medium                    |
| P15 learning engine             |        5–8 weeks | High                      |
| P16 curriculum                  |       8–12 weeks | **Very high**             |
| P17 grading/EXE/boot            |       8–16 weeks | **Extreme**               |
| P18 multi-assembler             |      8–16+ weeks | **Extreme/legal blocker** |
| P19a reach                      |       8–16 weeks | Very high                 |
| P19b frontier                   |     6–12+ months | Unbounded                 |

AI can compress:

* boilerplate;
* CSS;
* test generation;
* documentation drafts;
* ordinary refactors.

It does **not** magically compress:

* ambiguous emulator semantics;
* legal clearance;
* pedagogy validation;
* cross-browser failures;
* curriculum design;
* architecture mistakes.

### Phases most likely to be 3× underestimated

P4, P8, P12, P13, P16, P17 and P18.

---

# My revised roadmap

## R0 — Foundation

**1–2 weeks**

* repo restructure;
* TS kernel;
* 375 tests preserved;
* Worker boundary;
* execution budget;
* notebook schema v1;
* dependency/license inventory;
* ADRs;
* CI;
* benchmarking baseline.

**Exit criterion:** Repo A behavior preserved without UI coupling.

---

## R1 — Complete notebook learning loop

**3–5 weeks**

Build:

* Svelte/structured UI shell;
* CodeMirror 6;
* code cells;
* explanatory/markdown cells;
* run;
* step;
* reset;
* run all;
* registers;
* flags;
* memory;
* stack;
* B800 text;
* line breakpoint;
* state carry;
* execution number;
* stale-output indicator;
* IndexedDB persistence;
* import/export.

**Exit criterion:** a student can complete a normal introductory 8086 exercise without DOSBox.

---

## R2 — Make it educational

**3–5 weeks**

Implement:

* `; @expect AX=0005`;
* output/memory expectations;
* predict-before-run;
* worked examples;
* hints;
* friendly diagnostics;
* 8–12 lessons;
* accessibility baseline;
* assignment package format.

### First major gate

At about **week 8–12**, put this in front of:

* 1–2 real assembly instructors;
* 10–20 real students.

Do not continue blindly if they do not prefer it to their current workflow.

---

## R3 — Accuracy infrastructure

**3–5 weeks**

* reproducible WASM NASM;
* byte-differential encoder tests;
* instruction coverage matrix;
* undefined-flag policy;
* golden bug corpus;
* public accuracy ledger.

---

## R4 — Authentic DOS lane

**3–5 weeks**

* lazy js-dos;
* write project snapshot;
* assemble with real NASM;
* run `.COM`;
* capture output;
* simple “Verify in DOS” UI.

Do **not** yet build synchronized breakpoints across engines.

---

## R5 — Advanced debugger

**4–7 weeks**

* compact rewind;
* watch expressions;
* conditional breakpoints;
* source mapping;
* stack visualization;
* selected rich output.

Only add visualizations that improve an observed learning problem.

---

## R6 — Verification hardening

**4–8 weeks**

* v86/FreeDOS structured test oracle;
* random/property test generation;
* large golden corpus;
* nightly emulator CI;
* js-dos product-path smoke tests;
* stable performance suite.

---

## R7 — Course productization

**6–10 weeks**

* CLI grader;
* assignment tooling;
* course packs;
* printable/exportable results;
* documentation;
* migrations;
* recovery;
* instructor feedback loop.

### Second gate

Require:

* at least **2 external instructors**;
* ideally **30–50+ students**;
* no recurring correctness blockers;
* most introductory assignments supported without workarounds.

Only then unlock the exotic roadmap.

---

## R8 — Optional independent tracks

Choose based on demand:

* AFD visual fidelity;
* hardware devices;
* graphical modes;
* collaboration;
* dialects;
* desktop;
* VS Code;
* AI;
* 8087.

Don't promise all of them.

---

# 6. Top-10 risk register

| #  | Risk                                          | Likelihood  | Impact   | Mitigation                                                                   |
| -- | --------------------------------------------- | ----------- | -------- | ---------------------------------------------------------------------------- |
| 1  | Scope destroys project                        | Very high   | Critical | Hard cutline; no frontier work before pilots                                 |
| 2  | Emulator gives confidently wrong answers      | High        | Critical | Public coverage ledger, generated/differential tests, undefined-state policy |
| 3  | Notebook semantics become incoherent          | High        | Critical | Define cell/symbol/re-execution semantics before UI                          |
| 4  | Vanilla DOM becomes unmaintainable            | High        | High     | Adopt Svelte now or formal component/store architecture                      |
| 5  | AFD/tool licensing blocks public release      | Medium-high | Critical | Full provenance audit before bundling any historic binary                    |
| 6  | Oracle CI becomes flaky                       | Medium-high | High     | Structured guest result packets; no screenshot/keystroke semantics testing   |
| 7  | Timeline consumes memory/performance          | Medium      | High     | Typed deltas, checkpoints, COW pages, capped history                         |
| 8  | Nobody adopts it despite technical excellence | High        | Critical | Instructor/student pilot in first 12 weeks                                   |
| 9  | Solo + AI codebase becomes incoherent         | High        | High     | ADRs, small PRs, tests, invariants, dependency boundaries                    |
| 10 | Curriculum becomes bigger than software       | High        | High     | Small validated course, reuse instructors' actual labs                       |

I would add an unofficial #11:

**Maintenance burden.**

Students will submit bizarre programs that your generated instruction tests never anticipated.

Emulators collect edge cases forever.

---

# 7. Minimum Lovable Product

The MLP should contain exactly enough for an instructor to say:

> “Next semester, my students can use this instead of installing DOSBox/NASM/debugger tools.”

### Include

* NASM-oriented 8086 course subset;
* notebook code + explanatory cells;
* run/step/reset/run-all;
* state carry;
* execution counters;
* stale-state detection;
* registers;
* flags;
* memory;
* stack;
* B800 text;
* breakpoints;
* rewind;
* friendly errors;
* `@expect`;
* prediction questions;
* 8–12 strong guided lessons;
* IndexedDB autosave;
* `.asmnb` import/export;
* schema/version metadata;
* one-click NASM verification;
* one-click real-DOS whole-program run;
* public accuracy ledger;
* simple assignment package;
* CLI grader.

### Exclude

Pretty much everything from P13 onward.

### Milestone I would hold the project to

Before expanding:

> **One real instructor must be able to teach a 2–4 week 8086 unit entirely through ASMBOOK, with at least ~80–90% of their normal introductory exercises supported and no correctness bug requiring a workaround.**

And students must actually find it clearer than their existing environment.

That is a meaningful success criterion.

“63 features implemented” is not.

---

# 8. Concrete first 30 days

## Days 1–7 — destroy ambiguity

1. Freeze P13–P19.
2. Write a one-page `PRODUCT.md`:

   * target student;
   * target course;
   * exact dialect;
   * exact MLP;
   * explicit non-goals.
3. Decide notebook execution semantics.
4. Decide Svelte vs vanilla. I recommend Svelte.
5. Create dependency/licensing matrix.
6. Quarantine AFD.EXE until redistribution rights are understood.
7. Define notebook schema v1.
8. Define supported CPU semantics.

Also create:

```text
docs/
  PRODUCT.md
  ARCHITECTURE.md
  NOTEBOOK-SEMANTICS.md
  ACCURACY-POLICY.md
  LICENSE-INVENTORY.md
  ADR/
```

---

## Days 8–14 — extract the kernel properly

Port the existing interpreter into:

```text
packages/kernel
```

Keep all 375 existing tests green. The existing interpreter/test base is one of the strongest reasons this project is worth attempting in the first place. 

Add:

* Worker transport;
* execution limits;
* deterministic reset;
* state serialization;
* benchmark suite;
* program-level golden fixtures.

No fancy UI.

---

## Days 15–21 — establish real NASM authority

Reproduce the direct Emscripten NASM build approach demonstrated by WorkbenchNP2. ([GitHub][4])

For 50–100 source fixtures:

```text
official host NASM
         ↕
WASM NASM
         ↕
ASMBOOK encoder
```

Assert byte equality where appropriate.

Start `accuracy-ledger.json` immediately.

---

## Days 22–30 — build one complete vertical lesson

Create:

```text
Cell 1: explanation
Cell 2: student code
Cell 3: predict AX
Cell 4: execute
Cell 5: inspect registers/flags
Cell 6: @expect
Cell 7: explanation of result
```

Support:

* save;
* reload;
* export;
* reset;
* step;
* register changes;
* stack/memory;
* errors.

Then give **that one lesson** to actual beginners.

Do not spend day 30 implementing an 8253 PIT.

If the teaching experience isn't already compelling, fix the learning loop.

---

# AI-assisted development guardrails I would mandate

AI assistance can help this project enormously, but an emulator is exactly the kind of codebase where plausible-looking AI output can be dangerous.

Use these rules:

### Every semantics change requires a test first

For example:

```text
Bug: SAR sets OF incorrectly
→ reproduce
→ add permanent test
→ fix
```

Never merely fix it.

### Every instruction implementation needs evidence

Reference:

* Intel/manual semantics;
* encoding oracle;
* differential fixture.

Not:

> “Claude/GPT says this is how AAA works.”

### Never accept giant AI refactors

Prefer:

```text
1 concern
1 PR
1 reviewable diff
```

A 6,000-line agent rewrite of the execution engine destroys your ability to locate regressions.

### Require architecture decision records

Especially for:

* cell semantics;
* event protocol;
* tracing;
* memory model;
* VFS;
* assembler integration;
* license decisions.

### Reproducible vendoring

Every external tool needs:

```text
name
version
upstream URL
commit/hash
license
build command
build environment
artifact SHA256
```

### CI tiers

**PR:** fast deterministic tests.

**Nightly:** differential/oracle/fuzz.

**Release:** full golden + integration + accessibility + license inventory.

### Fuzzing rule

Every random test must output a seed.

When seed `1837821` finds a bug:

> seed becomes permanent regression fixture.

### AI is not a code reviewer of its own work

For CPU semantics, require an independent oracle/test, not “agent implemented, then agent reviewed.”

---

# 9. Questions that must be answered before Phase 0

These are not nice-to-have planning questions. Several determine your fundamental architecture.

### 1. Which assembly language are you actually teaching?

NASM syntax?

MASM/TASM syntax used by many university courses?

Both?

This determines adoption far more than another visualization.

### 2. What precisely does “8086” mean?

Original 8086 only?

8088-equivalent instructions?

80186 additions?

286 real-mode instructions?

DOSBox default CPU?

Write the boundary.

### 3. What happens when one code cell references a label defined in another?

This has to be specified before notebook implementation.

### 4. What happens when a previously executed cell is edited?

Do later cells become stale?

Does state rewind automatically?

Does the notebook reassemble?

### 5. Is real NASM verification per-cell or per-program?

I strongly recommend whole-program verification initially.

### 6. What is the first course's required instruction matrix?

Get an actual syllabus and 20–50 existing labs.

Build against those, not an imagined curriculum.

### 7. Is real DOS parity user-facing or primarily an engineering verification tool?

It may not deserve permanent visual prominence.

### 8. Is AFD pixel fidelity actually valuable to students?

Or is it valuable because you personally appreciate AFD?

Those are different requirements.

### 9. Is “no backend” absolute?

If yes, accept these consequences:

* no truly secret hidden tests;
* no normal account-based teacher dashboard;
* no conventional collaboration discovery;
* no server-held progress;
* no protected API key.

### 10. How will teachers collect work?

* `.asmnb` file?
* ZIP?
* GitHub?
* LMS?
* command-line grader?
* screenshots?

Solve the boring workflow first.

### 11. Are you willing to remove AFD.EXE if redistribution rights aren't obtained?

The answer needs to be yes.

### 12. Are JWasm/MASM syntax requirements actually demanded by target courses?

If not, remove P18.

### 13. What's your browser baseline?

Choose it.

### 14. What accuracy means “course-ready”?

For example:

> All instruction forms and DOS/BIOS calls used in target syllabus independently verified and zero known correctness-blocking bugs.

### 15. What would make you stop the project?

Define a kill criterion.

For example:

> If after a 12-week vertical slice, two instructors do not consider the notebook workflow materially better than existing tools, stop expanding scope and reassess.

That protects you from spending two years polishing a product nobody adopts.

---

# Final assessment

There **is a project worth building here**.

The existing tested JS interpreter plus your already-working real NASM/DOSBox pipeline gives ASMBOOK an unusually strong starting position. The proposed product also has a credible niche because notebook-style execution, pedagogy and explicit verification are not well covered by the existing browser assembly tools. 

But I would make five decisions immediately:

**First:** replace the 20-phase roadmap with adoption gates.

**Second:** build the notebook/pedagogy experience *before* PITs, VGA, mouse, multi-assembler support or collaboration.

**Third:** resolve notebook cell semantics before implementing cells.

**Fourth:** reconsider vanilla DOM now rather than “escaping” to Svelte after it becomes expensive.

**Fifth:** perform a real licensing audit—especially **AFD.EXE, the CC-BY-SA font and JWasm/UASM**—before public distribution.

If those changes are made, ASMBOOK goes from an impressive but highly likely multi-year scope trap to a project I would consider technically credible and genuinely worth pursuing.

[1]: https://github.com/yjs/y-webrtc "https://github.com/yjs/y-webrtc"
[2]: https://github.com/yjs/y-codemirror.next "https://github.com/yjs/y-codemirror.next"
[3]: https://www.npmjs.com/package/yjs/v/13.6.27?activeTab=readme "https://www.npmjs.com/package/yjs/v/13.6.27?activeTab=readme"
[4]: https://github.com/uraraworks/WorkbenchNP2 "https://github.com/uraraworks/WorkbenchNP2"
[5]: https://www.nasm.us/ "https://www.nasm.us/"
[6]: https://www.nasm.us/doc/nasm10.html "https://www.nasm.us/doc/nasm10.html"
[7]: https://github.com/copy/v86 "https://github.com/copy/v86"
[8]: https://github.com/copy/v86/blob/master/v86.d.ts "https://github.com/copy/v86/blob/master/v86.d.ts"
[9]: https://github.com/kyr0/v86 "https://github.com/kyr0/v86"
[10]: https://github.com/mapbox/pixelmatch "https://github.com/mapbox/pixelmatch"
[11]: https://js-dos.com/player-api.html "https://js-dos.com/player-api.html"
[12]: https://js-dos.com/command-interface.html "https://js-dos.com/command-interface.html"
[13]: https://js-dos.com/save-load-game-progress.html "https://js-dos.com/save-load-game-progress.html"
[14]: https://js-dos.com/working-with-fs.html "https://js-dos.com/working-with-fs.html"
[15]: https://github.com/js-dos "https://github.com/js-dos"
[16]: https://www.gnu.org/licenses/old-licenses/gpl-2.0-faq.html "https://www.gnu.org/licenses/old-licenses/gpl-2.0-faq.html"
[17]: https://creativecommons.org/compatible-licenses/ "https://creativecommons.org/compatible-licenses/"
[18]: https://fd.lod.bz/rbil/copyright.html "https://fd.lod.bz/rbil/copyright.html"
[19]: https://github.com/Terraspace/UASM "https://github.com/Terraspace/UASM"
[20]: https://www.gnu.org/licenses/license-list.html "https://www.gnu.org/licenses/license-list.html"
[21]: https://vulms.vu.edu.pk/Courses/CS401/Downloads/AFD_Tutorial.pdf "https://vulms.vu.edu.pk/Courses/CS401/Downloads/AFD_Tutorial.pdf"
[22]: https://vetusware.com/download/AFD_%20Advanced%20Fullscreen%20Debug%201.00/?id=5675 "https://vetusware.com/download/AFD_%20Advanced%20Fullscreen%20Debug%201.00/?id=5675"
[23]: https://github.com/ASD0x41/xide?utm_source=chatgpt.com "GitHub - ASD0x41/xide: An online x86 assembly IDE, containing the Netwide Assembler (NASM), the Advanced Fullscreen Debugger (AFD) and em-dosbox (a WASM port of the DOSBox Emulator) · GitHub"
[24]: https://vgath-8086.github.io/ "https://vgath-8086.github.io/"
[25]: https://github.com/robalb/x86-64-playground "https://github.com/robalb/x86-64-playground"
[26]: https://github.com/Baron-von-Riedesel/JWasm/blob/master/README.md "https://github.com/Baron-von-Riedesel/JWasm/blob/master/README.md"
[27]: https://dosbox-x.com/wiki/Guide%3ACPU-settings-in-DOSBox%E2%80%90X "https://dosbox-x.com/wiki/Guide%3ACPU-settings-in-DOSBox%E2%80%90X"
[28]: https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-vol-2b-manual.pdf "https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-vol-2b-manual.pdf"
[29]: https://www.w3.org/TR/wcag/ "https://www.w3.org/TR/wcag/"
[30]: https://eric.ed.gov/?id=EJ1476162&q=source%3A%22ACM+Transactions+on+Computing+Education%22 "https://eric.ed.gov/?id=EJ1476162&q=source%3A%22ACM+Transactions+on+Computing+Education%22"
