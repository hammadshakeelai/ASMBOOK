import { useSignal, useSignalEffect } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import {
  defaultCells, applyCells, runCell, runUpTo, runToLine, step, restart,
  getCellLocalLine, session, machine, cells,
  moveCell, copyCell, deleteCell, addCell, changeCellType, clearOutput,
  getExecCount
} from './store.js';
import { autosave, loadAutosave, downloadNotebook, importNotebook, createShareURL, loadFromShareURL, clearShareHash } from '../kernel/storage.js';
import { LESSONS, loadLesson } from '../kernel/lessons.js';
import { friendlyErrors } from '../kernel/errors.js';
import type { FriendlyError } from '../kernel/errors.js';
import { CellView } from './cell.js';
import { MachinePanel } from './machine.js';
import { MemoryPanel } from './memory.js';
import { TextScreen } from './textscreen.js';
import { ShortcutsPage } from './shortcuts.js';
import { NotebookOutline } from './outline.js';
import { AddressCalculator } from './address_calc.js';
import type { Cell } from '../kernel/session.js';

export function App() {
  const outputMap = useSignal<Record<string, string>>({});
  const regDiffMap = useSignal<Record<string, Record<string, [number, number]>>>({});
  const execInfoMap = useSignal<Record<string, { steps: number; reason: string; durationMs?: number; success?: boolean }>>({});
  const expectMap = useSignal<Record<string, { results: any[]; allPassed: boolean }>>({});
  const parseMap = useSignal<Record<string, FriendlyError[]>>({});
  const activeCell = useSignal<string | null>(cells.value.find(c => c.kind === 'code')?.id || cells.value[0]?.id || null);
  const cursorCell = useSignal<string | null>(null);
  const cursorLocalLine = useSignal<number | null>(null);
  const loaded = useSignal(false);
  const showLessons = useSignal(false);
  const showShortcutsModal = useSignal(false);
  const showShortcutsPage = useSignal(false);
  const kernelBusy = useSignal(false);
  const saveNotice = useSignal<string | null>(null);
  const sidebarTab = useSignal<'inspector' | 'outline' | 'calc'>('inspector');
  const notebookMode = useSignal<'command' | 'edit'>('command');
  const clipboardCell = useSignal<Cell | null>(null);
  const lastDTime = useSignal<number>(0);
  const savedTheme = (typeof localStorage !== 'undefined' && localStorage.getItem('asmbook_theme')) ||
    (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const theme = useSignal<'light' | 'dark'>(savedTheme === 'dark' ? 'dark' : 'light');

  // Draggable sidebar state
  const sidebarWidth = useSignal<number>(() => {
    try {
      const saved = localStorage.getItem('asmbook_sidebar_width');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 240 && val <= 900) return val;
      }
    } catch {}
    return 320;
  });
  const isDraggingSplitter = useSignal(false);
  const editingMdCellId = useSignal<string | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  function handleSplitterPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    const splitterEl = e.currentTarget as HTMLElement;
    try {
      splitterEl.setPointerCapture(e.pointerId);
    } catch {}
    isDraggingSplitter.value = true;
    document.body.classList.add('is-resizing');

    const startX = e.clientX;
    const startWidth = sidebarWidth.value;

    function onPointerMove(ev: PointerEvent) {
      const delta = startX - ev.clientX; // Dragging left widens the sidebar
      const minW = 240;
      const maxW = Math.min(900, Math.floor(window.innerWidth * 0.75));
      const newWidth = Math.max(minW, Math.min(maxW, startWidth + delta));
      sidebarWidth.value = newWidth;
      if (sidebarRef.current) {
        sidebarRef.current.style.width = `${newWidth}px`;
        sidebarRef.current.style.minWidth = `${newWidth}px`;
        sidebarRef.current.style.maxWidth = `${newWidth}px`;
      }
    }

    function onPointerUp(ev: PointerEvent) {
      isDraggingSplitter.value = false;
      document.body.classList.remove('is-resizing');
      try {
        splitterEl.releasePointerCapture(ev.pointerId);
      } catch {}
      splitterEl.removeEventListener('pointermove', onPointerMove as any);
      splitterEl.removeEventListener('pointerup', onPointerUp as any);
      splitterEl.removeEventListener('pointercancel', onPointerUp as any);
      try {
        localStorage.setItem('asmbook_sidebar_width', String(sidebarWidth.value));
      } catch {}
    }

    splitterEl.addEventListener('pointermove', onPointerMove as any);
    splitterEl.addEventListener('pointerup', onPointerUp as any);
    splitterEl.addEventListener('pointercancel', onPointerUp as any);
  }

  function handleResetSplitter() {
    sidebarWidth.value = 320;
    if (sidebarRef.current) {
      sidebarRef.current.style.width = '320px';
      sidebarRef.current.style.minWidth = '320px';
      sidebarRef.current.style.maxWidth = '320px';
    }
    try {
      localStorage.setItem('asmbook_sidebar_width', '320');
    } catch {}
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme.value);
    try {
      localStorage.setItem('asmbook_theme', theme.value);
    } catch {}
  }, [theme.value]);

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
  }

  // Load autosave on mount (share URL takes priority)
  useSignalEffect(() => {
    if (loaded.value) return;
    const shared = loadFromShareURL();
    if (shared) {
      applyCells(shared);
      clearShareHash();
      loaded.value = true;
      return;
    }
    loadAutosave().then(saved => {
      if (saved) {
        applyCells(saved);
      } else {
        applyCells(cells.value);
      }
      loaded.value = true;
    });
  });

  // Refresh outputs when machine state changes
  useSignalEffect(() => {
    machine.value; // subscribe
    refreshOutputs();
    const st = machine.value;
    if (st?.cursor?.cellId && st?.cursor?.line != null) {
      cursorCell.value = st.cursor.cellId;
      cursorLocalLine.value = getCellLocalLine(st.cursor.cellId, st.cursor.line);
    } else {
      cursorCell.value = null;
      cursorLocalLine.value = null;
    }
  });

  // Global keyboard shortcuts (Jupyter-style dual mode: Command & Edit)
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inInput = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || !!target.closest('.cm-editor');

      // Update mode if typing in input
      if (inInput && notebookMode.value !== 'edit') {
        notebookMode.value = 'edit';
      }

      // Escape — switch to command mode or close modals
      if (e.key === 'Escape') {
        if (showLessons.value || showShortcutsModal.value || showShortcutsPage.value) {
          showLessons.value = false;
          showShortcutsModal.value = false;
          showShortcutsPage.value = false;
          return;
        }
        if (notebookMode.value === 'edit' || editingMdCellId.value != null || inInput) {
          e.preventDefault();
          notebookMode.value = 'command';
          editingMdCellId.value = null;
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          return;
        }
      }

      // Ctrl+Enter / Cmd+Enter — run focused cell (stay in cell)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (activeCell.value) handleRun(activeCell.value);
        return;
      }

      // Shift+Enter — run focused cell and advance (or insert at end)
      if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (activeCell.value) handleRunAndAdvance(activeCell.value);
        return;
      }

      // Alt+Enter — run focused cell and insert below immediately
      if (e.key === 'Enter' && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        if (activeCell.value) handleRunAndInsert(activeCell.value);
        return;
      }

      // Ctrl+B — insert code cell below
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B') && !e.shiftKey) {
        e.preventDefault();
        handleAddCellBelow(activeCell.value || undefined, 'code');
        return;
      }

      // Ctrl+M — toggle cell type between code and markdown
      if ((e.ctrlKey || e.metaKey) && (e.key === 'm' || e.key === 'M') && !e.shiftKey) {
        e.preventDefault();
        if (activeCell.value) {
          const c = cells.value.find(item => item.id === activeCell.value);
          if (c) handleChangeType(c.id, c.kind === 'code' ? 'markdown' : 'code');
        }
        return;
      }

      // Ctrl+S / Cmd+S — manual save notice
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSave();
        return;
      }

      // Ctrl+R / Cmd+R — restart machine (prevent browser full reload)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R') && !e.shiftKey) {
        e.preventDefault();
        handleRestart();
        return;
      }

      // Ctrl+Up / Ctrl+Down — navigate cells
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowUp') {
        e.preventDefault();
        navigateCell('up');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowDown') {
        e.preventDefault();
        navigateCell('down');
        return;
      }

      // F7 — step
      if (e.key === 'F7') {
        e.preventDefault();
        handleStep();
        return;
      }

      // Shift+? — toggle shortcuts page (when not actively typing inside textarea)
      if (e.key === '?' && e.shiftKey && !inInput) {
        e.preventDefault();
        showShortcutsPage.value = !showShortcutsPage.value;
        return;
      }

      // ── JUPYTER COMMAND MODE (single-key shortcuts when not editing text) ──
      if (!inInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Enter — enter edit mode on active cell
        if (e.key === 'Enter') {
          e.preventDefault();
          notebookMode.value = 'edit';
          if (activeCell.value) {
            const c = cells.value.find(item => item.id === activeCell.value);
            if (c && c.kind === 'markdown') {
              editingMdCellId.value = c.id;
            } else {
              const cellEl = document.getElementById(activeCell.value);
              const cmEl = cellEl?.querySelector('.cm-content') as HTMLElement;
              if (cmEl) cmEl.focus();
            }
          }
          return;
        }

        // A — insert cell above
        if (e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          handleAddCellAbove(activeCell.value || undefined, 'code');
          return;
        }

        // B — insert cell below
        if (e.key === 'b' || e.key === 'B') {
          e.preventDefault();
          handleAddCellBelow(activeCell.value || undefined, 'code');
          return;
        }

        // M — change to markdown
        if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          if (activeCell.value) handleChangeType(activeCell.value, 'markdown');
          return;
        }

        // Y — change to code
        if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          if (activeCell.value) handleChangeType(activeCell.value, 'code');
          return;
        }

        // D D — delete cell (press twice)
        if (e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          const now = Date.now();
          if (now - lastDTime.value < 800) {
            if (activeCell.value) {
              const idToDelete = activeCell.value;
              navigateCell('down');
              deleteCell(idToDelete);
              saveNotice.value = 'Cell deleted';
              setTimeout(() => { saveNotice.value = null; }, 1500);
            }
            lastDTime.value = 0;
          } else {
            lastDTime.value = now;
            saveNotice.value = 'Press D again to delete cell';
            setTimeout(() => { if (lastDTime.value === now) saveNotice.value = null; }, 900);
          }
          return;
        }

        // C — copy cell
        if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          if (activeCell.value) {
            const c = cells.value.find(item => item.id === activeCell.value);
            if (c) {
              clipboardCell.value = { ...c };
              saveNotice.value = 'Cell copied';
              setTimeout(() => { saveNotice.value = null; }, 1500);
            }
          }
          return;
        }

        // X — cut cell
        if (e.key === 'x' || e.key === 'X') {
          e.preventDefault();
          if (activeCell.value) {
            const c = cells.value.find(item => item.id === activeCell.value);
            if (c) {
              clipboardCell.value = { ...c };
              const idToDelete = activeCell.value;
              navigateCell('down');
              deleteCell(idToDelete);
              saveNotice.value = 'Cell cut';
              setTimeout(() => { saveNotice.value = null; }, 1500);
            }
          }
          return;
        }

        // V — paste cell below
        if (e.key === 'v' || e.key === 'V') {
          e.preventDefault();
          if (clipboardCell.value) {
            const newId = addCell(activeCell.value || undefined, clipboardCell.value.kind, 'below');
            const current = cells.value.map(c => c.id === newId ? { ...c, source: clipboardCell.value!.source } : c);
            applyCells(current);
            activeCell.value = newId;
            saveNotice.value = 'Cell pasted';
            setTimeout(() => { saveNotice.value = null; }, 1500);
          }
          return;
        }

        // J / ArrowDown — navigate down
        if (e.key === 'j' || e.key === 'J') {
          e.preventDefault();
          navigateCell('down');
          return;
        }

        // K / ArrowUp — navigate up
        if (e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          navigateCell('up');
          return;
        }

        // 1-6 — convert to Markdown heading
        if (/^[1-6]$/.test(e.key)) {
          e.preventDefault();
          if (activeCell.value) {
            const c = cells.value.find(item => item.id === activeCell.value);
            if (c) {
              const prefix = '#'.repeat(parseInt(e.key, 10)) + ' ';
              const cleanSource = c.source.replace(/^#+\s*/, '');
              const newSource = prefix + cleanSource;
              const current = cells.value.map(item => item.id === c.id ? { ...item, kind: 'markdown' as const, source: newSource } : item);
              applyCells(current);
              activeCell.value = c.id;
            }
          }
          return;
        }

        // H — keyboard shortcuts reference
        if (e.key === 'h' || e.key === 'H') {
          e.preventDefault();
          showShortcutsPage.value = true;
          return;
        }
      }
    }

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('.lessons-dropdown') && !target.closest('.shortcuts-modal')) {
        showLessons.value = false;
        showShortcutsModal.value = false;
      }
      // If clicking inside notebook cell body outside editor, ensure command mode
      if (target.closest('.cell') && !target.closest('.cm-editor') && target.tagName !== 'TEXTAREA') {
        notebookMode.value = 'command';
      }
    }

    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  function handleRun(id: string) {
    const targetCell = cells.value.find(c => c.id === id);
    if (targetCell && targetCell.kind === 'markdown') {
      if (editingMdCellId.value === id) {
        editingMdCellId.value = null;
      }
      return;
    }
    kernelBusy.value = true;
    const t0 = performance.now();
    try {
      const res = runCell(id);
      const durationMs = Math.round((performance.now() - t0) * 10) / 10;
      const success = res && !res.error && res.reason !== 'error';
      execInfoMap.value = {
        ...execInfoMap.value,
        [id]: { steps: res?.steps ?? 0, reason: res?.reason ?? '', durationMs, success }
      };
    } finally {
      refreshOutputs();
      kernelBusy.value = false;
    }
  }

  function handleRunAndAdvance(id: string) {
    handleRun(id);
    const list = cells.value;
    const idx = list.findIndex(c => c.id === id);
    if (idx >= 0 && idx < list.length - 1) {
      activeCell.value = list[idx + 1].id;
    } else {
      const newId = addCell(id, 'code', 'below');
      activeCell.value = newId;
    }
  }

  function handleRunAndInsert(id: string) {
    handleRun(id);
    const newId = addCell(id, 'code', 'below');
    activeCell.value = newId;
  }

  function handleRunUpTo(id: string) {
    kernelBusy.value = true;
    const t0 = performance.now();
    try {
      const res = runUpTo(id);
      const durationMs = Math.round((performance.now() - t0) * 10) / 10;
      const success = res && !res.error && res.reason !== 'error';
      execInfoMap.value = {
        ...execInfoMap.value,
        [id]: { steps: res?.steps ?? 0, reason: res?.reason ?? '', durationMs, success }
      };
    } finally {
      refreshOutputs();
      kernelBusy.value = false;
    }
  }

  function handleRunToCursor(id: string, line: number) {
    kernelBusy.value = true;
    const t0 = performance.now();
    try {
      const res = runToLine(id, line);
      const durationMs = Math.round((performance.now() - t0) * 10) / 10;
      const success = res && !res.error && res.reason !== 'error';
      execInfoMap.value = {
        ...execInfoMap.value,
        [id]: { steps: res?.steps ?? 0, reason: res?.reason ?? '', durationMs, success }
      };
    } finally {
      refreshOutputs();
      kernelBusy.value = false;
    }
  }

  function handleStep() {
    kernelBusy.value = true;
    const t0 = performance.now();
    try {
      const res = step();
      const durationMs = Math.round((performance.now() - t0) * 10) / 10;
      if (activeCell.value) {
        execInfoMap.value = {
          ...execInfoMap.value,
          [activeCell.value]: { steps: res?.steps ?? 1, reason: res?.reason ?? 'step', durationMs, success: true }
        };
      }
    } finally {
      refreshOutputs();
      kernelBusy.value = false;
    }
  }

  function handleRestart() {
    restart();
    applyCells(cells.value);
    outputMap.value = {};
    regDiffMap.value = {};
    execInfoMap.value = {};
    cursorCell.value = null;
    cursorLocalLine.value = null;
  }

  function handleAddCellBelow(afterId?: string, kind: 'code' | 'markdown' = 'code') {
    const newId = addCell(afterId, kind, 'below');
    activeCell.value = newId;
    if (kind === 'markdown') {
      editingMdCellId.value = newId;
    }
  }

  function handleAddCellAbove(beforeId?: string, kind: 'code' | 'markdown' = 'code') {
    const newId = addCell(beforeId, kind, 'above');
    activeCell.value = newId;
    if (kind === 'markdown') {
      editingMdCellId.value = newId;
    }
  }

  function handleChangeType(id: string, kind: 'code' | 'markdown') {
    changeCellType(id, kind);
    if (kind === 'markdown') {
      editingMdCellId.value = id;
    }
  }

  function handleSave() {
    autosave(cells.value);
    saveNotice.value = '✓ Saved';
    setTimeout(() => { saveNotice.value = null; }, 2000);
  }

  function handleClearOutput(id: string) {
    clearOutput(id);
    refreshOutputs();
  }

  function navigateCell(dir: 'up' | 'down') {
    const list = cells.value;
    if (list.length === 0) return;
    const idx = list.findIndex(c => c.id === activeCell.value);
    const next = dir === 'up'
      ? Math.max(0, idx - 1)
      : Math.min(list.length - 1, idx + 1);
    activeCell.value = list[next].id;
  }

  function handleRunAll() {
    restart();
    applyCells(cells.value);
    // Run each code cell sequentially
    for (const c of cells.value) {
      if (c.kind === 'code') {
        runCell(c.id);
      }
    }
    refreshOutputs();
  }

  function updateCells(updated: Cell[]) {
    applyCells(updated);
    autosave(updated);
  }

  function handleSourceChange(id: string, src: string) {
    const updated = cells.value.map(c =>
      c.id === id ? { ...c, source: src } : c
    );
    updateCells(updated);
  }

  function handleExport() {
    downloadNotebook(cells.value);
  }

  function handleShare() {
    const url = createShareURL(cells.value);
    if (url) {
      navigator.clipboard.writeText(url).then(() => {
        alert('Share URL copied to clipboard!');
      }).catch(() => {
        prompt('Copy this share URL:', url);
      });
    } else {
      alert('Notebook is too large to share via URL. Use Export instead.');
    }
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.asmnb,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const imported = importNotebook(reader.result as string);
        if (imported) {
          updateCells(imported);
        } else {
          alert('Invalid .asmnb file');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  async function handleLoadLesson(file: string) {
    showLessons.value = false;
    const loadedCells = await loadLesson(file);
    if (loadedCells) {
      updateCells(loadedCells);
    }
  }

  function refreshOutputs() {
    const out: Record<string, string> = {};
    const diffs: Record<string, Record<string, [number, number]>> = {};
    const infos: Record<string, { steps: number; reason: string; durationMs?: number; success?: boolean }> = {};
    const expects: Record<string, { results: any[]; allPassed: boolean }> = {};
    for (const c of cells.value) {
      const co = session.getOutput(c.id);
      if (co) {
        out[c.id] = co.text;
        if (co.regDiff && Object.keys(co.regDiff).length > 0) {
          diffs[c.id] = co.regDiff;
        }
        const prevInfo = execInfoMap.value[c.id];
        infos[c.id] = {
          steps: co.steps,
          reason: co.reason,
          durationMs: prevInfo?.durationMs,
          success: prevInfo?.success ?? (co.reason !== 'error'),
        };
        if (co.expectResults && co.expectResults.length > 0) {
          expects[c.id] = { results: co.expectResults, allPassed: co.allPassed };
        }
      }
    }
    // Clean up outputs for cells that were deleted, while retaining previous outputs for existing cells
    const validIds = new Set(cells.value.map(c => c.id));
    const mergedOut: Record<string, string> = {};
    const mergedDiffs: Record<string, Record<string, [number, number]>> = {};
    const mergedInfos: Record<string, { steps: number; reason: string; durationMs?: number; success?: boolean }> = {};
    const mergedExpects: Record<string, { results: any[]; allPassed: boolean }> = {};
    for (const id of validIds) {
      if (out[id] !== undefined) mergedOut[id] = out[id];
      else if (outputMap.value[id] !== undefined) mergedOut[id] = outputMap.value[id];

      if (diffs[id] !== undefined) mergedDiffs[id] = diffs[id];
      else if (regDiffMap.value[id] !== undefined) mergedDiffs[id] = regDiffMap.value[id];

      if (infos[id] !== undefined) mergedInfos[id] = infos[id];
      else if (execInfoMap.value[id] !== undefined) mergedInfos[id] = execInfoMap.value[id];

      if (expects[id] !== undefined) mergedExpects[id] = expects[id];
      else if (expectMap.value[id] !== undefined) mergedExpects[id] = expectMap.value[id];
    }
    outputMap.value = mergedOut;
    regDiffMap.value = mergedDiffs;
    execInfoMap.value = mergedInfos;
    expectMap.value = mergedExpects;

    // Code-cell offsets (parser numbers lines code-only; exclude markdown cells)
    const codeStarts: Record<string, number> = {};
    let lineAccum = 0;
    for (const c of cells.value) {
      if (c.kind === 'code') {
        codeStarts[c.id] = lineAccum;
        lineAccum += c.source.split('\n').length;
      }
    }

    const byCell: Record<string, { line: number | null; message: string }[]> = {};
    for (const pe of session.getParseErrors()) {
      if (!pe.cellId || !pe.message) continue;
      const start = codeStarts[pe.cellId];
      if (start == null) continue;
      const local = pe.line != null ? pe.line - start : null;
      byCell[pe.cellId] = byCell[pe.cellId] || [];
      byCell[pe.cellId].push({ line: local, message: pe.message });
    }
    const parsed: Record<string, FriendlyError[]> = {};
    for (const id of Object.keys(byCell)) {
      parsed[id] = friendlyErrors(byCell[id]);
    }
    parseMap.value = parsed;
  }

  return (
    <div class="app">
      <header class="app-header" role="banner">
        <span class={`kernel-status ${kernelBusy.value ? 'busy' : 'idle'}`} title={kernelBusy.value ? 'Kernel busy' : 'Kernel idle'}></span>
        <h1>ASMBOOK</h1>
        <span class="subtitle">8086 Assembly Notebook</span>
        <div class="header-actions">
          <div class="lessons-dropdown">
            <button class="btn btn-sm" onClick={() => { showLessons.value = !showLessons.value; }} aria-label="Load a lesson">Lessons</button>
            {showLessons.value && (
              <div class="lessons-menu" role="menu">
                {LESSONS.map(l => (
                  <button key={l.id} class="lessons-item" role="menuitem" onClick={() => handleLoadLesson(l.file)}>
                    {l.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button class="btn btn-sm" onClick={() => { if (confirm('Start a new notebook? Unsaved changes will be lost.')) { handleRestart(); applyCells(defaultCells()); outputMap.value = {}; } }} title="New notebook" aria-label="Create new notebook">New</button>
          <button class="btn btn-sm" onClick={handleImport} title="Import .asmnb file" aria-label="Import notebook file">Import</button>
          <button class="btn btn-sm" onClick={handleExport} title="Export .asmnb file" aria-label="Export notebook file">Export</button>
          <button class="btn btn-sm" onClick={handleShare} title="Copy share URL" aria-label="Share notebook via URL">Share</button>
          {Object.keys(outputMap.value).length > 0 && (
            <button class="btn btn-sm" onClick={() => { outputMap.value = {}; }} title="Clear all outputs" aria-label="Clear all cell outputs">Clear</button>
          )}
          <button
            class="btn btn-sm btn-theme"
            onClick={toggleTheme}
            title={`Switch to ${theme.value === 'dark' ? 'light' : 'dark'} mode`}
            aria-label="Toggle dark mode"
          >
            {theme.value === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>
      </header>

      {/* Classic Jupyter action toolbar */}
      <div class="notebook-toolbar" role="toolbar" aria-label="Notebook action toolbar">
        <div
          class={`mode-pill mode-${notebookMode.value}`}
          onClick={() => {
            notebookMode.value = notebookMode.value === 'command' ? 'edit' : 'command';
          }}
          title={`Notebook Mode: ${notebookMode.value.toUpperCase()} (Press Esc for Command, Enter for Edit)`}
        >
          {notebookMode.value.toUpperCase()}
        </div>
        <div class="tb-sep" />
        <button class="tb-btn" onClick={handleSave} title="Save notebook">
          <span class="tb-icon">💾</span> Save
        </button>
        <div class="tb-sep" />
        <button class="tb-btn" onClick={() => handleAddCellBelow(activeCell.value || undefined, 'code')} title="Insert Code cell below (Ctrl+B / B)">
          <span class="tb-icon">+</span> Code
        </button>
        <button class="tb-btn" onClick={() => handleAddCellBelow(activeCell.value || undefined, 'markdown')} title="Insert Markdown cell below">
          <span class="tb-icon">+</span> Markdown
        </button>
        <div class="tb-sep" />
        <button class="tb-btn tb-btn-run" onClick={() => { if (activeCell.value) handleRun(activeCell.value); }} title="Run selected cell (Ctrl+Enter)">
          <span class="tb-icon">▶</span> Run
        </button>
        <button class="tb-btn" onClick={handleStep} title="Step one instruction (F7)">
          <span class="tb-icon">↷</span> Step
        </button>
        <button class="tb-btn" onClick={handleRestart} title="Restart machine (Ctrl+R)">
          <span class="tb-icon">⟳</span> Restart
        </button>
        <button class="tb-btn" onClick={handleRunAll} title="Run all cells from top">
          <span class="tb-icon">⏩</span> Run All
        </button>
        <div class="tb-sep" />
        <select
          class="tb-select"
          value={cells.value.find(c => c.id === activeCell.value)?.kind || 'code'}
          onChange={(e) => {
            if (activeCell.value) handleChangeType(activeCell.value, (e.target as HTMLSelectElement).value as any);
          }}
          title="Change cell type (M/Y in command mode)"
        >
          <option value="code">Code</option>
          <option value="markdown">Markdown</option>
        </select>
        <div class="tb-sep" />
        <button
          class={`tb-btn ${sidebarTab.value === 'outline' ? 'tb-btn-active' : ''}`}
          onClick={() => { sidebarTab.value = sidebarTab.value === 'outline' ? 'inspector' : 'outline'; }}
          title="Toggle Table of Contents / Outline in sidebar"
        >
          <span class="tb-icon">📑</span> Outline
        </button>
        <button
          class={`tb-btn ${sidebarTab.value === 'calc' ? 'tb-btn-active' : ''}`}
          onClick={() => { sidebarTab.value = sidebarTab.value === 'calc' ? 'inspector' : 'calc'; }}
          title="Toggle 8086 Segment Address Calculator in sidebar"
        >
          <span class="tb-icon">🧮</span> Calc
        </button>
        <div class="tb-sep" />
        <button class="tb-btn tb-btn-help" onClick={() => { showShortcutsPage.value = true; }} title="Keyboard shortcuts & help (Shift+? / H)">
          <span class="tb-icon">⌨</span> Shortcuts
        </button>
        <button
          class="tb-btn tb-btn-theme"
          onClick={toggleTheme}
          title={`Switch to ${theme.value === 'dark' ? 'light' : 'dark'} mode`}
        >
          <span class="tb-icon">{theme.value === 'dark' ? '☀️' : '🌙'}</span> {theme.value === 'dark' ? 'Light' : 'Dark'}
        </button>
        {saveNotice.value && <span class="save-notice-badge">{saveNotice.value}</span>}
      </div>

      <div class="app-body">
        <main class="notebook" role="main" aria-label="Notebook cells">
          {/* Top divider to insert cell before the first cell */}
          {cells.value.length > 0 && (
            <div class="cell-divider top-divider">
              <div class="divider-line" />
              <div class="divider-actions">
                <button class="divider-btn" onClick={() => handleAddCellAbove(cells.value[0]?.id, 'code')} title="Insert code cell at top">+ Code</button>
                <button class="divider-btn" onClick={() => handleAddCellAbove(cells.value[0]?.id, 'markdown')} title="Insert markdown cell at top">+ Markdown</button>
              </div>
            </div>
          )}

          {cells.value.map((cell, idx) => (
            <div key={cell.id} class="cell-wrapper-item">
              <CellView
                cell={cell}
                index={idx}
                execCount={getExecCount(cell.id)}
                output={outputMap.value[cell.id] || ''}
                regDiff={regDiffMap.value[cell.id] || null}
                steps={execInfoMap.value[cell.id]?.steps ?? null}
                reason={execInfoMap.value[cell.id]?.reason ?? null}
                durationMs={execInfoMap.value[cell.id]?.durationMs ?? null}
                execSuccess={execInfoMap.value[cell.id]?.success ?? null}
                expectResults={expectMap.value[cell.id] || null}
                parseErrors={parseMap.value[cell.id] || null}
                isActive={activeCell.value === cell.id}
                cursorLine={cursorCell.value === cell.id ? cursorLocalLine.value : null}
                isFirst={idx === 0}
                isLast={idx === cells.value.length - 1}
                isEditingMd={editingMdCellId.value === cell.id}
                onSetEditingMd={(editing) => {
                  editingMdCellId.value = editing ? cell.id : null;
                  if (editing) notebookMode.value = 'edit';
                }}
                onRun={() => handleRun(cell.id)}
                onRunAndAdvance={() => handleRunAndAdvance(cell.id)}
                onRunAndInsert={() => handleRunAndInsert(cell.id)}
                onRunUpTo={() => handleRunUpTo(cell.id)}
                onRunToCursor={(line: number) => handleRunToCursor(cell.id, line)}
                onFocus={() => { activeCell.value = cell.id; }}
                onSourceChange={(src: string) => handleSourceChange(cell.id, src)}
                onMoveUp={() => moveCell(cell.id, 'up')}
                onMoveDown={() => moveCell(cell.id, 'down')}
                onCopy={() => copyCell(cell.id)}
                onDelete={() => deleteCell(cell.id)}
                onAddAfter={() => handleAddCellBelow(cell.id, 'code')}
                onAddMarkdown={() => handleAddCellBelow(cell.id, 'markdown')}
                onAddAbove={() => handleAddCellAbove(cell.id, 'code')}
                onAddBelow={() => handleAddCellBelow(cell.id, 'code')}
                onChangeType={(kind) => handleChangeType(cell.id, kind)}
                onClearOutput={() => handleClearOutput(cell.id)}
              />
              {/* Between-cell hover divider for mouse insertion */}
              <div class="cell-divider">
                <div class="divider-line" />
                <div class="divider-actions">
                  <button class="divider-btn" onClick={() => handleAddCellBelow(cell.id, 'code')} title="Insert code cell below">+ Code</button>
                  <button class="divider-btn" onClick={() => handleAddCellBelow(cell.id, 'markdown')} title="Insert markdown cell below">+ Markdown</button>
                </div>
              </div>
            </div>
          ))}

          {cells.value.length === 0 && (
            <div class="empty-state" role="note" aria-label="Empty notebook">
              <p>No cells yet. Click <strong>+ Code</strong> below or load a <strong>Lesson</strong> to get started.</p>
              <button class="btn btn-sm" onClick={() => handleAddCellBelow(undefined, 'code')}>+ New Cell</button>
            </div>
          )}

          <div class="notebook-bottom-bar">
            <button class="btn btn-add-cell" onClick={() => handleAddCellBelow(cells.value[cells.value.length - 1]?.id, 'code')} title="Insert code cell at end">+ Code Cell</button>
            <button class="btn btn-add-md" onClick={() => handleAddCellBelow(cells.value[cells.value.length - 1]?.id, 'markdown')} title="Insert markdown cell at end">+ Markdown Cell</button>
            <span class="footer-hint"><kbd>Ctrl+Enter</kbd> run &middot; <kbd>Shift+Enter</kbd> run &amp; advance &middot; <kbd>A/B</kbd> add cell &middot; <kbd>Shift+?</kbd> shortcuts</span>
          </div>
        </main>
        {/* Draggable Splitter between Notebook and Sidebar */}
        <div
          class={`layout-splitter ${isDraggingSplitter.value ? 'dragging' : ''}`}
          onPointerDown={handleSplitterPointerDown}
          onMouseDown={(e) => e.preventDefault()}
          onDblClick={handleResetSplitter}
          title="Drag to resize inspector panel (Double-click to reset)"
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={sidebarWidth.value}
          aria-label="Resize sidebar"
        >
          <div class="splitter-line" />
        </div>
        <aside
          ref={sidebarRef}
          class="sidebar"
          role="complementary"
          aria-label="Machine state and tools"
          style={{ width: `${sidebarWidth.value}px`, minWidth: `${sidebarWidth.value}px`, maxWidth: `${sidebarWidth.value}px` }}
        >
          <div class="sidebar-tab-bar" role="tablist">
            <button
              role="tab"
              aria-selected={sidebarTab.value === 'inspector'}
              class={`sidebar-tab-btn ${sidebarTab.value === 'inspector' ? 'active' : ''}`}
              onClick={() => { sidebarTab.value = 'inspector'; }}
              title="CPU Registers, Flags, Stack & Text Screen"
            >
              ⚙ Inspector
            </button>
            <button
              role="tab"
              aria-selected={sidebarTab.value === 'outline'}
              class={`sidebar-tab-btn ${sidebarTab.value === 'outline' ? 'active' : ''}`}
              onClick={() => { sidebarTab.value = 'outline'; }}
              title="Table of Contents / Lesson Outline"
            >
              📑 Outline
            </button>
            <button
              role="tab"
              aria-selected={sidebarTab.value === 'calc'}
              class={`sidebar-tab-btn ${sidebarTab.value === 'calc' ? 'active' : ''}`}
              onClick={() => { sidebarTab.value = 'calc'; }}
              title="8086 Segment Arithmetic & Effective Address Calculator"
            >
              🧮 Address Calc
            </button>
          </div>

          <div class="sidebar-tab-body">
            {sidebarTab.value === 'inspector' && (
              <>
                <MachinePanel state={machine.value} />
                <MemoryPanel
                  sp={machine.value?.regs?.SP ?? null}
                />
                <TextScreen />
              </>
            )}
            {sidebarTab.value === 'outline' && (
              <NotebookOutline
                cells={cells.value}
                activeCellId={activeCell.value}
                onSelectCell={(id) => { activeCell.value = id; }}
              />
            )}
            {sidebarTab.value === 'calc' && (
              <AddressCalculator
                regs={machine.value?.regs}
                onNavigateMem={(_addr) => {
                  sidebarTab.value = 'inspector';
                }}
              />
            )}
          </div>
          <div class="controls" role="group" aria-label="Execution controls">
            <button onClick={handleRunAll} class="btn btn-runall" title="Run all cells from top" aria-label="Run all cells">▶▶ Run All</button>
            <button onClick={handleStep} class="btn btn-step" title="Step (F7)" aria-label="Step one instruction">Step <kbd>F7</kbd></button>
            <button onClick={handleRestart} class="btn btn-restart" title="Restart (Ctrl+R)" aria-label="Restart machine">Restart <kbd>Ctrl+R</kbd></button>
          </div>
          <div class="shortcuts-hint" role="note" aria-label="Keyboard shortcuts">
            <kbd>Ctrl+Enter</kbd> run &middot; <kbd>F7</kbd> step &middot; <kbd>Ctrl+↑↓</kbd> navigate &middot; <kbd>Ctrl+R</kbd> restart &middot; <kbd>Shift+?</kbd> shortcuts
          </div>
          <div class="status-bar" role="status" aria-label="Notebook status">
            <span>{cells.value.length} cell{cells.value.length !== 1 ? 's' : ''}</span>
            <span>{session.instrCount} instruction{session.instrCount !== 1 ? 's' : ''}</span>
          </div>
          {showShortcutsModal.value && (
            <div class="shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-modal-title">
              <div class="shortcuts-modal-content">
                <h2 id="shortcuts-modal-title" class="shortcuts-modal-title">Keyboard Shortcuts</h2>
                <button class="shortcuts-modal-close" onClick={() => { showShortcutsModal.value = false; }} aria-label="Close shortcuts modal">✕</button>
                <ul class="shortcuts-modal-list">
                  <li><kbd>Ctrl+Enter</kbd> — Run code / Render markdown in place</li>
                  <li><kbd>Shift+Enter</kbd> — Run/Render & advance (or insert cell)</li>
                  <li><kbd>Alt+Enter</kbd> — Run/Render & insert cell below</li>
                  <li><kbd>Enter</kbd> — Edit selected markdown cell</li>
                  <li><kbd>Esc</kbd> — Render markdown / close modal</li>
                  <li><kbd>Ctrl+B</kbd> — Insert new code cell below</li>
                  <li><kbd>Ctrl+M</kbd> — Toggle Code / Markdown</li>
                  <li><kbd>F7</kbd> — Step one instruction</li>
                  <li><kbd>Ctrl+↑↓</kbd> — Navigate cells up/down</li>
                  <li><kbd>Ctrl+R</kbd> — Restart machine</li>
                  <li><kbd>Shift+?</kbd> — Open full shortcuts & help guide</li>
                </ul>
              </div>
            </div>
          )}
          {showShortcutsPage.value && (
            <ShortcutsPage onClose={() => { showShortcutsPage.value = false; }} />
          )}
        </aside>
      </div>
    </div>
  );
}
