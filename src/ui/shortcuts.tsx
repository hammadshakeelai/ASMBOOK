// Shortcuts reference page
import { useSignal } from '@preact/signals';

interface ShortcutsPageProps { onClose: () => void; }

export function ShortcutsPage({ onClose }: ShortcutsPageProps) {
  const activeSection = useSignal('cells');
  const sections = [
    { id: 'cells', label: 'Cells' },
    { id: 'exec', label: 'Execution' },
    { id: 'nav', label: 'Navigation' },
    { id: 'machine', label: 'Machine' },
    { id: 'tips', label: 'Tips & Tricks' },
  ] as const;
  return (
    <div class="shortcuts-page" role="dialog" aria-modal="true" aria-labelledby="shortcuts-page-title">
      <div class="shortcuts-page-overlay" onClick={onClose} />
      <div class="shortcuts-page-content">
        <div class="shortcuts-page-header">
          <h1 id="shortcuts-page-title">ASMBOOK — Keyboard Shortcuts & Reference</h1>
          <button class="shortcuts-page-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <nav class="shortcuts-nav" role="tablist">
          {sections.map(s => (
            <button key={s.id} class={`shortcuts-nav-btn ${activeSection.value === s.id ? 'active' : ''}`}
              onClick={() => { activeSection.value = s.id; }} role="tab"
              aria-selected={activeSection.value === s.id}>{s.label}</button>
          ))}
        </nav>
        <div class="shortcuts-body" role="tabpanel">
          {activeSection.value === 'cells' && <CellsSection />}
          {activeSection.value === 'exec' && <ExecSection />}
          {activeSection.value === 'nav' && <NavSection />}
          {activeSection.value === 'machine' && <MachineSection />}
          {activeSection.value === 'tips' && <TipsSection />}
        </div>
      </div>
    </div>
  );
}

function CellsSection() {
  return (
    <section>
      <h2>Cell Operations</h2>
      <p class="section-intro">Cells are the building blocks of your notebook.</p>
      <table class="shortcuts-table">
        <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
        <tbody>
          <tr><td>{['Ctrl', 'Enter']}</td><td>Run focused cell (stay in cell)</td></tr>
          <tr><td>{['Shift', 'Enter']}</td><td>Run focused cell and advance (insert new cell if last)</td></tr>
          <tr><td>{['Ctrl', 'B']}</td><td>Insert new code cell below focused cell</td></tr>
          <tr><td>{['Ctrl', '↑']}</td><td>Move focus to cell above</td></tr>
          <tr><td>{['Ctrl', '↓']}</td><td>Move focus to cell below</td></tr>
        </tbody>
      </table>
      <h3>Cell Toolbar</h3>
      <ul class="feature-list">
        <li><strong>▶ Run</strong> — Execute this cell from current CPU state</li>
        <li><strong>▶▶ Run Up To</strong> — Restart machine and run from top through this cell</li>
        <li><strong>↕ Run to Cursor</strong> — Run from current state to cursor line</li>
        <li><strong>↑↓</strong> — Move cell up/down in notebook</li>
        <li><strong>⎘ Copy</strong> — Duplicate this cell</li>
        <li><strong>+ Add</strong> — Insert new cell below</li>
      </ul>
    </section>
  );
}

function ExecSection() {
  return (
    <section>
      <h2>Execution</h2>
      <table class="shortcuts-table">
        <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
        <tbody>
          <tr><td>{['Ctrl', 'Enter']}</td><td>Run focused cell — executes from current CPU state</td></tr>
          <tr><td>{['Shift', 'Enter']}</td><td>Run and advance — runs cell, then moves to next/new cell</td></tr>
          <tr><td>{['F7']}</td><td>Step — execute one instruction at a time</td></tr>
          <tr><td>{['Ctrl', 'R']}</td><td>Restart — reset CPU to initial state</td></tr>
        </tbody>
      </table>
      <h3>Execution Model</h3>
      <ul class="feature-list">
        <li><strong>State persists</strong> — Running a cell preserves registers and memory. Re-running starts from the cell's first instruction but keeps CPU state.</li>
        <li><strong>Cells chain</strong> — Cell 2 can use registers set by Cell 1. No restart needed between cells.</li>
        <li><strong>HLT is soft</strong> — HLT stops execution but doesn't reset. Next run continues from HLT.</li>
        <li><strong>Run Up To (▶▶)</strong> — Only this resets the machine first. Use for a clean run from the top.</li>
      </ul>
    </section>
  );
}

function NavSection() {
  return (
    <section>
      <h2>Navigation</h2>
      <table class="shortcuts-table">
        <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
        <tbody>
          <tr><td>{['Ctrl', '↑']}</td><td>Focus cell above</td></tr>
          <tr><td>{['Ctrl', '↓']}</td><td>Focus cell below</td></tr>
          <tr><td>{['Esc']}</td><td>Close any open modal or dropdown</td></tr>
          <tr><td>{['Shift', '?']}</td><td>Open/close this shortcuts reference</td></tr>
        </tbody>
      </table>
    </section>
  );
}

function MachineSection() {
  return (
    <section>
      <h2>Machine State</h2>
      <ul class="feature-list">
        <li><strong>Registers</strong> — AX, BX, CX, DX, SI, DI, BP, SP, CS, DS, ES, SS. Changed values highlighted in green/red.</li>
        <li><strong>Flags</strong> — CF, PF, AF, ZF, SF, OF. Set flags shown in red.</li>
        <li><strong>Memory</strong> — View memory at any address. Stack view shows top of stack.</li>
        <li><strong>Text Screen</strong> — 80×25 character display at B800:0000.</li>
        <li><strong>Kernel Status</strong> — Dot in header: <span class="kernel-dot idle"></span> idle, <span class="kernel-dot busy"></span> running.</li>
      </ul>
      <h3>Understanding Output</h3>
      <ul class="feature-list">
        <li><strong>Register diffs</strong> — Changed registers show <code>old → new</code> with new value highlighted.</li>
        <li><strong>Execution count</strong> — <code>In [3]</code> means this cell has been run 3 times.</li>
        <li><strong>Output area</strong> — INT 21h string output appears below cell. Errors in red.</li>
      </ul>
    </section>
  );
}

function TipsSection() {
  return (
    <section>
      <h2>Tips &amp; Tricks</h2>
      <ul class="feature-list">
        <li><strong>Build incrementally</strong> — Write a few instructions per cell. Run each to see the effect.</li>
        <li><strong>Use labels</strong> — Define with <code>labelname:</code>, jump with <code>JMP labelname</code>.</li>
        <li><strong>Data directives</strong> — <code>DB</code> for bytes, <code>DW</code> for words. Example: <code>greet DB 'Hello$'</code></li>
        <li><strong>DOS interrupts</strong> — <code>INT 21h</code> AH=09h prints $-terminated string. AH=02h prints char.</li>
        <li><strong>Expect checks</strong> — Add <code>; expect AX=5</code> to verify values after running.</li>
        <li><strong>Lessons</strong> — Click "Lessons" in header to load example notebooks.</li>
        <li><strong>Autosave</strong> — Notebook auto-saves to browser storage. Persists across reloads.</li>
      </ul>
      <h3>Example</h3>
      <div class="code-example"><pre>{`; Print a string
MOV DX, greet
MOV AH, 09h
INT 21h
HLT
greet DB 'Hello!$'`}</pre></div>
    </section>
  );
}