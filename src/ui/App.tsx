import { useSignal, useSignalEffect } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import {
  defaultCells, applyCells, runCell, runUpTo, step, restart,
  toggleBreakpoint, getCellLocalLine, session, machine
} from './store.js';
import { autosave, loadAutosave, downloadNotebook, importNotebook } from '../kernel/storage.js';
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

  // Load autosave on mount
  useSignalEffect(() => {
    if (loaded.value) return;
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

  // Global keyboard shortcuts
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
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
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

  function handleToggleBreakpoint(cellId: string, line: number) {
    toggleBreakpoint(cellId, line);
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
          <button class="btn btn-sm" onClick={handleImport} title="Import .asmnb file (Ctrl+O)" aria-label="Import notebook file">Import</button>
          <button class="btn btn-sm" onClick={handleExport} title="Export .asmnb file (Ctrl+S)" aria-label="Export notebook file">Export</button>
        </div>
      </header>
      <div class="app-body">
        <main class="notebook" role="main" aria-label="Notebook cells">
          {cells.value.map((cell) => (
            <CellView
              key={cell.id}
              cell={cell}
              output={outputMap.value[cell.id] || ''}
              isActive={activeCell.value === cell.id}
              cursorLine={cursorCell.value === cell.id ? cursorLocalLine.value : null}
              onRun={() => handleRun(cell.id)}
              onRunUpTo={() => handleRunUpTo(cell.id)}
              onFocus={() => { activeCell.value = cell.id; }}
              onToggleBreakpoint={(line: number) => handleToggleBreakpoint(cell.id, line)}
              onSourceChange={(src: string) => handleSourceChange(cell.id, src)}
            />
          ))}
        </main>
        <aside class="sidebar" role="complementary" aria-label="Machine state">
          <MachinePanel state={machine.value} />
          <MemoryPanel
            sp={machine.value?.regs?.SP ?? null}
            ds={machine.value?.regs?.DS ?? null}
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
