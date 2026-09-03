// ================================================================
//  CodeCell — one assembly code cell.
//  - CodeMirror 6 editor (NASM-ish highlighting, line numbers)
//  - clickable breakpoint gutter
//  - current-instruction line highlight (from machine cursor)
//  - inline parse-error markers
//  - ▶ Run / Run-up-to buttons + output panel (INT-21h text, reg diffs)
// ================================================================
import { useEffect, useRef } from 'preact/hooks';
import { EditorState, RangeSet, StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  gutter,
  GutterMarker,
  keymap
} from '@codemirror/view';
import { nasm } from './asmMode.js';
import { linter, type Diagnostic } from '@codemirror/lint';
import { basicSetup } from 'codemirror';
import type { Cell } from '../kernel/session.js';
import {
  machine,
  outputs,
  errors,
  runCell,
  runUpTo,
  updateCellSource,
  toggleBreakpoint,
  session
} from './store.js';

// ── active-instruction line highlight ───────────────────────────
const setActiveLine = StateEffect.define<number | null>();
const activeLineField = StateField.define<number | null>({
  create: () => null,
  update(line, tr) {
    for (const e of tr.effects) if (e.is(setActiveLine)) return e.value;
    return line;
  }
});
const activeLineDeco = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setActiveLine)) {
        deco = Decoration.none;
        if (e.value != null) {
          const from = tr.state.doc.line(e.value).from;
          deco = Decoration.set([
            Decoration.line({ class: 'cm-active-instr' }).range(from)
          ]);
        }
      }
    }
    return deco;
  },
  provide: f => EditorView.decorations.from(f)
});
const activeLineHighlight = EditorView.baseTheme({
  '.cm-active-instr': {
    backgroundColor: 'rgba(255, 255, 0, 0.14)',
    boxShadow: 'inset 2px 0 0 #ffd60a'
  },
  '.cm-bp-gutter': { width: '1.4em', cursor: 'pointer' },
  '.cm-bp-marker': { display: 'inline-block', width: '0.9em', textAlign: 'center', color: '#ff5555', fontWeight: 'bold' }
});

// ── breakpoint gutter state ─────────────────────────────────────
const setBreakpoints = StateEffect.define<number[]>();
const breakpointField = StateField.define<number[]>({
  create: () => [],
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setBreakpoints)) return e.value;
    return v;
  }
});
class BPMarker extends GutterMarker {
  constructor(private on: boolean) { super(); }
  toDOM() { const d = document.createElement('span'); d.className = 'cm-bp-marker'; d.textContent = this.on ? '●' : ''; return d; }
}

// ── CodeCell component ───────────────────────────────────────────
export function CodeCell({ cell }: { cell: Cell }) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);

  // create the editor once per cell instance
  useEffect(() => {
    if (!host.current) return;
    const cellId = cell.id;
    const breakpointGutter = gutter({
      class: 'cm-bp-gutter',
      markers: v => {
        const lines = [...new Set(v.state.field(breakpointField))].sort((a, b) => a - b);
        return RangeSet.of(lines.map(l => new BPMarker(true).range(v.state.doc.line(l).from)));
      },
      initialSpacer: () => new BPMarker(true),
      domEventHandlers: {
        mousedown(v, line) {
          const num = v.state.doc.lineAt(line.from).number;
          const cur = v.state.field(breakpointField);
          const next = cur.includes(num)
            ? cur.filter(n => n !== num)
            : [...cur, num];
          v.dispatch({ effects: setBreakpoints.of(next) });
          toggleBreakpoint(cellId, num);
          return true;
        }
      }
    });

    const lintSource = () => {
      const offset = session.cellLineOffset(cellId);
      const diags: Diagnostic[] = [];
      for (const e of errors.value) {
        if (e.cellId !== cellId || e.line == null) continue;
        const local = offset != null ? e.line - offset + 1 : e.line;
        if (local < 1) continue;
        const l = Math.min(local, v.state.doc.lines);
        diags.push({
          from: v.state.doc.line(l).from,
          to: v.state.doc.line(l).to,
          severity: 'error',
          message: e.message
        });
      }
      return diags;
    };

    const ext: Extension[] = [
      basicSetup,
      nasm,
      activeLineHighlight,
      activeLineField,
      activeLineDeco,
      breakpointField,
      breakpointGutter,
      linter(lintSource),
      keymap.of([
        { key: 'Ctrl-Enter', run: () => { runCell(cellId); return true; } },
        { key: 'Shift-Enter', run: () => { runUpTo(cellId); return true; } }
      ]),
      EditorView.updateListener.of(u => {
        if (u.docChanged) updateCellSource(cellId, u.state.doc.toString());
      })
    ];

    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({ doc: cell.source, extensions: ext })
    });
    view.current = v;
    v.dispatch({ effects: setBreakpoints.of([...session.getBreakpointLines(cellId)]) });
    return () => { v.destroy(); view.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell.id]);

  // external source changes → push into editor (unless the user is typing)
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const cur = v.state.doc.toString();
    if (cur !== cell.source && !v.hasFocus) {
      v.dispatch({ changes: { from: 0, to: cur.length, insert: cell.source } });
    }
  }, [cell.source]);

  // machine cursor movement → highlight the current instruction line
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const cur = machine.value?.cursor;
    let local: number | null = null;
    if (cur && cur.cellId === cell.id) {
      const offset = session.cellLineOffset(cell.id);
      if (offset != null && cur.line != null) local = cur.line - offset + 1;
    }
    v.dispatch({ effects: setActiveLine.of(local) });
  });

  const out = outputs.value.get(cell.id);
  const hasActive = machine.value?.cursor?.cellId === cell.id;
  const dirty = machine.value?.needsRestart;

  return (
    <section class={`cell code-cell${hasActive ? ' is-active' : ''}`} data-cell-id={cell.id}>
      <div class="cell-bar">
        <button class="btn-run" title="Run up to end of this cell (Ctrl+Enter)" onClick={() => runCell(cell.id)}>▶</button>
        <button class="btn-run-top" title="Run from a clean machine down to this cell (Shift+Enter)" onClick={() => runUpTo(cell.id)}>⇪</button>
        <span class="cell-id">[{cell.kind} · {cell.id}]</span>
        <span class="cell-hint">{dirty ? '⟳ restart to apply' : ''}</span>
      </div>
      <div class="cm-host" ref={host} />
      {out && out.text !== '' && <pre class="cell-output">📟 {out.text}</pre>}
      {out && Object.keys(out.regDiff).length > 0 && (
        <div class="cell-regdiff">
          {Object.entries(out.regDiff).map(([r, [a, b]]) => (
            <span class="regdiff" key={r}>{r}: {hex4(a)} → <b>{hex4(b)}</b></span>
          ))}
        </div>
      )}
      {out && reasonLabel(out.reason) && <div class="cell-reason">{reasonLabel(out.reason)}</div>}
    </section>
  );
}

function hex4(v: number): string {
  return '0x' + (v & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}
function reasonLabel(r: string): string {
  switch (r) {
    case 'halted': return '⏹ machine halted';
    case 'breakpoint': return '⏸ breakpoint hit';
    case 'cap': return '⚠ step cap — possible infinite loop';
    default: return '';
  }
}