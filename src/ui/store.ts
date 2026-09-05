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

// ── Starter notebook (Showcase GCD Demo) ──────────────────────
export function defaultCells(): Cell[] {
  return [
    {
      id: 'intro',
      kind: 'markdown',
      source: [
        '# 8086 Architecture: Iterative Greatest Common Divisor (GCD)',
        '',
        'Interactive exploration of the **Euclidean Algorithm** running on a real-mode Intel 8086 CPU.',
        'Watch CPU registers (`AX`, `BX`, `CX`, `DX`), arithmetic flags (`ZF`, `CF`, `OF`), and execution timing update in real time.',
      ].join('\n'),
    },
    {
      id: 'cell-1',
      kind: 'code',
      source: [
        '; --- Step 1: Register Initialization ---',
        '; Computing GCD(48, 18): Expecting GCD = 6',
        'MOV AX, 48       ; First integer (dividend)',
        'MOV BX, 18       ; Second integer (divisor)',
        'MOV CX, 0        ; Step iteration counter',
      ].join('\n'),
    },
    {
      id: 'explain-loop',
      kind: 'markdown',
      source: [
        '### Euclidean Modulo Division Loop',
        'In each iteration, divide `AX` by `BX`, store remainder in `DX`, and swap registers (`AX ← BX`, `BX ← DX`) until remainder equals `0`.',
      ].join('\n'),
    },
    {
      id: 'cell-2',
      kind: 'code',
      source: [
        '; --- Step 2: Euclidean Iteration Loop ---',
        'gcd_loop:',
        '  INC CX         ; Increment loop iteration counter',
        '  XOR DX, DX     ; Clear DX for 16-bit division',
        '  DIV BX         ; AX / BX -> Quotient in AX, Remainder in DX',
        '  MOV AX, BX     ; AX = previous divisor',
        '  MOV BX, DX     ; BX = remainder',
        '  CMP BX, 0      ; Has remainder reached zero?',
        '  JNZ gcd_loop   ; Loop until remainder is 0',
        '',
        '; Loop terminates with GCD = 6 in AX',
      ].join('\n'),
    },
    {
      id: 'explain-output',
      kind: 'markdown',
      source: [
        '### Terminal Output & DOS Interrupt Call',
        'Display the calculated result banner to the console using **`INT 21h, AH=09h`** (DOS Print String).',
      ].join('\n'),
    },
    {
      id: 'cell-3',
      kind: 'code',
      source: [
        '; --- Step 3: Display Result to Text Screen ---',
        '.DATA',
        "banner DB '========================================$', 0",
        "msg    DB 13, 10, '>> Euclidean GCD(48, 18) = 6$', 0",
        "status DB 13, 10, '>> Computation Complete!$', 0",
        '',
        '.CODE',
        'MOV DX, banner',
        'MOV AH, 09h      ; DOS Print String',
        'INT 21h',
        '',
        'MOV DX, msg',
        'MOV AH, 09h',
        'INT 21h',
        '',
        'MOV DX, status',
        'MOV AH, 09h',
        'INT 21h',
        '',
        'HLT              ; Halt CPU execution',
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

export function copyCells(ids: string[]): string[] {
  if (!ids || ids.length === 0) return [];
  const current = [...cells.value];
  const srcCells = ids
    .map(id => current.find(c => c.id === id))
    .filter((c): c is Cell => c !== undefined);
  if (srcCells.length === 0) return [];

  const lastIndex = Math.max(...srcCells.map(c => current.findIndex(item => item.id === c.id)));
  const insertIndex = lastIndex >= 0 ? lastIndex + 1 : current.length;

  const copies: Cell[] = srcCells.map(src => ({
    ...src,
    id: nextCellId(),
    source: src.source,
  }));

  current.splice(insertIndex, 0, ...copies);
  updateCells(current);
  return copies.map(c => c.id);
}

export function deleteCell(id: string) {
  let current = cells.value.filter(c => c.id !== id);
  if (current.length === 0) {
    // Always keep at least one cell
    current = [{ id: nextCellId(), kind: 'code', source: '' }];
  }
  updateCells(current);
}

export function deleteCells(ids: string[]): string[] {
  if (!ids || ids.length === 0) return [];
  let current = cells.value.filter(c => !ids.includes(c.id));
  if (current.length === 0) {
    current = [{ id: nextCellId(), kind: 'code', source: '' }];
  }
  updateCells(current);
  return current.map(c => c.id);
}

export function pasteCells(afterId: string | undefined, sourceCells: { kind: 'code' | 'markdown'; source: string }[]): string[] {
  if (!sourceCells || sourceCells.length === 0) return [];
  const current = [...cells.value];
  const idx = afterId ? current.findIndex(c => c.id === afterId) : -1;
  const insertIdx = idx >= 0 ? idx + 1 : current.length;

  const newCells: Cell[] = sourceCells.map(sc => ({
    id: nextCellId(),
    kind: sc.kind,
    source: sc.source,
  }));

  current.splice(insertIdx, 0, ...newCells);
  updateCells(current);
  return newCells.map(c => c.id);
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
