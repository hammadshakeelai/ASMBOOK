// App — the notebook shell: toolbar, cell list with add-buttons,
// and the live machine inspector.
import { useEffect } from 'preact/hooks';
import { cells, applyCells, addCell, loadNotebook } from './store.js';
import { Toolbar } from './Toolbar.js';
import { CodeCell } from './CodeCell.js';
import { MarkdownCell } from './MarkdownCell.js';
import { Inspector } from './Inspector.js';

export function App() {
  // boot: restore persisted notebook (or defaults), then build + refresh
  useEffect(() => {
    let cancelled = false;
    void loadNotebook().then(saved => {
      if (cancelled) return;
      applyCells(saved);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div class="nb-root">
      <Toolbar />
      <div class="nb-body">
        <main class="nb-cells">
          {cells.value.map(c => (
            <div class="cell-wrap" key={c.id}>
              {c.kind === 'code' ? <CodeCell cell={c} /> : <MarkdownCell cell={c} />}
              <div class="cell-actions">
                <button class="add-code" onClick={() => addCell('code', c.id)}>＋ code</button>
                <button class="add-md" onClick={() => addCell('markdown', c.id)}>＋ md</button>
              </div>
            </div>
          ))}
        </main>
        <Inspector />
      </div>
    </div>
  );
}