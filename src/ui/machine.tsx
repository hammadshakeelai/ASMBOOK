import type { LiveState } from '../kernel/session.js';

interface MachinePanelProps {
  state: LiveState | null;
}

const FLAGS = ['OF', 'DF', 'IF', 'TF', 'SF', 'ZF', 'AF', 'PF', 'CF'] as const;

export function MachinePanel({ state }: MachinePanelProps) {
  if (!state) {
    return <div class="machine-panel"><p class="empty">No machine state yet.</p></div>;
  }

  return (
    <div class="machine-panel" role="region" aria-label="CPU registers and flags">
      <h2>Registers</h2>
      <table class="regs-table" aria-label="General purpose registers">
        <tbody>
          <tr><td class="reg-name">AX</td><td class="reg-val">{hex16(state.regs.AX)}</td>
              <td class="reg-name">AH</td><td class="reg-val">{hex8(state.regs.AX >> 8)}</td>
              <td class="reg-name">AL</td><td class="reg-val">{hex8(state.regs.AX & 0xFF)}</td></tr>
          <tr><td class="reg-name">BX</td><td class="reg-val">{hex16(state.regs.BX)}</td>
              <td class="reg-name">BH</td><td class="reg-val">{hex8(state.regs.BX >> 8)}</td>
              <td class="reg-name">BL</td><td class="reg-val">{hex8(state.regs.BX & 0xFF)}</td></tr>
          <tr><td class="reg-name">CX</td><td class="reg-val">{hex16(state.regs.CX)}</td>
              <td class="reg-name">CH</td><td class="reg-val">{hex8(state.regs.CX >> 8)}</td>
              <td class="reg-name">CL</td><td class="reg-val">{hex8(state.regs.CX & 0xFF)}</td></tr>
          <tr><td class="reg-name">DX</td><td class="reg-val">{hex16(state.regs.DX)}</td>
              <td class="reg-name">DH</td><td class="reg-val">{hex8(state.regs.DX >> 8)}</td>
              <td class="reg-name">DL</td><td class="reg-val">{hex8(state.regs.DX & 0xFF)}</td></tr>
          <tr><td class="reg-name">SI</td><td class="reg-val">{hex16(state.regs.SI)}</td>
              <td class="reg-name">DI</td><td class="reg-val">{hex16(state.regs.DI)}</td><td></td><td></td></tr>
          <tr><td class="reg-name">BP</td><td class="reg-val">{hex16(state.regs.BP)}</td>
              <td class="reg-name">SP</td><td class="reg-val">{hex16(state.regs.SP)}</td><td></td><td></td></tr>
          <tr><td class="reg-name">CS</td><td class="reg-val">{hex16(state.regs.CS ?? 0)}</td>
              <td class="reg-name">DS</td><td class="reg-val">{hex16(state.regs.DS ?? 0)}</td><td></td><td></td></tr>
          <tr><td class="reg-name">SS</td><td class="reg-val">{hex16(state.regs.SS ?? 0)}</td>
              <td class="reg-name">ES</td><td class="reg-val">{hex16(state.regs.ES ?? 0)}</td><td></td><td></td></tr>
          <tr><td class="reg-name">IP</td><td class="reg-val">{hex16(state.regs.IP)}</td><td></td><td></td><td></td><td></td></tr>
        </tbody>
      </table>

      <h2>Flags</h2>
      <div class="flags-row" role="group" aria-label="CPU flags">
        {FLAGS.map(f => (
          <span key={f} class={`flag-bit ${state.flags[f] ? 'set' : ''}`}>
            {f}:{state.flags[f]}
          </span>
        ))}
      </div>

      <div class="machine-meta">
        <span>Instructions: {state.totalInstrs}</span>
        {state.halted && <span class="halted-badge">HALTED</span>}
        {state.needsRestart && <span class="restart-badge">RESTART NEEDED</span>}
      </div>
    </div>
  );
}

function hex16(v: number): string {
  return '0x' + ((v & 0xFFFF) + 0x10000).toString(16).slice(-4).toUpperCase();
}

function hex8(v: number): string {
  return '0x' + ((v & 0xFF) + 0x100).toString(16).slice(-2).toUpperCase();
}
