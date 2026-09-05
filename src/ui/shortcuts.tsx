// Shortcuts reference page
import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';

interface ShortcutsPageProps { onClose: () => void; }

export function ShortcutsPage({ onClose }: ShortcutsPageProps) {
  const activeSection = useSignal('command');

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);
  const sections = [
    { id: 'command', label: 'Command Mode (Jupyter)' },
    { id: 'cells', label: 'Cells' },
    { id: 'exec', label: 'Execution' },
    { id: 'nav', label: 'Navigation' },
    { id: 'machine', label: 'Machine' },
    { id: 'tips', label: 'Tips & Tools' },
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
          {activeSection.value === 'command' && <CommandModeSection />}
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

function CommandModeSection() {
  return (
    <section>
      <h2>Jupyter Command Mode (Single-Key Shortcuts)</h2>
      <p class="section-intro">
        Press <kbd>Esc</kbd> to enter <strong>Command Mode</strong> (when not actively typing inside an editor).
        Press <kbd>Enter</kbd> to enter <strong>Edit Mode</strong>.
      </p>
      <table class="shortcuts-table">
        <thead><tr><th>Key</th><th>Action</th></tr></thead>
        <tbody>
          <tr><td><kbd>A</kbd></td><td>Insert new cell <strong>above</strong> current cell</td></tr>
          <tr><td><kbd>B</kbd></td><td>Insert new cell <strong>below</strong> current cell</td></tr>
          <tr><td><kbd>M</kbd></td><td>Convert active cell to <strong>Markdown</strong></td></tr>
          <tr><td><kbd>Y</kbd></td><td>Convert active cell to <strong>Code (8086)</strong></td></tr>
          <tr><td><kbd>D</kbd> <kbd>D</kbd></td><td><strong>Delete</strong> current cell (press D twice)</td></tr>
          <tr><td><kbd>C</kbd></td><td><strong>Copy</strong> current cell</td></tr>
          <tr><td><kbd>X</kbd></td><td><strong>Cut</strong> current cell</td></tr>
          <tr><td><kbd>V</kbd></td><td><strong>Paste</strong> copied/cut cell below current cell</td></tr>
          <tr><td><kbd>J</kbd> or <kbd>↓</kbd></td><td>Select <strong>next</strong> cell down</td></tr>
          <tr><td><kbd>K</kbd> or <kbd>↑</kbd></td><td>Select <strong>previous</strong> cell up</td></tr>
          <tr><td><kbd>Enter</kbd></td><td>Enter <strong>Edit Mode</strong> on selected cell</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Exit edit mode &amp; return to <strong>Command Mode</strong></td></tr>
          <tr><td><kbd>1</kbd> &ndash; <kbd>6</kbd></td><td>Convert active cell to Markdown heading level 1 &ndash; 6</td></tr>
          <tr><td><kbd>H</kbd></td><td>Open this keyboard shortcuts dialog</td></tr>
        </tbody>
      </table>
    </section>
  );
}

function KbdCombo({ keys }: { keys: string[] }) {
  return (
    <span class="kbd-combo">
      {keys.map((k, i) => (
        <span key={i}>
          {i > 0 && <span class="kbd-plus">+</span>}
          <kbd>{k}</kbd>
        </span>
      ))}
    </span>
  );
}

function CellsSection() {
  return (
    <section>
      <h2>Cell Operations</h2>
      <p class="section-intro">Cells are the building blocks of your notebook. You can insert code or markdown cells anywhere.</p>
      <table class="shortcuts-table">
        <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
        <tbody>
          <tr><td><KbdCombo keys={['Ctrl', 'Enter']} /> / <KbdCombo keys={['Cmd', 'Enter']} /></td><td>Run focused code cell / Render markdown cell in place</td></tr>
          <tr><td><KbdCombo keys={['Shift', 'Enter']} /></td><td>Run/Render focused cell and advance to next (inserts new cell if at bottom)</td></tr>
          <tr><td><KbdCombo keys={['Alt', 'Enter']} /></td><td>Run/Render focused cell and insert new cell immediately below</td></tr>
          <tr><td><KbdCombo keys={['Enter']} /></td><td>Enter edit mode on active Markdown cell (when in command mode)</td></tr>
          <tr><td><KbdCombo keys={['Esc']} /></td><td>Exit markdown edit mode & render in place / close dialogs</td></tr>
          <tr><td><KbdCombo keys={['Ctrl', 'B']} /></td><td>Insert new code cell below focused cell</td></tr>
          <tr><td><KbdCombo keys={['Ctrl', 'M']} /></td><td>Toggle active cell type (Code &harr; Markdown)</td></tr>
          <tr><td><KbdCombo keys={['Ctrl', '↑']} /></td><td>Move focus to cell above</td></tr>
          <tr><td><KbdCombo keys={['Ctrl', '↓']} /></td><td>Move focus to cell below</td></tr>
        </tbody>
      </table>
      <h3>Cell Affordances</h3>
      <ul class="feature-list">
        <li><strong>Gutter Run Button (▶)</strong> — Hover over the cell gutter on the left to reveal the quick play button (VS Code notebook signature)</li>
        <li><strong>Execution Timing Badge</strong> — Displays step count and millisecond timing (e.g., <code>✓ 4 steps · 1.2ms</code>)</li>
        <li><strong>Collapsible Outputs</strong> — Click the <code>▾ / ▸</code> chevron next to <code>Out [N]:</code> to collapse output and save vertical space</li>
        <li><strong>▶ Run</strong> — Execute this cell from current CPU state</li>
        <li><strong>▶▶ Run to</strong> — Restart machine and run from top through this cell</li>
        <li><strong>▶ Run to Cursor</strong> — Run from current CPU state up to the line where your text cursor is positioned</li>
        <li><strong>Code (8086) ▾ / Markdown ▾</strong> — Cell language selector in the bottom-right corner of each cell</li>
        <li><strong>Hover Dividers</strong> — Move mouse between cells to reveal centered <code>+ Code</code> and <code>+ Markdown</code> buttons</li>
        <li><strong>Double-click Markdown</strong> — Double-click any rendered markdown cell to edit its source</li>
        <li><strong>↑↓</strong> — Move cell up/down in notebook</li>
        <li><strong>⧉ Copy</strong> — Duplicate this cell</li>
        <li><strong>✕ Delete</strong> — Remove cell</li>
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
          <tr><td><KbdCombo keys={['Ctrl', 'Enter']} /></td><td>Run focused cell — executes from current CPU state</td></tr>
          <tr><td><KbdCombo keys={['Shift', 'Enter']} /></td><td>Run and advance — runs cell, then moves to next cell (or inserts new cell)</td></tr>
          <tr><td><KbdCombo keys={['Alt', 'Enter']} /></td><td>Run and insert — runs cell, then inserts a new cell below immediately</td></tr>
          <tr><td><KbdCombo keys={['F7']} /></td><td>Step — execute exactly one instruction at a time</td></tr>
          <tr><td><KbdCombo keys={['Ctrl', 'R']} /></td><td>Restart — reset CPU registers, flags, and memory to initial state</td></tr>
        </tbody>
      </table>
      <h3>Execution Model</h3>
      <ul class="feature-list">
        <li><strong>State persists</strong> — Running a cell preserves registers and memory. Re-running starts from the cell's first instruction but keeps CPU state.</li>
        <li><strong>Cells chain</strong> — Cell 2 can use registers set by Cell 1. No restart needed between cells.</li>
        <li><strong>HLT is soft</strong> — HLT stops execution but doesn't reset. Next run continues from HLT.</li>
        <li><strong>Run Up To (▶▶)</strong> — Resets the machine first, then executes the prefix up through the target cell.</li>
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
          <tr><td><KbdCombo keys={['Ctrl', '↑']} /></td><td>Focus cell above</td></tr>
          <tr><td><KbdCombo keys={['Ctrl', '↓']} /></td><td>Focus cell below</td></tr>
          <tr><td><KbdCombo keys={['Esc']} /></td><td>Close any open modal or cancel editing</td></tr>
          <tr><td><KbdCombo keys={['Shift', '?']} /></td><td>Open/close this shortcuts &amp; help dialog</td></tr>
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
        <li><strong>Outline / Table of Contents</strong> — Switch to the 📑 Outline tab in the sidebar (or toolbar) to see an interactive outline of your lesson headings and jump directly to any section.</li>
        <li><strong>8086 Address Calculator</strong> — Switch to the 🧮 Address Calc tab to visually decompose 20-bit real-mode physical addressing <code>(Segment &lt;&lt; 4) + EA</code>, test all 8086 addressing modes, and inspect memory bytes live.</li>
        <li><strong>Draggable Sidebar</strong> — Click and drag the vertical divider between the cells and the inspector panel to resize. Double-click the divider to reset to default 320px width.</li>
        <li><strong>Dark Mode</strong> — Toggle dark/light theme anytime with the 🌙/☀️ button in the toolbar or header. Preference is saved automatically.</li>
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