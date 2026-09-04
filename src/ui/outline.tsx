// Table of Contents / Notebook Outline
import type { Cell } from '../kernel/session.js';

interface OutlineItem {
  id: string;
  cellId: string;
  level: number; // 1 to 6 for H1-H6, 0 for code cell
  title: string;
  kind: 'markdown' | 'code';
  cellIndex: number;
}

interface NotebookOutlineProps {
  cells: Cell[];
  activeCellId: string | null;
  onSelectCell: (id: string) => void;
}

export function NotebookOutline({ cells, activeCellId, onSelectCell }: NotebookOutlineProps) {
  const items: OutlineItem[] = [];

  cells.forEach((cell, idx) => {
    if (cell.kind === 'markdown') {
      const lines = cell.source.split('\n');
      let foundHeading = false;
      for (let l = 0; l < lines.length; l++) {
        const match = lines[l].match(/^(#{1,6})\s+(.+)$/);
        if (match) {
          foundHeading = true;
          items.push({
            id: `${cell.id}-h-${l}`,
            cellId: cell.id,
            level: match[1].length,
            title: match[2].trim(),
            kind: 'markdown',
            cellIndex: idx,
          });
        }
      }
      if (!foundHeading) {
        // First line or snippet of markdown
        const firstLine = cell.source.trim().split('\n')[0] || `Markdown cell #${idx + 1}`;
        items.push({
          id: `${cell.id}-txt`,
          cellId: cell.id,
          level: 2,
          title: firstLine.length > 32 ? firstLine.slice(0, 32) + '…' : firstLine,
          kind: 'markdown',
          cellIndex: idx,
        });
      }
    } else {
      // Code cell: detect comment header or first instruction
      const lines = cell.source.split('\n');
      let title = '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith(';')) {
          title = trimmed.replace(/^;\s*/, '');
          break;
        } else if (trimmed && !title) {
          title = trimmed;
        }
      }
      if (!title) title = `Code cell #${idx + 1}`;
      if (title.length > 32) title = title.slice(0, 32) + '…';

      items.push({
        id: `${cell.id}-code`,
        cellId: cell.id,
        level: 3,
        title: title,
        kind: 'code',
        cellIndex: idx,
      });
    }
  });

  const handleClick = (item: OutlineItem) => {
    onSelectCell(item.cellId);
    const target = document.getElementById(item.cellId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div class="notebook-outline" role="region" aria-label="Table of Contents">
      <div class="outline-header">
        <span class="outline-title">Outline / TOC</span>
        <span class="outline-badge">{items.length} item{items.length !== 1 ? 's' : ''}</span>
      </div>
      {items.length === 0 ? (
        <div class="outline-empty">No headings found. Add Markdown headings (# H1, ## H2) to outline your notebook.</div>
      ) : (
        <ul class="outline-list" role="tree">
          {items.map(item => {
            const isActive = activeCellId === item.cellId;
            return (
              <li
                key={item.id}
                role="treeitem"
                aria-selected={isActive}
                class={`outline-item level-${item.level} ${item.kind} ${isActive ? 'active' : ''}`}
                onClick={() => handleClick(item)}
                title={`Jump to Cell #${item.cellIndex + 1}: ${item.title}`}
              >
                <span class="outline-item-icon">
                  {item.kind === 'code' ? '⚙' : (item.level === 1 ? '§' : '•')}
                </span>
                <span class="outline-item-text">{item.title}</span>
                <span class="outline-item-num">#{item.cellIndex + 1}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
