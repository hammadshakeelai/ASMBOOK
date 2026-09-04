import { useSignal } from '@preact/signals';
import { getMemHex, getStackView } from './store.js';

interface MemoryPanelProps {
  sp: number | null;
}

export function MemoryPanel({ sp }: MemoryPanelProps) {
  const memAddr = useSignal<number>(0x200); // default: variable area
  const showStack = useSignal(true);
  const showMem = useSignal(true);

  const stack = sp != null ? getStackView(6) : null;
  const mem = getMemHex(memAddr.value, 4);

  return (
    <div class="memory-panel">
      {/* Stack */}
      <div class="section-header" onClick={() => { showStack.value = !showStack.value; }}>
        <span class="toggle">{showStack.value ? '▾' : '▸'}</span>
        Stack
      </div>
      {showStack.value && (
        <div class="section-body">
          {sp != null ? (
            <table class="stack-table">
              <thead><tr><th>SP</th><th>Value</th></tr></thead>
              <tbody>
                {stack!.words.map((w, i) => (
                  <tr key={i} class={i === 0 ? 'top-of-stack' : ''}>
                    <td class="mono">{hex16(sp! - i * 2)}</td>
                    <td class="mono">{hex16(w)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p class="empty">No stack yet.</p>
          )}
        </div>
      )}

      {/* Memory dump */}
      <div class="section-header" onClick={() => { showMem.value = !showMem.value; }}>
        <span class="toggle">{showMem.value ? '▾' : '▸'}</span>
        Memory
      </div>
      {showMem.value && (
        <div class="section-body">
          <div class="mem-addr-row">
            <label>Address:</label>
            <input
              type="text"
              class="mem-addr-input"
              value={hex16(memAddr.value)}
              onInput={(e: any) => {
                const v = parseInt(e.target.value, 16);
                if (!isNaN(v)) memAddr.value = v & 0xFFFFF;
              }}
            />
          </div>
          <table class="mem-table">
            <thead>
              <tr>
                <th>Addr</th>
                {Array.from({ length: 16 }, (_, i) => (
                  <th key={i}>{i.toString(16).toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mem.map(row => (
                <tr key={row.addr}>
                  <td class="mono addr">{hex16(row.addr)}</td>
                  {row.bytes.map((b, i) => (
                    <td key={i} class="mono byte">{b === 0 ? <span class="zero">00</span> : hex8(b)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function hex16(v: number): string {
  return '0x' + ((v & 0xFFFF) + 0x10000).toString(16).slice(-4).toUpperCase();
}

function hex8(v: number): string {
  return '0x' + ((v & 0xFF) + 0x100).toString(16).slice(-2).toUpperCase();
}
