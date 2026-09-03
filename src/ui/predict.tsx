import { useSignal } from '@preact/signals';
import type { LiveState } from '../kernel/session.js';

const REGS = ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP', 'IP'] as const;
const FLAGS = ['ZF', 'SF', 'CF', 'OF'] as const;

interface PredictPanelProps {
  onPredict: (guesses: Record<string, string>) => void;
  result: { actual: LiveState; guesses: Record<string, string> } | null;
}

export function PredictPanel({ onPredict, result }: PredictPanelProps) {
  const guesses = useSignal<Record<string, string>>({});

  function handleChange(name: string, val: string) {
    guesses.value = { ...guesses.value, [name]: val };
  }

  function handleSubmit() {
    onPredict(guesses.value);
  }

  return (
    <div class="predict-panel" role="region" aria-label="Predict register values">
      <div class="predict-header">
        <strong>Predict the result</strong>
        <span class="predict-hint">Enter hex values (e.g. 0x000F or 15)</span>
      </div>

      <div class="predict-grid">
        <div class="predict-group">
          <span class="predict-group-title">Registers</span>
          {REGS.map(r => (
            <label key={r} class="predict-field">
              <span class="predict-label">{r}</span>
              <input
                type="text"
                class={`predict-input ${getResultClass(result, r)}`}
                value={guesses.value[r] ?? ''}
                onInput={(e) => handleChange(r, (e.target as HTMLInputElement).value)}
                placeholder="—"
                aria-label={`Predict ${r}`}
                disabled={!!result}
              />
              {result && (
                <span class={`predict-actual ${getResultClass(result, r)}`}>
                  {formatReg(result.actual.regs[r as keyof typeof result.actual.regs])}
                </span>
              )}
            </label>
          ))}
        </div>

        <div class="predict-group">
          <span class="predict-group-title">Flags</span>
          {FLAGS.map(f => (
            <label key={f} class="predict-field">
              <span class="predict-label">{f}</span>
              <select
                class={`predict-input predict-flag ${getFlagResultClass(result, f)}`}
                value={guesses.value[f] ?? ''}
                onChange={(e) => handleChange(f, (e.target as HTMLSelectElement).value)}
                aria-label={`Predict ${f}`}
                disabled={!!result}
              >
                <option value="">—</option>
                <option value="0">0</option>
                <option value="1">1</option>
              </select>
              {result && (
                <span class={`predict-actual ${getFlagResultClass(result, f)}`}>
                  {result.actual.flags[f] ? '1' : '0'}
                </span>
              )}
            </label>
          ))}
        </div>
      </div>

      {!result && (
        <button class="btn btn-predict" onClick={handleSubmit} aria-label="Check prediction">
          Check Prediction
        </button>
      )}

      {result && (
        <div class={`predict-verdict ${allCorrect(result) ? 'correct' : 'incorrect'}`}>
          {allCorrect(result) ? 'All correct!' : 'Some predictions were wrong (see red highlights)'}
        </div>
      )}
    </div>
  );
}

function parseGuess(val: string): number | null {
  if (!val.trim()) return null;
  const n = parseInt(val.trim(), 16);
  return isNaN(n) ? null : n;
}

function getResultClass(result: PredictPanelProps['result'], reg: string): string {
  if (!result) return '';
  const guess = parseGuess(result.guesses[reg] ?? '');
  const actual = result.actual.regs[reg as keyof typeof result.actual.regs];
  if (guess === null) return '';
  return (guess & 0xFFFF) === (actual & 0xFFFF) ? 'correct' : 'incorrect';
}

function getFlagResultClass(result: PredictPanelProps['result'], flag: string): string {
  if (!result) return '';
  const guess = result.guesses[flag];
  if (guess === undefined || guess === '') return '';
  const actual = result.actual.flags[flag as keyof typeof result.actual.flags] ? '1' : '0';
  return guess === actual ? 'correct' : 'incorrect';
}

function allCorrect(result: NonNullable<PredictPanelProps['result']>): boolean {
  for (const r of REGS) {
    const guess = parseGuess(result.guesses[r] ?? '');
    const actual = result.actual.regs[r as keyof typeof result.actual.regs];
    if (guess !== null && (guess & 0xFFFF) !== (actual & 0xFFFF)) return false;
  }
  for (const f of FLAGS) {
    const guess = result.guesses[f];
    if (guess !== undefined && guess !== '') {
      const actual = result.actual.flags[f as keyof typeof result.actual.flags] ? '1' : '0';
      if (guess !== actual) return false;
    }
  }
  return true;
}

function formatReg(v: number): string {
  return '0x' + ((v & 0xFFFF) + 0x10000).toString(16).slice(-4).toUpperCase();
}
