// ================================================================
//  store — Preact signals that bind the LiveSession machine to the
//  notebook UI. The session object is the single source of truth for
//  CPU state; these signals are the renderable snapshots of it.
// ================================================================
import { signal } from '@preact/signals';
import {
  LiveSession,
  type Cell,
  type CellOutput,
  type LiveState
} from '../kernel/session.js';

export const session = new LiveSession();

export type InspectorTab = 'regs' | 'memory' | 'stack' | 'screen';

export const cells = signal<Cell[]>([]);
export const machine = signal<LiveState | null>(null);
export const outputs = signal<Map<string, CellOutput>>(new Map());
export const errors = signal<{ cellId: string | null; line: number | null; message: string }[]>([]);
export const status = signal('loading…');
export const inspectorTab = signal<InspectorTab>('regs');
export const memBase = signal(0);
export const memRows = 8;

// ── default starter notebook ─────────────────────────────────────
const STARTER = [
  '; ── Cell 1: our first program ─────────────────',
  '; The whole notebook is ONE machine. ▶ below moves the',
  '; CPU cursor through this cell and stops at the end.',
  '',
  '.DATA',
  "msg db 'Hello from ASMBOOK!$'",
  '.CODE',
  "MOV AH, 09h          ; DOS: print string to screen",
  "MOV DX, msg",
  "INT 21h",
  '',
  "MOV AX, 4C00h        ; DOS: exit",
  "INT 21h",
  'HLT'
].join('\n');

export function defaultCells(): Cell[] {
  return [
    { id: 'md-intro', kind: 'markdown', source: '# ASMBOOK — 8086 Assembly Notebook\n\nThis notebook is **one live machine**. All code cells share the same registers, flags and RAM (like a Python notebook that never forgets). Press **▶** on a cell to run the CPU through that cell, or **Step** to go one instruction at a time.' },
    { id: 'cell-1', kind: 'code', source: STARTER }
  ];
}

// ── session binding ──────────────────────────────────────────────
export function refresh() {
  machine.value = session.getState();
  outputs.value = session.getAllOutputs();
  errors.value = session.getParseErrors();
  status.value = describe(session.getState());
}

function describe(st: LiveState): string {
  if (st.needsRestart) return '⟳ restart to apply — variable layout changed';
  if (st.halted) return 'halted (HLT)';
  if (st.cursor) return `IP#${st.cursor.instrIndex} · ${st.cursor.cellId ?? ''} line ${st.cursor.line ?? '?'}`;
  return 'ready';
}

export function applyCells(next: Cell[]): void {
  cells.value = next;
  session.setCells(next);
  refresh();
  scheduleSave();
}

export function updateCellSource(id: string, source: string): void {
  applyCells(cells.value.map(c => (c.id === id ? { ...c, source } : c)));
}

export function addCell(kind: 'code' | 'markdown', afterId: string): void {
  const id = `${kind}-${Math.random().toString(36).slice(2, 8)}`;
  const next = [...cells.value];
  const at = next.findIndex(c => c.id === afterId);
  next.splice(at >= 0 ? at + 1 : next.length, 0, {
    id,
    kind,
    source: kind === 'code' ? '; new cell\nHLT' : '# new note'
  });
  applyCells(next);
}

export function deleteCell(id: string): void {
  applyCells(cells.value.filter(c => c.id !== id));
}

export function runCell(id: string) { const r = session.runCell(id); refresh(); return r; }
export function runUpTo(id: string) { const r = session.runUpTo(id); refresh(); return r; }
export function step() { const r = session.step(); refresh(); return r; }
export function reset() { session.resetMachine(); refresh(); }
export function runAll() { session.resetMachine(false); session.continueRun(); refresh(); }
export function continueRun() { session.continueRun(); refresh(); }
export function toggleBreakpoint(id: string, line: number) { session.toggleBreakpoint(id, line); refresh(); }

// ── persistence (IndexedDB autosave + .asmnb export/import) ──────
const DB_NAME = 'asmbook';
const DB_STORE = 'notebooks';
const DB_KEY = 'current';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveNotebook(), 400);
}

export async function saveNotebook(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(cells.value, DB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* storage unavailable — notebook still works in-memory */ }
}

export async function loadNotebook(): Promise<Cell[]> {
  try {
    const db = await openDB();
    const stored = await new Promise<Cell[] | undefined>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(DB_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (Array.isArray(stored) && stored.length) return stored;
  } catch { /* fall through to defaults */ }
  return defaultCells();
}

export function exportNotebook(): void {
  const payload = {
    formatVersion: 1,
    kernelVersion: '0.1.0',
    asmbook: 'https://github.com/hammadshakeelai/ASMBOOK',
    cells: cells.value
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'notebook.asmnb.json';
  a.click();
  URL.revokeObjectURL(url);
}

export async function importNotebook(file: File): Promise<void> {
  const text = await file.text();
  const data = JSON.parse(text) as { cells?: Cell[] };
  if (!Array.isArray(data.cells)) throw new Error('Not a valid .asmnb file');
  applyCells(data.cells.map((c, i) => ({ id: c.id ?? `c-${Date.now()}-${i}`, kind: c.kind, source: c.source ?? '' })));
}