// Inspector — the live machine side panel: registers, flags, memory,
// stack and the B800h text screen. Reads straight from the session
// snapshots published in `store`.
import {
  machine,
  memBase,
  memRows,
  inspectorTab,
  session,
  type InspectorTab
} from './store.js';

const REG_DISPLAY = ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP'];
const SEG_DISPLAY = ['CS', 'DS', 'ES', 'SS'];
const FLAG_LETTERS: [string, string][] = [
  ['OF', 'O'], ['DF', 'D'], ['IF', 'I'], ['TF', 'T'],
  ['SF', 'S'], ['ZF', 'Z'], ['AF', 'A'], ['PF', 'P'], ['CF', 'C']
];

export function Inspector() {
  const st = machine.value;
  const tab = inspectorTab.value;

  return (
    <aside class="inspector">
      <div class="ins-tabs">
        {(['regs', 'memory', 'stack', 'screen'] as InspectorTab[]).map(t => (
          <button
            key={t}
            class={tab === t ? 'active' : ''}
            onClick={() => { inspectorTab.value = t; }}
          >
            {t}
          </button>
        ))}
      </div>
      <div class="ins-body">
        {!st ? (
          <p class="dim">waiting for a build…</p>
        ) : (
          <>
            {tab === 'regs' && <Registers />}
            {tab === 'memory' && <Memory />}
            {tab === 'stack' && <Stack />}
            {tab === 'screen' && <Screen />}
          </>
        )}
      </div>
    </aside>
  );
}

function Registers() {
  const m = machine.value!;
  return (
    <div class="ins-section">
      <h4>Registers</h4>
      <div class="reg-grid">
        {REG_DISPLAY.map(r => (
          <div class="reg" key={r}>
            <span class="reg-name">{r}</span>
            <span class="reg-val">{hex4(m.regs[r] ?? 0)}</span>
          </div>
        ))}
        {SEG_DISPLAY.map(r => (
          <div class="reg reg-seg" key={r}>
            <span class="reg-name">{r}</span>
            <span class="reg-val">{hex4(m.regs[r] ?? 0)}</span>
          </div>
        ))}
        <div class="reg reg-seg">
          <span class="reg-name">IP#</span>
          <span class="reg-val">{m.cursor?.instrIndex ?? 0}</span>
        </div>
      </div>
      <h4>Flags</h4>
      <div class="flag-row">
        {FLAG_LETTERS.map(([f, ch]) => (
          <span class={`flag ${m.flags[f] ? 'set' : ''}`} title={f} key={f}>
            {ch}
          </span>
        ))}
      </div>
      {m.halted && <p class="dim">machine halted</p>}
      {!m.halted && m.cursor && (
        <p class="dim">cursor in {m.cursor.cellId ?? '?'} @ line {m.cursor.line ?? '?'}</p>
      )}
    </div>
  );
}

function Memory() {
  const base = memBase.value;
  const rows = session.memHex(base, memRows);
  return (
    <div class="ins-section">
      <h4>Memory (linear)</h4>
      <label class="mem-base">
        base 0x
        <input
          type="text"
          value={base.toString(16).toUpperCase()}
          onInput={e => {
            const v = parseInt((e.target as HTMLInputElement).value, 16);
            if (!Number.isNaN(v)) memBase.value = (v & 0xfffff);
          }}
        />
      </label>
      <table class="mem-table">
        <tbody>
          {rows.map(r => (
            <tr key={r.addr}>
              <td class="mem-addr">{hex5(r.addr)}</td>
              <td class="mem-bytes">
                {r.bytes.map((b, i) => (
                  <span key={i} class={b === 0 ? 'zero' : ''}>{hex2(b)}</span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stack() {
  const { sp, words } = session.stackView(8);
  return (
    <div class="ins-section">
      <h4>Stack (SS:SP)</h4>
      <p class="dim">SP = {hex4(sp)}</p>
      <table class="mem-table">
        <tbody>
          {words.map((w, i) => (
            <tr key={i}>
              <td class="mem-addr">{hex5((((machine.value?.regs.SS ?? 0) << 4) + sp + i * 2) & 0xfffff)}</td>
              <td class="mem-bytes"><span>{hex4(w)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Screen() {
  const rows = session.screenText();
  return (
    <div class="ins-section">
      <h4>Text screen (B800h)</h4>
      <pre class="dos-screen">
        {rows.map(row => row.map(c => c.ch).join('')).join('\n')}
      </pre>
    </div>
  );
}

function hex2(v: number): string { return (v & 0xff).toString(16).toUpperCase().padStart(2, '0'); }
function hex4(v: number): string { return (v & 0xffff).toString(16).toUpperCase().padStart(4, '0'); }
function hex5(v: number): string { return (v & 0xfffff).toString(16).toUpperCase().padStart(5, '0'); }