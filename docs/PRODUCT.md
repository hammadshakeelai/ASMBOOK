# ASMBOOK — Product definition

Written 2026-09-03, before R1. Frozen during R0; changes require an ADR.

## One-line definition

A free, open-source, browser-based **notebook** where students write 8086
assembly, execute it on a **fully inspectable virtual machine**, debug it with
a **classic-DOS-style debugger of our own design**, and verify it against
**real NASM running in real DOS** — with nothing installed, no accounts, and
no backend.

## Target user

- Students in a first Computer-Organization / Microprocessors course that
  uses 8086 real-mode assembly (16-bit registers, segments, INT 21h)
- Their instructors, who need exercises to run identically for every student
  without lab-machine setup

## The three engines

1. **Interpreter kernel (teaching engine)** — our own 8086 machine, in
   TypeScript, fully observable (registers, flags, memory, stack, timeline,
   rewind). Skinned after classic full-screen DOS debuggers such as AFD, but
   with ASMBOOK's own visual design.
2. **DOS lane (compatibility engine)** — js-dos: real DOSBox compiled to
   WebAssembly with real NASM 2.16.03 inside. One click writes the notebook's
   program to the emulated drive, assembles it with `nasm -f bin`, and runs it.
3. **Verification machine (engineering, user-visible)** — the kernel's output
   is differentially tested against the DOS lane in CI. Results are published
   as an accuracy ledger rather than claimed.

## MVP (R0 → R2, then gate)

- Notebook cells (assembly + markdown), live machine state carried across runs
- Run / restart / run-from-top / step; breakpoints; rewind
- Registers, flags, memory, stack panels; B800h text screen
- `; @expect` checkable cells; predict-then-run quiz cells
- Friendly plain-language assembler/runtime errors
- IndexedDB autosave; `.asmnb` import/export; share-URL for small notebooks
- One-click real-DOS verification of the whole program
- 8–12 guided lessons ending with the Doomsday algorithm notebook

## Explicit non-goals (v1)

- Accounts, servers, telemetry, "cloud" anything
- Multi-user collaboration
- MASM/TASM dialect support (evidence-gated decision — see VALIDATION_PROTOCOL)
- Protected mode, 32-bit, FPU, multitasking
- Anti-cheat guarantees (see VALIDATION_PROTOCOL.md — learning mode vs grading mode)
- Pixel-identical reproduction of any third-party program's screen
