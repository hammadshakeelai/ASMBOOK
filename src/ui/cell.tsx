import { useRef, useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { EditorView, basicSetup } from 'codemirror';
import { gutter, GutterMarker } from '@codemirror/view';
import { EditorState, StateField, StateEffect } from '@codemirror/state';
import { StreamLanguage } from '@codemirror/language';
import { PredictPanel } from './predict.js';
import { predictCell } from './store.js';
import type { Cell } from '../kernel/session.js';
import type { LiveState } from '../kernel/session.js';

// ── 8086 assembly language mode ────────────────────────────────
const asm8086 = StreamLanguage.define({
    token(stream: any) {
      if (stream.match(/^;.*$/)) return 'lineComment';
      if (stream.match(/^'.*?'/)) return 'string';
      if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*:/)) return 'labelName';
      if (stream.match(/^\.[A-Za-z]+/)) return 'keyword';
      if (stream.match(/^(MOV|ADD|SUB|AND|OR|XOR|CMP|TEST|PUSH|POP|INT|HLT|NOP|JMP|JE|JNE|JZ|JNZ|CALL|RET|INC|DEC|SHL|SHR|SAL|SAR|ROL|ROR|MUL|IMUL|DIV|IDIV|NOT|NEG|LEA|LODSB|LODSW|STOSB|STOSW|MOVSB|MOVSW|SCASB|SCASW|CMPSB|CMPSW|REP|REPE|REPNE|IN|OUT|CLI|STI|LOOP|LOOPE|LOOPNE|LOOPZ|LOOPNZ)\b/i)) return 'keyword';
      if (stream.match(/^(AX|BX|CX|DX|SI|DI|BP|SP|CS|DS|ES|SS|AH|AL|BH|BL|CH|CL|DH|DL)\b/)) return 'typeName';
      if (stream.match(/^(DB|DW|DD|DQ|DT|RESB|RESW|RESD)\b/i)) return 'keyword';
      if (stream.match(/^[0-9]+[hHbBoOdD]?\b/)) return 'number';
      if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) return 'variableName';
      stream.next();
      return null;
    },
    startState() { return {}; },
  });

// ── Breakpoint gutter marker ──────────────────────────────────
const breakpointEffect = StateEffect.define<boolean>();

const breakpointField = StateField.define<boolean>({
  create() { return false; },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(breakpointEffect)) return e.value;
    }
    return value;
  },
});

class BreakpointMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('div');
    el.className = 'cm-breakpoint';
    el.textContent = '●';
    return el;
  }
}

const breakpointGutter = gutter({
  lineMarker(view, line) {
    const hasBP = view.state.field(breakpointField, false);
    return hasBP ? new BreakpointMarker() : null;
  },
  lineMarkerChange(update) {
    return update.startState.field(breakpointField, false) !==
           update.state.field(breakpointField, false);
  },
  domEventHandlers: {
    click(view, line) {
      const pos = line.from;
      const hasBP = view.state.field(breakpointField, false);
      // dispatch breakpoint toggle
      view.dispatch({
        effects: breakpointEffect.of(!hasBP),
      });
      return true;
    },
  },
});

// ── Cursor line highlight ─────────────────────────────────────
const cursorLineEffect = StateEffect.define<number | null>();

const cursorLineField = StateField.define<number | null>({
  create() { return null; },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(cursorLineEffect)) return e.value;
    }
    return value;
  },
});

interface CellViewProps {
  cell: Cell;
  output: string;
  isActive: boolean;
  cursorLine: number | null;
  onRun: () => void;
  onRunUpTo: () => void;
  onFocus: () => void;
  onToggleBreakpoint: (line: number) => void;
  onSourceChange: (src: string) => void;
}

export function CellView({
  cell, output, isActive, cursorLine,
  onRun, onRunUpTo, onFocus, onToggleBreakpoint, onSourceChange,
}: CellViewProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isMarkdown = cell.kind === 'markdown';
  const predictResult = useSignal<{ actual: LiveState; guesses: Record<string, string> } | null>(null);

  useEffect(() => {
    if (isMarkdown || !editorRef.current) return;

    const state = EditorState.create({
      doc: cell.source,
      extensions: [
        basicSetup,
        asm8086,
        breakpointGutter,
        breakpointField,
        cursorLineField,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onSourceChange(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          '&': { fontSize: '13px', fontFamily: 'ui-monospace, monospace' },
          '.cm-content': { minHeight: '60px' },
          '.cm-breakpoint': {
            color: '#dc2626',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '10px',
            lineHeight: '1',
          },
          '.cm-activeLine': {
            backgroundColor: '#eff6ff',
          },
        }),
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => { view.destroy(); };
  }, [cell.id]);

  // Update cursor line highlight when cursorLine changes
  useEffect(() => {
    if (isMarkdown || !viewRef.current) return;
    if (cursorLine != null) {
      viewRef.current.dispatch({
        effects: cursorLineField.reconfigure(cursorLine),
      });
    }
  }, [cursorLine]);

  function handlePredict(guesses: Record<string, string>) {
    const { state } = predictCell(cell.id);
    predictResult.value = { actual: state, guesses };
  }

  if (isMarkdown) {
    return (
      <div class={`cell cell-markdown ${isActive ? 'active' : ''}`} onClick={onFocus}>
        <div class="cell-content markdown-body">
          {renderMarkdown(cell.source)}
        </div>
      </div>
    );
  }

  return (
    <div class={`cell cell-code ${isActive ? 'active' : ''}`} onClick={onFocus}>
      <div class="cell-toolbar">
        <span class="cell-label">{cell.id}</span>
        <button class="btn btn-run" onClick={onRun} title="Run this cell (Ctrl+Enter)">&#9654; Run</button>
        <button class="btn btn-runup" onClick={onRunUpTo} title="Run up to this cell">&#9654;&#9654; Run to</button>
        <button class="btn btn-predict-toggle" onClick={() => {
          predictResult.value = predictResult.value ? null : { actual: null as any, guesses: {} };
        }} title="Toggle prediction panel">Predict</button>
      </div>
      <div class="cell-editor" ref={editorRef} />
      {predictResult.value && predictResult.value.actual && (
        <PredictPanel onPredict={handlePredict} result={predictResult.value} />
      )}
      {predictResult.value && !predictResult.value.actual && (
        <PredictPanel onPredict={handlePredict} result={null} />
      )}
      {output && <pre class="cell-output">{output}</pre>}
    </div>
  );
}

function renderMarkdown(src: string): preact.ComponentChildren {
  const lines = src.split('\n');
  const result: preact.VNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('# ')) {
      result.push(<h1>{inlineMd(line.slice(2))}</h1>);
    } else if (line.startsWith('## ')) {
      result.push(<h2>{inlineMd(line.slice(3))}</h2>);
    } else if (line.startsWith('### ')) {
      result.push(<h3>{inlineMd(line.slice(4))}</h3>);
    } else if (line.trim() === '') {
      // paragraph break
    } else {
      result.push(<p>{inlineMd(line)}</p>);
    }
    i++;
  }
  return result;
}

function inlineMd(text: string): preact.VNode[] {
  const parts: preact.VNode[] = [];
  const re = /(\*\*.*?\*\*|\*.*?\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<>{text.slice(last, m.index)}</>);
    const s = m[0];
    if (s.startsWith('**')) {
      parts.push(<strong>{s.slice(2, -2)}</strong>);
    } else if (s.startsWith('*')) {
      parts.push(<em>{s.slice(1, -1)}</em>);
    } else {
      parts.push(<code>{s.slice(1, -1)}</code>);
    }
    last = m.index + s.length;
  }
  if (last < text.length) parts.push(<>{text.slice(last)}</>);
  return parts;
}
