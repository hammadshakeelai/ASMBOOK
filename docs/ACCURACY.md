# Accuracy infrastructure (R3)

The accuracy policy (see [VALIDATION_PROTOCOL.md](VALIDATION_PROTOCOL.md)) is
that *"accurate" must be machine-checked*: deterministic, CI-affordable, and
independent of a spec-writer's optimism. R3 builds the observable part of that:

1. **Instruction coverage matrix** — `src/kernel/coverage.ts`
2. **Execution ledger** — `src/kernel/ledger.ts` + `tests/accuracy.test.ts`
3. **Public ledger artifact** — `docs/accuracy-ledger.json` (regenerated on
   every CI run; committed so diffs are reviewable)

## Coverage matrix

`COVERAGE_MATRIX` enumerates **1,061 instruction forms** across 12 categories
(data, arith, logic, shift, string, stack, flow, io, flag, bcd, seg, system).
Every entry records the mnemonic, operand shape, addressing mode, the flags it
affects, and a verification class:

| Class | Meaning | Enforced |
|---|---|---|
| `MUST_MATCH` | Architecturally defined by the 8086 spec; must agree with the DOS oracle | yes |
| `IMPLEMENTATION_DEFINED` | Legal variation across 8086 vendors / reserved flags (e.g. DIV flags) | recorded, not compared |
| `UNDEFINED_DONT_COMPARE` | Undefined by spec; engine picks a deterministic value | never compared |

## The ledger

`buildLedger()` takes every form in the matrix, synthesises a minimal concrete
program with correct register setup (`prologue()`), runs it through a real
`LiveSession` (assembly + execution), and records PASS or FAIL with the snippet
and the friendly diagnostic. This is deliberately *not* a spec claim — it is a
machine-checked statement about **this engine, today**, published so regressions
show up as red CI and gaps become backlog items.

Status at time of writing: **99.7% pass (1058/1061)**.

## Known gaps (ledger FAIL entries)

The 3 remaining fails are honest, understood engine limits:

| Form | Why it fails |
|---|---|
| `DIV DX`, `IDIV DX` | Architecturally **always** overflows: dividend is `DX:AX`, so with `DX` as divisor the quotient necessarily exceeds 16 bits (or the divisor is zero). The engine reports the overflow correctly; the snippet cannot be made non-degenerate. |
| `JMP r16` | Indirect `JMP reg` is not implemented (only labels). |

A larger set (AH/CH/DH/BH in various forms) was found by the ledger in R3 and
**already fixed**: the parser treated `AH` as the hex immediate `0x0A` ("AH")
instead of a register because the destination-immediate validator ran before
the register check. One line restored high-byte registers everywhere and
brought 24 legacy INT 10h/21h tests back to green.

Ledger statuses are meant to approach 100% as the engine matures, but every
non-passing entry must stay *documented* (never silently hidden).

## Screen goldens (semantic, not pixels)

Per the locked design decision, screen state is compared as a **semantic
80×25 char+attribute matrix** — never as pixel-diffed screenshots. The
`screenText()` live-session view reads the real B800h video memory; the
accuracy test paints `H`/`!` with attributes into B800h via an `ES=0xB800`
write and asserts the matrix contents.

## Oracle chain (status: infra only — lanes pending)

The four-tier oracle plan in `DESIGN.md` remains the north star for R3-R4:
NASM (encoding) → DOSBox-X native (semantics) → v86 (independent secondary) →
js-dos (product smoke). This milestone delivers the *harness* (matrix, ledger,
snippets, goldens) so each orphan lane can be attached without re-architecting.
The NASM encoder-differential and DOSBox verification lanes are the remaining
R3/R4 work, gated behind GATE 1 per the roadmap.

## Running it

```bash
npm run test:kernel            # includes tests/accuracy.test.ts
# the ledger JSON is rewritten into docs/accuracy-ledger.json on every run
npx vitest run tests/accuracy.test.ts   # just the accuracy suite
npm test                       # legacy 375-case engine suite (must stay 100%)
```