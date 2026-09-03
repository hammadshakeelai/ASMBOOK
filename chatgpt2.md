The new constraints change one of my earlier recommendations: **I would now choose Preact + Signals rather than Svelte**. The canvas-heavy boundaries, AI-assisted maintenance, and multi-year stability goals make that the best fit.

## Decision summary

| Question                  | Final call                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Q1 UI**                 | **Preact + Signals**                                                                                                       |
| **Q2 AFD strategy**       | **Option (c): ASMBOOK's own debugger; DOS lane runs/verifies programs.** Optionally add MIT-licensed FreeDOS DEBUG later   |
| **Q3 Cells**              | **Whole notebook = one program/translation unit. Cells are source + pedagogy views, not independent Jupyter runtimes**     |
| **Q4 Oracle**             | **Native DOSBox-X as primary nightly oracle**, v86 as independent secondary, js-dos for browser integration                |
| **Q5 Validation**         | 2 instructors + ~12–20 students + their real labs; hard quantitative adoption gate                                         |
| **Q6 Biggest blind spot** | **Assembly-dialect/course mismatch**, followed by assessment security, offline deployment, accessibility, and LMS workflow |

---

# Q1 — UI framework final call

## VERDICT

### **Choose Preact + Signals.**

Not Svelte 5.
Not Svelte 4.
Not SolidJS.
Not vanilla + a homemade architecture.

This is one place where I would revise my previous Svelte recommendation now that the requirements are clearer.

Preact describes itself as a roughly **3 kB** React-compatible alternative with the same modern component API, and its compatibility layer gives access to much of the React ecosystem when genuinely needed. Its Signals integration also has an unusually useful property for ASMBOOK: signals placed directly in rendered output can update the DOM without re-rendering the whole component tree. ([preactjs.com][1])

Preact itself remains heavily used and maintained; current npm data shows tens of millions of weekly downloads. ([npm][2])

---

## REASONING

### 1. It gives you exactly as much framework as ASMBOOK needs

Your application naturally separates into two worlds:

```text
Preact UI shell
│
├── Notebook structure
├── Cells
├── Toolbar
├── dialogs
├── output panels
├── breakpoint lists
├── lesson UI
└── settings
         │
         ├──────── imperative boundary ────────┐
         ▼                                     ▼
   Canvas AFD                          Canvas timeline
                                         
                                         
Pure TypeScript kernel ← Worker protocol
```

The difficult rendering areas are already excluded from the component framework:

* AFD display;
* memory renderer;
* timeline;
* future VGA renderer;
* animations.

That removes one of Svelte's biggest potential advantages: declaratively managing all those interfaces.

For the remaining application shell, JSX components + Signals are enough.

---

### 2. AI assistance actually shifts the decision toward Preact

This condition matters.

With a human-only solo developer, Svelte's concise syntax would be attractive.

With AI-generated code, I care more about:

* whether generated patterns are consistent;
* whether training/examples overwhelmingly exist;
* whether incorrect syntax is easy to recognize;
* whether one agent knows the conventions another agent used;
* whether large generated refactors resemble mainstream code.

React-style JSX has an enormous corpus of examples, documentation and developer familiarity. Preact intentionally stays close to that programming model.

Svelte has excellent ergonomics, but AI-generated Svelte is more prone to mixing generations of syntax:

```text
Svelte 3/4:
$: x = ...

Svelte 5:
let x = $state(...)
let y = $derived(...)
$effect(...)
```

Svelte's own current documentation advises using **runes mode for new code rather than legacy features**. ([Svelte][3])

That is manageable for a human team with strong conventions, but it creates another class of mistakes for autonomous coding agents.

With Preact you can put a simple line in `AGENTS.md`:

> Components use Preact functional JSX. UI-reactive values use `@preact/signals`. Kernel/domain state never uses Preact state.

That is extremely difficult for an agent to misunderstand.

---

### 3. Svelte 5 is mature enough — but Svelte 4 is no longer the safer choice

I would **not** avoid Svelte 5 because it is immature.

Svelte 5 is already well into its stable lifecycle; the current Svelte 5 release line remains actively maintained, with Svelte 5.57 available in 2026. ([npm][4])

So if your choice were only:

> Svelte 4 or Svelte 5?

the answer would be:

### Svelte 5.

Pinning Svelte 4 in a new multi-year project in September 2026 would intentionally begin on the legacy programming model. That creates **more** migration risk, not less.

But I still prefer Preact for ASMBOOK.

---

### 4. SolidJS would otherwise be technically attractive

Solid's fine-grained reactivity is extremely well suited to something like registers:

```text
AX changed → update AX
ZF changed → update ZF
```

without rerendering unrelated UI.

The problem is timing.

Solid is currently in a transition toward its 2.0 release line, with 2.0 release candidates appearing while the 1.x line remains established. ([npm][5])

There is no compelling reason for ASMBOOK to voluntarily enter that ecosystem transition when Preact solves the actual problem already.

**Reject SolidJS.**

---

### 5. Vanilla + formal store eventually becomes a privately maintained framework

You could build:

```ts
store.subscribe(...)
h(...)
mount(...)
dispose(...)
effect(...)
computed(...)
keyedList(...)
```

and get a perfectly good UI.

But then you own:

* component lifetime;
* cleanup;
* keyed list reconciliation;
* nested editor lifecycle;
* effect teardown;
* error boundaries;
* focus preservation;
* conditional mounting;
* async rendering conventions;
* devtools;
* testing patterns.

At that point the question becomes:

> Why are you maintaining a tiny internal Preact?

This is not transparency. It is additional infrastructure.

**Reject vanilla for the shell.**

Keep vanilla TypeScript where it provides actual value: kernel, codecs, assembler abstraction, Canvas and filesystem.

---

## Comparison

| Criterion           | Preact+Signals     | Svelte 5                           | Svelte 4                | Solid                    | Vanilla/store                       |
| ------------------- | ------------------ | ---------------------------------- | ----------------------- | ------------------------ | ----------------------------------- |
| Runtime/bundle      | **Excellent**      | Excellent                          | Excellent               | Excellent                | Excellent                           |
| Long-term stability | **Excellent**      | Good/Excellent                     | Poor choice for new app | Some 2.0 transition risk | Depends entirely on you             |
| TypeScript          | **Excellent**      | Excellent                          | Good                    | Excellent                | Excellent                           |
| AI generation       | **Best**           | Good, but syntax-generation mixing | Declining               | Fair/Good                | Highly project-specific             |
| Hiring familiarity  | **Best**           | Good                               | Legacy                  | Smaller                  | Generic JS, but custom architecture |
| Canvas integration  | **Excellent**      | Excellent                          | Excellent               | Excellent                | Excellent                           |
| Ecosystem           | **Excellent**      | Strong                             | Aging                   | Smaller                  | None                                |
| Migration if wrong  | **Relatively low** | Medium/high                        | High                    | High                     | High once custom abstractions grow  |

Bundle size should **not** be the deciding factor. CodeMirror, NASM WASM and the lazily loaded DOS environment dwarf the difference between these UI choices.

---

## RISKS

The main Preact risks are not technical limitations; they are architectural misuse.

You could accidentally:

* turn Signals into a second emulator state store;
* update component state on every CPU instruction;
* import large React UI libraries through `preact/compat`;
* create React-style application complexity you don't need;
* put giant trace arrays into reactive component props.

That would squander its benefits.

---

## CONCRETE RECOMMENDATION

Use:

```text
apps/web
    Preact
    @preact/signals
    CodeMirror

packages/kernel
    zero Preact

packages/protocol
    zero Preact

packages/notebook
    zero Preact

packages/assembler
    zero Preact
```

And enforce these rules:

```text
1. Kernel state never lives in Signals.
2. Worker owns the running CPU.
3. UI receives batched/sampled snapshots.
4. Canvas renderers receive imperative data through refs/adapters.
5. No CPU-tick → component-render relationship.
6. No preact/compat dependency unless an ADR explicitly approves it.
7. No generic global state library.
8. Signals are UI state, not domain architecture.
```

At 1M emulated instructions/s, UI updates should still happen perhaps 30–60 times/s, not one million times/s.

**Final Q1 decision: Preact + Signals.**

---

# Q2 — AFD.EXE legal strategy

## VERDICT

Rank the options:

### **1st — (c) Own ASMBOOK debugger; DOS lane runs programs but does not require AFD**

### **2nd — (b) Optionally bundle an open-source DOS debugger**

### **3rd — (a) Bring-your-own AFD**

And I would ship **(c)**.

The product does not need AFD in its authenticity lane.

---

## REASONING

The DOS lane has a very specific job:

```text
ASMBOOK source
     ↓
real NASM
     ↓
real .COM
     ↓
DOS environment
     ↓
program behavior/result
```

Nothing in that authenticity chain requires AFD.

Your own debugger has far better access to:

* machine state;
* source maps;
* cell boundaries;
* rewind;
* teaching annotations;
* predictions;
* expectation assertions;
* register diffs.

Putting a DOS debugger inside the oracle lane adds a second debugging UX without improving semantic verification.

---

## Open-source DOS debugger options actually exist

### FreeDOS DEBUG

FreeDOS currently distributes `DEBUG` 2.51 and lists its copying policy as the **MIT License**. ([Polski SunSITE][6])

This is by far the cleanest optional historical-DOS-debugger addition.

You could eventually offer:

```text
Tools
 ├─ NASM
 ├─ NDISASM
 └─ DEBUG
```

without AFD's copyright problem.

### lDebug

lDebug is also actively maintained; FreeDOS lists its current version and its **Fair License** licensing. ([ibiblio][7])

It is another viable option, although I would favor MIT-licensed FreeDOS DEBUG simply because its licensing story is less unusual for contributors.

### DOSBox debugger

DOSBox-family projects also have internal debugger facilities, but those are emulator/developer facilities rather than an ordinary DOS program integrated naturally into your student filesystem. ([DOSBox][8])

I would not build product functionality around them.

---

# Bring-your-own AFD

Technically:

```text
Choose AFD.EXE
       ↓
File remains local
       ↓
write into ephemeral DOS filesystem
       ↓
execute
```

is dramatically better legally than ASMBOOK distributing AFD.

But I still rank it last.

Why?

It creates:

* an installation prerequisite;
* uncertainty about where students legally obtained AFD;
* classroom support burden;
* inability to provide identical environments;
* different AFD versions/hashes;
* unnecessary product association with a proprietary binary.

If users can import arbitrary DOS tools, AFD can naturally work through that general mechanism.

I would **not advertise a dedicated “Import your AFD.EXE” workflow**.

---

# Is a pixel-accurate AFD look-alike legally defensible?

## VERDICT

### **Do not ship a pixel-accurate clone. Ship an AFD-inspired functional debugger with original visual expression.**

This is the firm recommendation.

In the US, GUI elements can contain protectable expressive material, although functional, standard, merger-driven and unprotectable elements must be filtered out. *Apple v. Microsoft* is an important example of how GUI copyright analysis can produce relatively “thin” protection after functional/unprotectable elements are removed. ([Justia Law][9])

Likewise, *Lotus v. Borland* illustrates that methods of operation—such as functional command hierarchies—may be outside copyright protection even though other expressive aspects can remain protected. ([FindLaw][10])

The EU reaches a broadly comparable practical result through different doctrine. In *BSA v. Ministry of Culture*, the CJEU held that a graphical user interface is not protected *as the expression of a computer program* under the Software Directive, but it can still qualify for ordinary copyright protection where it is the author's own intellectual creation. Elements dictated solely by technical function do not receive that protection. ([Eur-Lex][11])

And *SAS Institute v. World Programming* confirms the important distinction between software **functionality** and protected **expression**. ([Eur-Lex][12])

That means this:

```text
AFD concepts
✓ registers on screen
✓ disassembly pane
✓ dump pane
✓ command prompt
✓ commands such as R/D/U/T/P/G/E
✓ 80×25-style retro debugger workflow
```

is a much safer target than:

```text
AFD expression
✗ exact logo
✗ exact title treatment
✗ exact borders
✗ exact wording everywhere
✗ identical color/palette composition
✗ intentionally pixel-identical screen
```

If the legal theory available to you ultimately gives the original GUI only “thin” copyright protection, **deliberately making yours virtually identical is precisely the fact pattern you do not want**.

Open-source distribution does not create an exemption.

GPL does not create an exemption.

Educational purpose does not automatically create an exemption.

So rename the requirement from:

> Pixel-perfect AFD clone

to:

> **AFD-inspired DOS debugger mode preserving familiar functional workflows while using ASMBOOK's own visual design.**

That is also a better product.

---

# Can real AFD screenshots remain private CI fixtures?

## VERDICT

### **Lower risk than distributing them, but not legally risk-free. I would use them only temporarily and privately.**

A screenshot can itself reproduce protected visual expression.

Keeping it:

* on a private machine/private CI;
* out of the Git repository;
* out of CI artifacts;
* out of npm packages;
* out of release bundles;

removes the public-distribution problem but does not magically mean copyright law ceases to apply to the copy itself.

I would use lawfully obtained AFD screenshots during reverse-engineering/compatibility work only to answer things like:

```text
Does command R behave this way?
How many columns does this field consume?
What information appears after stepping?
```

Then replace them with **ASMBOOK-owned semantic and graphical goldens**.

Best final CI architecture:

```text
semantic debugger golden
    80x25 chars/attributes/state
              ↓
ASMBOOK renderer
              ↓
ASMBOOK-owned PNG golden
```

You no longer need AFD imagery in permanent CI.

If you insist on distributing a near-pixel-identical clone, that's the point where I would obtain actual copyright counsel rather than rely on engineering analysis.

---

# Does AdTec still exist or enforce?

I found historical evidence identifying AFD as:

> Copyright AdTec GmbH 1990 / all rights reserved

in contemporaneous/tutorial material. ([Virtual University of Pakistan][13])

I did **not** find credible evidence in targeted searches that the original AdTec GmbH software vendor currently operates or actively enforces AFD rights. Current companies called “ADTEC GmbH” appear to be unrelated businesses established in different industries and eras. ([OpenRegister][14])

But:

### **No enforcement evidence ≠ no copyright owner.**

Rights can:

* survive corporate dissolution;
* be transferred;
* end up in an insolvency estate;
* pass to successors.

So this changes nothing about the release decision.

---

## RISKS

* Accidentally copying expressive details while believing “TUI means uncopyrightable.”
* Trademark/passing-off confusion if branded too heavily as “AFD.”
* Public screenshots in documentation recreating the problem.
* BYO-AFD becoming an implicit piracy tutorial.
* Contributors independently checking in AFD assets.

---

## CONCRETE RECOMMENDATION

Ship:

### Core

**ASMBOOK Debugger**

Original appearance, optionally described in documentation as:

> Inspired by classic full-screen DOS debuggers such as AFD.

### DOS authenticity lane

```text
NASM
NDISASM
student program
FreeDOS/runtime environment
```

### Optional later addition

**FreeDOS DEBUG 2.51 (MIT)**.

### Explicit repository policy

Add:

```text
PROPRIETARY-ASSETS.md

AFD.EXE, AFD screenshots, AFD documentation,
fonts/assets extracted from AFD, and other proprietary
AFD materials MUST NOT be committed or distributed.
```

That permanently closes the ambiguity.

---

# Q3 — Notebook cell semantics

## VERDICT

### **The entire notebook is ONE assembly program / ONE translation unit / ONE machine image.**

Cells are:

* editor views;
* lesson boundaries;
* source-map regions;
* output/annotation containers.

They are **not separately assembled mini-programs**.

Do not implement a pedagogical incremental symbol table.

Do not pretend x86/NASM has Python-notebook execution semantics.

This decision should become one of ASMBOOK's immutable architectural invariants.

---

# Recommended mini-semantics specification

## Core invariant

For build `B`:

```text
ordered code cells
      ↓
canonical source projection
      ↓
ONE assembler input
      ↓
ONE symbol table
      ↓
ONE memory layout
      ↓
ONE executable image
      ↓
ONE CS:IP address space
```

Every build gets a content-derived identifier such as:

```text
buildId =
hash(
  ordered code cells +
  includes +
  assembler version +
  assembler flags +
  kernel architecture version
)
```

CPU state and outputs reference that `buildId`.

---

## 1. Cell A defines `x dw 5`; Cell B uses `mov ax,[x]`

### What happens

Suppose:

**Cell A**

```asm
x dw 5
```

**Cell B**

```asm
mov ax, [x]
```

ASMBOOK conceptually concatenates them in notebook order into the canonical translation unit:

```asm
; cell:A:start
x dw 5
; cell:A:end

; cell:B:start
mov ax, [x]
; cell:B:end
```

NASM—or ASMBOOK's canonical parser/encoder following the same layout rules—assigns `x` a normal address.

There is no separate Cell-A memory universe.

There is no special notebook symbol table.

`x` exists in the assembled program image exactly as if those lines had been written in one `.asm` file.

### Important consequence

Running Cell A does **not** “create variable x.”

Assembly creates the image.

Loading/resetting that image puts the initialized bytes representing `x` into memory.

That distinction should be taught explicitly.

---

## 2. Student edits Cell A after running A → B → C

### What happens

Immediately:

```text
Source changes
    ↓
current build becomes obsolete
    ↓
new sourceBuildId ≠ runningBuildId
```

ASMBOOK marks:

* current CPU state: **STALE**
* Cell B output: **STALE**
* Cell C output: **STALE**
* any debugger trace: **STALE**

Do **not** silently mutate the running image.

Do **not** silently replay everything.

Do **not** continue execution using addresses from the previous binary.

You can keep outputs visible, but visually label them:

> Generated from previous build

Execution controls requiring valid source/state should offer:

* **Restart with changes**
* **Restart and run**
* **Discard edits / keep debugging previous build** if you deliberately want advanced historical debugging.

For MVP, I would allow only **Restart with changes**.

---

## 3. `jmp label_in_later_cell`

### Legal.

**Cell A**

```asm
jmp print_result
```

**Cell D**

```asm
print_result:
    mov ah, 09h
```

Because there is one assembler invocation, this is an ordinary NASM forward reference.

It resolves normally.

If execution jumps from code visually located in Cell A to code in Cell D:

```text
CS:IP changes
        ↓
source map resolves address
        ↓
Cell D becomes active/highlighted
```

The notebook should visually show that control flow left one cell and entered another.

This is actually a powerful teaching feature.

---

# 4. What does Run All do?

### Always operate on the whole program.

Algorithm:

```text
Compute buildId
       │
       ├── same as cached assembled artifact?
       │          ↓
       │      reuse bytes/symbol map
       │
       └── different
                  ↓
             assemble again

Then ALWAYS:
reset machine
load fresh program image
reset devices/interrupt state
set initial CS:IP
execute from entry point
```

You may cache assembly artifacts if the exact build hash matches.

You must **not** reuse runtime CPU state.

You must **not** concatenate independently compiled cell binaries.

---

# 5. Whole-program stable layout or incremental symbol table?

## VERDICT

### **Whole-program layout, stable only for a given build.**

No incremental symbol table.

No incremental linker.

You can incrementally parse cells for:

* syntax highlighting;
* autocomplete;
* immediate diagnostics;
* symbol navigation.

But those are editor conveniences.

The authoritative result is:

```text
whole translation unit
        ↓
assembler
        ↓
symbols / offsets / bytes
```

An edit in Cell 2 can legitimately move Cell 9 from:

```text
IP = 018Ah
```

to:

```text
IP = 0194h
```

That's real assembly behavior.

Therefore every source-changing rebuild invalidates old machine addresses.

---

# 6. When does real-NASM verification run?

## VERDICT

### **Whole-program only.**

You may invoke fast per-cell parser diagnostics such as:

> Unknown mnemonic
> malformed operand
> likely undefined symbol

but do not label a cell as:

> Verified by NASM

unless the authoritative complete translation unit has successfully assembled.

The verification action should be:

```text
Verify notebook with NASM
```

not:

```text
Verify this isolated cell
```

because isolation changes symbol/layout semantics.

---

# 7. What does IP mean across cells?

### IP always means actual x86 IP.

Never:

```text
Cell 3 IP = 8
```

Always something like:

```text
CS:IP = 1000:012C
```

Your source map then says:

```text
1000:012C
    ↓
notebook.asm line 47
    ↓
cellId=f3a...
    ↓
Cell 4, editor line 7
```

So debugger UI can display:

> `1000:012C — Cell 4 : line 7`

But **012C remains the real machine offset**.

---

# The important UX consequence: don't imitate Jupyter's "Run Cell"

True Jupyter users expect:

```python
# Cell 7
x = 5
```

to be executable independently and out of order.

ASMBOOK cannot offer that faithfully without inventing an incremental runtime/linker.

So don't call the operation the same thing.

For assembly code cells I recommend these verbs:

### Build

Assemble current notebook.

### Restart

Reload clean image.

### Run

Execute the currently built program.

### Step

Execute instruction.

### Run to Cursor

Temporary breakpoint at this source location.

### Continue

Continue current machine.

### Run All

Rebuild if needed → reset → run program.

For educational exercises, a cell can still have a button like:

> **Check this step**

but that is a pedagogical action, not an independent machine execution context.

---

## REASONING

This model gives you all of these for free:

* real forward labels;
* ordinary NASM macros;
* real addresses;
* coherent debugger state;
* valid source maps;
* one binary;
* one parity model;
* repeatable results;
* easy DOS verification.

The alternative gives you an enormous hidden subsystem:

```text
incremental assembler
incremental linker
symbol persistence
relocation system
cell-local memory ownership
address patching
state migration
```

and then you would spend years explaining why ASMBOOK behaves differently from real assembly.

The notebook metaphor should improve learning presentation, not change the architecture of the language being taught.

---

## RISKS

The main risk is expectation mismatch:

> “Why can't I execute Cell 8 by itself like Python?”

Solve it in onboarding:

> **ASMBOOK notebooks organize one assembly program into explainable sections. Unlike Python notebooks, code cells share one real machine image rather than being independently executed snippets.**

Other risks:

* `%include` complicates mapping;
* macros make source-to-address mapping nontrivial;
* data declarations mixed with code confuse beginners;
* edits shift downstream addresses;
* a code cell can branch out of its visual cell.

These are real x86 realities and should be surfaced, not hidden.

---

## CONCRETE RECOMMENDATION

Before another UI feature, write:

```text
docs/NOTEBOOK_SEMANTICS.md
```

with these normative words:

```text
MUST:
- assemble code cells as one ordered translation unit
- maintain one canonical program image per build
- invalidate machine state when sourceBuildId changes
- expose real CS:IP
- permit cross-cell symbol references

MUST NOT:
- assign independent address spaces to cells
- maintain notebook-only runtime symbols
- continue execution against a rebuilt image
- claim isolated-cell NASM verification
```

**Final Q3 call: one program, many pedagogical views.**

---

# Q4 — DOS oracle

## VERDICT

### Primary nightly oracle: **native DOSBox-X**

### Secondary independent oracle: **v86 + FreeDOS**

### Browser/product integration oracle: **js-dos**

I would **not** make js-dos the primary semantic oracle.

And I would not replace DOSBox-X with dosbox-staging, QEMU or 86Box for routine CI.

---

# Ranking

## 1. DOSBox-X native — best CI-minute

DOSBox-X gives you exactly what nightly microtests need:

* native process startup rather than browser + WASM;
* command-line automation;
* `-silent`;
* automatic exit;
* time limits;
* fixed CPU configuration;
* explicit 8086 CPU configuration, including an 8086-prefetch mode. ([DOSBox-X][15])

That last property matters.

For example:

```text
cputype=8086
```

lets your semantics suite target the machine ASMBOOK claims to teach rather than an abstract later x86.

Use it.

---

## 2. v86 — very useful independent second implementation

v86 is excellent for automated guest interaction because its host API provides capabilities including:

* creating files;
* reading guest files;
* reading memory;
* saving/restoring emulator state;
* instruction counting. ([GitHub][16])

So your `RESULT.BIN` method fits v86 extremely well.

Its biggest value is **independence**.

If:

```text
ASMBOOK = result A
DOSBox-X = result B
v86       = result B
```

then you have much more useful evidence than:

```text
ASMBOOK vs two configurations of the same emulator family
```

I would run a smaller high-value subset through v86 nightly or weekly.

---

## 3. js-dos — use it to test your actual deployment stack

js-dos is essential because it's what users encounter.

But that makes it an **integration test**, not your most efficient semantics test.

A js-dos oracle needs:

```text
browser
→ JS/WASM startup
→ emulator initialization
→ virtual filesystem
→ DOS
→ test
→ result extraction
```

whereas native DOSBox-X skips several layers.

Use js-dos to answer:

> Does ASMBOOK's real web verification path actually work?

Not:

> What is the cheapest way to run 10,000 ALU semantics cases tonight?

---

# What about DOSBox Staging?

Not my primary choice.

DOSBox Staging explicitly describes its CPU model as a generic emulated x86 CPU rather than trying to reproduce one particular historical CPU model, and its normal CPU-type controls target later x86 configurations. ([dosbox-staging.org][17])

That's reasonable for gaming compatibility.

It's less attractive for a project making explicit 8086 semantics claims.

---

# QEMU + FreeDOS?

### No.

QEMU is outstanding infrastructure software, but there is no gain in using a later generalized x86 virtualization/emulation model as the authority for obscure original-8086 semantics.

Use QEMU if you later need PC-system integration.

Not your 8086 instruction oracle.

---

# 86Box?

### Excellent adjudication tool; bad bulk CI oracle.

86Box tries to reproduce much more historical hardware behavior.

That makes it attractive when you're debugging something like:

* prefetch interactions;
* timing-sensitive hardware;
* genuine original-PC quirks.

But it is heavier and less convenient for thousands of tiny headless CI cases.

Use it when two lighter engines disagree.

---

# Real hardware?

Eventually I would obtain one genuine:

* 8088 IBM-compatible; or
* actual 8086-class board/system.

Not for CI.

For a tiny **silicon adjudication corpus**.

Especially for:

* undocumented flags;
* prefetch/self-modifying code;
* divide edge cases;
* odd interrupt behavior.

A $100–300 historical machine can become more valuable to the credibility of your project than another six months of visual features.

---

# Recommended nightly architecture

Do **not** launch DOSBox-X 10,000 times.

That destroys your CI efficiency.

Instead produce batches:

```text
TEST001.COM
TEST002.COM
...
TEST500.COM
RUNTESTS.BAT
```

or preferably one generated runner containing many cases.

Write:

```text
RESULTS.BIN

header
case 0001 result
case 0002 result
case 0003 result
...
```

Then:

```text
One emulator launch
      ↓
hundreds/thousands of cases
      ↓
one output artifact
```

---

# Realistic counts

I would start with this nightly budget:

### DOSBox-X

**5,000 generated instruction/flag/memory microcases**

plus:

**200–500 golden program-level tests**

Target:

### under 10 minutes wall-clock

on 4–8 CI shards.

That is a *target to benchmark*, not a claim that those exact numbers are guaranteed on GitHub hardware.

The native DOS work itself should probably be much faster than ten minutes once batched; the generous limit protects against guest startup and CI variance.

For public repositories, standard GitHub-hosted Actions runners are available without the private-repository included-minute accounting. Private GitHub Free repositories normally receive a finite monthly Actions allowance. ([GitHub Docs][18])

So for a public GPL project, raw “free minutes” should not force you into a tiny nightly suite.

---

# Cross-oracle schedule

### Every PR

```text
TypeScript kernel tests
WASM NASM encoding
properties
goldens
```

### Nightly

```text
~5,000 generated cases → DOSBox-X
200–500 program goldens → DOSBox-X
300–500 high-risk representative cases → v86
20–50 complete browser flows → js-dos
```

### Disagreement

```text
ASMBOOK
  ↓
DOSBox-X
  ↓
v86
  ↓
architectural manual
  ↓
86Box / real hardware if unresolved
```

A disagreement should **never** automatically mean:

> Make ASMBOOK copy DOSBox-X.

---

## Deterministic DOSBox-X config

Pin:

* exact release/container digest;
* `cputype=8086`;
* normal/non-dynamic CPU core where applicable;
* fixed cycles;
* locale;
* code page;
* DOS image;
* config file;
* sound off;
* network off;
* clean filesystem.

I would run a **separate prefetch-sensitive suite** under the explicit 8086-prefetch model rather than making all correctness tests depend on prefetch behavior.

---

## RISKS

The primary risk is philosophical:

### DOSBox-X is still software, not an Intel 8086.

It can contain bugs.

So define:

```text
oracle ≠ specification
```

The actual hierarchy should be:

```text
Intel/architectural specification
+ documented 8086 behavior
+ independent implementations
+ physical hardware where needed
```

And your already-accepted undefined-flags policy is essential.

---

## CONCRETE RECOMMENDATION

Use:

> **DOSBox-X native as the high-throughput nightly compatibility oracle.**

Retain:

> **v86 as independent validation.**

Retain:

> **js-dos only for browser-product-path confidence.**

That gives you both efficiency and independence.

---

# Q5 — Instructor validation gate

## VERDICT

### Do not validate with "people who like the demo."

Validate with **two instructors' existing labs and actual novice students**.

Minimum useful sample:

* **2 instructors**
* preferably from **different institutions**
* preferably using different current toolchains
* **6–10 students each**
* total **12–20 students**
* **3 existing exercises per instructor**

This is not enough for publishable educational-effect research.

It **is** enough for a product kill/pivot decision.

---

# How to find instructors

## First priority — direct targeted outreach

Search current course pages for terms like:

```text
8086 assembly course
8086 lab MASM
microprocessor lab emu8086
assembly language DOSBox NASM
```

There are still current courses using materially different toolchains. Public course materials show MASM-centered 8086 instruction, EMU8086-oriented labs and mixed MASM/NASM environments, which is exactly why you need instructors rather than assuming your target workflow. ([KFUPM Faculty][19])

Create a spreadsheet of **20–25 instructors**, not two.

You only need two yeses.

---

## Second — SIGCSE

ACM SIGCSE remains a large international community for computing-education faculty, and its members mailing list is specifically intended for computing-education discussion. ([sigcse.org][20])

If you or a collaborator has access, that's a very appropriate channel.

---

## Third — department/lab coordinators

Target people who visibly teach:

* Computer Organization;
* Microprocessors;
* Assembly Language;
* Computer Architecture;
* Embedded Systems fundamentals.

A lab coordinator can sometimes be a better pilot partner than the professor who designed the syllabus ten years ago.

---

## Outreach email

Hello,

I'm building ASMBOOK, a free and open-source browser-based environment for teaching 8086 assembly. Students can write assembly, step through instructions, inspect registers/flags/memory/stack, and work through notebook-style explanations and exercises without installing a local toolchain.

I'm not looking for a general product review. I'd like to test whether it actually improves an existing assembly lab compared with the tools students currently use.

Would you be willing to share one or two of your existing 8086 lab exercises and spend about 30 minutes showing me your current workflow? If the tool fits your course, I'd then like to pilot one lab with a small group of students.

There would be no accounts or software installation, and I would adapt the pilot to your existing learning objectives rather than asking you to adopt a new syllabus.

The most useful feedback for me would be what prevents you from using it—not encouragement.

Thank you,
Haroon

That last sentence is important. It signals that you're not recruiting testimonials.

For an education community:

I'm looking for 1–2 instructors who currently teach 8086/x86 real-mode assembly and would be willing to help evaluate an open-source browser teaching tool.

ASMBOOK combines notebook-style explanations/exercises with register, flag, memory, stack and step-through debugging, plus real NASM/DOS verification. The goal is to test it against an instructor's existing lab—not against a demo I designed myself.

I'm especially interested in courses currently using MASM/TASM, EMU8086, NASM/DOSBox, or similar workflows. The initial request is a short discussion about your current setup and one or two existing lab exercises; if it looks useful, I'd like to pilot a lab with a small student group.

I'm particularly looking for reasons it would *not* work in a real course: dialect requirements, grading workflow, lab restrictions, student confusion, accessibility, or missing debugger features.

Use direct outreach first; community posts should supplement it, not replace it.

---

# Study design

## Don't test your own showcase exercise

If you create:

> "A perfect Doomsday ASMBOOK tutorial"

then compare that against:

> "Open DOSBox and write this manually"

you have rigged the comparison.

Ask each instructor for **their current exercises**.

For example:

1. arithmetic/flags;
2. loops/arrays;
3. procedure/stack or DOS interrupt exercise.

ASMBOOK must adapt to them.

---

# Student procedure

Use matched A/B tasks.

For example:

```text
Group A
Task 1 → existing tool
Task 2 → ASMBOOK

Group B
Task 1 → ASMBOOK
Task 2 → existing tool
```

Use tasks of similar difficulty.

Counterbalance order so the second tool does not automatically benefit from practice.

---

# What to measure

### 1. Setup-to-first-success

From:

> Here's the exercise.

to:

> First valid program has assembled and executed.

ASMBOOK should dominate here.

---

### 2. Task completion

Within a fixed reasonable period:

```text
completed correctly
completed with help
not completed
```

This matters much more than "I liked it."

---

### 3. Environment errors

Count failures caused by:

* setup;
* path;
* assembler invocation;
* DOS commands;
* editor/tool confusion;
* debugger operation.

Separate them from genuine assembly-concept mistakes.

A teaching tool should reduce the former.

---

### 4. Error confusion

This is one of the most valuable metrics.

When ASMBOOK emits an error, observe:

> Within 60 seconds, can the student correctly identify what needs to change?

Score:

```text
0 = no / wrong interpretation
1 = correctly understands next action
```

Modern usability work repeatedly finds that positive questionnaire responses can coexist with observable confusion and task abandonment, which is why observation matters more than satisfaction alone. ([DOI][21])

---

### 5. Debugging task success

Give students a program containing a bug.

Measure whether they can:

* set breakpoint;
* inspect state;
* locate bad instruction;
* explain why result is wrong;
* correct it.

This tests ASMBOOK's actual proposed advantage.

---

### 6. Instructor intervention count

Count:

> "Sir/Ma'am, what do I do now?"

A reduction is valuable.

---

### 7. SUS

Use the standard System Usability Scale after completing tasks.

SUS averages around the high-60s across broad products, but I would **not accept 68 as good enough for replacing a classroom toolchain**. ([ScienceDirect][22])

Set your gate higher.

---

### 8. Instructor metrics

Record:

* preparation time;
* assignment setup;
* grading/reproduction time;
* how often student's environment cannot be reproduced;
* missing dialect features;
* support burden;
* willingness to use one actual course lab.

That final behavior is more valuable than any survey response.

---

# Hard go/no-go thresholds

## CONTINUE

Proceed beyond the validation gate only if all of these are approximately true:

### Correctness

**Zero Severity-1 correctness failures.**

Meaning no case where ASMBOOK confidently teaches the wrong architectural result in the tested syllabus.

### Completion

**≥85% task completion**, and no more than **5 percentage points worse** than incumbent tools.

### Workflow

At least one:

* setup-to-first-success **≥25% faster**, or
* environment/tool errors **≥50% lower**.

### Usability

Median SUS:

### **≥75**

Not merely “above average.”

### Preference

At least:

### **70% of participating students**

would choose ASMBOOK for the next equivalent lab.

### Instructor commitment

At least one instructor says:

> "Yes, I will use this for an actual lab."

The second instructor may have a blocker—but it should be something fixable, such as missing export or dialect syntax.

---

# PIVOT

Pivot if:

### Students do well, instructors refuse because of workflow

Example:

> “Great tool, but my course requires MASM syntax and Google Classroom submission.”

That is not a visualization problem.

Stop visual feature development.

Fix dialect/integration.

---

### SUS = 60–74 but objective task performance improves

The concept probably works.

The UX does not.

Fix:

* terminology;
* error messages;
* navigation;
* notebook semantics;
* output density.

---

### Students love it but aren't better with it

Danger.

Novelty and animations can create preference without educational value.

Do not interpret:

> “This is cool!”

as evidence that the product should expand.

---

# PAUSE/KILL

After one focused repair iteration, stop or fundamentally rethink ASMBOOK if:

* both instructors refuse to use even one real lab for reasons intrinsic to the notebook model;
* completion remains **>10 percentage points worse** than existing tooling;
* students repeatedly mistrust results because of correctness failures;
* the notebook metaphor causes more state confusion than it eliminates;
* setup becomes easier but debugging/conceptual learning doesn't improve at all;
* instructors require such different dialects/toolchains that your chosen architecture cannot economically support them.

The purpose of the week-8–12 gate is precisely to make killing the wrong version of the project emotionally possible.

---

## RISKS

The biggest validation risk is recruiting friendly people who want to help you succeed.

They will give you flattering evidence.

Use:

* instructors you don't already know;
* their exercises;
* their students;
* their incumbent tools.

Also record failures—not just aggregate survey numbers.

---

## CONCRETE RECOMMENDATION

Before pilot recruitment, make a one-page `VALIDATION_PROTOCOL.md`.

Freeze the metrics **before** testing.

Otherwise you will unconsciously redefine success after seeing results.

---

# Q6 — Blind spots still remaining

## VERDICT

There are still five major risks I would treat as more important than most of the post-MVP feature list.

Ranked by **expected damage = likelihood × consequence**:

---

# 1. Assembly-dialect mismatch

## VERDICT

### **This is now the largest adoption risk.**

There is no single modern university “8086 syntax.”

Current course materials still show environments built around:

* MASM;
* EMU8086;
* NASM;
* mixed tools;
* school-specific templates. ([KFUPM Faculty][19])

You can build the finest NASM notebook in the world and have an instructor respond:

> “My 14 weeks of labs are written for MASM.”

Game over.

### RISKS

It's worse than syntax highlighting differences.

You encounter:

```asm
.model small
.stack 100h
.data
.code
main proc
...
main endp
end main
```

versus NASM-style source.

Then:

* directives differ;
* object formats differ;
* memory models differ;
* include/macro systems differ;
* teaching materials differ.

### RECOMMENDATION

During instructor validation, collect the actual source files.

Do **not** promise “multi-dialect support.”

Instead decide after evidence:

#### If NASM courses are enough

Remain NASM-first.

#### If most target adopters require MASM

Pivot before advanced debugger work.

A carefully limited **course-compatibility front end** may eventually be more valuable than embedding multiple full assemblers.

But don't rebuild MASM casually.

---

# 2. Grading security / anti-cheat

## VERDICT

### A static browser application cannot provide secure hidden tests or secure exam mode.

Assume the student owns the machine.

Therefore they can inspect:

* JavaScript;
* WASM;
* IndexedDB;
* network requests;
* hidden test data;
* notebook files;
* evaluator logic.

And of course they can use:

* another assembler;
* ChatGPT/Claude;
* scripts;
* modified ASMBOOK.

### RECOMMENDATION

Make a bright architectural distinction:

```text
Learning mode
    browser checks
    visible expectations
    instant feedback

Grading mode
    submitted .asmnb/source
           ↓
    instructor-controlled CLI/CI
           ↓
    private tests
```

Don't market client-side hidden tests as cheating-resistant.

For in-person examinations, security belongs to:

* controlled lab machines;
* network policies;
* institution proctoring;
* LMS/exam infrastructure.

Not ASMBOOK.

Also allow:

```text
assignment manifest:
kernelVersion
assemblerVersion
allowedFeatures
starterHash
```

for reproducibility.

But don't confuse signing/versioning with anti-cheat.

---

# 3. Offline/restricted-school deployment

## VERDICT

### “Static GitHub Pages” does not automatically mean “works anywhere.”

Many university labs have:

* filtered internet;
* blocked GitHub domains;
* proxy restrictions;
* no ability to download 4–10 MB at class time;
* machines reset after logout;
* stale browser caches;
* unreliable Wi-Fi.

If the first ten minutes of the lab become:

> “ASMBOOK isn't loading on these PCs”

your installation-free advantage disappears.

### RECOMMENDATION

ASMBOOK should eventually ship the same build in **three forms**:

```text
1. Public website
2. Self-contained offline release ZIP
3. PWA/offline-cache mode
```

The offline ZIP should need something as simple as:

```text
python -m http.server
```

or a tiny packaged static server.

No runtime CDN.

No Google Fonts.

No runtime npm asset fetching.

No dependency on GitHub after installation.

Teacher should be able to download:

```text
asmbook-coursepack-v1.4.zip
```

once and put it on an entire lab network.

Also pin the exact application/kernel version into assignments, because a service-worker-cached student build and an updated instructor build can otherwise produce maddening reproducibility bugs.

---

# 4. Canvas-heavy accessibility

## VERDICT

### Canvas may be the renderer, but it cannot be the only interface.

HTML Canvas pixels do not magically expose semantic controls or textual structure to assistive technology. The platform guidance around Canvas requires equivalent fallback/accessibility content for meaningful interactive regions rather than treating drawn pixels as sufficient semantics. ([HTML Living Standard][23])

WCAG 2.2 also creates concrete obligations around keyboard operation, focus, dragging alternatives and target sizing—not just contrast. ([W3C][24])

### Your problematic features

* memory hex canvas;
* timeline scrubber;
* AFD screen;
* branch arrows;
* heatmaps;
* animated flags.

### RECOMMENDATION

Every important canvas representation gets an accessible equivalent.

Example:

```text
Canvas memory viewer
+
DOM table / accessible memory inspector

Timeline drag scrubber
+
Previous step
Next step
Go to instruction [____]
Go to cycle/event [____]

Canvas flags
+
semantic text:
ZF = 1, Set
CF = 0, Clear
```

Also:

* keyboard everything;
* visible focus;
* no information conveyed solely by red/green;
* reduced-motion support;
* zoom without breakage;
* text alternatives for diagrams;
* AFD theme optional rather than mandatory;
* target-size compliance;
* screen-reader testing, not merely automated Lighthouse.

This belongs in R1/R2.

Not P19.

---

# 5. LMS workflow collision

## VERDICT

### Instructor adoption may ultimately be limited more by submission/grading workflow than debugger quality.

Real instructors ask:

> How do students submit this?

> Can I return grades?

> Can I reproduce the student's execution?

> Can I put it in Canvas/Moodle/Classroom?

Those are very different from:

> Does REP MOVSB animate nicely?

LTI 1.3 integrations involve authentication/security and service interactions such as OAuth/JWT and grade/role services; they are not just static hyperlink exports. ([1EdTech][25])

Likewise, Google Classroom APIs can create coursework, manage attachments and interact with grading workflows, but doing that properly requires Google API projects/authentication rather than a magical zero-backend export button. ([Google for Developers][26])

### RECOMMENDATION

Do **not** build LTI first.

Make the universal primitive excellent:

```text
assignment.asmnb
       ↓
student
       ↓
submission.asmnb
       ↓
asmbook-grade submission.asmnb assignment.json
       ↓
report.html
report.json
```

Then any institution can upload those files to:

* Google Classroom;
* Moodle;
* Canvas;
* Blackboard;
* email;
* GitHub Classroom.

If instructor demand later justifies real grade passback, accept that an optional hosted companion service may be needed.

Don't sacrifice the entire architecture's simplicity preemptively for LTI.

---

# Where does mobile rank?

### #6 — unless your validation shows phone-first classrooms.

I would explicitly **not support full ASMBOOK authoring/debugging on smartphones for MVP.**

Don't waste months trying to put:

```text
CodeMirror
registers
flags
memory
stack
debugger
notebook
```

on a 390-pixel screen.

Instead:

### Phone

Support:

* read lesson;
* predictions;
* quiz;
* inspect saved run;
* simple code viewing.

### Tablet + hardware keyboard / desktop

Support full authoring and debugging.

During instructor interviews ask:

> “What percentage of your students have access to a laptop/desktop during this lab?”

If the answer is surprisingly low, that becomes a strategy problem before development continues.

---

# Two further blind spots worth putting on the register

## Browser-storage loss

IndexedDB is better than localStorage, but browser storage is not a student's Dropbox.

Students clear site data.

Managed labs wipe profiles.

Browsers may evict storage.

So autosave must never create the belief:

> “It's safely saved forever.”

Provide:

* one-click `.asmnb` download;
* automatic recovery snapshots;
* export reminders before graded work;
* eventually persistent-storage requests where supported.

---

## Future SharedArrayBuffer/cross-origin isolation trap

If you ever optimize WASM tooling using threads/SharedArrayBuffer, browsers require cross-origin isolation. That changes resource and embedding requirements and can conflict with third-party iframe/integration assumptions. ([Web.dev][27])

So:

> Do not make ASMBOOK's basic functionality depend on threaded WASM/SharedArrayBuffer without first testing LMS embedding and deployment constraints.

This is not a current blocker.

It is exactly the kind of “performance improvement” that can create an architectural trap two years later.

---

# Final ordered risk picture

If I were maintaining the project risk register today, my top five by expected damage would be:

| Rank  | Risk                          | Why it can kill ASMBOOK                                        |
| ----- | ----------------------------- | -------------------------------------------------------------- |
| **1** | Dialect mismatch              | Instructor's existing curriculum simply won't run              |
| **2** | Assessment/security mismatch  | Static client can't meet claims around hidden/secure grading   |
| **3** | Offline/restricted deployment | “No installation” advantage collapses in real labs             |
| **4** | Accessibility failure         | Canvas-first product excludes users and institutional adoption |
| **5** | LMS/submission friction       | Instructor workload cancels student-side convenience           |

Notice what is **not** in that top five:

* whether the timeline has what-if branches;
* whether the debugger is pixel-perfect AFD;
* whether collaboration uses Yjs;
* whether it has gamepad support;
* whether it supports FASM;
* whether you reach 1.2M vs 1.5M instructions/sec.

That is the strategic change I would now make to the project's worldview.

---

# The decisions I would lock now

**UI:** Preact + Signals. Keep domain/kernel completely framework-free.

**AFD:** Stop pursuing pixel identity. Own the debugger. Do not distribute AFD. Add MIT FreeDOS DEBUG later only if users want a DOS-native debugger.

**Notebook:** One notebook = one translation unit = one program image. Never build an incremental Jupyter-style assembly runtime.

**Oracle:** DOSBox-X native primary; v86 independent secondary; js-dos integration verification.

**Validation:** 2 instructors, 12–20 students, their real labs, frozen quantitative gates. No expansion if instructors won't commit to actual use.

**Product risk priority:** solve dialect, assessment, offline deployment, accessibility and submission workflow **before** returning to the advanced-feature roadmap.

Those six decisions would make ASMBOOK substantially less likely to turn into an impressive emulator project that instructors admire but never actually adopt.

[1]: https://preactjs.com/?lang=en "https://preactjs.com/?lang=en"
[2]: https://www.npmjs.com/package/preact "https://www.npmjs.com/package/preact"
[3]: https://svelte.dev/search?q=av "https://svelte.dev/search?q=av"
[4]: https://www.npmjs.com/package/svelte?activeTab=readme "https://www.npmjs.com/package/svelte?activeTab=readme"
[5]: https://www.npmjs.com/package/solid-js?activeTab=versions "https://www.npmjs.com/package/solid-js?activeTab=versions"
[6]: https://ftp.icm.edu.pl/pub/msdos/freedos/repositories/1.4/html/en/base/debug/20250621.0/index.html "https://ftp.icm.edu.pl/pub/msdos/freedos/repositories/1.4/html/en/base/debug/20250621.0/index.html"
[7]: https://www.ibiblio.org/pub/micro/pc-stuff/freedos/files/repositories/latest/html/en/devel/ldebug/20260216.6/index.html "https://www.ibiblio.org/pub/micro/pc-stuff/freedos/files/repositories/latest/html/en/devel/ldebug/20260216.6/index.html"
[8]: https://www.dosbox.com/wiki/Building_DOSBox_with_Visual_Studio "https://www.dosbox.com/wiki/Building_DOSBox_with_Visual_Studio"
[9]: https://law.justia.com/cases/federal/appellate-courts/F3/35/1435/605245/ "https://law.justia.com/cases/federal/appellate-courts/F3/35/1435/605245/"
[10]: https://caselaw.findlaw.com/court/us-1st-circuit/1118863.html "https://caselaw.findlaw.com/court/us-1st-circuit/1118863.html"
[11]: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A62009CJ0393 "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A62009CJ0393"
[12]: https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=celex%3A62010CJ0406 "https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=celex%3A62010CJ0406"
[13]: https://vulms.vu.edu.pk/Courses/CS401/Downloads/AFD_Tutorial.pdf "https://vulms.vu.edu.pk/Courses/CS401/Downloads/AFD_Tutorial.pdf"
[14]: https://openregister.de/company/DE-HRB-R3306-117194 "https://openregister.de/company/DE-HRB-R3306-117194"
[15]: https://dosbox-x.com/wiki/Home "https://dosbox-x.com/wiki/Home"
[16]: https://github.com/copy/v86/blob/master/v86.d.ts "https://github.com/copy/v86/blob/master/v86.d.ts"
[17]: https://www.dosbox-staging.org/preview/dev/0.83/manual/system/cpu/ "https://www.dosbox-staging.org/preview/dev/0.83/manual/system/cpu/"
[18]: https://docs.github.com/en/billing/concepts/product-billing/github-actions "https://docs.github.com/en/billing/concepts/product-billing/github-actions"
[19]: https://faculty.kfupm.edu.sa/COE/shazli/coe205/coe205.htm "https://faculty.kfupm.edu.sa/COE/shazli/coe205/coe205.htm"
[20]: https://sigcse.org/membership/mailing-lists.html "https://sigcse.org/membership/mailing-lists.html"
[21]: https://doi.org/10.3390/educsci16060877 "https://doi.org/10.3390/educsci16060877"
[22]: https://www.sciencedirect.com/topics/computer-science/system-usability-scale "https://www.sciencedirect.com/topics/computer-science/system-usability-scale"
[23]: https://html.spec.whatwg.org/dev/canvas.html "https://html.spec.whatwg.org/dev/canvas.html"
[24]: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ "https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/"
[25]: https://www.1edtech.org/standards/lti "https://www.1edtech.org/standards/lti"
[26]: https://developers.google.com/workspace/classroom/support/faq "https://developers.google.com/workspace/classroom/support/faq"
[27]: https://web.dev/articles/coop-coep?hl=en "https://web.dev/articles/coop-coep?hl=en"
