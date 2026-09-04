import { useSignal, useSignalEffect } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import {
  defaultCells, applyCells, runCell, runUpTo, step, restart,
  getCellLocalLine, session, machine,
  moveCell, copyCell, deleteCell, addCell, clearOutput
} from './store.js';
import { autosave, loadAutosave, downloadNotebook, importNotebook, createShareURL, loadFromShareURL, clearShareHash } from '../kernel/storage.js';
import { LESSONS, loadLesson } from '../kernel/lessons.js';
import { CellView } from './cell.js';
import { MachinePanel } from './machine.js';
import { MemoryPanel } from './memory.js';
import { TextScreen } from './textscreen.js';
import type { Cell } from '../kernel/session.js';

export function App() {
  const cells = useSignal<Cell[]>(defaultCells());
  const outputMap = useSignal<Record<string, string>>({});
  const activeCell = useSignal<string | null>(null);
  const cursorCell = useSignal<string | null>(null);
  const cursorLocalLine = useSignal<number | null>(null);
  const loaded = useSignal(false);
  const showLessons = useSignal(false);

  // Load autosave on mount (share URL takes priority)
  useSignalEffect(() => {
    if (loaded.value) return;
    const shared = loadFromShareURL();
    if (shared) {
      cells.value = shared;
      applyCells(shared);
      clearShareHash();
      loaded.value = true;
      return;
    }
    loadAutosave().then(saved => {
      if (saved) {
        cells.value = saved;
        applyCells(saved);
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

  // Global keyboard shortcuts + click-outside for lessons dropdown
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      // Ctrl+Enter / Cmd+Enter — run focused cell
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (activeCell.value) handleRun(activeCell.value);
      }
      // Ctrl+R / Cmd+R — restart (prevent page reload)
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        handleRestart();
      }
      // F7 — step
      if (e.key === 'F7') {
        e.preventDefault();
        handleStep();
      }
      // Escape — close lessons dropdown
      if (e.key === 'Escape') {
        showLessons.value = false;
      }
    }
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('.lessons-dropdown')) {
        showLessons.value = false;
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
    runCell(id);
    refreshOutputs();
  }

  function handleRunUpTo(id: string) {
    runUpTo(id);
    refreshOutputs();
  }

  function handleStep() {
    step();
    refreshOutputs();
  }

  function handleRestart() {
    restart();
    applyCells(cells.value);
    outputMap.value = {};
    cursorCell.value = null;
    cursorLocalLine.value = null;
  }

  function handleMoveCell(id: string, dir: 'up' | 'down') {
    moveCell(id, dir);
  }

  function handleCopyCell(id: string) {
    copyCell(id);
  }

  function handleDeleteCell(id: string) {
    deleteCell(id);
  }

  function handleAddCell(afterId: string) {
    addCell(afterId);
  }

  function handleClearOutput(id: string) {
    clearOutput(id);
    refreshOutputs();
  }

  function updateCells(updated: Cell[]) {
    cells.value = updated;
    applyCells(updated);
    autosave(updated); // autosave on every edit
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
    const cells = await loadLesson(file);
    if (cells) {
      updateCells(cells);
    }
  }

  function refreshOutputs() {
    const out: Record<string, string> = {};
    for (const c of cells.value) {
      const co = session.getOutput(c.id);
      if (co) out[c.id] = co.text;
    }
    outputMap.value = out;
  }

  return (
    <div class="app">
      <header class="app-header" role="banner">
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
          <button class="btn btn-sm" onClick={() => { if (confirm('Start a new notebook? Unsaved changes will be lost.')) { handleRestart(); cells.value = defaultCells(); applyCells(cells.value); outputMap.value = {}; } }} title="New notebook" aria-label="Create new notebook">New</button>
          <button class="btn btn-sm" onClick={handleImport} title="Import .asmnb file" aria-label="Import notebook file">Import</button>
          <button class="btn btn-sm" onClick={handleExport} title="Export .asmnb file" aria-label="Export notebook file">Export</button>
          <button class="btn btn-sm" onClick={handleShare} title="Copy share URL" aria-label="Share notebook via URL">Share</button>
        </div>
      </header>
      <div class="app-body">
        <main class="notebook" role="main" aria-label="Notebook cells">
          {cells.value.map((cell, idx) => (
            <CellView
              key={cell.id}
              cell={cell}
              output={outputMap.value[cell.id] || ''}
              isActive={activeCell.value === cell.id}
              cursorLine={cursorCell.value === cell.id ? cursorLocalLine.value : null}
              isFirst={idx === 0}
              isLast={idx === cells.value.length - 1}
              onRun={() => handleRun(cell.id)}
              onRunUpTo={() => handleRunUpTo(cell.id)}
              onFocus={() => { activeCell.value = cell.id; }}
              onSourceChange={(src: string) => handleSourceChange(cell.id, src)}
              onMoveUp={() => handleMoveCell(cell.id, 'up')}
              onMoveDown={() => handleMoveCell(cell.id, 'down')}
              onCopy={() => handleCopyCell(cell.id)}
              onDelete={() => handleDeleteCell(cell.id)}
              onAddAfter={() => handleAddCell(cell.id)}
              onClearOutput={() => handleClearOutput(cell.id)}
            />
          ))}
        </main>
        <aside class="sidebar" role="complementary" aria-label="Machine state">
          <MachinePanel state={machine.value} />
          <MemoryPanel
            sp={machine.value?.regs?.SP ?? null}
          />
          <TextScreen />
          <div class="controls" role="group" aria-label="Execution controls">
            <button onClick={handleStep} class="btn btn-step" title="Step (F7)" aria-label="Step one instruction">Step</button>
            <button onClick={handleRestart} class="btn btn-restart" title="Restart (Ctrl+R)" aria-label="Restart machine">Restart</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
