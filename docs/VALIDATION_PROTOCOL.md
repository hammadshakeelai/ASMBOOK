# ASMBOOK — Validation protocol

Frozen **before** recruitment (2026-09-03). Metrics are not redefined after
results are seen. The gate exists to make killing or pivoting the wrong
version of ASMBOOK emotionally possible.

## When

After R2 (notebook loop + teaching layer) is internally complete — planned
around week 8–12 of development. No advanced features (graphics, devices,
dialects, collaboration) are built before this gate passes.

## Participants

- **2 instructors**, different institutions, different current toolchains
  (candidates: MASM-based, EMU8086-based, NASM/DOSBox-based courses)
- **6–10 students each** (12–20 total), novices to 8086
- **3 exercises per instructor — THEIR existing labs, not ours**

## Procedure

Matched A/B, counterbalanced:

```
Group A: task 1 with incumbent tool → task 2 with ASMBOOK
Group B: task 1 with ASMBOOK        → task 2 with incumbent tool
```

Plus one debugging task in ASMBOOK only (seeded-bug program: find it via
breakpoints/stepping, explain it, fix it).

## Metrics (frozen)

1. **Setup-to-first-success** time (from "here is the exercise" to first
   correctly running program)
2. **Task completion** (correct / with help / not completed, within period)
3. **Environment errors** (tool/setup/path failures — distinct from genuine
   assembly-concept mistakes)
4. **Error confusion**: after each tool error, within 60s can the student
   state the correct next action? (0/1)
5. **Debugging task success** (breakpoint set, bad instruction located,
   cause explained, fix correct)
6. **Instructor intervention count** ("what do I do now?" moments)
7. **SUS** questionnaire after tasks
8. **Instructor metrics**: prep time, grading/reproduction time, missing
   dialect features, willingness to use one real lab

## Go / no-go

**CONTINUE** if all of:
- zero Severity-1 correctness failures (no case where ASMBOOK confidently
  teaches a wrong architectural result)
- ≥85% task completion and no worse than −5pp vs incumbent
- setup-to-first-success ≥25% faster OR environment errors ≥50% lower
- median SUS ≥ 75
- ≥70% of students would choose ASMBOOK for the next lab
- ≥1 instructor commits to using it for a real lab

**PIVOT** (stop features, fix the blocker) if instructors refuse for
workflow reasons (e.g. dialect mismatch, grading workflow) while students
perform well. Collect their real `.asm` sources as evidence.

**PAUSE/KILL** after one repair iteration if: both instructors refuse for
reasons intrinsic to the notebook model; completion >10pp worse; students
mistrust results; the notebook metaphor causes more confusion than it
removes.

## Anti-bias rules

- Recruit instructors you do NOT already know
- Use their exercises and their incumbent tools — never a rigged showcase
- Record failures and verbatim confusion, not just aggregates
- A "this is cool!" is not evidence; task performance is

## Grading-mode separation (design consequence)

The browser cannot hide tests from students. Therefore: **learning mode**
(browser-side visible checks) vs **grading mode** (instructor-run CLI with
private tests, offline submission via exported `.asmnb`/source bundles).
No client-side feature may be marketed as cheating-resistant.
