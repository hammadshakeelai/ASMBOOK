# Graph Report - ASMBOOK  (2026-09-06)

## Corpus Check
- 83 files · ~495,456 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1128 nodes · 1646 edges · 117 communities (100 shown, 17 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.66)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `53c51b99`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- session.ts
- App.tsx
- index-D7Iu8xK8.js
- LiveSession
- App
- Executor
- qe
- cell.tsx
- dependencies
- compilerOptions
- CPU
- CPU
- oracle.test.ts
- Parser
- run.js
- manifest.json
- shortcuts.tsx
- write-session2.js
- write-session3.js
- write-session4.js
- write-session.js
- sw.js
- 20-logic-shift.cases.js
- chatgpt2.md
- ASMBOOK — Complete Repository Note
- engine.mjs
- chatgpt.md
- Missing or under-specified features
- ASMBOOK — Validation protocol
- 9. Questions that must be answered before Phase 0
- gemini.md
- Q3 — Notebook cell semantics
- REASONING
- session.ts
- My revised roadmap
- ledger.ts
- The important UX consequence: don't imitate Jupyter's "Run Cell"
- 2. Corrections to factual claims
- Open-source DOS debugger options actually exist
- CONTINUE
- Recommended mini-semantics specification
- What to measure
- AI-assisted development guardrails I would mandate
- grok.md
- 6. When does real-NASM verification run?
- Cross-oracle schedule
- CONCRETE RECOMMENDATION
- ASMBOOK — Architecture
- LiveSession
- VERDICT
- 2.8 The GPL conclusion is too simplistic—and there are worse licensing problems
- ASMBOOK — Accuracy policy
- ASMBOOK — Notebook semantics (normative)
- ASMBOOK
- 2.9 The market-gap claim needs narrowing
- The missing architectural problem: what does an assembly “notebook cell” actually mean?
- Differential-testing CI architecture
- ASMBOOK — License inventory
- ASMBOOK — Product definition
- VERDICT
- VERDICT
- How to find instructors
- 8. Concrete first 30 days
- Performance: can TypeScript hit 1M instructions/sec?
- ASMBOOK — Design & roadmap
- ASMBOOK — Proprietary assets policy (binding)
- Ranking
- VERDICT
- VERDICT
- VERDICT
- Where does mobile rank?
- PIVOT
- 7. Minimum Lovable Product
- Shared filesystem between lanes
- Bet 4 — Framework-free vanilla TypeScript UI
- Rewind/timeline design
- Pixel-perfect AFD: technically achievable, strategically questionable
- storage.ts
- storage.js
- 5. Whole-program stable layout or incremental symbol table?
- predict.tsx
- Two further blind spots worth putting on the register
- Can real AFD screenshots remain private CI fixtures?
- PAUSE/KILL
- Is a pixel-accurate AFD look-alike legally defensible?
- Q5 — Instructor validation gate
- Realistic counts
- errors.js
- 1. Executive verdict
- 3. Architecture review
- graphify.md
- graphify.md
- test-browser-exhaustive-fanout.mjs
- machine.tsx
- expect.js
- session.js
- 5. Scope, estimates and revised phase order
- qa-lessons-curriculum.mjs
- test-notebook-logic-vigorous.mjs
- redteam-engine-fuzz.mjs
- redteam-security-storage.mjs
- 6. When does real-NASM verification run?
- 5. Scope, estimates and revised phase order
- redteam-session-state.mjs

## God Nodes (most connected - your core abstractions)
1. `Executor` - 46 edges
2. `LiveSession` - 41 edges
3. `LiveSession` - 39 edges
4. `qe` - 37 edges
5. `App` - 35 edges
6. `CPU` - 26 edges
7. `Parser` - 19 edges
8. `compilerOptions` - 16 edges
9. `9. Questions that must be answered before Phase 0` - 16 edges
10. `ASMBOOK — Complete Repository Note` - 15 edges

## Surprising Connections (you probably didn't know these)
- `run()` --indirect_call--> `k()`  [INFERRED]
  tests/oracle.test.ts → docs/assets/index-D7Iu8xK8.js
- `Ue()` --indirect_call--> `h()`  [INFERRED]
  docs/assets/index-D7Iu8xK8.js → tests/run.js
- `MemoryPanel()` --indirect_call--> `b()`  [INFERRED]
  src/ui/memory.tsx → docs/assets/index-D7Iu8xK8.js
- `renderMarkdown()` --indirect_call--> `h()`  [INFERRED]
  src/ui/cell.tsx → tests/run.js
- `LiveSession` --references--> `CPU`  [EXTRACTED]
  src/kernel/session.ts → src/kernel/engine.mjs

## Import Cycles
- None detected.

## Communities (117 total, 17 thin omitted)

### Community 0 - "session.ts"
Cohesion: 0.09
Nodes (34): AddressingMode, ARITH, arithFlags, arithOps, BCD, Category, COVERAGE_MATRIX, coverageByCategory() (+26 more)

### Community 1 - "App.tsx"
Cohesion: 0.07
Nodes (49): LESSONS, loadLesson(), Cell, AddressCalcProps, AddressCalculator(), ModePreset, App(), hex16() (+41 more)

### Community 2 - "index-D7Iu8xK8.js"
Cohesion: 0.07
Nodes (41): b(), ce(), constructor(), De(), Ee(), F(), Ge(), getReg() (+33 more)

### Community 3 - "LiveSession"
Cohesion: 0.28
Nodes (8): FriendlyError, FLAG_EXPLANATIONS, friendlyErrors(), friendlyParse(), matchError(), NASM_PATTERNS, REG_EXPLANATIONS, RUNTIME_PATTERNS

### Community 7 - "cell.tsx"
Cohesion: 0.11
Nodes (12): asm8086, breakpointEffect, breakpointField, breakpointGutter, BreakpointMarker, CellView(), CellViewProps, cursorLineEffect (+4 more)

### Community 8 - "dependencies"
Cohesion: 0.07
Nodes (26): dependencies, codemirror, @codemirror/commands, @codemirror/language, @codemirror/lint, @codemirror/state, @codemirror/view, preact (+18 more)

### Community 9 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, esModuleInterop, isolatedModules, jsx, jsxImportSource, lib, module, moduleResolution (+9 more)

### Community 11 - "CPU"
Cohesion: 0.14
Nodes (3): CPU, Executor, Parser

### Community 12 - "oracle.test.ts"
Cohesion: 0.15
Nodes (10): ALL_REGS16, BOUND16, BOUND8, FLAG_NAMES, JCC_MNEMONICS, lcg(), refArith(), rnd() (+2 more)

### Community 15 - "run.js"
Cohesion: 0.22
Nodes (10): allFails, byFile, checkCase(), { CPU, Parser, Executor }, dir, execute(), files, fs (+2 more)

### Community 16 - "manifest.json"
Cohesion: 0.22
Nodes (8): background_color, description, display, icons, name, short_name, start_url, theme_color

### Community 18 - "write-session2.js"
Cohesion: 0.50
Nodes (3): existing, fs, lines

### Community 19 - "write-session3.js"
Cohesion: 0.50
Nodes (3): existing, fs, lines

### Community 20 - "write-session4.js"
Cohesion: 0.50
Nodes (3): existing, fs, lines

### Community 33 - "chatgpt2.md"
Cohesion: 0.08
Nodes (23): 4. What does Run All do?, 7. What does IP mean across cells?, 86Box?, Always operate on the whole program., Bring-your-own AFD, Decision summary, Don't test your own showcase exercise, Excellent adjudication tool; bad bulk CI oracle. (+15 more)

### Community 34 - "ASMBOOK — Complete Repository Note"
Cohesion: 0.10
Nodes (19): 12 Lesson Notebooks, Architecture (Key Boundaries), ASMBOOK — Complete Repository Note, Bug Fixes (7 total, all in this session), Credits, Development Commands, Documentation (Key Files), `@expect` Directive Pipeline (+11 more)

### Community 35 - "engine.mjs"
Cohesion: 0.16
Nodes (9): findings, dec(), DEST_FIRST_OPS, EXAMPLES, OPERAND_SPEC, NOTE: the legacy "Boot" block that auto-instantiated the old AFD UI in a, REG_SIZE, REGPAIR_OPS (+1 more)

### Community 36 - "chatgpt.md"
Cohesion: 0.14
Nodes (13): 2.10 JWasm → WASM is technically plausible; licensing is the blocker, 2.11 DOSBox should not be described as the ultimate 8086 truth oracle, 6. Top-10 risk register, A static app cannot have genuinely hidden client-side tests, Agree, but drastically reduce it., Bet 2 — Jupyter-like message protocol, Bet 3 — Transparent interpreter + DOS authenticity lane, Final assessment (+5 more)

### Community 37 - "Missing or under-specified features"
Cohesion: 0.12
Nodes (17): 10. Keyboard accessibility, 11. Modern accessible UI alongside AFD skin, 12. Assignment format, 13. Reproducible student submission, 14. Browser/device support statement, 1. Deterministic `Reset` / `Restart kernel`, 2. “Run all from top”, 3. Dirty/out-of-order cell state (+9 more)

### Community 38 - "ASMBOOK — Validation protocol"
Cohesion: 0.22
Nodes (7): Accuracy infrastructure (R3), Coverage matrix, Known gaps (ledger FAIL entries), Oracle chain (status: infra only — lanes pending), Running it, Screen goldens (semantic, not pixels), The ledger

### Community 39 - "9. Questions that must be answered before Phase 0"
Cohesion: 0.12
Nodes (16): 10. How will teachers collect work?, 11. Are you willing to remove AFD.EXE if redistribution rights aren't obtained?, 12. Are JWasm/MASM syntax requirements actually demanded by target courses?, 13. What's your browser baseline?, 14. What accuracy means “course-ready”?, 15. What would make you stop the project?, 1. Which assembly language are you actually teaching?, 2. What precisely does “8086” mean? (+8 more)

### Community 40 - "gemini.md"
Cohesion: 0.13
Nodes (14): 1. Executive Verdict, 2. Corrections to Factual Claims, 3. Architecture Review, 4. Missing Features & Features to Cut, 5. Revised Phase Order, 6. Top-10 Risk Register, 7. MVP Definition and Milestone Gate, 8. Concrete First-30-Days Execution Advice (+6 more)

### Community 41 - "Q3 — Notebook cell semantics"
Cohesion: 0.25
Nodes (8): Anti-bias rules, ASMBOOK — Validation protocol, Go / no-go, Grading-mode separation (design consequence), Metrics (frozen), Participants, Procedure, When

### Community 42 - "REASONING"
Cohesion: 0.15
Nodes (13): 1. It gives you exactly as much framework as ASMBOOK needs, 2. AI assistance actually shifts the decision toward Preact, 3. Svelte 5 is mature enough — but Svelte 4 is no longer the safer choice, 4. SolidJS would otherwise be technically attractive, 5. Vanilla + formal store eventually becomes a privately maintained framework, **Choose Preact + Signals.**, Comparison, CONCRETE RECOMMENDATION (+5 more)

### Community 43 - "session.ts"
Cohesion: 0.17
Nodes (14): EvalContext, ExpectClause, ExpectOp, ExpectResult, evaluateExpects(), parseExpectLine(), parseExpects(), parseNumber() (+6 more)

### Community 44 - "My revised roadmap"
Cohesion: 0.17
Nodes (12): First major gate, My revised roadmap, R0 — Foundation, R1 — Complete notebook learning loop, R2 — Make it educational, R3 — Accuracy infrastructure, R4 — Authentic DOS lane, R5 — Advanced debugger (+4 more)

### Community 45 - "ledger.ts"
Cohesion: 0.08
Nodes (4): diffRegs(), LiveSession, REG_LIST, VALID_OPS

### Community 46 - "The important UX consequence: don't imitate Jupyter's "Run Cell""
Cohesion: 0.18
Nodes (11): Build, CONCRETE RECOMMENDATION, Continue, REASONING, Restart, RISKS, Run, Run All (+3 more)

### Community 47 - "2. Corrections to factual claims"
Cohesion: 0.18
Nodes (11): 2.1 Yjs + WebRTC is not really “no backend required”, 2.2 A real WASM NASM build does now exist, 2.3 v86 is viable as a CI oracle, but not in the way your plan suggests, 2.4 Pixelmatch is good, but “byte-exact pixelmatch” is the wrong concept, 2.5 The js-dos “iframe per run because it can't restart” claim is now outdated, 2.6 js-dos persistence is primarily filesystem persistence, not general emulator rewind, 2.7 Mouse support: likely fine, but test INT 33h instead of assuming it, 2. Corrections to factual claims (+3 more)

### Community 48 - "Open-source DOS debugger options actually exist"
Cohesion: 0.20
Nodes (10): **1st — (c) Own ASMBOOK debugger; DOS lane runs programs but does not require AFD**, **2nd — (b) Optionally bundle an open-source DOS debugger**, **3rd — (a) Bring-your-own AFD**, DOSBox debugger, FreeDOS DEBUG, lDebug, Open-source DOS debugger options actually exist, Q2 — AFD.EXE legal strategy (+2 more)

### Community 49 - "CONTINUE"
Cohesion: 0.20
Nodes (10): **70% of participating students**, **≥75**, Completion, CONTINUE, Correctness, Hard go/no-go thresholds, Instructor commitment, Preference (+2 more)

### Community 50 - "Recommended mini-semantics specification"
Cohesion: 0.22
Nodes (9): 1. Cell A defines `x dw 5`; Cell B uses `mov ax,[x]`, 2. Student edits Cell A after running A → B → C, 3. `jmp label_in_later_cell`, Core invariant, Important consequence, Legal., Recommended mini-semantics specification, What happens (+1 more)

### Community 51 - "What to measure"
Cohesion: 0.22
Nodes (9): 1. Setup-to-first-success, 2. Task completion, 3. Environment errors, 4. Error confusion, 5. Debugging task success, 6. Instructor intervention count, 7. SUS, 8. Instructor metrics (+1 more)

### Community 52 - "AI-assisted development guardrails I would mandate"
Cohesion: 0.22
Nodes (9): AI-assisted development guardrails I would mandate, AI is not a code reviewer of its own work, CI tiers, Every instruction implementation needs evidence, Every semantics change requires a test first, Fuzzing rule, Never accept giant AI refactors, Reproducible vendoring (+1 more)

### Community 53 - "grok.md"
Cohesion: 0.22
Nodes (8): 2. Corrections to factual claims, 3. Architecture review, 4. Missing features & features to cut, 5. Revised phase order, 6. Top-10 risk register, 7. MVP definition and milestone, 8. Concrete first-30-days execution advice, 9. Open questions the developer must answer before Phase 0

### Community 54 - "6. When does real-NASM verification run?"
Cohesion: 0.23
Nodes (9): assert(), assertEqual(), __dirname, executeAsm(), failures, __filename, loaderPath, testDivError() (+1 more)

### Community 55 - "Cross-oracle schedule"
Cohesion: 0.25
Nodes (8): CONCRETE RECOMMENDATION, Cross-oracle schedule, Deterministic DOSBox-X config, Disagreement, DOSBox-X is still software, not an Intel 8086., Every PR, Nightly, RISKS

### Community 56 - "CONCRETE RECOMMENDATION"
Cohesion: 0.25
Nodes (8): CONCRETE RECOMMENDATION, Core, Does AdTec still exist or enforce?, DOS authenticity lane, Explicit repository policy, **No enforcement evidence ≠ no copyright owner.**, Optional later addition, RISKS

### Community 57 - "ASMBOOK — Architecture"
Cohesion: 0.25
Nodes (8): ASMBOOK — Architecture, CI / verification, DOS lane, Features in this release, Hard boundaries, Kernel execution paths, Layers, Notebook model

### Community 59 - "VERDICT"
Cohesion: 0.29
Nodes (7): 1. Assembly-dialect mismatch, If most target adopters require MASM, If NASM courses are enough, RECOMMENDATION, RISKS, **This is now the largest adoption risk.**, VERDICT

### Community 60 - "2.8 The GPL conclusion is too simplistic—and there are worse licensing problems"
Cohesion: 0.29
Nodes (7): 2.8 The GPL conclusion is too simplistic—and there are worse licensing problems, AFD-Pro — your biggest overlooked copyright issue, CC-BY-SA font, js-dos, JWasm / UASM, NASM, CodeMirror, MIT/ISC/BSD dependencies, Ralf Brown's Interrupt List

### Community 61 - "ASMBOOK — Accuracy policy"
Cohesion: 0.29
Nodes (7): ASMBOOK — Accuracy policy, CI tiers, Golden corpus, Performance, Public ledger, Result classes, The three authorities

### Community 62 - "ASMBOOK — Notebook semantics (normative)"
Cohesion: 0.29
Nodes (7): ASMBOOK — Notebook semantics (normative), Cells are views, not units, Edits are RAM patches, MUST / MUST NOT summary, Out-of-order re-runs, The model: one live machine, Two modes

### Community 63 - "ASMBOOK"
Cohesion: 0.29
Nodes (7): ASMBOOK, Credits, Development, Governance documents, Layout, License, Status

### Community 64 - "2.9 The market-gap claim needs narrowing"
Cohesion: 0.33
Nodes (6): 2.9 The market-gap claim needs narrowing, 8086 Online IDE, WorkbenchNP2, x86-64-playground, XIDE, Your real moat

### Community 65 - "The missing architectural problem: what does an assembly “notebook cell” actually mean?"
Cohesion: 0.33
Nodes (6): Cell 1, Cell 1, Cell 2, Cell 2, Recommended MLP solution, The missing architectural problem: what does an assembly “notebook cell” actually mean?

### Community 66 - "Differential-testing CI architecture"
Cohesion: 0.33
Nodes (6): Differential-testing CI architecture, Tier 1 — every commit, seconds, Tier 2 — every PR, Tier 3 — nightly/full oracle tests, Tier 4 — product integration smoke, Which oracle?

### Community 68 - "ASMBOOK — License inventory"
Cohesion: 0.33
Nodes (5): ASMBOOK — License inventory, Code, Data & fonts, Kernel provenance, Planned (vendor at the phase that needs them — update this table then)

### Community 69 - "ASMBOOK — Product definition"
Cohesion: 0.33
Nodes (6): ASMBOOK — Product definition, Explicit non-goals (v1), MVP (R0 → R2, then gate), One-line definition, Target user, The three engines

### Community 70 - "VERDICT"
Cohesion: 0.40
Nodes (5): 4. Canvas-heavy accessibility, Canvas may be the renderer, but it cannot be the only interface., RECOMMENDATION, VERDICT, Your problematic features

### Community 71 - "VERDICT"
Cohesion: 0.40
Nodes (5): Browser/product integration oracle: **js-dos**, Primary nightly oracle: **native DOSBox-X**, Q4 — DOS oracle, Secondary independent oracle: **v86 + FreeDOS**, VERDICT

### Community 72 - "How to find instructors"
Cohesion: 0.40
Nodes (5): First priority — direct targeted outreach, How to find instructors, Outreach email, Second — SIGCSE, Third — department/lab coordinators

### Community 73 - "8. Concrete first 30 days"
Cohesion: 0.40
Nodes (5): 8. Concrete first 30 days, Days 15–21 — establish real NASM authority, Days 1–7 — destroy ambiguity, Days 22–30 — build one complete vertical lesson, Days 8–14 — extract the kernel properly

### Community 74 - "Performance: can TypeScript hit 1M instructions/sec?"
Cohesion: 0.40
Nodes (5): Fast path, Performance: can TypeScript hit 1M instructions/sec?, Performance CI, Trace path, Yes, probably—under the right definition.

### Community 75 - "ASMBOOK — Design & roadmap"
Cohesion: 0.40
Nodes (5): ASMBOOK — Design & roadmap, Decisions locked (and who forced them), Roadmap, Traps inherited from the predecessor projects, What this is

### Community 76 - "ASMBOOK — Proprietary assets policy (binding)"
Cohesion: 0.40
Nodes (4): Absolutely prohibited in this repository or any release artifact, ASMBOOK — Proprietary assets policy (binding), Consequences for the product design, Enforcement

### Community 77 - "Ranking"
Cohesion: 0.50
Nodes (4): 1. DOSBox-X native — best CI-minute, 2. v86 — very useful independent second implementation, 3. js-dos — use it to test your actual deployment stack, Ranking

### Community 78 - "VERDICT"
Cohesion: 0.50
Nodes (4): 2. Grading security / anti-cheat, A static browser application cannot provide secure hidden tests or secure exam mode., RECOMMENDATION, VERDICT

### Community 79 - "VERDICT"
Cohesion: 0.50
Nodes (4): 3. Offline/restricted-school deployment, RECOMMENDATION, “Static GitHub Pages” does not automatically mean “works anywhere.”, VERDICT

### Community 80 - "VERDICT"
Cohesion: 0.50
Nodes (4): 5. LMS workflow collision, Instructor adoption may ultimately be limited more by submission/grading workflow than debugger quality., RECOMMENDATION, VERDICT

### Community 81 - "Where does mobile rank?"
Cohesion: 0.50
Nodes (4): #6 — unless your validation shows phone-first classrooms., Phone, Tablet + hardware keyboard / desktop, Where does mobile rank?

### Community 82 - "PIVOT"
Cohesion: 0.50
Nodes (4): PIVOT, Students do well, instructors refuse because of workflow, Students love it but aren't better with it, SUS = 60–74 but objective task performance improves

### Community 83 - "7. Minimum Lovable Product"
Cohesion: 0.50
Nodes (4): 7. Minimum Lovable Product, Exclude, Include, Milestone I would hold the project to

### Community 84 - "Shared filesystem between lanes"
Cohesion: 0.50
Nodes (4): Achievable, but don't actually share one live filesystem., Custom interpreter, DOS lane, Shared filesystem between lanes

### Community 85 - "Bet 4 — Framework-free vanilla TypeScript UI"
Cohesion: 0.50
Nodes (4): Bet 4 — Framework-free vanilla TypeScript UI, I would reject this decision., My recommendation, “We'll swap vanilla for Svelte later” is not a good escape hatch

### Community 86 - "Rewind/timeline design"
Cohesion: 0.50
Nodes (4): Compact delta log, Linear rewind, Rewind/timeline design, What-if branching

### Community 87 - "Pixel-perfect AFD: technically achievable, strategically questionable"
Cohesion: 0.50
Nodes (4): Pixel-perfect AFD: technically achievable, strategically questionable, Primary golden representation, Secondary golden, Stable harness

### Community 88 - "storage.ts"
Cohesion: 0.20
Nodes (11): NotebookData, clearAutosave(), createShareURL(), dbGet(), dbSet(), downloadNotebook(), exportNotebook(), importNotebook() (+3 more)

### Community 89 - "storage.js"
Cohesion: 0.24
Nodes (12): autosave(), clearAutosave(), createShareURL(), dbGet(), dbSet(), downloadNotebook(), exportNotebook(), importNotebook() (+4 more)

### Community 90 - "5. Whole-program stable layout or incremental symbol table?"
Cohesion: 0.67
Nodes (3): 5. Whole-program stable layout or incremental symbol table?, VERDICT, **Whole-program layout, stable only for a given build.**

### Community 91 - "predict.tsx"
Cohesion: 0.33
Nodes (9): allCorrect(), FLAGS, formatReg(), getFlagResultClass(), getResultClass(), parseGuess(), PredictPanel(), PredictPanelProps (+1 more)

### Community 92 - "Two further blind spots worth putting on the register"
Cohesion: 0.67
Nodes (3): Browser-storage loss, Future SharedArrayBuffer/cross-origin isolation trap, Two further blind spots worth putting on the register

### Community 93 - "Can real AFD screenshots remain private CI fixtures?"
Cohesion: 0.67
Nodes (3): Can real AFD screenshots remain private CI fixtures?, **Lower risk than distributing them, but not legally risk-free. I would use them only temporarily and privately.**, VERDICT

### Community 94 - "PAUSE/KILL"
Cohesion: 0.67
Nodes (3): CONCRETE RECOMMENDATION, PAUSE/KILL, RISKS

### Community 95 - "Is a pixel-accurate AFD look-alike legally defensible?"
Cohesion: 0.67
Nodes (3): **Do not ship a pixel-accurate clone. Ship an AFD-inspired functional debugger with original visual expression.**, Is a pixel-accurate AFD look-alike legally defensible?, VERDICT

### Community 96 - "Q5 — Instructor validation gate"
Cohesion: 0.67
Nodes (3): Do not validate with "people who like the demo.", Q5 — Instructor validation gate, VERDICT

### Community 97 - "Realistic counts"
Cohesion: 0.67
Nodes (3): DOSBox-X, Realistic counts, under 10 minutes wall-clock

### Community 98 - "errors.js"
Cohesion: 0.32
Nodes (7): FLAG_EXPLANATIONS, friendlyErrors(), friendlyParse(), matchError(), NASM_PATTERNS, REG_EXPLANATIONS, RUNTIME_PATTERNS

### Community 99 - "1. Executive verdict"
Cohesion: 0.67
Nodes (3): 1. Executive verdict, ASMBOOK technical due-diligence review, Verdict: **BUILD WITH CHANGES**

### Community 100 - "3. Architecture review"
Cohesion: 0.67
Nodes (3): 3. Architecture review, Bet 1 — Pure DOM-free TypeScript kernel, Strongly agree.

### Community 103 - "test-browser-exhaustive-fanout.mjs"
Cohesion: 0.33
Nodes (6): __dirname, __filename, record(), results, run(), SCREENSHOT_DIR

### Community 104 - "machine.tsx"
Cohesion: 0.38
Nodes (6): LiveState, FLAGS, hex16(), hex8(), MachinePanel(), MachinePanelProps

### Community 105 - "expect.js"
Cohesion: 0.70
Nodes (4): evaluateExpects(), parseExpectLine(), parseExpects(), parseNumber()

### Community 106 - "session.js"
Cohesion: 0.38
Nodes (4): colors, resultsLog, hex(), hex2()

### Community 109 - "5. Scope, estimates and revised phase order"
Cohesion: 0.67
Nodes (3): run(), SCREENSHOT_DIR, setCellCode()

### Community 114 - "6. When does real-NASM verification run?"
Cohesion: 0.67
Nodes (3): 6. When does real-NASM verification run?, VERDICT, **Whole-program only.**

### Community 115 - "5. Scope, estimates and revised phase order"
Cohesion: 0.67
Nodes (3): 5. Scope, estimates and revised phase order, Approximate effort for the original roadmap, Phases most likely to be 3× underestimated

## Knowledge Gaps
- **467 isolated node(s):** `name`, `version`, `private`, `license`, `description` (+462 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Executor` connect `Executor` to `session.ts`, `engine.mjs`, `CPU`, `session.js`, `session.ts`, `ledger.ts`, `oracle.test.ts`, `run.js`, `redteam-engine-fuzz.mjs`, `LiveSession`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `Cell` connect `App.tsx` to `session.ts`, `storage.ts`, `session.ts`, `cell.tsx`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `LiveSession` connect `LiveSession` to `CPU`, `session.ts`, `Executor`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _468 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `session.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09041835357624832 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06892010535557506 - nodes in this community are weakly interconnected._
- **Should `index-D7Iu8xK8.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07207792207792207 - nodes in this community are weakly interconnected._