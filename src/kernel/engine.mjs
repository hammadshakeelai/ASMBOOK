// ================================================================
//  Assembly Dry Run Tool — 8086 Interpreter
//  Supports: MOV, ADD, SUB, MUL, DIV, INC, DEC, NEG, AND, OR,
//            XOR, NOT, CMP, TEST, SHL, SHR, SAR, ROL, ROR,
//            PUSH, POP, CALL, RET, JMP + all conditionals,
//            LOOP, INT 21h (output), HLT, NOP, CBW, CWD, XCHG,
//            LEA, .DATA / .CODE / DB / DW directives
// ================================================================

'use strict';

// ── CPU State ──────────────────────────────────────────────────
class CPU {
  constructor() { this.reset(); }

  reset() {
    this.regs  = { AX:0, BX:0, CX:0, DX:0, SI:0, DI:0, SP:0xFFFE, BP:0, CS:0, DS:0, ES:0, SS:0, IP:0x100 };
    this.flags = { OF:0, DF:0, IF:1, TF:0, SF:0, ZF:0, AF:0, PF:0, CF:0 };
    this.mem   = new Uint8Array(0x100000); // real 1 MB segmented address space (20-bit)
    this.ports = new Uint8Array(65536);   // simulated I/O port space (IN/OUT)
    this.inputBuffer = [];                 // queued keyboard input (char codes)
    this.ip    = 0;
    this.halted = false;
  }

  // Real-mode address translation: physical = (segment << 4) + offset, wrapped to 20 bits.
  // `seg` may be a register name ('DS','SS',…) or a numeric selector value.
  linear(seg, off) {
    const s = (typeof seg === 'string') ? (this.regs[seg.toUpperCase()] ?? 0) : seg;
    return (((s & 0xFFFF) << 4) + (off & 0xFFFF)) & 0xFFFFF;
  }

  snapshot() {
    return {
      regs:   { ...this.regs },
      flags:  { ...this.flags },
      mem:    this.mem.slice(),
      ports:  this.ports.slice(),
      inputBuffer: this.inputBuffer.slice(),
      ip:     this.ip,
      halted: this.halted,
    };
  }

  restore(snap) {
    this.regs   = { ...snap.regs };
    this.flags  = { ...snap.flags };
    this.mem    = snap.mem.slice();
    if (snap.ports)       this.ports = snap.ports.slice();
    if (snap.inputBuffer) this.inputBuffer = snap.inputBuffer.slice();
    this.ip     = snap.ip;
    this.halted = snap.halted;
  }

  // ── Register accessors ──
  static REG8  = ['AL','AH','BL','BH','CL','CH','DL','DH'];
  static REG16 = ['AX','BX','CX','DX','SI','DI','SP','BP'];
  static SEG   = ['CS','DS','ES','SS'];

  isReg(n)  { n = n.toUpperCase(); return CPU.REG8.includes(n) || CPU.REG16.includes(n) || CPU.SEG.includes(n); }
  isReg8(n) { return CPU.REG8.includes(n.toUpperCase()); }
  isReg16(n){ n = n.toUpperCase(); return CPU.REG16.includes(n) || CPU.SEG.includes(n); }
  regSize(n){ return this.isReg8(n) ? 8 : 16; }

  getReg(n) {
    switch (n.toUpperCase()) {
      case 'AL': return  this.regs.AX & 0xFF;
      case 'AH': return (this.regs.AX >> 8) & 0xFF;
      case 'BL': return  this.regs.BX & 0xFF;
      case 'BH': return (this.regs.BX >> 8) & 0xFF;
      case 'CL': return  this.regs.CX & 0xFF;
      case 'CH': return (this.regs.CX >> 8) & 0xFF;
      case 'DL': return  this.regs.DX & 0xFF;
      case 'DH': return (this.regs.DX >> 8) & 0xFF;
      default:   return this.regs[n.toUpperCase()] ?? null;
    }
  }

  setReg(n, v) {
    switch (n.toUpperCase()) {
      case 'AL': this.regs.AX = (this.regs.AX & 0xFF00) | (v & 0xFF);         return;
      case 'AH': this.regs.AX = (this.regs.AX & 0x00FF) | ((v & 0xFF) << 8);  return;
      case 'BL': this.regs.BX = (this.regs.BX & 0xFF00) | (v & 0xFF);         return;
      case 'BH': this.regs.BX = (this.regs.BX & 0x00FF) | ((v & 0xFF) << 8);  return;
      case 'CL': this.regs.CX = (this.regs.CX & 0xFF00) | (v & 0xFF);         return;
      case 'CH': this.regs.CX = (this.regs.CX & 0x00FF) | ((v & 0xFF) << 8);  return;
      case 'DL': this.regs.DX = (this.regs.DX & 0xFF00) | (v & 0xFF);         return;
      case 'DH': this.regs.DX = (this.regs.DX & 0x00FF) | ((v & 0xFF) << 8);  return;
      default:
        if (n.toUpperCase() in this.regs) this.regs[n.toUpperCase()] = v & 0xFFFF;
    }
  }

  // ── Flags ──
  updateFlags(result, size, kind, a, b) {
    const mask    = size === 8 ? 0xFF : 0xFFFF;
    const signBit = size === 8 ? 0x80 : 0x8000;
    const res     = ((result % 0x10000) + 0x10000) % 0x10000 & mask;

    this.flags.ZF = res === 0 ? 1 : 0;
    this.flags.SF = (res & signBit) ? 1 : 0;

    // Parity of low byte
    let p = res & 0xFF;
    p ^= p >> 4; p ^= p >> 2; p ^= p >> 1;
    this.flags.PF = (~p & 1);

    if (kind === 'ADD') {
      this.flags.CF = result > mask ? 1 : 0;
      this.flags.AF = ((a ^ b ^ result) & 0x10) ? 1 : 0;
      const sa = a & signBit, sb = b & signBit, sr = res & signBit;
      this.flags.OF = (sa === sb && sr !== sa) ? 1 : 0;
    } else if (kind === 'SUB') {
      this.flags.CF = a < b ? 1 : 0;
      this.flags.AF = ((a ^ b ^ result) & 0x10) ? 1 : 0;
      const sa = a & signBit, sb = b & signBit, sr = res & signBit;
      this.flags.OF = (sa !== sb && sr !== sa) ? 1 : 0;
    } else {
      this.flags.CF = 0;
      this.flags.OF = 0;
      this.flags.AF = 0;
    }
  }

  // ── Memory ──  (addresses here are LINEAR/physical 20-bit; callers segment first)
  memRead(addr, size = 16) {
    addr &= 0xFFFFF;
    return size === 8 ? this.mem[addr] : (this.mem[addr] | (this.mem[(addr + 1) & 0xFFFFF] << 8));
  }
  memWrite(addr, val, size = 16) {
    addr &= 0xFFFFF;
    if (size === 8) {
      this.mem[addr] = val & 0xFF;
    } else {
      this.mem[addr]                = val & 0xFF;
      this.mem[(addr + 1) & 0xFFFFF] = (val >> 8) & 0xFF;
    }
  }

  // ── Stack ──  (always SS:SP)
  push(val) {
    this.regs.SP = (this.regs.SP - 2) & 0xFFFF;
    this.memWrite(this.linear('SS', this.regs.SP), val, 16);
  }
  pop() {
    const val = this.memRead(this.linear('SS', this.regs.SP), 16);
    this.regs.SP = (this.regs.SP + 2) & 0xFFFF;
    return val;
  }
}

// ── NASM-like operand spec: [min, max] ─────────────────────────
// Only known 8086 mnemonics appear here; unknown opcodes are skipped
// so session's VALID_OPS "Unknown instruction" message still fires.
const OPERAND_SPEC = {
  // zero operands
  NOP: [0,0], HLT: [0,0], CBW: [0,0], CWD: [0,0], XLAT: [0,0], XLATB: [0,0],
  PUSHF: [0,0], POPF: [0,0], PUSHA: [0,0], PUSHAW: [0,0],
  POPA: [0,0], POPAW: [0,0], LAHF: [0,0], SAHF: [0,0],
  MOVSB: [0,0], MOVSW: [0,0], STOSB: [0,0], STOSW: [0,0],
  LODSB: [0,0], LODSW: [0,0], SCASB: [0,0], SCASW: [0,0],
  CMPSB: [0,0], CMPSW: [0,0], DAA: [0,0], DAS: [0,0],
  AAA: [0,0], AAS: [0,0],
  CLC: [0,0], STC: [0,0], CMC: [0,0], CLD: [0,0], STD: [0,0],
  CLI: [0,0], STI: [0,0], LEAVE: [0,0], WAIT: [0,0], FWAIT: [0,0],
  LOCK: [0,0], INTO: [0,0], IRET: [0,0], INT3: [0,0],

  // exactly 1 operand
  INC: [1,1], DEC: [1,1], NEG: [1,1], NOT: [1,1],
  MUL: [1,1], IMUL: [1,1], DIV: [1,1], IDIV: [1,1],
  PUSH: [1,1], POP: [1,1],
  JMP: [1,1], CALL: [1,1], INT: [1,1],
  LOOP: [1,1], LOOPE: [1,1], LOOPZ: [1,1], LOOPNE: [1,1], LOOPNZ: [1,1],
  JCXZ: [1,1],
  JO: [1,1], JNO: [1,1], JB: [1,1], JNB: [1,1], JZ: [1,1], JNZ: [1,1],
  JBE: [1,1], JA: [1,1], JS: [1,1], JNS: [1,1], JP: [1,1], JNP: [1,1],
  JL: [1,1], JGE: [1,1], JLE: [1,1], JG: [1,1],

  // shift family: 1 or 2 operands (optional CL/count)
  SHL: [1,2], SAL: [1,2], SHR: [1,2], SAR: [1,2],
  ROL: [1,2], ROR: [1,2], RCL: [1,2], RCR: [1,2],

  // REP family: exactly 1 operand (the string op)
  REP: [1,1], REPE: [1,1], REPZ: [1,1], REPNE: [1,1], REPNZ: [1,1],

  // exactly 2 operands
  MOV: [2,2], XCHG: [2,2], LEA: [2,2],
  ADD: [2,2], ADC: [2,2], SUB: [2,2], SBB: [2,2],
  AND: [2,2], OR: [2,2], XOR: [2,2], CMP: [2,2], TEST: [2,2],

  // 0 or 1 operand (optional imm16)
  RET: [0,1], RETN: [0,1], RETF: [0,1],

  // exactly 2 operands (imm16, imm8)
  ENTER: [2,2],

  // 1 or 2 operands
  INS: [1,2], OUTS: [1,2],

  // 0 or 1 operand (base optional)
  AAM: [0,1], AAD: [0,1],
};

// Known 8086 registers → bit size (16-bit CPU; IP is not a usable operand).
const REG_SIZE = {
  AX:16, BX:16, CX:16, DX:16, SI:16, DI:16, BP:16, SP:16,
  CS:16, DS:16, ES:16, SS:16,
  AL:8, AH:8, BL:8, BH:8, CL:8, CH:8, DL:8, DH:8,
};

// 2-operand MM ops where both register operands must share one size.
const REGPAIR_OPS = new Set([
  'MOV','XCHG','ADD','ADC','SUB','SBB','AND','OR','XOR','CMP','TEST',
]);

// Dest-first 2-operand ops where the destination is a register/memory,
// never an immediate (LEA excluded from REGPAIR — its sizes legitimately
// differ; ENTER excluded — its first operand IS the immediate).
const DEST_FIRST_OPS = new Set([
  'MOV','XCHG','LEA','ADD','ADC','SUB','SBB','AND','OR','XOR','CMP','TEST',
]);

// ── Parser ─────────────────────────────────────────────────────
class Parser {
  parse(code) {
    this.instrs  = [];
    this.labels  = {};
    this.vars    = {};
    this.errors  = [];
    this._nextAddr = 0x0200;

    const lines = code.split('\n');
    let inData = false;
    let idx    = 0;

    // Pass 1: labels + variables
    for (let i = 0; i < lines.length; i++) {
      const stripped = lines[i].replace(/;.*$/, '').trim();
      if (!stripped) continue;

      if (this._isSegDir(stripped, 'DATA'))  { inData = true;  continue; }
      if (this._isSegDir(stripped, 'CODE'))  { inData = false; continue; }

      let rest = stripped;

      // Label — peel BEFORE skip-line check so labels named like directives
      // (end:, proc:, code:) are still registered, not swallowed.
      const lm = rest.match(/^(\w+):\s*(.*)/);
      if (lm) {
        const lname = lm[1].toUpperCase();
        if (!inData) this.labels[lname] = idx;
        rest = lm[2].trim();
        if (!rest) continue;
      }

      if (this._skipLine(rest)) continue;

      if (inData) {
        this._parseVar(rest, i + 1);
      } else {
        idx++;
      }
    }

    // Pass 2: instructions
    inData = false; idx = 0;
    for (let i = 0; i < lines.length; i++) {
      const raw      = lines[i];
      const stripped = raw.replace(/;.*$/, '').trim();
      if (!stripped) continue;

      if (this._isSegDir(stripped, 'DATA'))  { inData = true;  continue; }
      if (this._isSegDir(stripped, 'CODE'))  { inData = false; continue; }

      let rest = stripped;

      const lm = rest.match(/^(\w+):\s*(.*)/);
      if (lm) { rest = lm[2].trim(); if (!rest) continue; }

      if (this._skipLine(rest)) continue;

      if (inData) continue;

      const instr = this._parseInstr(rest, i + 1, idx);
      if (instr) { this.instrs.push(instr); idx++; }
    }

    return { instrs: this.instrs, labels: this.labels, vars: this.vars, errors: this.errors };
  }

  _isSegDir(s, name) {
    return new RegExp(`^\\.${name}\\b`, 'i').test(s);
  }

  _skipLine(s) {
    return /^\.(MODEL|STACK|ASSUME|TEXT|BSS)\b/i.test(s)
        || /^(ASSUME|MODEL)\b/i.test(s)
        || /^END\b/i.test(s)
        || /^\w+\s+(SEGMENT|ENDS)\b/i.test(s)
        || /^\w+\s+(PROC|ENDP)\b/i.test(s)
        || /^(PROC|ENDP)\b/i.test(s);
  }

  _parseVar(text, lineNum) {
    const m = text.match(/^(\w+)\s+(DB|DW)\s+(.+)/i);
    if (!m) return;
    const name = m[1].toUpperCase();
    const type = m[2].toUpperCase();
    const size = type === 'DB' ? 1 : 2;
    const addr = this._nextAddr;
    let valStr = m[3].trim();

    // String literal DB 'hello', '$'
    if (type === 'DB' && /^['"]/.test(valStr)) {
      const sm = valStr.match(/^['"]([^'"]*)['"](.*)/);
      if (sm) {
        const str   = sm[1];
        const extra = sm[2].replace(/\s*,\s*/, '').trim();
        const bytes = [...str].map(c => c.charCodeAt(0));
        if (extra === '$' || extra === "'$'") bytes.push(0x24);
        else if (extra === '0Dh' || extra === '13') bytes.push(13, 10);
        this.vars[name] = { addr, size: 1, bytes };
        this._nextAddr += bytes.length;
        return;
      }
    }

    // DUP
    const dup = valStr.match(/^(\d+)\s+DUP\s*\((.+)\)/i);
    if (dup) {
      const count = parseInt(dup[1]);
      const val   = dup[2].trim() === '?' ? 0 : (this._parseImm(dup[2].trim()) ?? 0);
      this.vars[name] = { addr, size, count, value: val };
      this._nextAddr += count * size;
      return;
    }

    // Comma list
    const parts = valStr.split(',').map(v => v.trim());
    if (parts.length > 1) {
      const values = parts.map(p => p === '?' ? 0 : (this._parseImm(p) ?? 0));
      this.vars[name] = { addr, size, values };
      this._nextAddr += parts.length * size;
      return;
    }

    const val = valStr === '?' ? 0 : (this._parseImm(valStr) ?? 0);
    this.vars[name] = { addr, size, value: val };
    this._nextAddr += size;
  }

  _parseInstr(text, lineNum, idx) {
    const m = text.match(/^(\w+)\s*(.*)/);
    if (!m) return null;
    const op   = m[1].toUpperCase();
    const args = this._splitArgs(m[2].trim());
    this._checkOperands(op, args, lineNum);
    return { op, args, lineNum, idx, raw: text };
  }

  // ── NASM-like operand validation ───────────────────────────────
  // Conservative parse-time checks mirroring 8086 semantics. They only
  // fire on a known mnemonic whose operand count cannot be valid, so
  // they never contradict the runtime and never flag an unknown opcode
  // (those still go through session's VALID_OPS check).

  _checkOperands(op, args, lineNum) {
    // Balanced brackets in each operand (e.g. "MOV AX]" or "MOV [AX, 5").
    for (const a of args) {
      let depth = 0;
      for (const ch of a) {
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
        if (depth < 0) break;
      }
      if (depth !== 0) {
        this.errors.push({ message: `error: unbalanced brackets in operand '${a}'`, lineNum });
      }
    }

    const count = args.length;
    const spec = OPERAND_SPEC[op];
    if (!spec) return;

    const [min, max] = spec;
    if (count < min || count > max) {
      const expectation = min === max
        ? `expects ${min} operand${min === 1 ? '' : 's'}`
        : `expects ${min} to ${max} operands`;
      this.errors.push({ message: `error: ${op} ${expectation} but got ${count}`, lineNum });
    }
    if (count !== 2) return;

    // Form B: register-pair size mismatch, e.g. "MOV AX, CL".
    if (REGPAIR_OPS.has(op)) {
      const a  = args[0].toUpperCase();
      const b  = args[1].toUpperCase();
      const sa = REG_SIZE[a];
      const sb = REG_SIZE[b];
      if (sa && sb && sa !== sb) {
        this.errors.push({
          message: `error: register size mismatch in ${op} operands '${args[0]}' and '${args[1]}'`,
          lineNum,
        });
      }
    }

    // Form C: destination is an immediate, e.g. "MOV 5, AX".
    // (Exclude registers first: "AH" parses as hex 0x0A via _parseImm but is a register.)
    if (DEST_FIRST_OPS.has(op) && REG_SIZE[args[0].toUpperCase()] === undefined && this._parseImm(args[0]) !== null) {
      this.errors.push({
        message: `error: invalid operand 1 for ${op}: immediate value cannot be a destination`,
        lineNum,
      });
    }
  }

  _splitArgs(s) {
    if (!s) return [];
    const out = [];
    let depth = 0, cur = '';
    for (const ch of s) {
      if (ch === '[') depth++;
      if (ch === ']') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  _parseImm(s) {
    if (!s) return null;
    s = s.trim();
    if (/^[0-9A-Fa-f]+[hH]$/.test(s))  return parseInt(s.slice(0, -1), 16);
    if (/^0[xX][0-9A-Fa-f]+$/.test(s)) return parseInt(s, 16);
    if (/^[01]+[bB]$/.test(s))          return parseInt(s.slice(0, -1), 2);
    if (/^-?\d+$/.test(s))              return parseInt(s, 10);
    if (/^'.'$/.test(s))                return s.charCodeAt(1);
    return null;
  }
}

// ── Executor ───────────────────────────────────────────────────
class Executor {
  constructor(cpu, parsed) {
    this.cpu    = cpu;
    this.instrs = parsed.instrs;
    this.labels = parsed.labels;
    this.vars   = parsed.vars;
    this.errors = [...parsed.errors];
    this.output = [];
    this.trace  = [];
    this.video  = [];   // DOS-screen events (cursor moves / clears) keyed to output position
    this._initMemory();
    this._assignAddresses();
  }

  // Record a video event (cursor position / clear) anchored to the current
  // length of the output stream, so a console can be replayed faithfully.
  _vid(type, data) { this.video.push(Object.assign({ at: this.output.length, type }, data)); }

  // Give every instruction a real byte address (COM-style base CS:0100), build
  // an address→index map, and prime the IP register. Lets the debugger show an
  // authentic CS:IP and resolve breakpoints / "go" targets by address.
  _assignAddresses() {
    this.addrToIdx = {};
    this.codeBase  = 0x100;
    // Pass 1 — assign addresses using each instruction's encoded length.
    let off = 0x100;
    for (let i = 0; i < this.instrs.length; i++) {
      const ins = this.instrs[i];
      ins.addr = off;
      this.addrToIdx[off] = i;
      let bytes = null;
      try { bytes = this._encode(ins); } catch (_) {}
      ins.len = (bytes && bytes.length) ? bytes.length : this._estLen(ins);
      off = (off + ins.len) & 0xFFFF;
    }
    this.codeEnd = off;
    // Pass 2 — encode for real (targets now known) and write the machine code
    // into the code segment at CS:0100, just like a loaded program.
    for (const ins of this.instrs) {
      let bytes = null;
      try { bytes = this._encode(ins); } catch (_) {}
      if (!bytes) bytes = [];
      if (bytes.length < ins.len) bytes = bytes.concat(new Array(ins.len - bytes.length).fill(0x90));
      else if (bytes.length > ins.len) bytes = bytes.slice(0, ins.len);
      ins.bytes = bytes;
      for (let k = 0; k < bytes.length; k++)
        this.cpu.mem[this.cpu.linear('CS', (ins.addr + k) & 0xFFFF)] = bytes[k] & 0xFF;
    }
    this.cpu.regs.IP = this.instrs.length ? this.instrs[0].addr : 0x100;
  }

  // ── 8086 machine-code encoder (covers the common instruction set; anything
  //    not encoded is padded with NOPs so addresses stay consistent) ──
  _encReg(a) {
    if (!a) return null;
    const u = a.toUpperCase();
    const R8 = { AL:0,CL:1,DL:2,BL:3,AH:4,CH:5,DH:6,BH:7 };
    const R16= { AX:0,CX:1,DX:2,BX:3,SP:4,BP:5,SI:6,DI:7 };
    const SEG= { ES:0,CS:1,SS:2,DS:3 };
    if (u in R8)  return { code:R8[u],  size:8,  kind:'r8'  };
    if (u in R16) return { code:R16[u], size:16, kind:'r16' };
    if (u in SEG) return { code:SEG[u], size:16, kind:'seg' };
    return null;
  }
  _encDisp(inner) {
    let s = inner.toUpperCase().replace(/^(CS|DS|ES|SS)\s*:\s*/, '');
    s = s.replace(/\b([0-9A-F]+)H\b/g, (_, n) => parseInt(n, 16));
    s = s.replace(/\b(BX|BP|SI|DI)\b/g, '0');
    s = s.replace(/\b([A-Z_]\w*)\b/g, (_, r) => { const v = this.vars[r]; return v ? v.addr : 0; });
    if (!/^[-\d\s+*/()]*$/.test(s)) return 0;
    try { return (Function('return(' + (s || '0') + ')')() | 0) & 0xFFFF; } catch (_) { return 0; }
  }
  _encMemInfo(arg) {
    const inner = arg.slice(arg.indexOf('[') + 1, arg.lastIndexOf(']'));
    const U = inner.toUpperCase(), has = re => re.test(U);
    const base = (has(/\bBX\b/) && has(/\bSI\b/)) ? 0 : (has(/\bBX\b/) && has(/\bDI\b/)) ? 1
               : (has(/\bBP\b/) && has(/\bSI\b/)) ? 2 : (has(/\bBP\b/) && has(/\bDI\b/)) ? 3
               : has(/\bSI\b/) ? 4 : has(/\bDI\b/) ? 5 : has(/\bBP\b/) ? 6 : has(/\bBX\b/) ? 7 : -1;
    const disp = this._encDisp(inner);
    if (base === -1) return { mod:0, rm:6, disp:[disp & 0xFF, (disp >> 8) & 0xFF] };       // [addr]
    if (disp === 0 && base !== 6) return { mod:0, rm:base, disp:[] };
    if (disp >= -128 && disp <= 127) return { mod:1, rm:base, disp:[disp & 0xFF] };
    return { mod:2, rm:base, disp:[disp & 0xFF, (disp >> 8) & 0xFF] };
  }
  _modrm(reg, rmArg) {
    const r = this._encReg(this._stripPtr(rmArg).arg);
    if (r) return [0xC0 | (reg << 3) | r.code];
    const m = this._encMemInfo(rmArg);
    return [(m.mod << 6) | (reg << 3) | m.rm, ...m.disp];
  }
  _rel(instr, label, len) {
    const u = (label || '').toUpperCase();
    let tgt = null;
    if (this.labels[u] != null) { const t = this.instrs[this.labels[u]]; tgt = t && t.addr; }
    else { const im = this._parseImm(label); if (im != null) tgt = im; }
    if (tgt == null || instr.addr == null) return 0;
    return (tgt - (instr.addr + len)) & 0xFFFF;
  }
  _encode(instr) {
    const op = instr.op, a = instr.args || [];
    const imm = s => this._parseImm(s);
    const isMem = s => s && s.includes('[');
    const lo = v => v & 0xFF, hi = v => (v >> 8) & 0xFF;
    const r0 = a[0] ? this._encReg(this._stripPtr(a[0]).arg) : null;
    const r1 = a[1] ? this._encReg(this._stripPtr(a[1]).arg) : null;

    const SINGLE = { NOP:[0x90],HLT:[0xF4],RET:[0xC3],RETN:[0xC3],RETF:[0xCB],IRET:[0xCF],IRETW:[0xCF],
      CLC:[0xF8],STC:[0xF9],CMC:[0xF5],CLD:[0xFC],STD:[0xFD],CLI:[0xFA],STI:[0xFB],CBW:[0x98],CWD:[0x99],
      PUSHF:[0x9C],POPF:[0x9D],SAHF:[0x9E],LAHF:[0x9F],PUSHA:[0x60],POPA:[0x61],XLAT:[0xD7],XLATB:[0xD7],
      MOVSB:[0xA4],MOVSW:[0xA5],CMPSB:[0xA6],CMPSW:[0xA7],STOSB:[0xAA],STOSW:[0xAB],LODSB:[0xAC],LODSW:[0xAD],
      SCASB:[0xAE],SCASW:[0xAF],DAA:[0x27],DAS:[0x2F],AAA:[0x37],AAS:[0x3F],AAM:[0xD4,0x0A],AAD:[0xD5,0x0A],
      INT3:[0xCC],INTO:[0xCE],WAIT:[0x9B],FWAIT:[0x9B],LOCK:[0xF0],LEAVE:[0xC9] };
    if (SINGLE[op]) return op === 'RET' && a[0] != null ? [0xC2, lo(imm(a[0])), hi(imm(a[0]))] : SINGLE[op].slice();

    const ALU = { ADD:0,OR:1,ADC:2,SBB:3,AND:4,SUB:5,XOR:6,CMP:7 };
    const JCC = { JO:0x70,JNO:0x71,JB:0x72,JC:0x72,JNAE:0x72,JAE:0x73,JNB:0x73,JNC:0x73,JE:0x74,JZ:0x74,
      JNE:0x75,JNZ:0x75,JBE:0x76,JNA:0x76,JA:0x77,JNBE:0x77,JS:0x78,JNS:0x79,JP:0x7A,JPE:0x7A,JNP:0x7B,JPO:0x7B,
      JL:0x7C,JNGE:0x7C,JGE:0x7D,JNL:0x7D,JLE:0x7E,JNG:0x7E,JG:0x7F,JNLE:0x7F };
    const SH = { ROL:0,ROR:1,RCL:2,RCR:3,SHL:4,SAL:4,SHR:5,SAR:7 };
    const UN = { TEST:0,NOT:2,NEG:3,MUL:4,IMUL:5,DIV:6,IDIV:7 };

    switch (op) {
      case 'INT':  { const n = imm(a[0]); return n === 3 ? [0xCC] : [0xCD, lo(n)]; }
      case 'PUSH': if (r0 && r0.kind === 'r16') return [0x50 | r0.code];
                   if (r0 && r0.kind === 'seg') return [[0x06,0x0E,0x16,0x1E][r0.code]];
                   if (!isMem(a[0]) && imm(a[0]) != null) return [0x68, lo(imm(a[0])), hi(imm(a[0]))];
                   if (isMem(a[0])) return [0xFF, ...this._modrm(6, a[0])]; break;
      case 'POP':  if (r0 && r0.kind === 'r16') return [0x58 | r0.code];
                   if (r0 && r0.kind === 'seg') return [[0x07,0x0F,0x17,0x1F][r0.code]];
                   if (isMem(a[0])) return [0x8F, ...this._modrm(0, a[0])]; break;
      case 'INC':  if (r0 && r0.kind === 'r16') return [0x40 | r0.code];
                   if (r0 && r0.kind === 'r8')  return [0xFE, 0xC0 | r0.code];
                   if (isMem(a[0])) return [/WORD/i.test(a[0]) ? 0xFF : 0xFE, ...this._modrm(0, a[0])]; break;
      case 'DEC':  if (r0 && r0.kind === 'r16') return [0x48 | r0.code];
                   if (r0 && r0.kind === 'r8')  return [0xFE, 0xC8 | r0.code];
                   if (isMem(a[0])) return [/WORD/i.test(a[0]) ? 0xFF : 0xFE, ...this._modrm(1, a[0])]; break;
      case 'MOV':  return this._encMov(a, r0, r1);
      case 'LEA':  if (r0 && isMem(a[1])) return [0x8D, ...this._modrm(r0.code, a[1])]; break;
      case 'XCHG': if (r0 && r1 && r0.kind === 'r16' && r1.code === 0) return [0x90 | r0.code];
                   if (r0 && r1 && r1.kind === 'r16' && r0.code === 0) return [0x90 | r1.code];
                   if (r0 && r1) return [r0.size === 8 ? 0x86 : 0x87, 0xC0 | (r1.code << 3) | r0.code]; break;
      case 'JMP':  if (/\bFAR\b/i.test(a[0])) break; return [0xE9, lo(this._rel(instr, a[0].replace(/\bPTR\b/i,'').trim(), 3)), hi(this._rel(instr, a[0].replace(/\bPTR\b/i,'').trim(), 3))];
      case 'CALL': if (/\bFAR\b/i.test(a[0])) break; return [0xE8, lo(this._rel(instr, a[0], 3)), hi(this._rel(instr, a[0], 3))];
      case 'LOOP':   return [0xE2, lo(this._rel(instr, a[0], 2))];
      case 'LOOPE': case 'LOOPZ':  return [0xE1, lo(this._rel(instr, a[0], 2))];
      case 'LOOPNE': case 'LOOPNZ':return [0xE0, lo(this._rel(instr, a[0], 2))];
      case 'JCXZ':   return [0xE3, lo(this._rel(instr, a[0], 2))];
    }
    if (ALU[op] != null) return this._encAlu(ALU[op], a, r0, r1);
    if (JCC[op] != null) return [JCC[op], lo(this._rel(instr, a[0], 2))];
    if (SH[op]  != null) return this._encShift(SH[op], a, r0);
    if (op === 'TEST')   return this._encTest(a, r0, r1);
    if (UN[op]  != null) return this._encUnary(UN[op], a, r0);
    return null;   // unknown → caller pads with NOPs
  }
  _encMov(a, r0, r1) {
    const imm = s => this._parseImm(s), lo = v => v & 0xFF, hi = v => (v >> 8) & 0xFF, isMem = s => s && s.includes('[');
    if (r0 && r1) {
      if (r0.kind === 'seg') return [0x8E, 0xC0 | (r0.code << 3) | r1.code];
      if (r1.kind === 'seg') return [0x8C, 0xC0 | (r1.code << 3) | r0.code];
      return [r0.size === 8 ? 0x88 : 0x89, 0xC0 | (r1.code << 3) | r0.code];
    }
    if (r0 && !isMem(a[1]) && imm(a[1]) != null) { const v = imm(a[1]); return r0.size === 8 ? [0xB0 | r0.code, lo(v)] : [0xB8 | r0.code, lo(v), hi(v)]; }
    if (r0 && this.vars[(a[1] || '').toUpperCase()]) { const v = this.vars[a[1].toUpperCase()].addr; return [0xB8 | r0.code, lo(v), hi(v)]; }
    if (r0 && isMem(a[1])) return [r0.size === 8 ? 0x8A : 0x8B, ...this._modrm(r0.code, a[1])];
    if (r1 && isMem(a[0])) return [r1.size === 8 ? 0x88 : 0x89, ...this._modrm(r1.code, a[0])];
    if (isMem(a[0]) && imm(a[1]) != null) { const v = imm(a[1]); const word = /WORD/i.test(a[0]) || v > 0xFF || v < -128; return word ? [0xC7, ...this._modrm(0, a[0]), lo(v), hi(v)] : [0xC6, ...this._modrm(0, a[0]), lo(v)]; }
    return null;
  }
  _encAlu(grp, a, r0, r1) {
    const imm = s => this._parseImm(s), lo = v => v & 0xFF, hi = v => (v >> 8) & 0xFF, isMem = s => s && s.includes('[');
    if (r0 && r1) return [(grp << 3) | (r0.size === 8 ? 0 : 1), 0xC0 | (r1.code << 3) | r0.code];
    if (r0 && isMem(a[1])) return [(grp << 3) | (r0.size === 8 ? 2 : 3), ...this._modrm(r0.code, a[1])];
    if (r1 && isMem(a[0])) return [(grp << 3) | (r1.size === 8 ? 0 : 1), ...this._modrm(r1.code, a[0])];
    if (r0 && imm(a[1]) != null) {
      const v = imm(a[1]);
      if (r0.code === 0 && r0.kind !== 'seg') return r0.size === 8 ? [(grp << 3) | 0x04, lo(v)] : [(grp << 3) | 0x05, lo(v), hi(v)];
      return r0.size === 8 ? [0x80, 0xC0 | (grp << 3) | r0.code, lo(v)] : [0x81, 0xC0 | (grp << 3) | r0.code, lo(v), hi(v)];
    }
    if (isMem(a[0]) && imm(a[1]) != null) { const v = imm(a[1]); const word = /WORD/i.test(a[0]) || v > 0xFF || v < -128; return word ? [0x81, ...this._modrm(grp, a[0]), lo(v), hi(v)] : [0x80, ...this._modrm(grp, a[0]), lo(v)]; }
    return null;
  }
  _encUnary(grp, a, r0) {
    if (r0) return [r0.size === 8 ? 0xF6 : 0xF7, 0xC0 | (grp << 3) | r0.code];
    if (a[0] && a[0].includes('[')) return [/WORD/i.test(a[0]) ? 0xF7 : 0xF6, ...this._modrm(grp, a[0])];
    return null;
  }
  _encTest(a, r0, r1) {
    const imm = s => this._parseImm(s), lo = v => v & 0xFF, hi = v => (v >> 8) & 0xFF;
    if (r0 && r1) return [r0.size === 8 ? 0x84 : 0x85, 0xC0 | (r1.code << 3) | r0.code];
    if (r0 && imm(a[1]) != null) { const v = imm(a[1]); return r0.size === 8 ? [0xF6, 0xC0 | r0.code, lo(v)] : [0xF7, 0xC0 | r0.code, lo(v), hi(v)]; }
    return null;
  }
  _encShift(grp, a, r0) {
    if (!r0) { if (a[0] && a[0].includes('[')) return [/WORD/i.test(a[0]) ? 0xD1 : 0xD0, ...this._modrm(grp, a[0])]; return null; }
    const w = r0.size === 8 ? 0 : 1, cnt = a[1];
    if (!cnt || cnt === '1') return [0xD0 | w, 0xC0 | (grp << 3) | r0.code];
    if (cnt.toUpperCase() === 'CL') return [0xD2 | w, 0xC0 | (grp << 3) | r0.code];
    return [0xC0 | w, 0xC0 | (grp << 3) | r0.code, (this._parseImm(cnt) || 0) & 0xFF];
  }

  // Estimated encoded length (bytes) — plausible, monotonic addresses for the
  // disassembly window. (The engine executes mnemonics, not encoded bytes.)
  _estLen(ins) {
    const op = ins.op, a = ins.args || [];
    const ONE = new Set(['NOP','HLT','RET','RETN','RETF','IRET','IRETW','CBW','CWD','PUSHF','POPF',
      'PUSHA','PUSHAW','POPA','POPAW','LAHF','SAHF','CLC','STC','CMC','CLD','STD','CLI','STI',
      'XLAT','XLATB','DAA','DAS','AAA','AAS','MOVSB','MOVSW','STOSB','STOSW','LODSB','LODSW',
      'SCASB','SCASW','CMPSB','CMPSW','LEAVE','WAIT','FWAIT','LOCK','INTO','INT3',
      'REP','REPE','REPZ','REPNE','REPNZ']);
    if (ONE.has(op)) return 1;
    if (op === 'INT' || op === 'AAM' || op === 'AAD') return 2;
    if (op[0] === 'J' || op.startsWith('LOOP')) return 2;            // short jumps / loops
    if (op === 'CALL' || op === 'JMP') return /\bFAR\b/i.test(a[0] || '') ? 5 : 3;
    if (op === 'PUSH' || op === 'POP') return this.cpu.isReg(a[0] || '') ? 1 : ((a[0] || '').includes('[') ? 2 : 3);
    let len = 2;
    const mem = a.some(x => x && x.includes('['));
    const imm = a.some(x => x && /^[-0-9]/.test(x.trim()) && !x.includes('['));
    if (mem) len += 2;
    if (imm) len += a.some(x => x && this.cpu.isReg16(x)) ? 2 : 1;
    return Math.min(len, 6);
  }

  _initMemory() {
    for (const v of Object.values(this.vars)) {
      let addr = v.addr;
      if (v.bytes) {
        for (const b of v.bytes) this.cpu.mem[addr++] = b & 0xFF;
      } else if (v.values) {
        for (const val of v.values) {
          if (v.size === 1) { this.cpu.mem[addr] = val & 0xFF; addr++; }
          else { this.cpu.mem[addr] = val & 0xFF; this.cpu.mem[(addr+1)&0xFFFF] = (val>>8)&0xFF; addr+=2; }
        }
      } else {
        const count = v.count ?? 1;
        for (let i = 0; i < count; i++) {
          if (v.size === 1) { this.cpu.mem[addr] = (v.value ?? 0) & 0xFF; addr++; }
          else { this.cpu.mem[addr]=(v.value??0)&0xFF; this.cpu.mem[(addr+1)&0xFFFF]=((v.value??0)>>8)&0xFF; addr+=2; }
        }
      }
    }
  }

  // ── Operand resolution ──
  _stripPtr(arg) {
    let size = null;
    if (/^BYTE\s+PTR\b/i.test(arg)) { size = 8;  arg = arg.replace(/^BYTE\s+PTR\s*/i, ''); }
    if (/^WORD\s+PTR\b/i.test(arg)) { size = 16; arg = arg.replace(/^WORD\s+PTR\s*/i, ''); }
    return { arg: arg.trim(), size };
  }

  resolve(raw) {
    const { arg, size: ptrSize } = this._stripPtr(raw);

    // Register
    if (this.cpu.isReg(arg)) {
      const size = ptrSize ?? this.cpu.regSize(arg);
      return { value: this.cpu.getReg(arg), size, isReg: true, name: arg.toUpperCase() };
    }

    // Memory [...]  (segment chosen by override prefix, BP→SS, else DS)
    if (this._isMemArg(arg)) {
      const mi   = this._memInfo(arg);
      const size = ptrSize ?? 16;
      return { value: this.cpu.memRead(mi.linear, size), size, isMem: true,
               addr: mi.off, seg: mi.seg, linear: mi.linear };
    }

    // Bare data symbol → its OFFSET (NASM semantics; use [sym] for contents).
    const vn = arg.toUpperCase();
    if (this.vars[vn]) {
      return { value: this.vars[vn].addr, size: 16, isImm: true, varName: vn };
    }

    // Immediate
    const imm = this._parseImm(arg);
    if (imm !== null) {
      const size = ptrSize ?? (imm > 0xFF ? 16 : 8);
      return { value: imm, size, isImm: true };
    }

    // Label (used as immediate address for LEA etc.)
    const lu = arg.toUpperCase();
    if (this.labels[lu] !== undefined) return { value: this.labels[lu], size: 16, isLabel: true };

    throw new Error(`Unknown operand: ${raw}`);
  }

  set(raw, value, size) {
    const { arg, size: ptrSize } = this._stripPtr(raw);
    if (this.cpu.isReg(arg)) {
      const mask = this.cpu.regSize(arg) === 8 ? 0xFF : 0xFFFF;
      this.cpu.setReg(arg, value & mask);
      return;
    }
    if (this._isMemArg(arg)) {
      const mi = this._memInfo(arg);
      this.cpu.memWrite(mi.linear, value, ptrSize ?? size ?? 16);
      return;
    }
    const vn = arg.toUpperCase();
    if (this.vars[vn]) {
      const v = this.vars[vn];
      this.cpu.memWrite(this.cpu.linear('DS', v.addr), value, v.size * 8);
      return;
    }
    throw new Error(`Cannot write to: ${raw}`);
  }

  // Is this operand a memory reference?  Accepts `[...]` and an optional
  // segment-override prefix in either MASM (`ES:[BX]`) or NASM (`[ES:BX]`) form.
  _isMemArg(arg) {
    return arg.startsWith('[') || /^(CS|DS|ES|SS)\s*:\s*\[/i.test(arg);
  }

  // Resolve a memory operand to { seg, off, linear }, honouring:
  //  • explicit segment override (CS/DS/ES/SS),
  //  • the 8086 rule that any BP-based address defaults to the stack segment,
  //  • otherwise the data segment.
  _memInfo(arg) {
    let seg = null;
    let m = arg.match(/^(CS|DS|ES|SS)\s*:\s*(\[.*\])$/i);   // MASM:  ES:[BX]
    if (m) { seg = m[1].toUpperCase(); arg = m[2]; }
    if (!arg.startsWith('[') || !arg.endsWith(']')) throw new Error(`Bad memory operand: ${arg}`);

    let inner = arg.slice(1, -1).trim();
    const im = inner.match(/^(CS|DS|ES|SS)\s*:\s*(.*)$/i);  // NASM:  [ES:BX]
    if (im) { seg = im[1].toUpperCase(); inner = im[2].trim(); }

    const vn  = inner.toUpperCase();
    const off = (this.vars[vn] ? this.vars[vn].addr : this._evalAddr(inner)) & 0xFFFF;
    if (!seg) seg = /\bBP\b/i.test(inner) ? 'SS' : 'DS';
    return { seg, off, linear: this.cpu.linear(seg, off) };
  }

  _resolveAddr(expr) {
    const inner = expr.match(/\[(.+)\]/)?.[1]?.trim();
    if (!inner) throw new Error(`Bad memory ref: ${expr}`);
    const vn = inner.toUpperCase();
    if (this.vars[vn]) return this.vars[vn].addr;
    return this._evalAddr(inner);
  }

  _evalAddr(expr) {
    let s = expr;
    // Numeric literals → decimal, BEFORE identifier substitution.
    s = s.replace(/\b([0-9][0-9A-Fa-f]*)[hH]\b/g, (_, n) => parseInt(n, 16).toString(10)); // 1234h / 0FFh
    s = s.replace(/\b0[xX]([0-9A-Fa-f]+)\b/g,     (_, n) => parseInt(n, 16).toString(10)); // 0x1234
    s = s.replace(/\b([01]+)[bB]\b/g,             (_, n) => parseInt(n, 2).toString(10));  // 1010b
    // Registers & data symbols → their numeric value / offset.
    s = s.replace(/\b([A-Za-z_]\w*)\b/g, (_, r) => {
      if (this.cpu.isReg(r)) return this.cpu.getReg(r);
      const vv = this.vars[r.toUpperCase()];
      if (vv) return vv.addr;
      throw new Error(`Unknown address symbol: ${r}`);
    });
    if (!/^[\d\s\+\-\*\/\(\)]+$/.test(s)) throw new Error(`Bad address: ${expr}`);
    // eslint-disable-next-line no-new-func
    return (Function('"use strict";return(' + s + ')'))() & 0xFFFF;
  }

  _parseImm(s) {
    if (!s) return null;
    s = s.trim();
    if (/^[0-9A-Fa-f]+[hH]$/.test(s))  return parseInt(s.slice(0, -1), 16);
    if (/^0[xX][0-9A-Fa-f]+$/.test(s)) return parseInt(s, 16);
    if (/^[01]+[bB]$/.test(s))          return parseInt(s.slice(0, -1), 2);
    if (/^-?\d+$/.test(s))              return parseInt(s, 10);
    if (/^'.'$/.test(s))                return s.charCodeAt(1);
    return null;
  }

  _jumpTarget(label) {
    const u = label.toUpperCase();
    if (this.labels[u] !== undefined) return this.labels[u];
    const imm = this._parseImm(label);
    if (imm !== null) return imm;
    throw new Error(`Unknown label: ${label}`);
  }

  _sign(v, size) { return size === 8 ? (v > 0x7F ? v - 0x100 : v) : (v > 0x7FFF ? v - 0x10000 : v); }

  _condJump(target, cond) {
    if (cond) { this.cpu.ip = this._jumpTarget(target); return true; }
    return false;
  }

  // ── Step ──
  step() {
    if (this.cpu.halted)                      throw new Error('CPU halted (HLT)');
    if (this.cpu.ip >= this.instrs.length)    throw new Error('End of program');

    const instr   = this.instrs[this.cpu.ip];
    const { op, args } = instr;
    let jumped    = false;
    let note      = '';

    try {
      switch (op) {
        case 'NOP': break;
        case 'HLT': this.cpu.halted = true; note = 'HALTED'; break;

        // ── Data transfer ──
        case 'MOV': {
          if (!args[0] || !args[1]) throw new Error('MOV needs 2 operands');
          const d = this._stripPtr(args[0]).arg.toUpperCase();
          const s = this._stripPtr(args[1]).arg.toUpperCase();
          // 8086 rules for segment registers and operand sizes
          if (d === 'CS') throw new Error('Illegal: CS cannot be a MOV destination');
          if (CPU.SEG.includes(d)) {
            if (this._parseImm(args[1]) !== null) throw new Error(`Illegal: MOV ${d}, immediate — load a segment through a register`);
            if (CPU.SEG.includes(s))              throw new Error(`Illegal: MOV ${d}, ${s} — segment-to-segment not allowed`);
            if (this.cpu.isReg(s) && this.cpu.regSize(s) !== 16) throw new Error(`Operand size mismatch: MOV ${d}, ${s}`);
          } else if (this.cpu.isReg(d) && this.cpu.isReg(s) && !CPU.SEG.includes(s) &&
                     this.cpu.regSize(d) !== this.cpu.regSize(s)) {
            throw new Error(`Operand size mismatch: MOV ${d}, ${s}`);
          }
          const src = this.resolve(args[1]);
          this.set(args[0], src.value, src.isReg ? src.size : undefined);
          note = `→ ${this._fmtOp(args[0])} = ${hex(src.value)}`;
          break;
        }

        case 'XCHG': {
          const a = this.resolve(args[0]);
          const b = this.resolve(args[1]);
          this.set(args[0], b.value);
          this.set(args[1], a.value);
          note = `${this._fmtOp(args[0])}↔${this._fmtOp(args[1])}`;
          break;
        }

        case 'LEA': {
          const addr = this._addrOf(args[1]);
          this.set(args[0], addr);
          note = `→ ${this._fmtOp(args[0])} = ${hex(addr)}`;
          break;
        }

        case 'CBW': {
          const al = this.cpu.getReg('AL');
          this.cpu.setReg('AX', al > 0x7F ? (al | 0xFF00) : al);
          break;
        }
        case 'CWD': {
          const ax = this.cpu.getReg('AX');
          this.cpu.setReg('DX', ax > 0x7FFF ? 0xFFFF : 0);
          break;
        }

        case 'XLAT': case 'XLATB': {
          const off = (this.cpu.getReg('BX') + this.cpu.getReg('AL')) & 0xFFFF;
          this.cpu.setReg('AL', this.cpu.memRead(this.cpu.linear('DS', off), 8));
          break;
        }

        // ── Arithmetic ──
        case 'ADD': case 'ADC': {
          const carry = op === 'ADC' ? this.cpu.flags.CF : 0;
          const a = this.resolve(args[0]);
          const b = this.resolve(args[1]);
          const result = a.value + b.value + carry;
          this.cpu.updateFlags(result, a.size, 'ADD', a.value, b.value);
          this.set(args[0], result);
          note = `${this._fmtOp(args[0])} = ${hex(result & (a.size===8?0xFF:0xFFFF))}`;
          break;
        }

        case 'SUB': case 'SBB': {
          const borrow = op === 'SBB' ? this.cpu.flags.CF : 0;
          const a = this.resolve(args[0]);
          const b = this.resolve(args[1]);
          const result = a.value - b.value - borrow;
          this.cpu.updateFlags(result, a.size, 'SUB', a.value, b.value);
          if (op === 'SBB') {
            // CF: unsigned borrow when a < (b + borrow)
            this.cpu.flags.CF = (a.value < b.value + borrow) ? 1 : 0;
            // OF: sign of a differs from sign of (b+borrow), and result sign differs from a
            const sz = a.size, sbit = sz === 8 ? 0x80 : 0x8000;
            const sa = a.value & sbit, sb = (b.value + borrow) & sbit, sr = result & sbit;
            this.cpu.flags.OF = (sa !== sb && sr !== sa) ? 1 : 0;
          }
          this.set(args[0], result);
          note = `${this._fmtOp(args[0])} = ${hex(result & (a.size===8?0xFF:0xFFFF))}`;
          break;
        }

        case 'INC': {
          const a = this.resolve(args[0]);
          const result = a.value + 1;
          const cf = this.cpu.flags.CF;
          this.cpu.updateFlags(result, a.size, 'ADD', a.value, 1);
          this.cpu.flags.CF = cf;
          this.set(args[0], result);
          note = `${this._fmtOp(args[0])} = ${hex(result & (a.size===8?0xFF:0xFFFF))}`;
          break;
        }

        case 'DEC': {
          const a = this.resolve(args[0]);
          const result = a.value - 1;
          const cf = this.cpu.flags.CF;
          this.cpu.updateFlags(result, a.size, 'SUB', a.value, 1);
          this.cpu.flags.CF = cf;
          this.set(args[0], result);
          note = `${this._fmtOp(args[0])} = ${hex(result & (a.size===8?0xFF:0xFFFF))}`;
          break;
        }

        case 'NEG': {
          const a = this.resolve(args[0]);
          const result = 0 - a.value;
          this.cpu.flags.CF = a.value !== 0 ? 1 : 0;
          this.cpu.updateFlags(result, a.size, 'SUB', 0, a.value);
          this.set(args[0], result);
          break;
        }

        case 'MUL': {
          const src = this.resolve(args[0]);
          if (src.size === 8) {
            const r = this.cpu.getReg('AL') * src.value;
            this.cpu.setReg('AX', r & 0xFFFF);
            this.cpu.flags.CF = this.cpu.flags.OF = r > 0xFF ? 1 : 0;
            note = `AX = ${hex(r & 0xFFFF)}`;
          } else {
            const r = this.cpu.getReg('AX') * src.value;
            this.cpu.setReg('AX', r & 0xFFFF);
            this.cpu.setReg('DX', (r >>> 16) & 0xFFFF);
            this.cpu.flags.CF = this.cpu.flags.OF = r > 0xFFFF ? 1 : 0;
            note = `DX:AX = ${hex((r>>>16)&0xFFFF)}:${hex(r&0xFFFF)}`;
          }
          break;
        }

        case 'IMUL': {
          const src = this.resolve(args[0]);
          if (src.size === 8) {
            const r = this._sign(this.cpu.getReg('AL'), 8) * this._sign(src.value, 8);
            this.cpu.setReg('AX', r & 0xFFFF);
            const al = r & 0xFF, ah = (r >> 8) & 0xFF, ext = (al & 0x80) ? 0xFF : 0x00;
            this.cpu.flags.CF = this.cpu.flags.OF = (ah === ext) ? 0 : 1; // set iff result ≠ sign-extension of low half
            note = `AX = ${hex(r & 0xFFFF)}`;
          } else {
            const r = this._sign(this.cpu.getReg('AX'), 16) * this._sign(src.value, 16);
            const ax = r & 0xFFFF, dx = (r >> 16) & 0xFFFF, ext = (ax & 0x8000) ? 0xFFFF : 0x0000;
            this.cpu.setReg('AX', ax);
            this.cpu.setReg('DX', dx);
            this.cpu.flags.CF = this.cpu.flags.OF = (dx === ext) ? 0 : 1;
            note = `DX:AX = ${hex(dx)}:${hex(ax)}`;
          }
          break;
        }

        case 'DIV': {
          const src = this.resolve(args[0]);
          if (src.value === 0) throw new Error('Division by zero');
          if (src.size === 8) {
            const ax = this.cpu.getReg('AX');
            const q = Math.floor(ax / src.value);
            if (q > 0xFF) throw new Error('Divide overflow — quotient too large for AL');
            this.cpu.setReg('AL', q & 0xFF);
            this.cpu.setReg('AH', (ax % src.value) & 0xFF);
            note = `AL=${hex(q & 0xFF)} AH=${hex(ax % src.value & 0xFF)}`;
          } else {
            const dxax = (this.cpu.getReg('DX') * 0x10000 + this.cpu.getReg('AX'));
            const q = Math.floor(dxax / src.value);
            if (q > 0xFFFF) throw new Error('Divide overflow — quotient too large for AX');
            this.cpu.setReg('AX', q & 0xFFFF);
            this.cpu.setReg('DX', (dxax % src.value) & 0xFFFF);
            note = `AX=${hex(q & 0xFFFF)} DX=${hex(dxax % src.value & 0xFFFF)}`;
          }
          break;
        }

        case 'IDIV': {
          const src = this.resolve(args[0]);
          if (src.value === 0) throw new Error('Division by zero');
          if (src.size === 8) {
            const ax = this._sign(this.cpu.getReg('AX'), 16);
            const sv = this._sign(src.value, 8);
            const q  = Math.trunc(ax / sv);
            if (q < -128 || q > 127) throw new Error('Divide overflow — signed quotient out of range');
            this.cpu.setReg('AL', q & 0xFF);
            this.cpu.setReg('AH', ((ax % sv) + 0x100) & 0xFF);
          } else {
            const dxax = this._sign(this.cpu.getReg('DX'), 16) * 0x10000 + this.cpu.getReg('AX');
            const sv   = this._sign(src.value, 16);
            const q    = Math.trunc(dxax / sv);
            if (q < -32768 || q > 32767) throw new Error('Divide overflow — signed quotient out of range');
            this.cpu.setReg('AX', q & 0xFFFF);
            this.cpu.setReg('DX', ((dxax % sv) + 0x10000) & 0xFFFF);
          }
          break;
        }

        // ── Logic ──
        case 'AND': case 'OR': case 'XOR': case 'TEST': {
          const a = this.resolve(args[0]);
          const b = this.resolve(args[1]);
          const result = op === 'AND' || op === 'TEST' ? a.value & b.value
                       : op === 'OR'                   ? a.value | b.value
                       :                                  a.value ^ b.value;
          this.cpu.updateFlags(result, a.size, 'LOG', a.value, b.value);
          if (op !== 'TEST') this.set(args[0], result);
          note = `result = ${hex(result)}`;
          break;
        }

        case 'NOT': {
          const a = this.resolve(args[0]);
          const mask = a.size === 8 ? 0xFF : 0xFFFF;
          this.set(args[0], (~a.value) & mask);
          break;
        }

        case 'CMP': {
          const a = this.resolve(args[0]);
          const b = this.resolve(args[1]);
          const result = a.value - b.value;
          this.cpu.updateFlags(result, a.size, 'SUB', a.value, b.value);
          note = `${this._fmtOp(args[0])}(${hex(a.value)}) - ${hex(b.value)} → flags`;
          break;
        }

                // ── Shifts & Rotates ──
        case 'SHL': case 'SAL': {
          const a = this.resolve(args[0]);
          const cnt = this._shiftCount(args[1]) & 0x1f;      // 8086 masks count to 5 bits
          if (cnt === 0) break;                              // count 0 leaves flags & value unchanged
          const sz = a.size, mask = sz === 8 ? 0xFF : 0xFFFF;
          const result = (a.value << cnt) & mask;
          this.cpu.updateFlags(result, a.size, 'LOG', result, result); // ZF/SF/PF only
          this.cpu.flags.CF = cnt > sz ? 0 : (a.value >> (sz - cnt)) & 1;
          if (cnt === 1) this.cpu.flags.OF = (((result >> (sz - 1)) & 1) ^ this.cpu.flags.CF) ? 1 : 0;
          this.set(args[0], result);
          note = `${this._fmtOp(args[0])} = ${hex(result)}`;
          break;
        }

                case 'SHR': {
          const a = this.resolve(args[0]);
          const cnt = this._shiftCount(args[1]) & 0x1f;      // 8086 masks count to 5 bits
          if (cnt === 0) break;
          const sz = a.size;
          const result = a.value >>> cnt;
          this.cpu.updateFlags(result, a.size, 'LOG', result, result); // ZF/SF/PF only
          this.cpu.flags.CF = cnt > sz ? 0 : (a.value >> (cnt - 1)) & 1;
          if (cnt === 1) this.cpu.flags.OF = ((a.value >> (sz - 1)) & 1) ? 1 : 0;
          this.set(args[0], result);
          note = `${this._fmtOp(args[0])} = ${hex(result)}`;
          break;
        }

        case 'SAR': {
          const a = this.resolve(args[0]);
          const cnt = this._shiftCount(args[1]) & 0x1f;      // 8086 masks count to 5 bits
          if (cnt === 0) break;
          const sz = a.size;
          const signed = this._sign(a.value, sz);
          const result = (signed >> cnt) & (sz === 8 ? 0xFF : 0xFFFF);
          this.cpu.updateFlags(result, a.size, 'LOG', result, result); // ZF/SF/PF only
          this.cpu.flags.CF = cnt >= sz ? (signed < 0 ? 1 : 0) : (a.value >> (cnt - 1)) & 1;
          if (cnt === 1) this.cpu.flags.OF = 0;
          this.set(args[0], result);
          note = `${this._fmtOp(args[0])} = ${hex(result)}`;
          break;
        }

        case 'ROL': {
          const a = this.resolve(args[0]);
          const raw = this._shiftCount(args[1]);
          const cnt5 = raw & 0x1f;                        // 8086 masks count to 5 bits
          if (cnt5 === 0) break;
          const sz = a.size, mask = sz === 8 ? 0xFF : 0xFFFF;
          const cnt = cnt5 % sz;
          const result = cnt === 0 ? (a.value & mask)
                       : ((a.value << cnt) | (a.value >>> (sz - cnt))) & mask;
          // CF = bit that exits MSB; bit (sz-cnt) original, or bit(sz-1) if cnt==0.
          this.cpu.flags.CF = (a.value >> (cnt === 0 ? sz - 1 : sz - cnt)) & 1;
          if (cnt5 === 1) this.cpu.flags.OF = (((result >> (sz - 1)) & 1) ^ (result & 1)) ? 1 : 0;
          this.set(args[0], result);
          note = `${this._fmtOp(args[0])} = ${hex(result)}`;
          break;
        }

        case 'ROR': {
          const a = this.resolve(args[0]);
          const raw = this._shiftCount(args[1]);
          const cnt5 = raw & 0x1f;
          if (cnt5 === 0) break;
          const sz = a.size, mask = sz === 8 ? 0xFF : 0xFFFF;
          const cnt = cnt5 % sz;
          const result = cnt === 0 ? (a.value & mask)
                       : ((a.value >>> cnt) | (a.value << (sz - cnt))) & mask;
          // CF = bit that exits LSB; bit (cnt-1) original, or bit 0 if cnt==0.
          this.cpu.flags.CF = (a.value >> (cnt === 0 ? 0 : cnt - 1)) & 1;
          if (cnt5 === 1) this.cpu.flags.OF = (((result >> (sz - 1)) & 1) ^ ((result >> (sz - 2)) & 1)) ? 1 : 0;
          this.set(args[0], result);
          note = `${this._fmtOp(args[0])} = ${hex(result)}`;
          break;
        }

        case 'RCL': {
          const a = this.resolve(args[0]);
          const raw = this._shiftCount(args[1]);
          const cnt5 = raw & 0x1f;
          if (cnt5 === 0) break;
          const sz = a.size, mask = sz === 8 ? 0xFF : 0xFFFF;
          const cnt = cnt5 % (sz + 1);          // rotate through carry: 9-bit / 17-bit
          let cf = this.cpu.flags.CF, val = a.value & mask;
          for (let i = 0; i < cnt; i++) {
            const newCf = (val >> (sz - 1)) & 1;
            val = ((val << 1) | cf) & mask;
            cf = newCf;
          }
          this.cpu.flags.CF = cf;
          if (cnt5 === 1) this.cpu.flags.OF = (((val >> (sz - 1)) & 1) ^ cf) ? 1 : 0;
          this.set(args[0], val);
          note = `${this._fmtOp(args[0])} = ${hex(val)}`;
          break;
        }

        case 'RCR': {
          const a = this.resolve(args[0]);
          const raw = this._shiftCount(args[1]);
          const cnt5 = raw & 0x1f;
          if (cnt5 === 0) break;
          const sz = a.size, mask = sz === 8 ? 0xFF : 0xFFFF;
          const cnt = cnt5 % (sz + 1);
          let cf = this.cpu.flags.CF, val = a.value & mask;
          if (cnt5 === 1) this.cpu.flags.OF = (((val >> (sz - 1)) & 1) ^ cf) ? 1 : 0; // before rotate
          for (let i = 0; i < cnt; i++) {
            const newCf = val & 1;
            val = ((val >>> 1) | (cf << (sz - 1))) & mask;
            cf = newCf;
          }
          this.cpu.flags.CF = cf;
          this.set(args[0], val);
          note = `${this._fmtOp(args[0])} = ${hex(val)}`;
          break;
        }

        // ── Stack ──
        case 'PUSH': {
          const src = this.resolve(args[0]);
          this.cpu.push(src.value);
          note = `SP=${hex(this.cpu.regs.SP)} ← ${hex(src.value)}`;
          break;
        }
        case 'POP': {
          const val = this.cpu.pop();
          this.set(args[0], val);
          note = `${this._fmtOp(args[0])} = ${hex(val)}`;
          break;
        }
        case 'PUSHF': this.cpu.push(this._flagsWord()); break;
        case 'POPF':  this._setFlagsWord(this.cpu.pop()); break;

        // ── Control flow ──
        case 'JMP': {
          const tgt = args[0].replace(/\bFAR\b/i, '').replace(/\bPTR\b/i, '').trim();
          this.cpu.ip = this._jumpTarget(tgt);
          jumped = true;
          note = `→ ${tgt}`;
          break;
        }

        case 'JE':  case 'JZ':   jumped = this._condJump(args[0], this.cpu.flags.ZF===1); break;
        case 'JNE': case 'JNZ':  jumped = this._condJump(args[0], this.cpu.flags.ZF===0); break;
        case 'JL':  case 'JNGE': jumped = this._condJump(args[0], this.cpu.flags.SF!==this.cpu.flags.OF); break;
        case 'JLE': case 'JNG':  jumped = this._condJump(args[0], this.cpu.flags.ZF===1||this.cpu.flags.SF!==this.cpu.flags.OF); break;
        case 'JG':  case 'JNLE': jumped = this._condJump(args[0], this.cpu.flags.ZF===0&&this.cpu.flags.SF===this.cpu.flags.OF); break;
        case 'JGE': case 'JNL':  jumped = this._condJump(args[0], this.cpu.flags.SF===this.cpu.flags.OF); break;
        case 'JA':  case 'JNBE': jumped = this._condJump(args[0], this.cpu.flags.CF===0&&this.cpu.flags.ZF===0); break;
        case 'JAE': case 'JNB': case 'JNC': jumped = this._condJump(args[0], this.cpu.flags.CF===0); break;
        case 'JB':  case 'JNAE': case 'JC': jumped = this._condJump(args[0], this.cpu.flags.CF===1); break;
        case 'JBE': case 'JNA':  jumped = this._condJump(args[0], this.cpu.flags.CF===1||this.cpu.flags.ZF===1); break;
        case 'JS':               jumped = this._condJump(args[0], this.cpu.flags.SF===1); break;
        case 'JNS':              jumped = this._condJump(args[0], this.cpu.flags.SF===0); break;
        case 'JO':               jumped = this._condJump(args[0], this.cpu.flags.OF===1); break;
        case 'JNO':              jumped = this._condJump(args[0], this.cpu.flags.OF===0); break;
        case 'JP': case 'JPE':   jumped = this._condJump(args[0], this.cpu.flags.PF===1); break;
        case 'JNP': case 'JPO':  jumped = this._condJump(args[0], this.cpu.flags.PF===0); break;
        case 'JCXZ':             jumped = this._condJump(args[0], this.cpu.getReg('CX')===0); break;

        case 'LOOP': {
          const cx = (this.cpu.getReg('CX') - 1) & 0xFFFF;
          this.cpu.setReg('CX', cx);
          note = `CX=${hex(cx)}`;
          if (cx !== 0) { this.cpu.ip = this._jumpTarget(args[0]); jumped = true; }
          break;
        }

        case 'LOOPE': case 'LOOPZ': {
          const cx = (this.cpu.getReg('CX') - 1) & 0xFFFF;
          this.cpu.setReg('CX', cx);
          if (cx !== 0 && this.cpu.flags.ZF === 1) { this.cpu.ip = this._jumpTarget(args[0]); jumped = true; }
          break;
        }

        case 'LOOPNE': case 'LOOPNZ': {
          const cx = (this.cpu.getReg('CX') - 1) & 0xFFFF;
          this.cpu.setReg('CX', cx);
          if (cx !== 0 && this.cpu.flags.ZF === 0) { this.cpu.ip = this._jumpTarget(args[0]); jumped = true; }
          break;
        }

        case 'CALL': {
          const far = /\bFAR\b/i.test(args[0]);
          const tgt = args[0].replace(/\bFAR\b/i, '').replace(/\bPTR\b/i, '').trim();
          if (far) this.cpu.push(this.cpu.getReg('CS'));   // far call saves CS:IP
          this.cpu.push(this.cpu.ip + 1);
          this.cpu.ip = this._jumpTarget(tgt);
          jumped = true;
          note = far ? 'far call' : `ret→${this.cpu.ip - 1}`;
          break;
        }

        case 'RET': case 'RETN': case 'RETF': {
          if (this.cpu.regs.SP >= 0xFFFE) { this.cpu.halted = true; note='HALTED (no ret addr)'; break; }
          this.cpu.ip = this.cpu.pop();
          if (op === 'RETF') this.cpu.setReg('CS', this.cpu.pop());   // far return restores CS
          const extra = args[0] ? (this._parseImm(args[0]) ?? 0) : 0; // RET n : caller-cleanup
          if (extra) this.cpu.setReg('SP', (this.cpu.getReg('SP') + extra) & 0xFFFF);
          jumped = true;
          note = `→ IP=${hex(this.cpu.ip)}`;
          break;
        }

        // ── Flags ──
        case 'CLC': this.cpu.flags.CF = 0; break;
        case 'STC': this.cpu.flags.CF = 1; break;
        case 'CMC': this.cpu.flags.CF ^= 1; break;
        case 'CLD': this.cpu.flags.DF = 0; break;
        case 'STD': this.cpu.flags.DF = 1; break;
        case 'CLI': break;
        case 'STI': break;

        // ── INT ──
        case 'INT': {
          const num = this._parseImm(args[0]);
          if (num === 0x20) {                       // terminate program
            this.cpu.halted = true; note = 'EXIT (INT 20h)';
          } else if (num === 0x21) {
            const ah = this.cpu.getReg('AH');
            switch (ah) {
              case 0x01: {                          // read char, with echo
                const c = this._readChar(); this.cpu.setReg('AL', c & 0xFF);
                if (c) this.output.push(String.fromCharCode(c));
                note = `input '${c ? String.fromCharCode(c) : ''}'`; break;
              }
              case 0x06: {                          // direct console I/O
                const dl = this.cpu.getReg('DL');
                if (dl === 0xFF) { const c = this._readChar(); this.cpu.setReg('AL', c & 0xFF); this.cpu.flags.ZF = c ? 0 : 1; }
                else this.output.push(String.fromCharCode(dl & 0xFF));
                break;
              }
              case 0x07: case 0x08: {               // read char, no echo
                const c = this._readChar(); this.cpu.setReg('AL', c & 0xFF);
                note = 'input (no echo)'; break;
              }
              case 0x02: {                          // print char in DL
                const ch = String.fromCharCode(this.cpu.getReg('DL') & 0xFF);
                this.output.push(ch); note = `output '${ch}'`; break;
              }
              case 0x09: {                          // print '$'-terminated string at DS:DX
                const off = this.cpu.getReg('DX'); let str = '';
                for (let i = 0; i < 1024; i++) { const b = this.cpu.memRead(this.cpu.linear('DS', (off + i) & 0xFFFF), 8); if (b === 0x24) break; str += String.fromCharCode(b); }
                // Safety: limit output to prevent excessive memory reads
                this.output.push(str.substring(0, 1024)); note = `output "${str.replace(/\r\n|\n/g,'↵')}"`; break;
              }
              case 0x0A: {                          // buffered keyboard input → DS:DX
                const off = this.cpu.getReg('DX'), max = this.cpu.memRead(this.cpu.linear('DS', off & 0xFFFF), 8);
                let n = 0, str = '';
                // Protect against max=0 underflow: ensure at least 1 iteration max
                const maxCap = Math.max(max, 1);
                while (n < maxCap - 1) {
                  const c = this._readChar();
                  if (!c || c === 13) break;
                  this.cpu.memWrite(this.cpu.linear('DS', (off + 2 + n) & 0xFFFF), c, 8); n++; str += String.fromCharCode(c);
                }
                this.cpu.memWrite(this.cpu.linear('DS', (off + 2 + n) & 0xFFFF), 13, 8);   // CR terminator
                this.cpu.memWrite(this.cpu.linear('DS', (off + 1) & 0xFFFF), n, 8);        // char count
                this.output.push(str); note = `buffered input "${str}" (${n})`; break;
              }
              case 0x2A: {                          // get system date
                const d = new Date();
                this.cpu.setReg('CX', d.getFullYear()); this.cpu.setReg('DH', d.getMonth() + 1);
                this.cpu.setReg('DL', d.getDate());   this.cpu.setReg('AL', d.getDay()); break;
              }
              case 0x2C: {                          // get system time
                const d = new Date();
                this.cpu.setReg('CH', d.getHours());  this.cpu.setReg('CL', d.getMinutes());
                this.cpu.setReg('DH', d.getSeconds()); this.cpu.setReg('DL', Math.floor(d.getMilliseconds() / 10)); break;
              }
              case 0x30: {                          // get DOS version (report 6.22)
                this.cpu.setReg('AL', 6); this.cpu.setReg('AH', 22);
                this.cpu.setReg('BX', 0); this.cpu.setReg('CX', 0); break;
              }
              case 0x4C: {                          // terminate with return code
                this.cpu.halted = true; note = `EXIT code=${hex(this.cpu.getReg('AL'))}`; break;
              }
              default: note = `INT 21h AH=${hex(ah, 2)} (unhandled)`;
            }
          } else if (num === 0x10) {                // BIOS video
            const ah = this.cpu.getReg('AH');
            if (ah === 0x0E || ah === 0x09 || ah === 0x0A)
              this.output.push(String.fromCharCode(this.cpu.getReg('AL') & 0xFF));        // teletype / write char
            else if (ah === 0x02) this._vid('pos', { r: this.cpu.getReg('DH'), c: this.cpu.getReg('DL') }); // set cursor
            else if (ah === 0x00) this._vid('cls', {});                                   // set mode → clear
            else if ((ah === 0x06 || ah === 0x07) && this.cpu.getReg('AL') === 0) this._vid('cls', {}); // scroll/clear window
            note = `INT 10h AH=${hex(ah, 2)}`;
          } else if (num === 0x16) {                // BIOS keyboard
            const ah = this.cpu.getReg('AH');
            if (ah === 0x00 || ah === 0x10) { const c = this._readChar(); this.cpu.setReg('AL', c & 0xFF); this.cpu.setReg('AH', 0); }
            else if (ah === 0x01 || ah === 0x11) { const has = this.cpu.inputBuffer.length > 0; this.cpu.flags.ZF = has ? 0 : 1; if (has) this.cpu.setReg('AL', this.cpu.inputBuffer[0] & 0xFF); }
          } else {
            note = `INT ${hex(num, 2)}h (no-op)`;
          }
          break;
        }

        // ── String instructions ──
        case 'MOVSB': case 'MOVSW': case 'STOSB': case 'STOSW':
        case 'LODSB': case 'LODSW': case 'SCASB': case 'SCASW':
        case 'CMPSB': case 'CMPSW':
          this._strOp(op);
          note = op;
          break;

        case 'REP': case 'REPE': case 'REPZ': case 'REPNE': case 'REPNZ': {
          const sop = (args[0] || '').toUpperCase();
          const checkZF = op !== 'REP';
          const wantZF  = (op === 'REPE' || op === 'REPZ') ? 1 : 0;
          let cx = this.cpu.getReg('CX'), guard = 0;
          while (cx !== 0) {
            this._strOp(sop);
            cx = (cx - 1) & 0xFFFF;
            this.cpu.setReg('CX', cx);
            if (checkZF && (sop.startsWith('SCAS') || sop.startsWith('CMPS')) && this.cpu.flags.ZF !== wantZF) break;
            if (guard++ > 300000) throw new Error('REP exceeded step limit');
          }
          note = `${op} ${sop} → CX=${hex(cx)}`;
          break;
        }

        // ── BCD adjust ──
        case 'DAA': {
          const al = this.cpu.getReg('AL'), oldCF = this.cpu.flags.CF;
          let AL = al, CF = 0;
          if ((AL & 0x0F) > 9 || this.cpu.flags.AF) { const s = AL + 6; CF = oldCF | (s > 0xFF ? 1 : 0); AL = s & 0xFF; this.cpu.flags.AF = 1; }
          else this.cpu.flags.AF = 0;
          if (al > 0x99 || oldCF) { AL = (AL + 0x60) & 0xFF; CF = 1; }
          this.cpu.flags.CF = CF; this.cpu.setReg('AL', AL); this._setSZP(AL);
          break;
        }
        case 'DAS': {
          const al = this.cpu.getReg('AL'), oldCF = this.cpu.flags.CF;
          let AL = al, CF = 0;
          if ((AL & 0x0F) > 9 || this.cpu.flags.AF) { const borrow = AL < 6 ? 1 : 0; AL = (AL - 6) & 0xFF; CF = oldCF | borrow; this.cpu.flags.AF = 1; }
          else this.cpu.flags.AF = 0;
          if (al > 0x99 || oldCF) { AL = (AL - 0x60) & 0xFF; CF = 1; }
          this.cpu.flags.CF = CF; this.cpu.setReg('AL', AL); this._setSZP(AL);
          break;
        }
        case 'AAA': {
          if ((this.cpu.getReg('AL') & 0x0F) > 9 || this.cpu.flags.AF) {
            this.cpu.setReg('AX', (this.cpu.getReg('AX') + 0x106) & 0xFFFF);
            this.cpu.flags.AF = 1; this.cpu.flags.CF = 1;
          } else { this.cpu.flags.AF = 0; this.cpu.flags.CF = 0; }
          this.cpu.setReg('AL', this.cpu.getReg('AL') & 0x0F);
          break;
        }
        case 'AAS': {
          if ((this.cpu.getReg('AL') & 0x0F) > 9 || this.cpu.flags.AF) {
            this.cpu.setReg('AX', (this.cpu.getReg('AX') - 6) & 0xFFFF);
            this.cpu.setReg('AH', (this.cpu.getReg('AH') - 1) & 0xFF);
            this.cpu.flags.AF = 1; this.cpu.flags.CF = 1;
          } else { this.cpu.flags.AF = 0; this.cpu.flags.CF = 0; }
          this.cpu.setReg('AL', this.cpu.getReg('AL') & 0x0F);
          break;
        }
        case 'AAM': {
          const base = args[0] ? (this._parseImm(args[0]) ?? 10) : 10;
          const al = this.cpu.getReg('AL');
          this.cpu.setReg('AH', Math.floor(al / base) & 0xFF);
          this.cpu.setReg('AL', (al % base) & 0xFF);
          this._setSZP(this.cpu.getReg('AL'));
          break;
        }
        case 'AAD': {
          const base = args[0] ? (this._parseImm(args[0]) ?? 10) : 10;
          const al = this.cpu.getReg('AL'), ah = this.cpu.getReg('AH');
          this.cpu.setReg('AL', (al + ah * base) & 0xFF);
          this.cpu.setReg('AH', 0);
          this._setSZP(this.cpu.getReg('AL'));
          break;
        }

        // ── Stack push/pop all (186) ──
        case 'PUSHA': case 'PUSHAW': {
          const sp = this.cpu.getReg('SP');
          this.cpu.push(this.cpu.getReg('AX')); this.cpu.push(this.cpu.getReg('CX'));
          this.cpu.push(this.cpu.getReg('DX')); this.cpu.push(this.cpu.getReg('BX'));
          this.cpu.push(sp);
          this.cpu.push(this.cpu.getReg('BP')); this.cpu.push(this.cpu.getReg('SI'));
          this.cpu.push(this.cpu.getReg('DI'));
          break;
        }
        case 'POPA': case 'POPAW': {
          this.cpu.setReg('DI', this.cpu.pop()); this.cpu.setReg('SI', this.cpu.pop());
          this.cpu.setReg('BP', this.cpu.pop()); this.cpu.pop(); // discard saved SP
          this.cpu.setReg('BX', this.cpu.pop()); this.cpu.setReg('DX', this.cpu.pop());
          this.cpu.setReg('CX', this.cpu.pop()); this.cpu.setReg('AX', this.cpu.pop());
          break;
        }

        // ── Flag <-> AH transfer ──
        case 'LAHF': {
          const f = this.cpu.flags;
          this.cpu.setReg('AH', (f.CF | (1 << 1) | (f.PF << 2) | (f.AF << 4) | (f.ZF << 6) | (f.SF << 7)) & 0xFF);
          break;
        }
        case 'SAHF': {
          const ah = this.cpu.getReg('AH');
          this.cpu.flags.CF = ah & 1; this.cpu.flags.PF = (ah >> 2) & 1;
          this.cpu.flags.AF = (ah >> 4) & 1; this.cpu.flags.ZF = (ah >> 6) & 1;
          this.cpu.flags.SF = (ah >> 7) & 1;
          break;
        }

        // ── Load far pointer: reg ← [m], DS/ES ← [m+2] ──
        case 'LDS': case 'LES': {
          const off = this._addrOf(args[1]);
          this.set(args[0], this.cpu.memRead(this.cpu.linear('DS', off), 16));
          this.cpu.setReg(op === 'LDS' ? 'DS' : 'ES', this.cpu.memRead(this.cpu.linear('DS', (off + 2) & 0xFFFF), 16));
          note = `${this._fmtOp(args[0])} ${op === 'LDS' ? 'DS' : 'ES'} loaded`;
          break;
        }

        // ── Stack frame (186) ──
        case 'ENTER': {
          const size = this._parseImm(args[0]) ?? 0;  // nesting level ignored (level 0)
          this.cpu.push(this.cpu.getReg('BP'));
          this.cpu.setReg('BP', this.cpu.getReg('SP'));
          this.cpu.setReg('SP', (this.cpu.getReg('SP') - size) & 0xFFFF);
          break;
        }
        case 'LEAVE': {
          this.cpu.setReg('SP', this.cpu.getReg('BP'));
          this.cpu.setReg('BP', this.cpu.pop());
          break;
        }

        // ── Port I/O (simulated port space) ──
        case 'IN': {
          const port = this.cpu.isReg(args[1]) ? this.cpu.getReg(args[1]) : (this._parseImm(args[1]) ?? 0);
          if (args[0].toUpperCase() === 'AL') this.cpu.setReg('AL', this.cpu.ports[port & 0xFFFF]);
          else this.cpu.setReg('AX', this.cpu.ports[port & 0xFFFF] | (this.cpu.ports[(port + 1) & 0xFFFF] << 8));
          note = `IN ${this._fmtOp(args[0])} ← port ${hex(port)}`;
          break;
        }
        case 'OUT': {
          const port = this.cpu.isReg(args[0]) ? this.cpu.getReg(args[0]) : (this._parseImm(args[0]) ?? 0);
          if (args[1].toUpperCase() === 'AL') this.cpu.ports[port & 0xFFFF] = this.cpu.getReg('AL');
          else { const v = this.cpu.getReg('AX'); this.cpu.ports[port & 0xFFFF] = v & 0xFF; this.cpu.ports[(port + 1) & 0xFFFF] = (v >> 8) & 0xFF; }
          note = `OUT port ${hex(port)} ← ${this._fmtOp(args[1])}`;
          break;
        }

        // ── Interrupt return / overflow trap ──
        case 'IRET': case 'IRETW': {
          if (this.cpu.regs.SP >= 0xFFFE) { this.cpu.halted = true; note = 'HALTED (no IRET frame)'; break; }
          this.cpu.ip = this.cpu.pop();
          this.cpu.setReg('CS', this.cpu.pop());
          this._setFlagsWord(this.cpu.pop());
          jumped = true;
          note = `→ IP=${hex(this.cpu.ip)}`;
          break;
        }
        case 'INTO': {
          note = this.cpu.flags.OF ? 'INTO (OF set)' : 'INTO (no trap)';
          break;
        }

        case 'INT3':  note = 'INT3 (breakpoint trap)'; break;
        case 'BOUND': note = 'BOUND (array range check)'; break;

        // ── Accepted no-ops ──
        case 'WAIT': case 'FWAIT': case 'LOCK': case 'ESC': case 'HNT':
          break;

        default:
          throw new Error(`Unsupported instruction: ${op}`);
      }
    } catch (e) {
      const err = new Error(e.message);
      err.lineNum = instr.lineNum;
      err.instr   = instr.raw;
      throw err;
    }

    const entry = {
      ip: this.cpu.ip,
      lineNum: instr.lineNum,
      instr:   instr.raw,
      note,
      jumped,
    };
    this.trace.push(entry);

    if (!jumped) this.cpu.ip++;
    // Keep the architectural IP register in sync with the next CS:IP.
    this.cpu.regs.IP = (this.cpu.ip < this.instrs.length) ? this.instrs[this.cpu.ip].addr : this.codeEnd;
    return entry;
  }

  _shiftCount(arg) {
    if (!arg) return 1;
    if (arg.toUpperCase() === 'CL') return this.cpu.getReg('CL') & 0x1F;
    return (this._parseImm(arg) ?? 1) & 0x1F;
  }

  // Effective address from either `[expr]` or a bare data symbol.
  _addrOf(arg) {
    const { arg: a } = this._stripPtr(arg);
    if (a.startsWith('[')) return this._resolveAddr(a);
    const v = this.vars[a.toUpperCase()];
    if (v) return v.addr;
    return this._evalAddr(a);
  }

  // Consume one queued input char code (0 if none queued).
  _readChar() {
    return this.cpu.inputBuffer.length ? this.cpu.inputBuffer.shift() : 0;
  }

  // Set SF/ZF/PF from an 8-bit result (used by BCD adjust ops).
  _setSZP(v) {
    const r = v & 0xFF;
    this.cpu.flags.ZF = r === 0 ? 1 : 0;
    this.cpu.flags.SF = (r & 0x80) ? 1 : 0;
    let p = r; p ^= p >> 4; p ^= p >> 2; p ^= p >> 1;
    this.cpu.flags.PF = (~p) & 1;
  }

  // One iteration of a string instruction (flat segments). DF picks direction.
  _strOp(op) {
    const d  = this.cpu.flags.DF ? -1 : 1;
    const cpu = this.cpu;
    const src = (sz) => cpu.memRead(cpu.linear('DS', cpu.getReg('SI')), sz);  // DS:SI
    const dst = (sz) => cpu.memRead(cpu.linear('ES', cpu.getReg('DI')), sz);  // ES:DI
    const wr  = (sz, v) => cpu.memWrite(cpu.linear('ES', cpu.getReg('DI')), v, sz);
    const adv = (reg, n) => cpu.setReg(reg, (cpu.getReg(reg) + n) & 0xFFFF);
    switch (op) {
      case 'MOVSB': wr(8,  src(8));  adv('SI', d);   adv('DI', d);   break;
      case 'MOVSW': wr(16, src(16)); adv('SI', 2*d); adv('DI', 2*d); break;
      case 'STOSB': wr(8,  cpu.getReg('AL')); adv('DI', d);   break;
      case 'STOSW': wr(16, cpu.getReg('AX')); adv('DI', 2*d); break;
      case 'LODSB': cpu.setReg('AL', src(8));  adv('SI', d);   break;
      case 'LODSW': cpu.setReg('AX', src(16)); adv('SI', 2*d); break;
      case 'SCASB': { const a = cpu.getReg('AL'), b = dst(8);  cpu.updateFlags(a - b, 8, 'SUB', a, b);  adv('DI', d);   break; }
      case 'SCASW': { const a = cpu.getReg('AX'), b = dst(16); cpu.updateFlags(a - b, 16, 'SUB', a, b); adv('DI', 2*d); break; }
      case 'CMPSB': { const a = src(8),  b = dst(8);  cpu.updateFlags(a - b, 8, 'SUB', a, b);  adv('SI', d);   adv('DI', d);   break; }
      case 'CMPSW': { const a = src(16), b = dst(16); cpu.updateFlags(a - b, 16, 'SUB', a, b); adv('SI', 2*d); adv('DI', 2*d); break; }
      default: throw new Error(`Unknown string op: ${op}`);
    }
  }

  _fmtOp(s) {
    return s.toUpperCase().replace(/\s+/g, '');
  }

  _flagsWord() {
    const f = this.cpu.flags;
    return f.CF | (f.PF << 2) | (f.AF << 4) | (f.ZF << 6) | (f.SF << 7)
         | (f.TF << 8) | (f.IF << 9) | (f.DF << 10) | (f.OF << 11);
  }
  _setFlagsWord(w) {
    this.cpu.flags.CF = w & 1;
    this.cpu.flags.PF = (w >> 2) & 1;
    this.cpu.flags.AF = (w >> 4) & 1;
    this.cpu.flags.ZF = (w >> 6) & 1;
    this.cpu.flags.SF = (w >> 7) & 1;
    this.cpu.flags.TF = (w >> 8) & 1;
    this.cpu.flags.IF = (w >> 9) & 1;
    this.cpu.flags.DF = (w >> 10) & 1;
    this.cpu.flags.OF = (w >> 11) & 1;
  }
}

// ── Helpers ────────────────────────────────────────────────────
function hex(v, digits = 4) {
  if (v < 0) v = v + (digits === 2 ? 0x100 : 0x10000);
  return v.toString(16).toUpperCase().padStart(digits, '0') + 'h';
}
function hex2(v) { return hex(v, 2); }
function dec(v, size) {
  const s = size === 8 ? (v > 0x7F ? v - 0x100 : v) : (v > 0x7FFF ? v - 0x10000 : v);
  return s.toString(10);
}

// ── Example programs ──
const EXAMPLES = [
  {
    name: 'Sum 1..10',
    code: `; Sum of numbers 1 to 10
; Result in AX

    MOV CX, 10      ; loop counter
    MOV AX, 0       ; accumulator
    MOV BX, 1       ; current number

loop_start:
    ADD AX, BX      ; AX += BX
    INC BX          ; next number
    LOOP loop_start ; CX--, repeat if CX != 0

    HLT             ; AX = 55 (0037h)
`,
  },
  {
    name: 'Factorial 5',
    code: `; Factorial of 5 → result in AX

    MOV AX, 1       ; product
    MOV CX, 5       ; counter

fact_loop:
    MUL CX          ; AX = AX * CX
    LOOP fact_loop  ; CX--, repeat

    HLT             ; AX = 120 (0078h)
`,
  },
  {
    name: 'Max of two numbers',
    code: `; Find maximum of BX and CX, store in AX

    MOV BX, 25      ; first number
    MOV CX, 42      ; second number

    MOV AX, BX
    CMP AX, CX      ; compare AX and CX
    JGE done        ; jump if AX >= CX
    MOV AX, CX      ; AX = CX (larger)

done:
    HLT             ; AX = 42 (002Ah)
`,
  },
  {
    name: 'INT 21h Output',
    code: `; Print a string using INT 21h

.data
    msg DB 'Hello, World!', '$'

.code
    MOV AH, 09h     ; function: write string
    MOV DX, msg     ; address of string
    INT 21h         ; call DOS

    MOV AH, 4Ch     ; function: exit
    INT 21h
`,
  },
  {
    name: 'Stack & CALL/RET',
    code: `; Demonstrate CALL, RET, PUSH/POP

    MOV AX, 10
    MOV BX, 20
    CALL add_em
    HLT             ; AX = 30

add_em:
    PUSH BX
    ADD  AX, BX
    POP  BX
    RET
`,
  },
  {
    name: 'Bubble Sort (array)',
    code: `; Bubble sort 5 elements
; Uses memory directly (BX as base, SI as index)

.data
    arr DW 5, 3, 8, 1, 4

.code
    MOV CX, 4          ; outer loop count

outer:
    PUSH CX
    MOV  BX, arr
    MOV  SI, 0

inner:
    MOV  AX, [BX+SI]
    MOV  DX, [BX+SI+2]
    CMP  AX, DX
    JLE  no_swap
    MOV  [BX+SI],   DX
    MOV  [BX+SI+2], AX
no_swap:
    ADD  SI, 2
    CMP  SI, 8         ; 4 pairs × 2 bytes
    JL   inner

    POP  CX
    LOOP outer

    HLT
`,
  },
];

// ── UI Application ─────────────────────────────────────────────
class App {
  constructor() {
    this.cpu      = new CPU();
    this.parser   = new Parser();
    this.executor = null;
    this.parsed   = null;
    this.history  = [];      // CPU snapshots for step-back
    this.outputBuf = '';     // accumulated output chars
    this.autoTimer = null;
    this.runTimer  = null;
    this._parseDebounce = null;
    this._prevRegs = null;

    this._bindUI();
    this._loadExampleByIdx(0);
  }

  // ── UI binding ──
  _bindUI() {
    this.$editor    = document.getElementById('editor');
    this.$lineNums  = document.getElementById('line-nums');
    this.$lineHL    = document.getElementById('line-highlight-canvas');
    this.$edErrors  = document.getElementById('editor-errors');
    this.$regsGrid  = document.getElementById('regs-grid');
    this.$ipVal     = document.getElementById('ip-val');
    this.$spVal     = document.getElementById('sp-val');
    this.$flagsRow  = document.getElementById('flags-row');
    this.$stackBody = document.getElementById('stack-body');
    this.$outPre    = document.getElementById('out-pre');
    this.$memPre    = document.getElementById('mem-pre');
    this.$errList   = document.getElementById('err-list');
    this.$traceList = document.getElementById('trace-list');
    this.$errBadge  = document.getElementById('err-badge');
    this.$status    = document.getElementById('status-pill');
    this.$btnBack   = document.getElementById('btn-step-back');
    this.$btnStep   = document.getElementById('btn-step');
    this.$btnRun    = document.getElementById('btn-run');
    this.$btnStop   = document.getElementById('btn-stop');
    this.$btnReset  = document.getElementById('btn-reset');
    this.$autoTog   = document.getElementById('auto-toggle');
    this.$speedSlider = document.getElementById('speed-slider');
    this.$speedVal  = document.getElementById('speed-val');

    // Editor events
    this.$editor.addEventListener('input',  () => this._onCodeChange());
    this.$editor.addEventListener('scroll', () => this._syncScroll());
    this.$editor.addEventListener('keydown', e => {
      if (e.key === 'Tab') { e.preventDefault(); this._insertTab(); }
    });

    // Toolbar buttons
    document.getElementById('btn-reset').addEventListener('click',  () => this.reset());
    document.getElementById('btn-step-back').addEventListener('click', () => this.stepBack());
    document.getElementById('btn-step').addEventListener('click',   () => this.step());
    document.getElementById('btn-run').addEventListener('click',    () => this.runAll());
    document.getElementById('btn-stop').addEventListener('click',   () => this.stopAuto());
    document.getElementById('btn-example').addEventListener('click', () => this._showExamplePicker());
    document.getElementById('btn-clear').addEventListener('click',  () => this._clearEditor());

    // Auto-step toggle
    this.$autoTog.addEventListener('change', () => {
      if (this.$autoTog.checked) this._startAutoStep();
      else this.stopAuto();
    });

    // Speed slider
    this.$speedSlider.addEventListener('input', () => {
      const ms = this._sliderToMs();
      document.getElementById('speed-val').textContent = ms + 'ms';
      if (this.autoTimer) { this.stopAuto(); this._startAutoStep(); }
    });
    document.getElementById('speed-val').textContent = this._sliderToMs() + 'ms';

    // Tabs
    document.getElementById('tabs').addEventListener('click', e => {
      const btn = e.target.closest('.tab');
      if (!btn) return;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('pane-' + btn.dataset.pane).classList.add('active');
    });

    // Init register grid
    this._buildRegGrid();
    this._buildFlagRow();
    this._updateUI();
  }

  _sliderToMs() {
    const v = parseInt(this.$speedSlider.value);
    const speeds = [50, 100, 200, 300, 500, 700, 1000, 1500, 2000];
    return speeds[v - 1] ?? 500;
  }

  _insertTab() {
    const s = this.$editor.selectionStart;
    const e = this.$editor.selectionEnd;
    this.$editor.value = this.$editor.value.slice(0, s) + '    ' + this.$editor.value.slice(e);
    this.$editor.selectionStart = this.$editor.selectionEnd = s + 4;
    this._onCodeChange();
  }

  // ── Code change handling ──
  _onCodeChange() {
    this._updateLineNums();
    clearTimeout(this._parseDebounce);
    this._parseDebounce = setTimeout(() => this._reparseAndReset(), 300);
  }

  _reparseAndReset() {
    this.reset(true); // parse + reset but keep code
  }

  // ── Reset ──
  reset(keepCode = false) {
    this.stopAuto();
    this.$autoTog.checked = false;
    this.cpu.reset();
    this.history  = [];
    this.outputBuf = '';

    const code = this.$editor.value;
    this.parsed   = this.parser.parse(code);
    this.executor = new Executor(this.cpu, this.parsed);

    this._prevRegs = { ...this.cpu.regs };
    this._updateUI();
    this._setStatus('Ready', '');
  }

  // ── Step forward ──
  step() {
    if (!this.executor) this.reset();
    if (this.cpu.halted)                   return this._setStatus('Halted', 'done');
    if (this.cpu.ip >= this.executor.instrs.length) return this._setStatus('End of program', 'done');
    if (this.parsed.errors.length > 0)     return this._setStatus('Fix errors first', 'error');

    // Save snapshot before step (cap depth — each snapshot copies 1 MB of RAM)
    this.history.push(this.cpu.snapshot());
    if (this.history.length > 1024) this.history.shift();

    const prevRegs = { ...this.cpu.regs };

    try {
      const entry = this.executor.step();
      this._prevRegs = prevRegs;
      this._updateUI(entry);

      if (this.cpu.halted || this.cpu.ip >= this.executor.instrs.length) {
        this._setStatus('Done', 'done');
        this.stopAuto();
      } else {
        this._setStatus(`IP: ${this.cpu.ip}  Line: ${this._currentLineNum()}`, 'running');
      }
    } catch (e) {
      this.history.pop(); // don't save bad state
      this._showRuntimeError(e);
      this.stopAuto();
    }
  }

  _currentLineNum() {
    if (!this.executor || this.cpu.ip >= this.executor.instrs.length) return '-';
    return this.executor.instrs[this.cpu.ip]?.lineNum ?? '-';
  }

  // ── Step back ──
  stepBack() {
    if (this.history.length === 0) return;
    const snap = this.history.pop();
    this._prevRegs = { ...this.cpu.regs };
    this.cpu.restore(snap);
    // Rebuild executor output up to this point by replaying trace
    // (simpler: just re-sync output from trace)
    this.outputBuf = this.executor.output.slice(0, this.executor.trace.length).join('');
    if (this.executor.trace.length > 0) this.executor.trace.pop();
    this._updateUI();
    this._setStatus(`Stepped back — IP: ${this.cpu.ip}`, '');
  }

  // ── Run all ──
  runAll() {
    if (!this.executor) this.reset();
    if (this.parsed.errors.length > 0) return this._setStatus('Fix errors first', 'error');

    const MAX = 100000;
    let steps = 0;
    // Step-back history isn't kept across a full run (1 MB snapshots × 100k
    // steps is infeasible); single-stepping still records history.
    this.history = [];
    this.$btnRun.style.display  = 'none';
    this.$btnStop.style.display = '';

    const tick = () => {
      for (let i = 0; i < 200; i++) {
        if (this.cpu.halted || this.cpu.ip >= this.executor.instrs.length) {
          this._setStatus('Done', 'done');
          this._updateUI();
          this.$btnRun.style.display  = '';
          this.$btnStop.style.display = 'none';
          return;
        }
        if (steps++ > MAX) {
          this._setStatus('Stopped: exceeded 100k steps (possible infinite loop)', 'error');
          this.$btnRun.style.display  = '';
          this.$btnStop.style.display = 'none';
          this._updateUI();
          return;
        }
        try {
          this.executor.step();
        } catch (e) {
          this._showRuntimeError(e);
          this.$btnRun.style.display  = '';
          this.$btnStop.style.display = 'none';
          return;
        }
      }
      this._updateUI();
      this.runTimer = requestAnimationFrame(tick);
    };
    this.runTimer = requestAnimationFrame(tick);
  }

  // ── Auto-step ──
  _startAutoStep() {
    this.stopAuto();
    const ms = this._sliderToMs();
    this.$btnStop.style.display = '';
    this.$btnRun.style.display  = 'none';
    this.autoTimer = setInterval(() => {
      if (this.cpu.halted || this.cpu.ip >= this.executor.instrs.length) {
        this.stopAuto();
        return;
      }
      this.step();
    }, ms);
  }

  stopAuto() {
    clearInterval(this.autoTimer);
    cancelAnimationFrame(this.runTimer);
    this.autoTimer = null;
    this.$btnStop.style.display = 'none';
    this.$btnRun.style.display  = '';
    if (this.$autoTog.checked && !this.cpu.halted) {
      // keep toggle on if not done
    }
  }

  // ── UI update ──
  _updateUI(traceEntry) {
    this._updateRegs();
    this._updateFlags();
    this._updateStack();
    this._updateOutput();
    this._updateMemory();
    this._updateErrors();
    this._updateTrace(traceEntry);
    this._updateLineHighlight();
    this._updateLineNums();
    this.$btnBack.disabled = this.history.length === 0;
  }

  _buildRegGrid() {
    const pairs = [
      ['AX','AL','AH'], ['BX','BL','BH'], ['CX','CL','CH'], ['DX','DL','DH'],
      ['SI',null,null],  ['DI',null,null],  ['BP',null,null],
    ];
    this.$regsGrid.innerHTML = '';
    for (const [r16, lo, hi] of pairs) {
      const cell = document.createElement('div');
      cell.className = 'reg-cell';
      cell.id = 'rc-' + r16;
      cell.innerHTML = `
        <div class="reg-name">${r16}</div>
        <div class="reg-val" id="rv-${r16}">0000h</div>
        ${lo ? `<div class="reg-sub" id="rs-${r16}">${hi}=00 ${lo}=00</div>` : ''}
      `;
      this.$regsGrid.appendChild(cell);
    }
  }

  _updateRegs() {
    const pairs = [
      ['AX','AL','AH'], ['BX','BL','BH'], ['CX','CL','CH'], ['DX','DL','DH'],
      ['SI',null,null],  ['DI',null,null],  ['BP',null,null],
    ];
    for (const [r16, lo, hi] of pairs) {
      const v = this.cpu.getReg(r16);
      const cell = document.getElementById('rc-' + r16);
      const valEl = document.getElementById('rv-' + r16);
      if (!cell || !valEl) continue;

      const changed = this._prevRegs && this._prevRegs[r16] !== v;
      cell.classList.toggle('changed', !!changed);
      valEl.textContent = hex(v);

      if (lo) {
        const subEl = document.getElementById('rs-' + r16);
        if (subEl) subEl.textContent = `${hi}=${hex2(this.cpu.getReg(hi))} ${lo}=${hex2(this.cpu.getReg(lo))}`;
      }
    }
    this.$ipVal.textContent = this.cpu.ip.toString(16).toUpperCase().padStart(4, '0');
    this.$spVal.textContent = hex(this.cpu.regs.SP);
  }

  _buildFlagRow() {
    const flags = ['ZF','SF','CF','OF','PF','DF'];
    this.$flagsRow.innerHTML = '';
    for (const f of flags) {
      const badge = document.createElement('div');
      badge.className = 'flag-badge';
      badge.id = 'fb-' + f;
      badge.title = this._flagDesc(f);
      badge.textContent = f + '=0';
      this.$flagsRow.appendChild(badge);
    }
  }

  _updateFlags() {
    const flags = ['ZF','SF','CF','OF','PF','DF'];
    for (const f of flags) {
      const el = document.getElementById('fb-' + f);
      if (!el) continue;
      const v = this.cpu.flags[f];
      el.textContent = f + '=' + v;
      el.classList.toggle('set', v === 1);
    }
  }

  _flagDesc(f) {
    return { ZF:'Zero Flag', SF:'Sign Flag', CF:'Carry Flag', OF:'Overflow Flag', PF:'Parity Flag', DF:'Direction Flag' }[f] || f;
  }

  _updateStack() {
    // Show values pushed on the stack
    const base = 0xFFFE;
    const sp   = this.cpu.regs.SP;
    let html   = '';
    if (sp >= base) {
      html = '<div class="stack-empty">empty</div>';
    } else {
      let addr = base - 2;
      let depth = 0;
      while (addr >= sp && depth < 16) {
        const val = this.cpu.memRead(addr, 16);
        const isTop = addr === sp;
        html += `<div class="stack-entry">
          <span class="addr">${hex(addr)}</span>
          &nbsp;<span class="val">${hex(val)}</span>
          ${isTop ? ' <span style="color:var(--accent)">← SP</span>' : ''}
        </div>`;
        addr -= 2;
        depth++;
      }
    }
    this.$stackBody.innerHTML = html;
  }

  _updateOutput() {
    if (!this.executor) { this.$outPre.textContent = ''; return; }
    const text = this.executor.output.join('');
    if (!text) {
      this.$outPre.innerHTML = '<span class="out-empty">No output yet</span>';
    } else {
      this.$outPre.textContent = text;
    }
  }

  _updateMemory() {
    if (!this.executor) return;
    // Show non-zero memory regions
    const mem   = this.cpu.mem;
    const lines  = [];
    let i = 0;
    while (i < 0x10000) {
      // Find next non-zero byte
      while (i < 0x10000 && mem[i] === 0) i++;
      if (i >= 0x10000) break;

      // Show 16-byte row
      const row = i & ~0xF;
      const rowEnd = Math.min(row + 16, 0x10000);
      let hexPart  = '';
      let asciiPart = '';
      for (let j = row; j < rowEnd; j++) {
        hexPart   += mem[j].toString(16).toUpperCase().padStart(2, '0') + ' ';
        const c    = mem[j];
        asciiPart += (c >= 0x20 && c < 0x7F) ? String.fromCharCode(c) : '.';
      }
      lines.push(`<span class="mem-addr">${row.toString(16).toUpperCase().padStart(4,'0')}</span>  <span class="mem-bytes">${hexPart.trimEnd()}</span>  <span class="mem-ascii">${asciiPart}</span>`);
      i = rowEnd;
    }
    this.$memPre.innerHTML = lines.length ? lines.join('\n') : '<span style="color:var(--text3)">No data in memory</span>';
  }

  _updateErrors() {
    const allErrors = [
      ...(this.parsed?.errors ?? []),
      ...(this.executor?.errors ?? []),
    ];

    // Editor inline error list
    if (allErrors.length === 0) {
      this.$edErrors.innerHTML = '<div class="editor-errors-empty">✓ No errors</div>';
    } else {
      this.$edErrors.innerHTML = allErrors.map(e =>
        `<div class="editor-error-item">
          <span class="err-line">Line ${e.lineNum ?? '?'}</span>
          <span>${escHtml(e.message)}</span>
        </div>`
      ).join('');
    }

    // Errors tab
    this.$errBadge.textContent = allErrors.length;
    this.$errBadge.classList.toggle('zero', allErrors.length === 0);

    this.$errList.innerHTML = allErrors.length === 0
      ? '<div style="color:var(--green);padding:8px">✓ No errors detected</div>'
      : allErrors.map(e => `
        <div class="err-item">
          <span class="err-icon">✖</span>
          <span class="err-loc">Line ${e.lineNum ?? '?'}</span>
          <div>
            <div class="err-msg">${escHtml(e.message)}</div>
            ${e.instr ? `<div class="err-src">${escHtml(e.instr)}</div>` : ''}
          </div>
        </div>`
      ).join('');
  }

  _updateTrace(newEntry) {
    if (!newEntry) return;
    const item = document.createElement('div');
    item.className = 'trace-item current-trace';
    item.innerHTML = `
      <span class="trace-ip">${newEntry.ip.toString(16).toUpperCase().padStart(4,'0')}</span>
      <span class="trace-ln">L${newEntry.lineNum}</span>
      <span class="trace-instr">${escHtml(newEntry.instr)}</span>
      <span class="trace-note">${escHtml(newEntry.note)}</span>
    `;

    // Deselect previous
    this.$traceList.querySelectorAll('.current-trace').forEach(el => el.classList.remove('current-trace'));
    this.$traceList.appendChild(item);
    item.scrollIntoView({ block: 'nearest' });
  }

  _updateLineHighlight() {
    if (!this.executor || this.cpu.ip >= this.executor.instrs.length) {
      this._clearHighlight(); return;
    }
    const lineNum = this.executor.instrs[this.cpu.ip]?.lineNum;
    if (!lineNum) { this._clearHighlight(); return; }
    this._drawHighlight(lineNum - 1);
  }

  _drawHighlight(lineIdx) {
    const ta  = this.$editor;
    const cv  = this.$lineHL;
    cv.width  = ta.offsetWidth;
    cv.height = ta.offsetHeight;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);

    const lineH   = 20; // px, matches CSS --line-h
    const padTop  = 8;
    const y       = padTop + lineIdx * lineH - ta.scrollTop;

    if (y < 0 || y > cv.height) return;

    ctx.fillStyle = 'rgba(91,156,246,0.12)';
    ctx.fillRect(0, y, cv.width, lineH);

    ctx.strokeStyle = 'rgba(91,156,246,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cv.width, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, y + lineH);
    ctx.lineTo(cv.width, y + lineH);
    ctx.stroke();

    // Scroll textarea to show line
    const targetScroll = lineIdx * lineH - ta.clientHeight / 2 + lineH;
    if (targetScroll > 0) ta.scrollTop = targetScroll;
  }

  _clearHighlight() {
    const cv = this.$lineHL;
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
  }

  _updateLineNums() {
    const lines = (this.$editor.value + '\n').split('\n');
    const lineH = 20;
    const padTop = 8;

    let html = '';
    const ip     = this.cpu.ip;
    const instrs = this.executor?.instrs ?? [];
    const curLine = (ip < instrs.length) ? instrs[ip]?.lineNum : null;

    for (let i = 0; i < lines.length - 1; i++) {
      const ln   = i + 1;
      const isCur = ln === curLine;
      html += `<div style="height:${lineH}px;color:${isCur ? 'var(--yellow)' : 'var(--text3)'}${isCur ? ';font-weight:bold' : ''}">${isCur ? '▶' : ln}</div>`;
    }
    this.$lineNums.innerHTML = html;
    this.$lineNums.scrollTop = this.$editor.scrollTop;
  }

  _syncScroll() {
    this.$lineNums.scrollTop = this.$editor.scrollTop;
    this._updateLineHighlight();
  }

  // ── Status ──
  _setStatus(msg, kind) {
    this.$status.textContent = msg;
    this.$status.className   = 'status-pill' + (kind ? ' ' + kind : '');
  }

  _showRuntimeError(e) {
    const err = { lineNum: e.lineNum, message: e.message, instr: e.instr };
    if (this.executor) this.executor.errors.push(err);
    this._updateErrors();
    this._setStatus(`Error: ${e.message}`, 'error');
    // Switch to errors tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-pane="errors"]').classList.add('active');
    document.getElementById('pane-errors').classList.add('active');
  }

  // ── Example loading ──
  _showExamplePicker() {
    const names = EXAMPLES.map((e, i) => `${i + 1}. ${e.name}`).join('\n');
    const choice = prompt(`Choose an example (1-${EXAMPLES.length}):\n\n${names}`);
    const idx = parseInt(choice) - 1;
    if (idx >= 0 && idx < EXAMPLES.length) this._loadExampleByIdx(idx);
  }

  _loadExampleByIdx(idx) {
    this.$editor.value = EXAMPLES[idx].code;
    this._onCodeChange();
    this.reset();
  }

  _clearEditor() {
    this.$editor.value = '';
    this.reset();
  }
}

// ── Utility ──
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── ESM export (headless engine for tests + UI) ──
// NOTE: the legacy "Boot" block that auto-instantiated the old AFD UI in a
// browser was removed for ASMBOOK — the UI here is the Preact notebook shell.
export { CPU, Parser, Executor, EXAMPLES, hex, hex2, dec };
