import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import {
  defaultCells, showcaseGcdCells, applyCells, runCell, runUpTo, runToLine, step, restart,
  getCellLocalLine, session, machine, cells, selectedMemAddr, memRevision,
  moveCell, deleteCells, pasteCells, addCell, changeCellType, clearOutput, clearAllOutputs,
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
  const execInfoMap = useSignal<Record<string, { steps: number; reason: string; durationMs?: number; success?: boolean; error?: string }>>({});
  const expectMap = useSignal<Record<string, { results: any[]; allPassed: boolean }>>({});
  const parseMap = useSignal<Record<string, FriendlyError[]>>({});
  const activeCell = useSignal<string | null>(cells.value.find(c => c.kind === 'code')?.id || cells.value[0]?.id || null);
  const selectedCellIds = useSignal<string[]>([cells.value.find(c => c.kind === 'code')?.id || cells.value[0]?.id || '']);
  const selectionOrder = useSignal<string[]>([cells.value.find(c => c.kind === 'code')?.id || cells.value[0]?.id || '']);
  const anchorCellId = useSignal<string | null>(activeCell.value);
  const clipboardCells = useSignal<Cell[]>([]);
  const pendingFocusCellId = useSignal<string | null>(null);
  const cursorCell = useSignal<string | null>(null);
  const cursorLocalLine = useSignal<number | null>(null);
  const loaded = useSignal(false);
  const showLessons = useSignal(false);
  const showShortcutsPage = useSignal(false);
  const kernelBusy = useSignal(false);
  const saveNotice = useSignal<string | null>(null);
  const toastMessage = useSignal<string | null>(null);
  const toastTimerRef = useRef<any>(null);

  function showToast(msg: string) {
    toastMessage.value = msg;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      toastMessage.value = null;
    }, 2800);
  }

  const sidebarTab = useSignal<'inspector' | 'outline' | 'calc'>('inspector');
  const notebookMode = useSignal<'command' | 'edit'>('command');
  const clipboardCell = useSignal<Cell | null>(null);
  const lastDTime = useSignal<number>(0);
  const savedTheme = (typeof localStorage !== 'undefined' && localStorage.getItem('asmbook_theme')) ||
    (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const theme = useSignal<'light' | 'dark'>(savedTheme === 'dark' ? 'dark' : 'light');

  // Draggable sidebar state
  const initialSidebarWidth = (() => {
    try {
      const saved = localStorage.getItem('asmbook_sidebar_width');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 240 && val <= 900) return val;
      }
    } catch {}
    return 360;
  })();
  const sidebarWidth = useSignal<number>(initialSidebarWidth);
  const isDraggingSplitter = useSignal(false);
  const editingMdCellId = useSignal<string | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  function handleSplitterPointerDown(e: any) {
    if (e.button !== 0) return;
    e.preventDefault();
    isDraggingSplitter.value = true;
    document.body.classList.add('is-resizing');

    const startX = e.clientX;
    const startWidth = typeof sidebarWidth.value === 'number' && !isNaN(sidebarWidth.value) ? sidebarWidth.value : 360;

    function onMove(ev: MouseEvent | PointerEvent) {
      const delta = startX - ev.clientX; // Dragging left widens the sidebar
      const minW = 240;
      const maxW = Math.min(900, Math.floor(window.innerWidth * 0.75));
      const newWidth = Math.round(Math.max(minW, Math.min(maxW, startWidth + delta)));
      sidebarWidth.value = newWidth;
      if (sidebarRef.current) {
        sidebarRef.current.style.width = `${newWidth}px`;
        sidebarRef.current.style.minWidth = `${newWidth}px`;
        sidebarRef.current.style.maxWidth = `${newWidth}px`;
      }
    }

    function onUp() {
      isDraggingSplitter.value = false;
      document.body.classList.remove('is-resizing');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      try {
        localStorage.setItem('asmbook_sidebar_width', String(sidebarWidth.value));
      } catch {}
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
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
  useEffect(() => {
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
  }, []);

  // Refresh outputs when machine state changes
  useEffect(() => {
    return machine.subscribe((st) => {
      refreshOutputs();
      if (st?.cursor?.cellId && st?.cursor?.line != null) {
        cursorCell.value = st.cursor.cellId;
        cursorLocalLine.value = getCellLocalLine(st.cursor.cellId, st.cursor.line);
      } else {
        cursorCell.value = null;
        cursorLocalLine.value = null;
      }
    });
  }, []);

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
        if (showLessons.value || showShortcutsPage.value) {
          showLessons.value = false;
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

      // Ctrl+C / Cmd+C — copy selected cell(s)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C') && !e.shiftKey && !e.altKey) {
        const textSelection = window.getSelection()?.toString();
        if (!textSelection || selectedCellIds.value.length > 1 || !inInput) {
          e.preventDefault();
          handleCopyCells();
          return;
        }
      }

      // Ctrl+V / Cmd+V — paste cell(s) when not editing text
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V') && !inInput && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handlePasteCells();
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
            handleDeleteCells();
            lastDTime.value = 0;
          } else {
            lastDTime.value = now;
            saveNotice.value = selectedCellIds.value.length > 1
              ? `Press D again to delete ${selectedCellIds.value.length} cells`
              : 'Press D again to delete cell';
            setTimeout(() => { if (lastDTime.value === now) saveNotice.value = null; }, 900);
          }
          return;
        }

        // C — copy cell(s)
        if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          handleCopyCells();
          return;
        }

        // X — cut cell(s)
        if (e.key === 'x' || e.key === 'X') {
          e.preventDefault();
          handleCopyCells();
          handleDeleteCells();
          return;
        }

        // V — paste cell(s) below
        if (e.key === 'v' || e.key === 'V') {
          e.preventDefault();
          handlePasteCells();
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
      if (!target.closest('.lessons-dropdown')) {
        showLessons.value = false;
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
        [id]: { steps: res?.steps ?? 0, reason: res?.reason ?? '', durationMs, success, error: res?.error }
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
        [id]: { steps: res?.steps ?? 0, reason: res?.reason ?? '', durationMs, success, error: res?.error }
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
        [id]: { steps: res?.steps ?? 0, reason: res?.reason ?? '', durationMs, success, error: res?.error }
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
          [activeCell.value]: { steps: res?.steps ?? 1, reason: res?.reason ?? 'step', durationMs, success: !res?.error && res?.reason !== 'error', error: res?.error }
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
    if (cells.value.length > 0) {
      const firstId = cells.value[0].id;
      activeCell.value = firstId;
      selectedCellIds.value = [firstId];
      selectionOrder.value = [firstId];
      anchorCellId.value = firstId;
    }
  }

  function focusNewCell(cellId: string, kind: 'code' | 'markdown' = 'code') {
    activeCell.value = cellId;
    selectedCellIds.value = [cellId];
    selectionOrder.value = [cellId];
    anchorCellId.value = cellId;
    notebookMode.value = 'edit';
    if (kind === 'markdown') {
      editingMdCellId.value = cellId;
    }
    pendingFocusCellId.value = cellId;

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const doFocus = () => {
      const cellEl = document.getElementById(cellId);
      if (!cellEl) return false;
      cellEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      if (kind === 'code') {
        const cm = cellEl.querySelector('.cm-content') as HTMLElement;
        if (cm) {
          cm.focus();
          return true;
        }
      } else {
        const ta = cellEl.querySelector('textarea.md-editor') as HTMLTextAreaElement;
        if (ta) {
          ta.focus();
          return true;
        }
      }
      return false;
    };

    if (doFocus()) return;
    requestAnimationFrame(() => {
      if (doFocus()) return;
      setTimeout(() => {
        if (doFocus()) return;
        setTimeout(doFocus, 50);
      }, 30);
    });
  }

  function handleAddCellBelow(afterId?: string, kind: 'code' | 'markdown' = 'code') {
    const newId = addCell(afterId, kind, 'below');
    focusNewCell(newId, kind);
  }

  function handleAddCellAbove(beforeId?: string, kind: 'code' | 'markdown' = 'code') {
    const newId = addCell(beforeId, kind, 'above');
    focusNewCell(newId, kind);
  }

  function handleCellSelect(cellId: string, e?: MouseEvent) {
    if (e && e.shiftKey) {
      e.preventDefault();
      // Shift+Click: Multi-cell range selection or ordered addition
      const list = cells.value;
      const anchor = anchorCellId.value || activeCell.value;
      const anchorIdx = anchor ? list.findIndex(c => c.id === anchor) : -1;
      const targetIdx = list.findIndex(c => c.id === cellId);

      if (anchorIdx >= 0 && targetIdx >= 0 && anchorIdx !== targetIdx) {
        // Range selection respecting shift-click direction
        const step = anchorIdx < targetIdx ? 1 : -1;
        const orderedRange: string[] = [];
        for (let i = anchorIdx; i !== targetIdx + step; i += step) {
          orderedRange.push(list[i].id);
        }
        selectedCellIds.value = orderedRange;
        selectionOrder.value = orderedRange;
        activeCell.value = cellId;
      } else {
        // Single toggle with shift
        if (!selectedCellIds.value.includes(cellId)) {
          const newOrder = [...selectionOrder.value, cellId];
          selectionOrder.value = newOrder;
          selectedCellIds.value = newOrder;
        } else {
          const newOrder = selectionOrder.value.filter(id => id !== cellId);
          selectionOrder.value = newOrder.length > 0 ? newOrder : [cellId];
          selectedCellIds.value = selectionOrder.value;
        }
        activeCell.value = cellId;
        anchorCellId.value = cellId;
      }
      notebookMode.value = 'command';
    } else if (e && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      // Ctrl+Click: Toggle individual cell selection
      if (selectedCellIds.value.includes(cellId)) {
        if (selectedCellIds.value.length > 1) {
          const newOrder = selectionOrder.value.filter(id => id !== cellId);
          selectionOrder.value = newOrder;
          selectedCellIds.value = newOrder;
          if (activeCell.value === cellId) activeCell.value = newOrder[0];
        }
      } else {
        const newOrder = [...selectionOrder.value, cellId];
        selectionOrder.value = newOrder;
        selectedCellIds.value = newOrder;
        activeCell.value = cellId;
        anchorCellId.value = cellId;
      }
      notebookMode.value = 'command';
    } else {
      // Normal click: single selection
      selectedCellIds.value = [cellId];
      selectionOrder.value = [cellId];
      activeCell.value = cellId;
      anchorCellId.value = cellId;
    }
  }

  function handleCopyCells(targetId?: string) {
    let order = selectionOrder.value;
    if (targetId && !selectedCellIds.value.includes(targetId)) {
      order = [targetId];
      selectedCellIds.value = [targetId];
      selectionOrder.value = [targetId];
      activeCell.value = targetId;
      anchorCellId.value = targetId;
    }
    if (order.length === 0 && activeCell.value) {
      order = [activeCell.value];
    }
    if (order.length === 0) return;

    const orderedCells = order
      .map(id => cells.value.find(c => c.id === id))
      .filter((c): c is Cell => c !== undefined);

    if (orderedCells.length === 0) return;

    clipboardCells.value = orderedCells.map(c => ({ ...c }));
    clipboardCell.value = { ...orderedCells[0] };

    const combinedText = orderedCells.map(c => c.source).join('\n\n');
    try {
      navigator.clipboard.writeText(combinedText);
    } catch {}

    saveNotice.value = orderedCells.length === 1
      ? '✓ Cell copied'
      : `✓ Copied ${orderedCells.length} cells in shift-click order`;
    setTimeout(() => { saveNotice.value = null; }, 2000);
  }

  function handlePasteCells(afterId?: string) {
    const toPaste = clipboardCells.value.length > 0
      ? clipboardCells.value
      : (clipboardCell.value ? [clipboardCell.value] : []);

    if (toPaste.length === 0) return;

    const targetAfter = afterId || activeCell.value || undefined;
    const newIds = pasteCells(targetAfter, toPaste.map(c => ({ kind: c.kind, source: c.source })));

    if (newIds.length > 0) {
      const lastId = newIds[newIds.length - 1];
      selectedCellIds.value = newIds;
      selectionOrder.value = newIds;
      activeCell.value = lastId;
      anchorCellId.value = lastId;
    }

    saveNotice.value = toPaste.length === 1
      ? '✓ Cell pasted'
      : `✓ Pasted ${toPaste.length} cells`;
    setTimeout(() => { saveNotice.value = null; }, 2000);
  }

  function handleDeleteCells(targetId?: string) {
    let ids = selectedCellIds.value;
    if (targetId && !ids.includes(targetId)) {
      ids = [targetId];
    }
    if (ids.length === 0 && activeCell.value) {
      ids = [activeCell.value];
    }
    if (ids.length === 0) return;

    deleteCells(ids);
    const remaining = cells.value;
    const nextActive = remaining[0]?.id || null;
    selectedCellIds.value = nextActive ? [nextActive] : [];
    selectionOrder.value = nextActive ? [nextActive] : [];
    activeCell.value = nextActive;
    anchorCellId.value = nextActive;

    saveNotice.value = ids.length === 1 ? 'Cell deleted' : `Deleted ${ids.length} cells`;
    setTimeout(() => { saveNotice.value = null; }, 1500);
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

  function handleClearAllOutputs() {
    clearAllOutputs();
    outputMap.value = {};
    regDiffMap.value = {};
    execInfoMap.value = {};
    expectMap.value = {};
    refreshOutputs();
    showToast('🧹 Cleared all cell outputs');
  }

  function navigateCell(dir: 'up' | 'down') {
    const list = cells.value;
    if (list.length === 0) return;
    const idx = list.findIndex(c => c.id === activeCell.value);
    const next = dir === 'up'
      ? Math.max(0, idx - 1)
      : Math.min(list.length - 1, idx + 1);
    const nextId = list[next].id;
    activeCell.value = nextId;
    selectedCellIds.value = [nextId];
    selectionOrder.value = [nextId];
    anchorCellId.value = nextId;
  }

  function handleRunAll() {
    restart();
    applyCells(cells.value);
    kernelBusy.value = true;
    try {
      const newExecInfos: Record<string, { steps: number; reason: string; durationMs?: number; success?: boolean; error?: string }> = {};
      for (const c of cells.value) {
        if (c.kind === 'code') {
          const t0 = performance.now();
          const res = runCell(c.id);
          const durationMs = Math.round((performance.now() - t0) * 10) / 10;
          const success = res && !res.error && res.reason !== 'error';
          newExecInfos[c.id] = { steps: res?.steps ?? 0, reason: res?.reason ?? '', durationMs, success, error: res?.error };
        }
      }
      execInfoMap.value = newExecInfos;
    } finally {
      refreshOutputs();
      kernelBusy.value = false;
    }
  }

  const autosaveTimerRef = useRef<any>(null);

  function updateCells(updated: Cell[]) {
    applyCells(updated);
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosave(updated);
    }, 350);
  }

  function handleSourceChange(id: string, src: string) {
    const updated = cells.value.map(c =>
      c.id === id ? { ...c, source: src } : c
    );
    updateCells(updated);
  }

  function handleExport() {
    downloadNotebook(cells.value);
    showToast('📥 Exported notebook (.asmnb)');
  }

  function handleShare() {
    const url = createShareURL(cells.value);
    if (url) {
      try {
        const hashIdx = url.indexOf('#');
        if (hashIdx >= 0) {
          window.location.hash = url.substring(hashIdx);
        }
      } catch { /* ignore */ }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          showToast('📋 Share link copied to clipboard!');
        }).catch(() => {
          showToast('📋 Share link generated in URL address bar!');
        });
      } else {
        showToast('📋 Share link generated in URL address bar!');
      }
    } else {
      showToast('⚠️ Notebook is too large to share via URL. Use Export instead.');
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
      handleRestart();
      updateCells(loadedCells);
      outputMap.value = {};
    }
  }

  function handleLoadShowcase() {
    showLessons.value = false;
    handleRestart();
    updateCells(showcaseGcdCells());
    outputMap.value = {};
  }

  function refreshOutputs() {
    const out: Record<string, string> = {};
    const diffs: Record<string, Record<string, [number, number]>> = {};
    const infos: Record<string, { steps: number; reason: string; durationMs?: number; success?: boolean; error?: string }> = {};
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
          error: co.error ?? prevInfo?.error,
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
    const mergedInfos: Record<string, { steps: number; reason: string; durationMs?: number; success?: boolean; error?: string }> = {};
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
    <div class="app" data-theme={theme.value}>
      <header class="app-header" role="banner">
        <span class={`kernel-status ${kernelBusy.value ? 'busy' : 'idle'}`} title={kernelBusy.value ? 'Kernel busy' : 'Kernel idle'}></span>
        <h1>ASMBOOK</h1>
        <span class="subtitle">8086 Assembly Notebook</span>
        <div class="header-actions">
          <div class="lessons-dropdown">
            <button class="btn btn-sm" onClick={() => { showLessons.value = !showLessons.value; }} aria-label="Load a lesson">Lessons</button>
            {showLessons.value && (
              <div class="lessons-menu" role="menu">
                <button class="lessons-item" role="menuitem" onClick={handleLoadShowcase} style="color: #60a5fa; font-weight: 600;">
                  ✨ Demo: Euclidean GCD
                </button>
                <div style="height: 1px; background: rgba(255,255,255,0.1); margin: 4px 0;" />
                {LESSONS.map(l => (
                  <button key={l.id} class="lessons-item" role="menuitem" onClick={() => handleLoadLesson(l.file)}>
                    {l.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button class="btn btn-sm" onClick={handleLoadShowcase} title="Load interactive Euclidean GCD demo notebook for screenshots" style="background: rgba(59, 130, 246, 0.2); border-color: #3b82f6; color: #93c5fd; font-weight: 500;">✨ Demo GCD</button>
          <button class="btn btn-sm" onClick={() => { if (confirm('Start a new notebook? Unsaved changes will be lost.')) { handleRestart(); applyCells(defaultCells()); outputMap.value = {}; } }} title="New notebook" aria-label="Create new notebook">New</button>
          <button class="btn btn-sm" onClick={handleImport} title="Import .asmnb file" aria-label="Import notebook file">Import</button>
          <button class="btn btn-sm" onClick={handleExport} title="Export .asmnb file" aria-label="Export notebook file">Export</button>
          <button class="btn btn-sm" onClick={handleShare} title="Copy share URL" aria-label="Share notebook via URL">Share</button>
          {(Object.keys(outputMap.value).length > 0 || Object.keys(regDiffMap.value).length > 0) && (
            <button class="btn btn-sm" onClick={handleClearAllOutputs} title="Clear all outputs" aria-label="Clear all cell outputs">Clear</button>
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
        <button
          class="tb-btn"
          onClick={() => handleCopyCells()}
          title={selectedCellIds.value.length > 1
            ? `Copy ${selectedCellIds.value.length} selected cells in shift-click order (Ctrl+C / C)`
            : 'Copy selected cell (Ctrl+C / C)'}
        >
          <span class="tb-icon">📋</span> Copy
        </button>
        <button
          class="tb-btn"
          onClick={() => handlePasteCells()}
          title="Paste copied cell(s) below (Ctrl+V / V)"
        >
          <span class="tb-icon">📄</span> Paste
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

          {cells.value.map((cell, idx) => {
            const isSelected = selectedCellIds.value.includes(cell.id);
            const orderIdx = selectionOrder.value.indexOf(cell.id);
            const selectionOrderNumber = orderIdx >= 0 ? orderIdx + 1 : null;
            return (
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
                  error={execInfoMap.value[cell.id]?.error ?? null}
                  expectResults={expectMap.value[cell.id] || null}
                  parseErrors={parseMap.value[cell.id] || null}
                  isActive={activeCell.value === cell.id}
                  isSelected={isSelected}
                  selectionOrderNumber={selectionOrderNumber}
                  totalSelectedCount={selectedCellIds.value.length}
                  shouldFocus={pendingFocusCellId.value === cell.id}
                  onFocused={() => {
                    if (pendingFocusCellId.value === cell.id) {
                      pendingFocusCellId.value = null;
                    }
                  }}
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
                  onFocus={() => {
                    if (selectedCellIds.value.length <= 1) {
                      activeCell.value = cell.id;
                      selectedCellIds.value = [cell.id];
                      selectionOrder.value = [cell.id];
                      anchorCellId.value = cell.id;
                    }
                    notebookMode.value = 'edit';
                  }}
                  onSelect={(e) => handleCellSelect(cell.id, e)}
                  onSourceChange={(src: string) => handleSourceChange(cell.id, src)}
                  onMoveUp={() => moveCell(cell.id, 'up')}
                  onMoveDown={() => moveCell(cell.id, 'down')}
                  onCopy={() => handleCopyCells(cell.id)}
                  onDelete={() => handleDeleteCells(cell.id)}
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
            );
          })}

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
          onMouseDown={handleSplitterPointerDown}
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
                  revision={memRevision.value}
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
                onNavigateMem={(addr) => {
                  selectedMemAddr.value = addr;
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
          {showShortcutsPage.value && (
            <ShortcutsPage onClose={() => { showShortcutsPage.value = false; }} />
          )}
        </aside>
      </div>

      {toastMessage.value && (
        <div class="asmbook-toast" role="status" aria-live="polite">
          {toastMessage.value}
        </div>
      )}
    </div>
  );
}
