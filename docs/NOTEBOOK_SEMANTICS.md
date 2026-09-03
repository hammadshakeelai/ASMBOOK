# ASMBOOK — Notebook semantics (normative)

Status: **v1, frozen for R1.** The words MUST / MUST NOT are binding.

## The model: one live machine

The notebook **is** one 8086 machine. There are no per-cell machines, no
per-cell address spaces, and no hidden resets. Concretely:

- The machine's registers, flags, RAM and devices persist across cell runs,
  exactly like a Python notebook's namespace persists across cells.
- Code cells assemble into the machine's code region. A cell's ▶ button means:
  **bring the CPU to the start of this cell (re-running the program prefix
  from the top if the machine was reset) and execute through the end of the
  cell**, leaving the machine live at the cursor (IP).
- `Run from top` resets the machine and executes from the entry point to the
  current cell or the program's end.
- The IP is displayed as the **cursor** — the notebook always shows where the
  CPU is parked.

## Edits are RAM patches

Editing a cell re-assembles it immediately (whole-notebook re-assembly is
fast; treated as a patch). Then:

- If the edit does not change any address that the current machine state
  depends on (cursor position, stack return addresses, absolute data
  references), execution state **survives** and the UI shows `✓ up to date`.
- If it does, the UI shows `⟳ restart to apply` — the machine is **never**
  silently inconsistent. We do not rewind or mutate prior outputs.

## Cells are views, not units

- Cells MUST NOT be treated as independently assembled programs.
- There is no incremental linker and no notebook-only symbol table beyond
  what whole-notebook assembly produces.
- Labels resolve across cells (forward references are legal — it is one
  program).
- The debugger MUST display real `CS:IP` values; a source map adds the
  friendly annotation (`0100:012C — Cell 4, line 7`).

## Out-of-order re-runs

Re-running an earlier cell behaves like re-running an earlier Python cell:
its effects apply with the **current** machine state; outputs of cells run
before it are marked stale, never silently rewritten.

## Two modes

- **Program mode (default).** Everything above. The notebook is one program;
  `Build & verify in DOS` assembles it contiguously (as real NASM would) and
  runs it in the DOS lane. Addresses in the live machine and in the built
  image may differ — this is explained in-product (same distinction as
  Python REPL vs an imported module).
- **Playground mode (opt-in per notebook).** A visible banner states that
  cells run as interpreter fragments with names-not-addresses convenience for
  early-course experimentation. Playground notebooks are explicitly marked as
  not real program layout and cannot be exported as .COM without converting
  to Program mode.

## MUST / MUST NOT summary

MUST:
- keep one machine per notebook, persistent across runs
- assemble ordered code cells as one translation unit per build
- invalidate (visibly) machine state when an edit requires it
- expose real CS:IP with source-mapped friendly annotations
- permit cross-cell symbol references

MUST NOT:
- give cells independent address spaces or hidden resets
- continue execution against a stale, silently-patched image
- claim isolated-cell NASM verification (whole-program only)
- fake Jupyter semantics that real assembly cannot reproduce
