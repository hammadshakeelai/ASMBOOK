// ================================================================
//  Store — Preact Signals wiring notebook state to the kernel.
//  Headless (no DOM). The UI imports from here.
// ================================================================
import { signal } from '@preact/signals';
import { LiveSession } from '../kernel/session.js';
import type { Cell } from '../kernel/session.js';
import { autosave } from '../kernel/storage.js';

// ── Shared kernel objects ──────────────────────────────────────
export const session = new LiveSession();
export const machine = signal<any>(null);
export const cells = signal<Cell[]>(defaultCells());
session.setCells(cells.value);

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
export function applyCells(newCells: Cell[]) {
  cells.value = newCells;
  session.setCells(newCells);
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

export function runToLine(id: string, line: number) {
  const res = session.runToLine(id, line);
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

// ── Cell operations ──────────────────────────────────────────

let _cellCounter = 1;
function nextCellId() {
  let nextId: string;
  do {
    nextId = `cell-${++_cellCounter}`;
  } while (cells.value && cells.value.some(c => c.id === nextId));
  return nextId;
}

export function moveCell(id: string, dir: 'up' | 'down') {
  const current = [...cells.value];
  const idx = current.findIndex(c => c.id === id);
  if (idx < 0) return;
  const target = dir === 'up' ? idx - 1 : idx + 1;
  if (target < 0 || target >= current.length) return;
  [current[idx], current[target]] = [current[target], current[idx]];
  updateCells(current);
}

export function copyCell(id: string) {
  const current = [...cells.value];
  const idx = current.findIndex(c => c.id === id);
  if (idx < 0) return;
  const src = current[idx];
  const copy: Cell = { ...src, id: nextCellId(), source: src.source };
  current.splice(idx + 1, 0, copy);
  updateCells(current);
}

export function deleteCell(id: string) {
  let current = cells.value.filter(c => c.id !== id);
  if (current.length === 0) {
    // Always keep at least one cell
    current = [{ id: nextCellId(), kind: 'code', source: '' }];
  }
  updateCells(current);
}

export function addCell(afterId?: string | null, kind: 'code' | 'markdown' = 'code', position: 'below' | 'above' = 'below'): string {
  const current = [...cells.value];
  const idx = afterId ? current.findIndex(c => c.id === afterId) : -1;
  const newCell: Cell = { id: nextCellId(), kind, source: '' };
  if (idx < 0) {
    if (position === 'above') {
      current.unshift(newCell);
    } else {
      current.push(newCell);
    }
  } else {
    const insertIdx = position === 'above' ? idx : idx + 1;
    current.splice(insertIdx, 0, newCell);
  }
  updateCells(current);
  return newCell.id;
}

export function changeCellType(id: string, kind: 'code' | 'markdown') {
  const current = cells.value.map(c => c.id === id ? { ...c, kind } : c);
  updateCells(current);
}

export function updateCells(newCells: Cell[]) {
  cells.value = newCells;
  session.setCells(newCells);
  publishMachine();
  autosave(newCells);
}

export function clearOutput(cellId: string) {
  session.clearOutput(cellId);
  publishMachine();
}

export function getExecCount(cellId: string): number {
  return session.getExecCount(cellId);
}

export function getCurrentExecCount(): number {
  return session.currentExecCount;
}

function publishMachine() {
  machine.value = session.getState();
}
