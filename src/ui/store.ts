// ================================================================
//  Store — Preact Signals wiring notebook state to the kernel.
//  Headless (no DOM). The UI imports from here.
// ================================================================
import { signal } from '@preact/signals';
import { LiveSession } from '../kernel/session.js';
import type { Cell } from '../kernel/session.js';

// ── Shared kernel objects ──────────────────────────────────────
export const session = new LiveSession();
export const machine = signal<any>(null);

// ── Starter notebook ──────────────────────────────────────────
export function defaultCells(): Cell[] {
  return [
    {
      id: 'intro',
      kind: 'markdown',
      source: '# Welcome to ASMBOOK\n\nWrite 8086 assembly, run it, and watch the CPU come alive.',
    },
    {
      id: 'cell-1',
      kind: 'code',
      source: [
        '.DATA',
        "greet DB 'Hello from ASMBOOK!$'",
        '.CODE',
        'MOV DX, greet',
        'MOV AH, 09h',
        'INT 21h',
        'HLT',
      ].join('\n'),
    },
  ];
}

// ── State management ──────────────────────────────────────────
export function applyCells(cells: Cell[]) {
  session.setCells(cells);
  publishMachine();
}

export function runCell(id: string) {
  const res = session.runCell(id);
  publishMachine();
  return res;
}

export function runUpTo(id: string) {
  const res = session.runUpTo(id);
  publishMachine();
  return res;
}

export function step() {
  const res = session.step();
  publishMachine();
  return res;
}

export function restart() {
  session.resetMachine();
  publishMachine();
}

export function toggleBreakpoint(cellId: string, line: number) {
  return session.toggleBreakpoint(cellId, line);
}

export function getCellLocalLine(cellId: string, globalLine: number): number | null {
  return session.getCellLocalLine(cellId, globalLine);
}

export function getMemHex(addr: number, rows?: number) {
  return session.memHex(addr, rows);
}

export function getStackView(depth?: number) {
  return session.stackView(depth);
}

export function getFullOutput(): string {
  return session.getFullOutput();
}

/** Run a cell and return the resulting state for prediction comparison. */
export function predictCell(id: string) {
  const res = session.runCell(id);
  const state = session.getState();
  publishMachine();
  return { result: res, state };
}

function publishMachine() {
  machine.value = session.getState();
}
