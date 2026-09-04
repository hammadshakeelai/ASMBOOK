import { useRef, useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { EditorView, basicSetup } from 'codemirror';
import { gutter, GutterMarker, keymap } from '@codemirror/view';
import { EditorState, StateField, StateEffect, Prec } from '@codemirror/state';
import { StreamLanguage } from '@codemirror/language';
import { PredictPanel } from './predict.js';
import { predictCell } from './store.js';
import type { Cell } from '../kernel/session.js';
import type { LiveState } from '../kernel/session.js';
import type { ExpectResult } from '../kernel/expect.js';
import type { FriendlyError } from '../kernel/errors.js';

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
      view.dispatch({ effects: breakpointEffect.of(!hasBP) });
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

// ── VS Code / Jupyter Signature SVG Icons ─────────────────────────
function IconInsertAbove() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2v5M5.5 4.5h5" />
      <rect x="2.5" y="9.5" width="11" height="4" rx="1.2" />
    </svg>
  );
}

function IconInsertBelow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="2.5" width="11" height="4" rx="1.2" />
      <path d="M8 8.5v5M5.5 11h5" />
    </svg>
  );
}

function IconMoveUp() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M8 2a.75.75 0 0 1 .53.22l4.5 4.5a.75.75 0 0 1-1.06 1.06L8.75 4.56V13.25a.75.75 0 0 1-1.5 0V4.56L4.03 7.78a.75.75 0 0 1-1.06-1.06l4.5-4.5A.75.75 0 0 1 8 2z" />
    </svg>
  );
}

function IconMoveDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M8 14a.75.75 0 0 1-.53-.22l-4.5-4.5a.75.75 0 1 1 1.06-1.06L7.25 11.44V2.75a.75.75 0 0 1 1.5 0v8.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5A.75.75 0 0 1 8 14z" />
    </svg>
  );
}

function IconCopyBlock() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="8.5" height="8.5" rx="1.2" />
      <rect x="5.5" y="5.5" width="8.5" height="8.5" rx="1.2" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M10 3h3v1h-1v9l-1 1H5l-1-1V4H3V3h3V2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1zM9 2H7v1h2V2zm0 3H8v7h1V5zm-2 0H6v7h1V5zM5 4h6v9H5V4z"/>
    </svg>
  );
}

function IconClearOutput() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M4 12l8-8" />
    </svg>
  );
}

export interface CellViewProps {
  cell: Cell;
  index: number;
  execCount: number;
  output: string;
  regDiff?: Record<string, [number, number]> | null;
  steps?: number | null;
  reason?: string | null;
  durationMs?: number | null;
  execSuccess?: boolean | null;
  expectResults: { results: ExpectResult[]; allPassed: boolean } | null;
  parseErrors: FriendlyError[] | null;
  isActive: boolean;
  cursorLine: number | null;
  isFirst: boolean;
  isLast: boolean;
  onRun: () => void;
  onRunAndAdvance?: () => void;
  onRunAndInsert?: () => void;
  onRunUpTo: () => void;
  onRunToCursor: (line: number) => void;
  onFocus: () => void;
  onSourceChange: (src: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onAddAfter: () => void;
  onAddMarkdown: () => void;
  onAddAbove?: () => void;
  onAddBelow?: () => void;
  onChangeType?: (kind: 'code' | 'markdown') => void;
  onClearOutput: () => void;
  isEditingMd?: boolean;
  onSetEditingMd?: (editing: boolean) => void;
}

export function CellView({
  cell, index, execCount, output, regDiff, steps, reason, durationMs, execSuccess, expectResults, parseErrors, isActive, cursorLine, isFirst, isLast,
  onRun, onRunAndAdvance, onRunAndInsert, onRunUpTo, onRunToCursor, onFocus, onSourceChange,
  onMoveUp, onMoveDown, onCopy, onDelete, onAddAfter, onAddMarkdown, onAddAbove, onAddBelow, onChangeType, onClearOutput,
  isEditingMd, onSetEditingMd,
}: CellViewProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isMarkdown = cell.kind === 'markdown';
  const editingMd = useSignal(false);
  const isEditing = isEditingMd !== undefined ? isEditingMd : editingMd.value;
  const isOutputCollapsed = useSignal(false);
  const setEditing = (val: boolean) => {
    editingMd.value = val;
    if (onSetEditingMd) onSetEditingMd(val);
  };
  const mdEditorRef = useRef<HTMLTextAreaElement>(null);
  const predictResult = useSignal<{ actual: LiveState; guesses: Record<string, string> } | null>(null);
  const editorCursorLine = useSignal<number | null>(null);

  // Auto-focus markdown editor when entering edit mode
  useEffect(() => {
    if (isMarkdown && isEditing && mdEditorRef.current) {
      mdEditorRef.current.focus();
      const len = mdEditorRef.current.value.length;
      mdEditorRef.current.setSelectionRange(len, len);
    }
  }, [isMarkdown, isEditing]);

  // Latest callback references for CodeMirror keymap
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  const onRunAndAdvanceRef = useRef(onRunAndAdvance);
  onRunAndAdvanceRef.current = onRunAndAdvance;
  const onRunAndInsertRef = useRef(onRunAndInsert);
  onRunAndInsertRef.current = onRunAndInsert;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;

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
        Prec.highest(keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              onRunRef.current();
              return true;
            },
          },
          {
            key: 'Ctrl-Enter',
            run: () => {
              onRunRef.current();
              return true;
            },
          },
          {
            key: 'Shift-Enter',
            run: () => {
              if (onRunAndAdvanceRef.current) onRunAndAdvanceRef.current();
              else onRunRef.current();
              return true;
            },
          },
          {
            key: 'Alt-Enter',
            run: () => {
              if (onRunAndInsertRef.current) onRunAndInsertRef.current();
              else onRunRef.current();
              return true;
            },
          },
        ])),
        EditorView.domEventHandlers({
          focus() {
            onFocusRef.current();
            return false;
          },
          mousedown() {
            onFocusRef.current();
            return false;
          },
          click() {
            onFocusRef.current();
            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onSourceChange(update.state.doc.toString());
          }
          // Track cursor line
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos).number;
          editorCursorLine.value = line;
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
    if (isEditing) {
      return (
        <div id={cell.id} class={`cell cell-markdown editing ${isActive ? 'active' : ''}`} onClick={onFocus}>
          <div class="cell-input-row">
            <div class="cell-gutter">
              <button
                class="gutter-run-btn"
                onClick={(e) => { e.stopPropagation(); setEditing(false); }}
                title="Render markdown (Ctrl+Enter)"
                aria-label={`Render markdown cell ${index + 1}`}
              >
                ▶
              </button>
              <span class="prompt-text md-prompt">MD:</span>
            </div>
            <div class="cell-main-area">
              <textarea
                ref={mdEditorRef}
                class="md-editor"
                value={cell.source}
                onInput={(e) => onSourceChange((e.target as HTMLTextAreaElement).value)}
                onKeyDown={(e: KeyboardEvent) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    setEditing(false);
                  } else if (e.shiftKey && e.key === 'Enter') {
                    e.preventDefault();
                    setEditing(false);
                    if (onRunAndAdvance) onRunAndAdvance();
                  } else if (e.altKey && e.key === 'Enter') {
                    e.preventDefault();
                    setEditing(false);
                    if (onRunAndInsert) onRunAndInsert();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setEditing(false);
                  }
                }}
                aria-label="Edit markdown cell"
                placeholder="Type markdown here... Press Ctrl+Enter to render."
              />
              <div class="cell-footer md-editor-footer">
                <div class="cell-footer-left">
                  <span class="md-editor-hint"><kbd>Ctrl+Enter</kbd> render &middot; <kbd>Shift+Enter</kbd> advance &middot; Markdown supported</span>
                </div>
                <div class="cell-footer-right">
                  <button class="btn btn-sm btn-done" onClick={() => setEditing(false)}>✓ Render</button>
                  {onChangeType && (
                    <div class="cell-type-wrapper">
                      <select
                        class="cell-type-select-bottom"
                        value={cell.kind}
                        onChange={(e) => onChangeType((e.target as HTMLSelectElement).value as any)}
                        title="Change cell type (Ctrl+M to toggle)"
                        aria-label="Cell type"
                      >
                        <option value="code">Code (8086)</option>
                        <option value="markdown">Markdown</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div id={cell.id} class={`cell cell-markdown ${isActive ? 'active' : ''}`} onClick={onFocus} onDblClick={() => setEditing(true)}>
        <div class="cell-input-row">
          <div class="cell-gutter md-gutter">
            <button
              class="gutter-run-btn"
              onClick={(e) => { e.stopPropagation(); setEditing(true); }}
              title="Edit markdown (Enter or double-click)"
              aria-label={`Edit markdown cell ${index + 1}`}
            >
              ✎
            </button>
          </div>
          <div class="cell-main-area">
            <div class="cell-toolbar md-toolbar">
              <div class="cell-toolbar-right">
                <div class="cell-ops" role="toolbar" aria-label="Cell actions">
                  <button
                    class="btn-icon btn-add-above"
                    onClick={onAddAbove || onAddAfter}
                    title="Insert Cell Above (A in Command Mode)"
                    aria-label="Insert cell above"
                  >
                    <IconInsertAbove />
                  </button>
                  <button
                    class="btn-icon btn-add-below"
                    onClick={onAddBelow || onAddAfter}
                    title="Insert Cell Below (B in Command Mode)"
                    aria-label="Insert cell below"
                  >
                    <IconInsertBelow />
                  </button>
                  <button
                    class="btn-icon"
                    onClick={onMoveUp}
                    disabled={isFirst}
                    title="Move Cell Up (K in Command Mode)"
                    aria-label="Move cell up"
                  >
                    <IconMoveUp />
                  </button>
                  <button
                    class="btn-icon"
                    onClick={onMoveDown}
                    disabled={isLast}
                    title="Move Cell Down (J in Command Mode)"
                    aria-label="Move cell down"
                  >
                    <IconMoveDown />
                  </button>
                  <button
                    class="btn-icon btn-copy"
                    onClick={onCopy}
                    title="Copy Cell (C in Command Mode)"
                    aria-label="Copy cell"
                  >
                    <IconCopyBlock />
                  </button>
                  <button
                    class="btn-icon btn-delete"
                    onClick={onDelete}
                    title="Delete Cell (D, D in Command Mode)"
                    aria-label="Delete cell"
                  >
                    <IconTrash />
                  </button>
                </div>
                <button class="btn btn-sm btn-md-edit" onClick={() => setEditing(true)} title="Edit markdown (or press Enter / double-click)">✎ Edit</button>
              </div>
            </div>
            <div class="cell-content markdown-body">
              {renderMarkdown(cell.source)}
            </div>
            <div class="cell-footer md-cell-footer">
              <div class="cell-footer-left">
                <span class="md-edit-hint">double-click or press Enter to edit</span>
              </div>
              <div class="cell-footer-right">
                <span class="subtle-cell-num" title={`Cell #${index + 1}`}>#{index + 1}</span>
                {onChangeType && (
                  <div class="cell-type-wrapper">
                    <span class="subtle-sep">·</span>
                    <select
                      class="cell-type-select-bottom"
                      value={cell.kind}
                      onChange={(e) => onChangeType((e.target as HTMLSelectElement).value as any)}
                      title="Change cell type (Ctrl+M to toggle)"
                      aria-label="Cell type"
                    >
                      <option value="code">Code (8086)</option>
                      <option value="markdown">Markdown</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const hasOutputContent = Boolean(
    output ||
    (regDiff && Object.keys(regDiff).length > 0) ||
    (expectResults && expectResults.results.length > 0) ||
    (parseErrors && parseErrors.length > 0)
  );

  return (
    <div id={cell.id} class={`cell cell-code ${isActive ? 'active' : ''}`} onClick={onFocus} onMouseDown={onFocus}>
      <div class="cell-input-row">
        <div class="cell-gutter" title={`Execution count: ${execCount}`}>
          <button
            class="gutter-run-btn"
            onClick={(e) => { e.stopPropagation(); onRun(); }}
            title="Run this cell (Ctrl+Enter)"
            aria-label={`Run cell ${index + 1}`}
          >
            ▶
          </button>
          <span class={`prompt-text in-prompt ${execCount > 0 ? 'executed' : ''}`}>
            In [{execCount > 0 ? execCount : ' '}]:
          </span>
        </div>
        <div class="cell-main-area">
          <div class="cell-toolbar">
            <div class="cell-toolbar-left">
              {durationMs != null && (
                <span class={`cell-timing-badge ${execSuccess !== false ? 'success' : 'error'}`} title={`Executed in ${durationMs}ms`}>
                  <span class="timing-icon">{execSuccess !== false ? '✓' : '✗'}</span>
                  <span class="timing-text">
                    {steps != null && steps > 0 ? `${steps} step${steps === 1 ? '' : 's'} · ` : ''}
                    {durationMs}ms
                  </span>
                </span>
              )}
            </div>
            <div class="cell-toolbar-right">
              <div class="cell-ops" role="toolbar" aria-label="Cell actions">
                <button
                  class="btn-icon btn-add-above"
                  onClick={onAddAbove || onAddAfter}
                  title="Insert Cell Above (A in Command Mode)"
                  aria-label="Insert cell above"
                >
                  <IconInsertAbove />
                </button>
                <button
                  class="btn-icon btn-add-below"
                  onClick={onAddBelow || onAddAfter}
                  title="Insert Cell Below (B in Command Mode)"
                  aria-label="Insert cell below"
                >
                  <IconInsertBelow />
                </button>
                <button
                  class="btn-icon"
                  onClick={onMoveUp}
                  disabled={isFirst}
                  title="Move Cell Up (K in Command Mode)"
                  aria-label="Move cell up"
                >
                  <IconMoveUp />
                </button>
                <button
                  class="btn-icon"
                  onClick={onMoveDown}
                  disabled={isLast}
                  title="Move Cell Down (J in Command Mode)"
                  aria-label="Move cell down"
                >
                  <IconMoveDown />
                </button>
                <button
                  class="btn-icon btn-copy"
                  onClick={onCopy}
                  title="Copy Cell (C in Command Mode)"
                  aria-label="Copy cell"
                >
                  <IconCopyBlock />
                </button>
                {output && (
                  <button
                    class="btn-icon btn-clear"
                    onClick={onClearOutput}
                    title="Clear Cell Output"
                    aria-label="Clear cell output"
                  >
                    <IconClearOutput />
                  </button>
                )}
                <button
                  class="btn-icon btn-delete"
                  onClick={onDelete}
                  title="Delete Cell (D, D in Command Mode)"
                  aria-label="Delete cell"
                >
                  <IconTrash />
                </button>
              </div>
              <button class="btn btn-run" onClick={onRun} title="Run this cell (Ctrl+Enter)">&#9654; Run</button>
              <button class="btn btn-runup" onClick={onRunUpTo} title="Run all cells up to this one">&#9654;&#9654; Run to</button>
              <button class="btn btn-run-cursor" onClick={() => {
                const line = editorCursorLine.value;
                if (line != null) onRunToCursor(line);
              }} title="Run to Cursor: Runs 8086 instructions from current CPU state up to your blinking text cursor line" aria-label="Run to cursor">&#9654; Run to Cursor</button>
              <button class="btn btn-predict-toggle" onClick={() => {
                predictResult.value = predictResult.value ? null : { actual: null as any, guesses: {} };
              }} title="Toggle prediction panel">Predict</button>
            </div>
          </div>
          <div class="cell-editor" ref={editorRef} />
          <div class="cell-footer">
            <div class="cell-footer-left"></div>
            <div class="cell-footer-right">
              <span class="subtle-cell-num" title={`Cell #${index + 1}`}>#{index + 1}</span>
              {onChangeType && (
                <div class="cell-type-wrapper">
                  <span class="subtle-sep">·</span>
                  <select
                    class="cell-type-select-bottom"
                    value={cell.kind}
                    onChange={(e) => onChangeType((e.target as HTMLSelectElement).value as any)}
                    title="Change cell type (Ctrl+M to toggle)"
                    aria-label="Cell type"
                  >
                    <option value="code">Code (8086)</option>
                    <option value="markdown">Markdown</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {parseErrors && parseErrors.length > 0 && (
        <div class="cell-parse-errors" role="alert" aria-label="Parse errors">
          {parseErrors.map((e, i) => (
            <div key={i} class="parse-error">
              {e.line != null && <span class="parse-error-line">line {e.line}: </span>}
              <span class="parse-error-text">{e.friendly}</span>
              {e.hint && <span class="parse-error-hint"> — {e.hint}</span>}
            </div>
          ))}
        </div>
      )}

      {predictResult.value && predictResult.value.actual && (
        <PredictPanel onPredict={handlePredict} onReset={handlePredictReset} result={predictResult.value} />
      )}
      {predictResult.value && !predictResult.value.actual && (
        <PredictPanel onPredict={handlePredict} onReset={handlePredictReset} result={null} />
      )}

      {/* Output / Diff section with Jupyter Out [N]: prompt and collapsible toggle */}
      {hasOutputContent && (
        <div class="cell-output-row">
          <div class="cell-gutter output-gutter">
            <button
              class="output-collapse-btn"
              onClick={(e) => { e.stopPropagation(); isOutputCollapsed.value = !isOutputCollapsed.value; }}
              title={isOutputCollapsed.value ? 'Expand output' : 'Collapse output'}
              aria-label="Toggle output display"
            >
              {isOutputCollapsed.value ? '▸' : '▾'}
            </button>
            <span class="prompt-text out-prompt">
              Out [{execCount > 0 ? execCount : ' '}]:
            </span>
          </div>
          <div class="cell-output-area">
            {isOutputCollapsed.value ? (
              <div
                class="output-collapsed-bar"
                onClick={() => { isOutputCollapsed.value = false; }}
                title="Click to expand output"
              >
                ▸ Output collapsed ({steps != null && steps > 0 ? `${steps} steps` : 'output hidden'}{durationMs != null ? ` · ${durationMs}ms` : ''}) — click to expand
              </div>
            ) : (
              <>
                {/* Live Register and Flag changes from this cell execution */}
                {regDiff && Object.keys(regDiff).length > 0 && (
                  <div class="cell-reg-diffs" role="region" aria-label="Registers and flags changed in this run">
                    <div class="diff-header">
                      <span class="diff-label">Modified:</span>
                      {steps != null && steps > 0 && (
                        <span class="diff-step-count">{steps} step{steps === 1 ? '' : 's'}{reason ? ` (${reason})` : ''}</span>
                      )}
                    </div>
                    <div class="diff-chips">
                      {Object.entries(regDiff).map(([k, [oldVal, newVal]]) => {
                        const isFlag = k.startsWith('FLAG_');
                        const label = isFlag ? k.replace('FLAG_', '') : k;
                        const formatVal = (v: number) => {
                          if (isFlag) return v ? '1' : '0';
                          return (v ?? 0).toString(16).toUpperCase().padStart(4, '0') + 'h';
                        };
                        const diffNum = !isFlag ? newVal - oldVal : null;
                        const diffStr = diffNum !== null && diffNum !== 0
                          ? (diffNum > 0 ? ` (+${diffNum})` : ` (${diffNum})`)
                          : '';
                        return (
                          <span key={k} class={`diff-chip ${isFlag ? 'diff-chip-flag' : 'diff-chip-reg'}`}>
                            <span class="diff-chip-name">{label}:</span>
                            <span class="diff-chip-old">{formatVal(oldVal)}</span>
                            <span class="diff-chip-arrow">→</span>
                            <span class="diff-chip-new">{formatVal(newVal)}</span>
                            {diffStr && <span class="diff-chip-delta">{diffStr}</span>}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {output && (
                  <div class="cell-output-wrap">
                    <pre class={`cell-output ${isErrorOutput(output) ? 'cell-output-error' : ''}`}>{output}</pre>
                    <button class="btn-icon copy-output-btn" onClick={() => { navigator.clipboard.writeText(output); }} title="Copy output" aria-label="Copy output">⧉</button>
                  </div>
                )}

                {expectResults && expectResults.results.length > 0 && (
                  <div class={`expect-results ${expectResults.allPassed ? 'expect-all-pass' : 'expect-has-fail'}`} role="status" aria-label="Expect results">
                    {expectResults.results.map((r, i) => (
                      <span key={i} class={`expect-item ${r.passed ? 'expect-pass' : 'expect-fail'}`}>
                        <span class="expect-icon">{r.passed ? '✓' : '✗'}</span>
                        <span class="expect-text">{r.clause.targetLabel}: {r.passed ? 'pass' : `fail (${r.actual})`}</span>
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function isErrorOutput(text: string): boolean {
  return /^error\b/i.test(text.trim()) || /\berror\b/i.test(text);
}

function renderMarkdown(src: string): preact.ComponentChildren {
  if (!src || !src.trim()) {
    return <p class="md-empty-placeholder"><em>Empty markdown cell. Press Enter or double-click to edit.</em></p>;
  }

  const lines = src.split('\n');
  const result: preact.VNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code blocks ```
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      result.push(
        <pre class="md-code-block">
          <code class={lang ? `language-${lang}` : ''}>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Headings
    if (line.startsWith('# ')) {
      result.push(<h1>{inlineMd(line.slice(2))}</h1>);
      i++;
      continue;
    } else if (line.startsWith('## ')) {
      result.push(<h2>{inlineMd(line.slice(3))}</h2>);
      i++;
      continue;
    } else if (line.startsWith('### ')) {
      result.push(<h3>{inlineMd(line.slice(4))}</h3>);
      i++;
      continue;
    } else if (line.startsWith('#### ')) {
      result.push(<h4>{inlineMd(line.slice(5))}</h4>);
      i++;
      continue;
    } else if (line.startsWith('##### ')) {
      result.push(<h5>{inlineMd(line.slice(6))}</h5>);
      i++;
      continue;
    } else if (line.startsWith('###### ')) {
      result.push(<h6>{inlineMd(line.slice(7))}</h6>);
      i++;
      continue;
    }

    // Horizontal rule ---, ***, ___
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
      result.push(<hr class="md-hr" />);
      i++;
      continue;
    }

    // Blockquote >
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      result.push(
        <blockquote class="md-blockquote">
          <p>{inlineMd(quoteLines.join(' '))}</p>
        </blockquote>
      );
      continue;
    }

    // Bullet list - / * / +
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: preact.VNode[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*[-*+]\s+/, '');
        items.push(<li>{inlineMd(itemText)}</li>);
        i++;
      }
      result.push(<ul class="md-list">{items}</ul>);
      continue;
    }

    // Numbered list 1. 2.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: preact.VNode[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*\d+\.\s+/, '');
        items.push(<li>{inlineMd(itemText)}</li>);
        i++;
      }
      result.push(<ol class="md-list">{items}</ol>);
      continue;
    }

    // Table: starts with | ... |
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      if (tableLines.length >= 2) {
        const headerCells = tableLines[0].slice(1, -1).split('|').map(s => s.trim());
        const isSep = /^[:\s\-]+$/.test(tableLines[1].replace(/\|/g, ''));
        const bodyLines = isSep ? tableLines.slice(2) : tableLines.slice(1);
        result.push(
          <table class="md-table">
            <thead>
              <tr>
                {headerCells.map((h, k) => <th key={k}>{inlineMd(h)}</th>)}
              </tr>
            </thead>
            <tbody>
              {bodyLines.map((row, rk) => {
                const cells = row.slice(1, -1).split('|').map(s => s.trim());
                return (
                  <tr key={rk}>
                    {cells.map((c, ck) => <td key={ck}>{inlineMd(c)}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
        continue;
      }
    }

    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph
    const pLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('>') &&
      !lines[i].startsWith('```') &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !(lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) &&
      !/^(\s*[-*_]\s*){3,}$/.test(lines[i])
    ) {
      pLines.push(lines[i]);
      i++;
    }
    result.push(<p>{inlineMd(pLines.join(' '))}</p>);
  }

  return result;
}

function inlineMd(text: string): preact.VNode[] {
  const parts: preact.VNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|~~[^~]+~~|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<>{text.slice(last, m.index)}</>);
    }
    const token = m[0];
    if (token.startsWith('`')) {
      parts.push(<code>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('__') && token.endsWith('__')) {
      parts.push(<strong>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(<em>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('_') && token.endsWith('_')) {
      parts.push(<em>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      parts.push(<del>{token.slice(2, -2)}</del>);
    } else if (token.startsWith('[')) {
      const label = m[2];
      const url = m[3];
      parts.push(<a href={url} target="_blank" rel="noopener noreferrer">{label}</a>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) {
    parts.push(<>{text.slice(last)}</>);
  }
  return parts;
}
