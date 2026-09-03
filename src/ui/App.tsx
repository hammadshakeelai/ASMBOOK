import { useState } from 'preact/hooks';
import { CPU, Parser, Executor, hex } from '../kernel/index.js';

// R0 scaffold: proves the pure kernel is wired into the UI.
// The real notebook shell arrives in R1 — this only demonstrates
// that the DOM-free kernel executes and its state renders.
export function App() {
  const [regs, setRegs] = useState<Record<string, number> | null>(null);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);

  function runDemo() {
    try {
      const code = [
        'MOV AX, 5',
        'ADD AX, 3',
        'MOV DX, msg',
        'MOV AH, 09h',
        'INT 21h',
        'HLT',
        'msg: db "Hello from ASMBOOK$", 0'
      ].join('\n');
      const cpu = new CPU();
      const parsed = new Parser().parse(code);
      const ex = new Executor(cpu, parsed);
      let steps = 0;
      while (!cpu.halted && steps++ < 100000) ex.step();
      setRegs({
        AX: cpu.getReg('AX'), BX: cpu.getReg('BX'),
        CX: cpu.getReg('CX'), DX: cpu.getReg('DX')
      });
      setOutput(ex.output.join(''));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main class="shell">
      <h1>ASMBOOK</h1>
      <p class="tagline">8086 Assembly Notebook — R0 scaffold (kernel wiring proof)</p>
      <button onClick={runDemo}>Run demo program</button>
      {error && <p class="error">Error: {error}</p>}
      {regs && (
        <section>
          <h2>Registers after run</h2>
          <ul class="regs">
            {Object.entries(regs).map(([r, v]) => (
              <li><b>{r}</b> = {hex(v)}</li>
            ))}
          </ul>
          <h2>INT 21h output</h2>
          <pre class="out">{output}</pre>
        </section>
      )}
    </main>
  );
}