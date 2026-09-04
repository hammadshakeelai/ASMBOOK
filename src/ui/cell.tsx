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
  lineMarker(view, _line) {
    const hasBP = view.state.field(breakpointField, false);
    return hasBP ? new BreakpointMarker() : null;
  },
  lineMarkerChange(update) {
    return update.startState.field(breakpointField, false) !==
           update.state.field(breakpointField, false);
  },
  domEventHandlers: {
    click(view, _line) {
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
  index: number;
  output: string;
  isActive: boolean;
  cursorLine: number | null;
  isFirst: boolean;
  isLast: boolean;
  onRun: () => void;
  onRunUpTo: () => void;
  onFocus: () => void;
  onSourceChange: (src: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onAddAfter: () => void;
  onAddMarkdown: () => void;
  onClearOutput: () => void;
}

export function CellView({
  cell, index, output, isActive, cursorLine, isFirst, isLast,
  onRun, onRunUpTo, onFocus, onSourceChange,
  onMoveUp, onMoveDown, onCopy, onDelete, onAddAfter, onAddMarkdown, onClearOutput,
}: CellViewProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isMarkdown = cell.kind === 'markdown';
  const editingMd = useSignal(false);
  const mdEditorRef = useRef<HTMLTextAreaElement>(null);
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
      // StateField has reconfigure at runtime but TS types don't expose it
      const effect = (cursorLineField as any).reconfigure(cursorLine);
      viewRef.current.dispatch({ effects: effect });
    }
  }, [cursorLine]);

  function handlePredict(guesses: Record<string, string>) {
    const { state } = predictCell(cell.id);
    predictResult.value = { actual: state, guesses };
  }

  function handlePredictReset() {
    predictResult.value = { actual: null as any, guesses: {} };
  }

  if (isMarkdown) {
    if (editingMd.value) {
      return (
        <div class={`cell cell-markdown active ${isActive ? 'active' : ''}`} onClick={onFocus}>
          <textarea
            ref={mdEditorRef}
            class="md-editor"
            value={cell.source}
            onInput={(e) => onSourceChange((e.target as HTMLTextAreaElement).value)}
            onBlur={() => { editingMd.value = false; }}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Escape') { editingMd.value = false; }
            }}
            aria-label="Edit markdown cell"
          />
        </div>
      );
    }
    return (
      <div class={`cell cell-markdown ${isActive ? 'active' : ''}`} onClick={onFocus} onDblClick={() => { editingMd.value = true; }}>
        <div class="cell-content markdown-body">
          {renderMarkdown(cell.source)}
        </div>
        <span class="md-edit-hint">double-click to edit</span>
      </div>
    );
  }

  return (
    <div class={`cell cell-code ${isActive ? 'active' : ''}`} onClick={onFocus}>
      <div class="cell-toolbar">
        <span class="cell-number">{index + 1}</span>
        <span class="cell-label">{cell.id}</span>
        <div class="cell-toolbar-right">
          <div class="cell-ops">
            <button class="btn-icon" onClick={onMoveUp} disabled={isFirst} title="Move up" aria-label="Move cell up">↑</button>
            <button class="btn-icon" onClick={onMoveDown} disabled={isLast} title="Move down" aria-label="Move cell down">↓</button>
            <button class="btn-icon" onClick={onCopy} title="Copy cell" aria-label="Copy cell">⧉</button>
            <button class="btn-icon" onClick={onDelete} title="Delete cell" aria-label="Delete cell">✕</button>
            <button class="btn-icon" onClick={onAddAfter} title="Add code cell below" aria-label="Add code cell below">+</button>
            <button class="btn-icon btn-icon-sm" onClick={onAddMarkdown} title="Add markdown cell below" aria-label="Add markdown cell below">M</button>
            {output && <button class="btn-icon" onClick={onClearOutput} title="Clear output" aria-label="Clear output">⌫</button>}
          </div>
          <button class="btn btn-run" onClick={onRun} title="Run this cell (Ctrl+Enter)">&#9654; Run</button>
          <button class="btn btn-runup" onClick={onRunUpTo} title="Run up to this cell">&#9654;&#9654; Run to</button>
          <button class="btn btn-predict-toggle" onClick={() => {
            predictResult.value = predictResult.value ? null : { actual: null as any, guesses: {} };
          }} title="Toggle prediction panel">Predict</button>
        </div>
      </div>
      <div class="cell-editor" ref={editorRef} />
      {predictResult.value && predictResult.value.actual && (
        <PredictPanel onPredict={handlePredict} onReset={handlePredictReset} result={predictResult.value} />
      )}
      {predictResult.value && !predictResult.value.actual && (
        <PredictPanel onPredict={handlePredict} onReset={handlePredictReset} result={null} />
      )}
      {output && (
        <div class="cell-output-wrap">
          <pre class={`cell-output ${isErrorOutput(output) ? 'cell-output-error' : ''}`}>{output}</pre>
          <button class="btn-icon copy-output-btn" onClick={() => { navigator.clipboard.writeText(output); }} title="Copy output" aria-label="Copy output">⧉</button>
        </div>
      )}
    </div>
  );
}

function isErrorOutput(text: string): boolean {
  return /^error\b/i.test(text.trim()) || /\berror\b/i.test(text);
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
