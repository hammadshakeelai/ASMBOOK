// 8086 Segment Arithmetic & Effective Address Calculator
import { useSignal } from '@preact/signals';
import { getMemHex } from './store.js';

interface AddressCalcProps {
  regs?: Record<string, number> | null;
  onNavigateMem?: (addr: number) => void;
}

type ModePreset =
  | '[BX + SI + disp]'
  | '[BX + DI + disp]'
  | '[BP + SI + disp]'
  | '[BP + DI + disp]'
  | '[SI + disp]'
  | '[DI + disp]'
  | '[BP + disp]'
  | '[BX + disp]'
  | '[disp]'
  | 'Custom';

export function AddressCalculator({ regs, onNavigateMem }: AddressCalcProps) {
  const selectedSegment = useSignal<'CS' | 'DS' | 'SS' | 'ES' | 'Custom'>('DS');
  const customSegmentVal = useSignal<string>('0700');
  const selectedPreset = useSignal<ModePreset>('[BX + SI + disp]');

  const baseVal = useSignal<string>('0100');
  const indexVal = useSignal<string>('0020');
  const dispVal = useSignal<string>('0004');

  // Load live register values
  const syncFromCPU = () => {
    if (!regs) return;
    const seg = selectedSegment.value;
    if (seg !== 'Custom' && regs[seg] != null) {
      customSegmentVal.value = (regs[seg] ?? 0).toString(16).toUpperCase().padStart(4, '0');
    }
    if (selectedPreset.value.includes('BX') && regs['BX'] != null) {
      baseVal.value = (regs['BX'] ?? 0).toString(16).toUpperCase().padStart(4, '0');
    } else if (selectedPreset.value.includes('BP') && regs['BP'] != null) {
      baseVal.value = (regs['BP'] ?? 0).toString(16).toUpperCase().padStart(4, '0');
    }

    if (selectedPreset.value.includes('SI') && regs['SI'] != null) {
      indexVal.value = (regs['SI'] ?? 0).toString(16).toUpperCase().padStart(4, '0');
    } else if (selectedPreset.value.includes('DI') && regs['DI'] != null) {
      indexVal.value = (regs['DI'] ?? 0).toString(16).toUpperCase().padStart(4, '0');
    }
  };

  const handlePresetChange = (preset: ModePreset) => {
    selectedPreset.value = preset;
    // Auto-select standard segment default
    if (preset.includes('BP')) {
      selectedSegment.value = 'SS';
      if (regs?.['SS'] != null) {
        customSegmentVal.value = regs['SS'].toString(16).toUpperCase().padStart(4, '0');
      }
    } else if (preset !== 'Custom') {
      selectedSegment.value = 'DS';
      if (regs?.['DS'] != null) {
        customSegmentVal.value = regs['DS'].toString(16).toUpperCase().padStart(4, '0');
      }
    }
    syncFromCPU();
  };

  // Parsing values
  const parseHex = (val: string): number => {
    const cleaned = val.replace(/[^0-9a-fA-F]/g, '');
    return parseInt(cleaned || '0', 16) || 0;
  };

  const segNum = selectedSegment.value !== 'Custom' && regs?.[selectedSegment.value] != null
    ? (regs[selectedSegment.value] & 0xFFFF)
    : (parseHex(customSegmentVal.value) & 0xFFFF);

  const preset = selectedPreset.value;
  const hasBase = preset.includes('BX') || preset.includes('BP') || preset === 'Custom';
  const hasIndex = preset.includes('SI') || preset.includes('DI') || preset === 'Custom';
  const hasDisp = preset.includes('disp') || preset === 'Custom';

  const baseNum = hasBase ? (parseHex(baseVal.value) & 0xFFFF) : 0;
  const indexNum = hasIndex ? (parseHex(indexVal.value) & 0xFFFF) : 0;
  const dispNum = hasDisp ? (parseHex(dispVal.value) & 0xFFFF) : 0;

  // Real-mode math
  const segmentShifted = (segNum << 4);
  const effectiveAddress = (baseNum + indexNum + dispNum) & 0xFFFF;
  const fullAddress = segmentShifted + effectiveAddress;
  const physicalAddress = fullAddress & 0xFFFFF;
  const wrapped = fullAddress > 0xFFFFF;

  // Memory Peek
  let peekBytes: number[] = [];
  try {
    const rows = getMemHex(physicalAddress, 1);
    if (rows && rows.length > 0 && rows[0].bytes) {
      peekBytes = rows[0].bytes;
    }
  } catch {}

  const peekByte = peekBytes.length > 0 ? peekBytes[0] : null;
  const peekWord = peekBytes.length > 1 ? (peekBytes[0] | (peekBytes[1] << 8)) : null;

  return (
    <div class="address-calc-panel" role="region" aria-label="8086 Segment Arithmetic & Effective Address Calculator">
      <div class="calc-header">
        <span class="calc-title">8086 Address Calculator</span>
        <button class="btn btn-sm btn-sync-cpu" onClick={syncFromCPU} title="Copy current registers from CPU">
          Sync CPU
        </button>
      </div>

      <p class="calc-intro">
        Decomposes real-mode 20-bit physical addressing: <code>Physical = (Segment &lt;&lt; 4) + EA</code>.
      </p>

      {/* Preset selector */}
      <div class="calc-field-group">
        <label class="calc-label">Addressing Mode:</label>
        <select
          class="calc-select"
          value={selectedPreset.value}
          onChange={(e) => handlePresetChange((e.target as HTMLSelectElement).value as ModePreset)}
        >
          <option value="[BX + SI + disp]">[BX + SI + disp] (Base + Index + Disp)</option>
          <option value="[BX + DI + disp]">[BX + DI + disp] (Base + Index + Disp)</option>
          <option value="[BP + SI + disp]">[BP + SI + disp] (Stack Frame + Index)</option>
          <option value="[BP + DI + disp]">[BP + DI + disp] (Stack Frame + Index)</option>
          <option value="[SI + disp]">[SI + disp] (Source Index + Disp)</option>
          <option value="[DI + disp]">[DI + disp] (Dest Index + Disp)</option>
          <option value="[BP + disp]">[BP + disp] (Stack Frame Local/Param)</option>
          <option value="[BX + disp]">[BX + disp] (Base + Disp)</option>
          <option value="[disp]">[disp] (Direct Addressing)</option>
          <option value="Custom">Custom / Manual</option>
        </select>
      </div>

      {/* Inputs grid */}
      <div class="calc-inputs-grid">
        <div class="calc-input-item">
          <label class="calc-sublabel">
            Segment ({selectedSegment.value})
          </label>
          <div class="calc-seg-row">
            <select
              class="calc-seg-select"
              value={selectedSegment.value}
              onChange={(e) => {
                const val = (e.target as HTMLSelectElement).value as any;
                selectedSegment.value = val;
                if (val !== 'Custom' && regs?.[val] != null) {
                  customSegmentVal.value = regs[val].toString(16).toUpperCase().padStart(4, '0');
                }
              }}
            >
              <option value="DS">DS</option>
              <option value="SS">SS</option>
              <option value="CS">CS</option>
              <option value="ES">ES</option>
              <option value="Custom">Hex</option>
            </select>
            <input
              type="text"
              class="calc-input"
              value={segNum.toString(16).toUpperCase().padStart(4, '0')}
              onInput={(e) => {
                customSegmentVal.value = (e.target as HTMLInputElement).value;
                selectedSegment.value = 'Custom';
              }}
              title="Segment register hex value"
            />
          </div>
        </div>

        {hasBase && (
          <div class="calc-input-item">
            <label class="calc-sublabel">
              Base ({preset.includes('BP') ? 'BP' : 'BX'})
            </label>
            <input
              type="text"
              class="calc-input"
              value={baseVal.value}
              onInput={(e) => { baseVal.value = (e.target as HTMLInputElement).value; }}
              title="Base register hex value"
            />
          </div>
        )}

        {hasIndex && (
          <div class="calc-input-item">
            <label class="calc-sublabel">
              Index ({preset.includes('DI') ? 'DI' : 'SI'})
            </label>
            <input
              type="text"
              class="calc-input"
              value={indexVal.value}
              onInput={(e) => { indexVal.value = (e.target as HTMLInputElement).value; }}
              title="Index register hex value"
            />
          </div>
        )}

        {hasDisp && (
          <div class="calc-input-item">
            <label class="calc-sublabel">Displacement</label>
            <input
              type="text"
              class="calc-input"
              value={dispVal.value}
              onInput={(e) => { dispVal.value = (e.target as HTMLInputElement).value; }}
              title="Displacement offset hex value"
            />
          </div>
        )}
      </div>

      {/* Visual Decomposition Steps */}
      <div class="calc-breakdown">
        <div class="calc-step">
          <span class="step-badge">1</span>
          <div class="step-content">
            <div class="step-title">Segment Base (Shift Left 4 bits)</div>
            <div class="step-formula">
              <code>{segNum.toString(16).toUpperCase().padStart(4, '0')}h &times; 16 = </code>
              <strong class="highlight-val">{segmentShifted.toString(16).toUpperCase().padStart(5, '0')}h</strong>
            </div>
          </div>
        </div>

        <div class="calc-step">
          <span class="step-badge">2</span>
          <div class="step-content">
            <div class="step-title">Effective Address (EA)</div>
            <div class="step-formula">
              <code>
                {hasBase ? `${baseNum.toString(16).toUpperCase()}h` : ''}
                {hasIndex ? ` + ${indexNum.toString(16).toUpperCase()}h` : ''}
                {hasDisp ? ` + ${dispNum.toString(16).toUpperCase()}h` : ''}
                {!hasBase && !hasIndex && !hasDisp ? '0000h' : ''}
                {' = '}
              </code>
              <strong class="highlight-val">{effectiveAddress.toString(16).toUpperCase().padStart(4, '0')}h</strong>
            </div>
          </div>
        </div>

        <div class="calc-step result-step">
          <span class="step-badge result-badge">3</span>
          <div class="step-content">
            <div class="step-title">Physical 20-bit Address</div>
            <div class="step-formula physical-formula">
              <code>{segmentShifted.toString(16).toUpperCase().padStart(5, '0')}h + {effectiveAddress.toString(16).toUpperCase().padStart(4, '0')}h = </code>
              <strong class="final-addr">{physicalAddress.toString(16).toUpperCase().padStart(5, '0')}h</strong>
            </div>
            {wrapped && (
              <div class="calc-note wrap-note">
                ⚠ 20-bit wrap: ({fullAddress.toString(16).toUpperCase()}h &amp; 0xFFFFF) &rarr; {physicalAddress.toString(16).toUpperCase().padStart(5, '0')}h
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Memory Peek */}
      <div class="calc-peek">
        <div class="peek-header">
          <span class="peek-title">Memory at Physical {physicalAddress.toString(16).toUpperCase().padStart(5, '0')}h:</span>
          {onNavigateMem && (
            <button
              class="btn btn-sm btn-peek-jump"
              onClick={() => onNavigateMem(physicalAddress)}
              title="Jump to this address in Memory Inspector"
            >
              Inspect
            </button>
          )}
        </div>
        <div class="peek-values">
          <span class="peek-item">
            Byte: <strong>{peekByte !== null ? `${peekByte.toString(16).toUpperCase().padStart(2, '0')}h` : '--'}</strong>
            {peekByte !== null && peekByte >= 32 && peekByte <= 126 && (
              <span class="peek-char"> ('{String.fromCharCode(peekByte)}')</span>
            )}
          </span>
          <span class="peek-item">
            Word: <strong>{peekWord !== null ? `${peekWord.toString(16).toUpperCase().padStart(4, '0')}h` : '----'}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
