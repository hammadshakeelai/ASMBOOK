import { useSignal } from '@preact/signals';
import { getMemHex, getStackView, selectedMemAddr, memRevision, machine } from './store.js';

interface MemoryPanelProps {
  sp: number | null;
  revision?: number;
}

export function MemoryPanel({ sp }: MemoryPanelProps) {
  const showStack = useSignal(true);
  const showMem = useSignal(true);
  const inputVal = useSignal(hex16(selectedMemAddr.value));
  const isEditing = useSignal(false);

  // Subscribe reactively to live memory revisions & machine state
  void memRevision.value;
  const state = machine.value;

  // Sync displayed input if selectedMemAddr changes externally and user isn't editing
  if (!isEditing.value && inputVal.value !== hex16(selectedMemAddr.value)) {
    inputVal.value = hex16(selectedMemAddr.value);
  }

  const stack = sp != null ? getStackView(6) : null;
  const mem = getMemHex(selectedMemAddr.value, 4);

  // Calculate current IP linear address to highlight current instruction byte
  const cs = state?.regs?.CS ?? 0;
  const ip = state?.regs?.IP ?? 0x100;
  const curIpLinear = ((cs << 4) + ip) & 0xFFFFF;

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
              value={inputVal.value}
              onFocus={() => { isEditing.value = true; }}
              onBlur={() => {
                isEditing.value = false;
                inputVal.value = hex16(selectedMemAddr.value);
              }}
              onInput={(e: any) => {
                inputVal.value = e.target.value;
                const cleaned = e.target.value.replace(/^0x/i, '').trim();
                const v = parseInt(cleaned, 16);
                if (!isNaN(v)) {
                  selectedMemAddr.value = v & 0xFFFFF;
                }
              }}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
            <div class="mem-quick-jumps">
              <button
                type="button"
                class="btn-quick-mem"
                onClick={() => { selectedMemAddr.value = 0x0100; inputVal.value = '0x0100'; }}
                title="Jump to Code segment (CS:0100)"
              >
                CS:0100
              </button>
              <button
                type="button"
                class="btn-quick-mem"
                onClick={() => { selectedMemAddr.value = 0x0200; inputVal.value = '0x0200'; }}
                title="Jump to Data segment (.DATA 0x0200)"
              >
                .DATA
              </button>
              {sp != null && (
                <button
                  type="button"
                  class="btn-quick-mem"
                  onClick={() => {
                    const top = (sp & 0xFFF0);
                    selectedMemAddr.value = top;
                    inputVal.value = hex16(top);
                  }}
                  title="Jump to Stack segment (SS:SP)"
                >
                  Stack
                </button>
              )}
            </div>
          </div>
          <div class="mem-table-container">
            <table class="mem-table">
              <thead>
                <tr>
                  <th>Addr</th>
                  {Array.from({ length: 16 }, (_, i) => (
                    <th key={i}>{i.toString(16).toUpperCase()}</th>
                  ))}
                  <th class="ascii-th" title="ASCII representation">Text</th>
                </tr>
              </thead>
              <tbody>
                {mem.map(row => {
                  const ascii = row.bytes.map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '·')).join('');
                  return (
                    <tr key={row.addr}>
                      <td class="mono addr">{hex16(row.addr)}</td>
                      {row.bytes.map((b, i) => {
                        const byteAddr = row.addr + i;
                        const isCurIp = byteAddr === curIpLinear;
                        const cls = `mono byte ${isCurIp ? 'cur-ip' : ''}`;
                        const charDesc = b >= 32 && b <= 126 ? `'${String.fromCharCode(b)}'` : '';
                        const title = `${hex16(byteAddr)}: ${hex8(b)} (${b})${charDesc ? ' ' + charDesc : ''}${isCurIp ? ' [CS:IP]' : ''}`;
                        return (
                          <td key={i} class={cls} title={title}>
                            {b === 0 ? <span class="zero">00</span> : hex8(b)}
                          </td>
                        );
                      })}
                      <td class="mono ascii-cell" title={ascii}>{ascii}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
