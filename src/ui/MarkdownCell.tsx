// MarkdownCell — a plain note cell (rendered as editable text; full
// markdown rendering is a later milestone). Keeps the notebook
// punctuated by explanations, like Jupyter.
import { updateCellSource, deleteCell } from './store.js';
import type { Cell } from '../kernel/session.js';

export function MarkdownCell({ cell }: { cell: Cell }) {
  return (
    <section class="cell md-cell" data-cell-id={cell.id}>
      <div class="cell-bar">
        <span class="cell-id">[md · {cell.id}]</span>
        <button class="btn-mini" title="Delete cell" onClick={() => deleteCell(cell.id)}>✕</button>
      </div>
      <textarea
        class="md-input"
        value={cell.source}
        onInput={e => updateCellSource(cell.id, (e.target as HTMLTextAreaElement).value)}
        spellcheck={false}
      />
    </section>
  );
}