# ASMBOOK — Proprietary assets policy (binding)

This repository distributes nothing for which we do not hold or have not
verified a redistribution right. "Abandonware" is not a license.

## Absolutely prohibited in this repository or any release artifact

- `AFD.EXE`, `AFD.COM` or any build of the Advanced Fullscreen Debug program
  (AdTec GmbH, 1990 — copyright notice documented in contemporaneous material)
- AFD's documentation, help screens, or extracted font/color assets
- Screenshots or captures of AFD's screen (except *temporarily, privately,
  never committed*, during compatibility study — see below)
- Any other historical proprietary binary (MASM, TASM, Turbo Debugger,
  Microsoft/IBM binaries, games)

## Consequences for the product design

1. The DOS lane ships **NASM + NDISASM + FreeDOS runtime** only, plus
   optionally an MIT-licensed debugger (FreeDOS DEBUG / lDebug) once its file
   headers are verified.
2. The ASMBOOK debugger is our **own design, inspired by the classic
   full-screen DOS debugger workflow** (functional elements: register pane,
   disassembly pane, dump pane, R/D/U/T/P/G/E-style commands, 80×25 layout).
   Functional/idea elements are safe to reproduce; expressive identity
   (logos, exact artwork, distinctive wording) is not copied.
3. CI goldens for the debugger are **semantic** (the 80×25 character +
   attribute matrix) and rendered **ASMBOOK-owned PNGs** — no third-party
   screen captures as permanent fixtures.

## Enforcement

- `.gitignore` excludes `*.EXE`, `*.COM` binaries by default
- Reviewers reject any PR adding unlisted binaries; binary files require an
  entry in LICENSE_INVENTORY.md with a verified license
- BYO-AFD: the DOS lane MAY load a debugger binary the *user* provides from
  their own machine (client-side injection, never stored or redistributed by
  us). This is the user's responsibility, not ours.
