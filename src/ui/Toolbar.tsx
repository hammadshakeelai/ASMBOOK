// Toolbar — the machine controls (Build ⟷ Run ⟷ Step ⟷ Reset) plus
// notebook file actions.
import { useRef } from 'preact/hooks';
import {
  machine,
  status,
  step,
  reset,
  runAll,
  continueRun,
  exportNotebook,
  importNotebook
} from './store.js';

export function Toolbar() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const st = machine.value;

  return (
    <header class="toolbar">
      <div class="brand">
        <span class="brand-mark">⬛</span> ASMBOOK
        <span class="kern-badge">8086 · live machine</span>
      </div>
      <div class="tb-controls">
        <button onClick={reset} title="Reset the machine to a clean 8086">⟲ Reset</button>
        <button onClick={runAll} title="Reset, then run the whole program from the top">▶ Run all</button>
        <button onClick={continueRun} title="Continue from the current cursor">▶ Continue</button>
        <button onClick={step} title="Execute exactly one instruction" disabled={!!st?.halted || !!st?.needsRestart}>Step</button>
      </div>
      <div class="tb-files">
        <button onClick={exportNotebook} title="Download this notebook as .asmnb">⬇ Export</button>
        <button onClick={() => fileRef.current?.click()} title="Open a .asmnb notebook">⬆ Import</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.asmnb"
          hidden
          onChange={async e => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (!f) return;
            try { await importNotebook(f); } catch (err) { alert(err instanceof Error ? err.message : String(err)); }
          }}
        />
      </div>
      <div class="tb-status" title="Machine state">{status.value}</div>
    </header>
  );
}