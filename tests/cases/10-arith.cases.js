// ================================================================
//  10-arith.cases.js  —  Arithmetic + FLAGS deep correctness suite
//  Ops: ADD ADC SUB SBB INC DEC NEG CMP CBW CWD
//  Every expected value derived from the Intel 8086 spec
//  (felixcloutier.com/x86, Intel 8086 Family Users Manual).
//
//  Flag rules used (8086):
//   ZF = result==0 ; SF = top bit of result ; PF = even #1-bits in low byte.
//   CF (ADD) = carry out of MSB ; CF (SUB/CMP) = borrow (a < b unsigned).
//   AF = carry/borrow across bit3<->bit4  (a^b^result & 0x10).
//   OF (ADD) = operands same sign, result differs ; (SUB) opposite-sign rule.
//   INC/DEC: set OF/SF/ZF/AF/PF, leave CF UNCHANGED.
//   NEG: CF = (operand != 0) ; OF/SF/ZF/AF/PF as for (0 - operand).
//   CMP: like SUB but destination is NOT written.
//   CBW/CWD: no flags affected.
// ================================================================
'use strict';

module.exports = [
  // ───────────────────────── ADD 8-bit ─────────────────────────
  // 0F + 01 = 10 : carry out of bit3 -> AF=1. 0x10 has one 1-bit -> PF=0.
  { name: 'ADD AL 0F+01 AF carry bit3', code: 'MOV AL,0Fh\nADD AL,1\nHLT',
    regs: { AL: 0x10 }, flags: { CF:0, AF:1, OF:0, SF:0, ZF:0, PF:0 } },

  // 09 + 08 = 11 : (9 + 8 = 0x11) low nibble 9+8=0x11 -> carry bit3 -> AF=1. 0x11 two 1-bits -> PF=1.
  { name: 'ADD AL 09+08 AF carry bit3', code: 'MOV AL,09h\nADD AL,08h\nHLT',
    regs: { AL: 0x11 }, flags: { CF:0, AF:1, OF:0, SF:0, ZF:0, PF:1 } },

  // 07 + 08 = 0F : nibble 7+8=0xF, no carry out of bit3 -> AF=0. 0x0F four 1-bits -> PF=1.
  { name: 'ADD AL 07+08 no AF', code: 'MOV AL,07h\nADD AL,08h\nHLT',
    regs: { AL: 0x0F }, flags: { CF:0, AF:0, OF:0, SF:0, ZF:0, PF:1 } },

  // FF + 01 = 00 : unsigned carry CF=1, result 0 -> ZF=1, AF=1 (F+1 nibble carry), PF=1.
  { name: 'ADD AL FF+01 unsigned wrap', code: 'MOV AL,0FFh\nADD AL,1\nHLT',
    regs: { AL: 0x00 }, flags: { CF:1, AF:1, OF:0, SF:0, ZF:1, PF:1 } },

  // 7F + 01 = 80 : signed overflow OF=1, SF=1, AF=1, CF=0. 0x80 one bit -> PF=0.
  { name: 'ADD AL 7F+01 signed overflow', code: 'MOV AL,7Fh\nADD AL,1\nHLT',
    regs: { AL: 0x80 }, flags: { CF:0, AF:1, OF:1, SF:1, ZF:0, PF:0 } },

  // 80 + 80 = 00 : two negatives -> positive 0 => OF=1, CF=1, ZF=1, AF=0, PF=1.
  { name: 'ADD AL 80+80 neg+neg overflow', code: 'MOV AL,80h\nADD AL,80h\nHLT',
    regs: { AL: 0x00 }, flags: { CF:1, AF:0, OF:1, SF:0, ZF:1, PF:1 } },

  // 40 + 40 = 80 : pos+pos -> negative => OF=1, SF=1, CF=0, AF=0, PF=0.
  { name: 'ADD AL 40+40 pos overflow', code: 'MOV AL,40h\nADD AL,40h\nHLT',
    regs: { AL: 0x80 }, flags: { CF:0, AF:0, OF:1, SF:1, ZF:0, PF:0 } },

  // FF + FF = FE (1FE) : CF=1, AF=1, no signed overflow (-1 + -1 = -2) OF=0, SF=1. 0xFE seven 1-bits -> PF=0.
  { name: 'ADD AL FF+FF', code: 'MOV AL,0FFh\nADD AL,0FFh\nHLT',
    regs: { AL: 0xFE }, flags: { CF:1, AF:1, OF:0, SF:1, ZF:0, PF:0 } },

  // ───────────────────────── ADD 16-bit ─────────────────────────
  // FFFF + 0001 = 0000 : CF=1, ZF=1, AF=1, OF=0, PF=1.
  { name: 'ADD AX FFFF+0001 16-bit wrap', code: 'MOV AX,0FFFFh\nADD AX,1\nHLT',
    regs: { AX: 0x0000 }, flags: { CF:1, AF:1, OF:0, SF:0, ZF:1, PF:1 } },

  // 7FFF + 0001 = 8000 : signed overflow OF=1, SF=1, AF=1, CF=0. low byte 0x00 -> PF=1.
  { name: 'ADD AX 7FFF+0001 signed overflow', code: 'MOV AX,7FFFh\nADD AX,1\nHLT',
    regs: { AX: 0x8000 }, flags: { CF:0, AF:1, OF:1, SF:1, ZF:0, PF:1 } },

  // 1234 + 1234 = 2468 : plain add, low byte 0x68 (0110_1000 three 1-bits) PF=0, AF: nibble 4+4=8 no carry AF=0.
  { name: 'ADD AX 1234+1234', code: 'MOV AX,1234h\nADD AX,1234h\nHLT',
    regs: { AX: 0x2468 }, flags: { CF:0, AF:0, OF:0, SF:0, ZF:0, PF:0 } },

  // 8000 + 8000 = 0000 : CF=1, OF=1 (neg+neg=0), ZF=1, AF=0, PF=1.
  { name: 'ADD AX 8000+8000', code: 'MOV AX,8000h\nADD AX,8000h\nHLT',
    regs: { AX: 0x0000 }, flags: { CF:1, AF:0, OF:1, SF:0, ZF:1, PF:1 } },

  // ───────────────────────── ADC ─────────────────────────
  // CF preset by STC, then ADC AL,0 -> 00+0+1 = 01. PF (0x01 one bit) =0, AF=0, CF=0.
  { name: 'ADC AL honors incoming CF (0+0+1)', code: 'STC\nMOV AL,0\nADC AL,0\nHLT',
    regs: { AL: 0x01 }, flags: { CF:0, AF:0, OF:0, SF:0, ZF:0, PF:0 } },

  // STC then ADC AL,FF on AL=00 -> 00+FF+1 = 100 -> AL=00, CF=1, ZF=1, AF=1 (0+F+1), PF=1.
  { name: 'ADC AL FF+CF wraps', code: 'MOV AL,0\nSTC\nADC AL,0FFh\nHLT',
    regs: { AL: 0x00 }, flags: { CF:1, AF:1, OF:0, SF:0, ZF:1, PF:1 } },

  // No carry in: CLC then ADC AL,1 on AL=0Fh -> 0x10, AF=1, CF=0, PF=0.
  { name: 'ADC AL with CF=0 same as ADD', code: 'MOV AL,0Fh\nCLC\nADC AL,1\nHLT',
    regs: { AL: 0x10 }, flags: { CF:0, AF:1, OF:0, SF:0, ZF:0, PF:0 } },

  // 16-bit ADC: AX=FFFE, STC, ADC AX,1 -> FFFE+1+1 = 10000 -> 0000, CF=1, ZF=1, AF=1, PF=1.
  { name: 'ADC AX FFFE+1+CF wraps', code: 'MOV AX,0FFFEh\nSTC\nADC AX,1\nHLT',
    regs: { AX: 0x0000 }, flags: { CF:1, AF:1, OF:0, SF:0, ZF:1, PF:1 } },

  // ───────────────────────── SUB 8-bit ─────────────────────────
  // 05 - 0A : borrow CF=1, result FB (-5). AF: low nibble 5-A borrow -> AF=1. SF=1. 0xFB (1111_1011 seven bits) PF=0.
  { name: 'SUB AL 05-0A borrow', code: 'MOV AL,5\nSUB AL,0Ah\nHLT',
    regs: { AL: 0xFB }, flags: { CF:1, AF:1, OF:0, SF:1, ZF:0, PF:0 } },

  // 10 - 01 = 0F : borrow from bit4 -> AF=1, CF=0, SF=0. 0x0F four bits -> PF=1.
  { name: 'SUB AL 10-01 AF borrow bit4', code: 'MOV AL,10h\nSUB AL,1\nHLT',
    regs: { AL: 0x0F }, flags: { CF:0, AF:1, OF:0, SF:0, ZF:0, PF:1 } },

  // 50 - 50 = 00 : ZF=1, CF=0, AF=0, OF=0, PF=1, SF=0.
  { name: 'SUB AL equal -> zero', code: 'MOV AL,50h\nSUB AL,50h\nHLT',
    regs: { AL: 0x00 }, flags: { CF:0, AF:0, OF:0, SF:0, ZF:1, PF:1 } },

  // 80 - 01 = 7F : signed overflow (neg - pos = pos) OF=1, SF=0, CF=0, AF=1 (0-1 nibble borrow). 0x7F seven bits PF=0.
  { name: 'SUB AL 80-01 signed overflow', code: 'MOV AL,80h\nSUB AL,1\nHLT',
    regs: { AL: 0x7F }, flags: { CF:0, AF:1, OF:1, SF:0, ZF:0, PF:0 } },

  // 7F - FF = 80 : (127 - (-1) = 128) overflow OF=1, SF=1, CF=1 (7F<FF unsigned), AF=1 (F-F=0 no... 0x7F low F, 0xFF low F => F-F=0 no borrow) AF=0.
  // nibble: 0xF - 0xF = 0 no borrow -> AF=0. 0x80 one bit PF=0.
  { name: 'SUB AL 7F-FF signed overflow', code: 'MOV AL,7Fh\nSUB AL,0FFh\nHLT',
    regs: { AL: 0x80 }, flags: { CF:1, AF:0, OF:1, SF:1, ZF:0, PF:0 } },

  // 00 - 01 = FF : CF=1 (borrow), AF=1, SF=1, OF=0. 0xFF eight bits PF=1.
  { name: 'SUB AL 00-01 underflow', code: 'MOV AL,0\nSUB AL,1\nHLT',
    regs: { AL: 0xFF }, flags: { CF:1, AF:1, OF:0, SF:1, ZF:0, PF:1 } },

  // ───────────────────────── SUB 16-bit ─────────────────────────
  // 0005 - 000A = FFFB : borrow CF=1, AF=1, SF=1, OF=0. low byte 0xFB (seven bits) PF=0.
  { name: 'SUB AX 0005-000A borrow', code: 'MOV AX,5\nSUB AX,0Ah\nHLT',
    regs: { AX: 0xFFFB }, flags: { CF:1, AF:1, OF:0, SF:1, ZF:0, PF:0 } },

  // 8000 - 0001 = 7FFF : signed overflow OF=1, SF=0, CF=0, AF=1. low byte 0xFF eight bits PF=1.
  { name: 'SUB AX 8000-0001 signed overflow', code: 'MOV AX,8000h\nSUB AX,1\nHLT',
    regs: { AX: 0x7FFF }, flags: { CF:0, AF:1, OF:1, SF:0, ZF:0, PF:1 } },

  // 0000 - 0001 = FFFF : CF=1, AF=1, SF=1, OF=0, PF=1.
  { name: 'SUB AX 0000-0001 underflow', code: 'MOV AX,0\nSUB AX,1\nHLT',
    regs: { AX: 0xFFFF }, flags: { CF:1, AF:1, OF:0, SF:1, ZF:0, PF:1 } },

  // ───────────────────────── SBB ─────────────────────────
  // STC then SBB AL,0 on AL=05 -> 5-0-1 = 4. AF=0, CF=0, SF=0. 0x04 one bit PF=0.
  { name: 'SBB AL honors incoming CF (5-0-1)', code: 'MOV AL,5\nSTC\nSBB AL,0\nHLT',
    regs: { AL: 0x04 }, flags: { CF:0, AF:0, OF:0, SF:0, ZF:0, PF:0 } },

  // STC then SBB AL,5 on AL=05 -> 5-5-1 = -1 = FF : CF=1, AF=1, SF=1, OF=0, PF=1.
  { name: 'SBB AL 5-5-1 underflow', code: 'MOV AL,5\nSTC\nSBB AL,5\nHLT',
    regs: { AL: 0xFF }, flags: { CF:1, AF:1, OF:0, SF:1, ZF:0, PF:1 } },

  // CLC then SBB behaves like SUB: 10h - 01h - 0 = 0F, AF=1, CF=0, PF=1.
  { name: 'SBB AL with CF=0 like SUB', code: 'MOV AL,10h\nCLC\nSBB AL,1\nHLT',
    regs: { AL: 0x0F }, flags: { CF:0, AF:1, OF:0, SF:0, ZF:0, PF:1 } },

  // 16-bit SBB: AX=0000, STC, SBB AX,0 -> 0-0-1 = FFFF, CF=1, AF=1, SF=1, OF=0, PF=1.
  { name: 'SBB AX 0-0-1 underflow', code: 'MOV AX,0\nSTC\nSBB AX,0\nHLT',
    regs: { AX: 0xFFFF }, flags: { CF:1, AF:1, OF:0, SF:1, ZF:0, PF:1 } },

  // ───────────────────────── INC (CF untouched) ─────────────────────────
  // STC then INC AL on AL=FF -> 00 : CF must stay 1 (INC never touches CF). ZF=1, AF=1, OF=0, PF=1.
  { name: 'INC AL FF->00 preserves CF=1', code: 'MOV AL,0FFh\nSTC\nINC AL\nHLT',
    regs: { AL: 0x00 }, flags: { CF:1, AF:1, OF:0, SF:0, ZF:1, PF:1 } },

  // CLC then INC AL on AL=FF -> 00 : CF stays 0 (preserved). ZF=1, AF=1, PF=1.
  { name: 'INC AL FF->00 preserves CF=0', code: 'MOV AL,0FFh\nCLC\nINC AL\nHLT',
    regs: { AL: 0x00 }, flags: { CF:0, AF:1, OF:0, SF:0, ZF:1, PF:1 } },

  // INC AL 7F -> 80 : signed overflow OF=1, SF=1, AF=1, ZF=0, CF preserved (STC=1). PF=0.
  { name: 'INC AL 7F->80 overflow, CF kept', code: 'STC\nMOV AL,7Fh\nINC AL\nHLT',
    regs: { AL: 0x80 }, flags: { CF:1, AF:1, OF:1, SF:1, ZF:0, PF:0 } },

  // INC AL 0F -> 10 : AF=1, CF preserved (CLC=0), PF=0.
  { name: 'INC AL 0F->10 AF, CF kept 0', code: 'CLC\nMOV AL,0Fh\nINC AL\nHLT',
    regs: { AL: 0x10 }, flags: { CF:0, AF:1, OF:0, SF:0, ZF:0, PF:0 } },

  // INC AX FFFF -> 0000 : CF preserved (STC=1), ZF=1, AF=1, PF=1.
  { name: 'INC AX FFFF->0000 preserves CF=1', code: 'MOV AX,0FFFFh\nSTC\nINC AX\nHLT',
    regs: { AX: 0x0000 }, flags: { CF:1, AF:1, OF:0, SF:0, ZF:1, PF:1 } },

  // ───────────────────────── DEC (CF untouched) ─────────────────────────
  // STC then DEC AL on AL=00 -> FF : CF preserved=1. SF=1, AF=1, OF=0, ZF=0, PF=1.
  { name: 'DEC AL 00->FF preserves CF=1', code: 'MOV AL,0\nSTC\nDEC AL\nHLT',
    regs: { AL: 0xFF }, flags: { CF:1, AF:1, OF:0, SF:1, ZF:0, PF:1 } },

  // CLC then DEC AL 01 -> 00 : ZF=1, CF preserved=0, AF=0, OF=0, PF=1.
  { name: 'DEC AL 01->00 zero, CF kept 0', code: 'MOV AL,1\nCLC\nDEC AL\nHLT',
    regs: { AL: 0x00 }, flags: { CF:0, AF:0, OF:0, SF:0, ZF:1, PF:1 } },

  // DEC AL 80 -> 7F : signed overflow OF=1, SF=0, AF=1, CF preserved (STC=1). 0x7F seven bits PF=0.
  { name: 'DEC AL 80->7F overflow, CF kept', code: 'STC\nMOV AL,80h\nDEC AL\nHLT',
    regs: { AL: 0x7F }, flags: { CF:1, AF:1, OF:1, SF:0, ZF:0, PF:0 } },

  // DEC AL 10 -> 0F : AF=1 (borrow bit4), CF preserved=0, PF=1.
  { name: 'DEC AL 10->0F AF borrow', code: 'CLC\nMOV AL,10h\nDEC AL\nHLT',
    regs: { AL: 0x0F }, flags: { CF:0, AF:1, OF:0, SF:0, ZF:0, PF:1 } },

  // DEC AX 0000 -> FFFF : CF preserved (STC=1), SF=1, AF=1, OF=0, PF=1.
  { name: 'DEC AX 0000->FFFF preserves CF', code: 'MOV AX,0\nSTC\nDEC AX\nHLT',
    regs: { AX: 0xFFFF }, flags: { CF:1, AF:1, OF:0, SF:1, ZF:0, PF:1 } },

  // ───────────────────────── NEG ─────────────────────────
  // NEG of 0 -> 0 : CF=0 (only zero gives CF=0), ZF=1, AF=0, OF=0, SF=0, PF=1.
  { name: 'NEG AL 00 -> CF=0', code: 'MOV AL,0\nNEG AL\nHLT',
    regs: { AL: 0x00 }, flags: { CF:0, AF:0, OF:0, SF:0, ZF:1, PF:1 } },

  // NEG of 1 -> FF : CF=1 (nonzero), SF=1, AF=1 (0-1 nibble borrow), OF=0, PF=1.
  { name: 'NEG AL 01 -> FF CF=1', code: 'MOV AL,1\nNEG AL\nHLT',
    regs: { AL: 0xFF }, flags: { CF:1, AF:1, OF:0, SF:1, ZF:0, PF:1 } },

  // NEG of 80h -> 80h : the overflow case. CF=1, OF=1, SF=1, AF=0 (0-0 low nibble), ZF=0. 0x80 one bit PF=0.
  { name: 'NEG AL 80 -> overflow OF=1', code: 'MOV AL,80h\nNEG AL\nHLT',
    regs: { AL: 0x80 }, flags: { CF:1, AF:0, OF:1, SF:1, ZF:0, PF:0 } },

  // NEG of 7F -> 81 : CF=1, SF=1, AF=1, OF=0. 0x81 two bits PF=1.
  { name: 'NEG AL 7F -> 81', code: 'MOV AL,7Fh\nNEG AL\nHLT',
    regs: { AL: 0x81 }, flags: { CF:1, AF:1, OF:0, SF:1, ZF:0, PF:1 } },

  // NEG AX 0001 -> FFFF : CF=1, SF=1, AF=1, OF=0, PF=1.
  { name: 'NEG AX 0001 -> FFFF', code: 'MOV AX,1\nNEG AX\nHLT',
    regs: { AX: 0xFFFF }, flags: { CF:1, AF:1, OF:0, SF:1, ZF:0, PF:1 } },

  // NEG AX 8000 -> 8000 : 16-bit overflow case. CF=1, OF=1, SF=1, AF=0, ZF=0. low byte 0x00 PF=1.
  { name: 'NEG AX 8000 -> overflow OF=1', code: 'MOV AX,8000h\nNEG AX\nHLT',
    regs: { AX: 0x8000 }, flags: { CF:1, AF:0, OF:1, SF:1, ZF:0, PF:1 } },

  // NEG AX 0000 -> CF=0, ZF=1.
  { name: 'NEG AX 0000 -> CF=0', code: 'MOV AX,0\nNEG AX\nHLT',
    regs: { AX: 0x0000 }, flags: { CF:0, AF:0, OF:0, SF:0, ZF:1, PF:1 } },

  // ───────────────────────── CMP (no dest write) ─────────────────────────
  // CMP equal: BX unchanged, ZF=1, CF=0, OF=0, SF=0, AF=0, PF=1.
  { name: 'CMP AX,AX equal no write', code: 'MOV AX,1234h\nMOV BX,5678h\nCMP AX,1234h\nHLT',
    regs: { AX: 0x1234, BX: 0x5678 }, flags: { CF:0, AF:0, OF:0, SF:0, ZF:1, PF:1 } },

  // CMP AL,10 with AL=05 : 5-10h borrow => CF=1, dest preserved (AL stays 05). SF=1 (result FB), AF=1, OF=0, PF=0 (0xF5 seven? 0x05-0x10=0xF5: 1111_0101 six bits -> PF=1).
  // 0x05 - 0x10 = 0xF5. 0xF5 = 1111_0101 has 6 ones -> PF=1. nibble 5-0=5 no borrow -> AF=0.
  { name: 'CMP AL 05 vs 10 below, no write', code: 'MOV AL,5\nCMP AL,10h\nHLT',
    regs: { AL: 0x05 }, flags: { CF:1, AF:0, OF:0, SF:1, ZF:0, PF:1 } },

  // CMP AL above: AL=20h vs 10h -> 0x10 result, CF=0, ZF=0, SF=0, AF=0, OF=0, dest=20h. 0x10 one bit PF=0.
  { name: 'CMP AL 20 vs 10 above, no write', code: 'MOV AL,20h\nCMP AL,10h\nHLT',
    regs: { AL: 0x20 }, flags: { CF:0, AF:0, OF:0, SF:0, ZF:0, PF:0 } },

  // CMP signed overflow case: AL=80 vs 01 -> 7F : OF=1, SF=0, CF=0, AF=1, dest=80h unchanged.
  { name: 'CMP AL 80 vs 01 signed overflow', code: 'MOV AL,80h\nCMP AL,1\nHLT',
    regs: { AL: 0x80 }, flags: { CF:0, AF:1, OF:1, SF:0, ZF:0, PF:0 } },

  // CMP 16-bit: AX=7FFF vs FFFF -> 7FFF-FFFF = 8000 borrow CF=1, OF=1 (pos - neg = neg), SF=1, AF=0, dest unchanged.
  // nibble F-F=0 -> AF=0. low byte 0x00 -> PF=1.
  { name: 'CMP AX 7FFF vs FFFF signed overflow', code: 'MOV AX,7FFFh\nCMP AX,0FFFFh\nHLT',
    regs: { AX: 0x7FFF }, flags: { CF:1, AF:0, OF:1, SF:1, ZF:0, PF:1 } },

  // ───────────────────────── CBW (sign-extend AL->AX) ─────────────────────────
  // AL=7F positive -> AH=00, AX=007F. No flags affected.
  { name: 'CBW AL=7F positive', code: 'MOV AX,0FF00h\nMOV AL,7Fh\nCBW\nHLT',
    regs: { AL: 0x7F, AH: 0x00, AX: 0x007F } },

  // AL=80 negative -> AH=FF, AX=FF80.
  { name: 'CBW AL=80 negative', code: 'MOV AX,0\nMOV AL,80h\nCBW\nHLT',
    regs: { AL: 0x80, AH: 0xFF, AX: 0xFF80 } },

  // AL=FF (-1) -> AX=FFFF.
  { name: 'CBW AL=FF -> FFFF', code: 'MOV AL,0FFh\nCBW\nHLT',
    regs: { AX: 0xFFFF, AH: 0xFF } },

  // AL=00 -> AX=0000.
  { name: 'CBW AL=00 -> 0000', code: 'MOV AX,1234h\nMOV AL,0\nCBW\nHLT',
    regs: { AX: 0x0000, AH: 0x00 } },

  // ───────────────────────── CWD (sign-extend AX->DX:AX) ─────────────────────────
  // AX=7FFF positive -> DX=0000.
  { name: 'CWD AX=7FFF positive', code: 'MOV DX,0FFFFh\nMOV AX,7FFFh\nCWD\nHLT',
    regs: { AX: 0x7FFF, DX: 0x0000 } },

  // AX=8000 negative -> DX=FFFF.
  { name: 'CWD AX=8000 negative', code: 'MOV DX,0\nMOV AX,8000h\nCWD\nHLT',
    regs: { AX: 0x8000, DX: 0xFFFF } },

  // AX=FFFF (-1) -> DX=FFFF.
  { name: 'CWD AX=FFFF -> DX=FFFF', code: 'MOV AX,0FFFFh\nCWD\nHLT',
    regs: { AX: 0xFFFF, DX: 0xFFFF } },

  // AX=0001 positive -> DX=0000.
  { name: 'CWD AX=0001 -> DX=0000', code: 'MOV DX,0AAAAh\nMOV AX,1\nCWD\nHLT',
    regs: { AX: 0x0001, DX: 0x0000 } },

  // ───────────────────────── Parity-focused ─────────────────────────
  // ADD AL 00+07 = 07 : 0x07 three 1-bits -> odd -> PF=0.
  { name: 'PF odd: result 07 -> PF=0', code: 'MOV AL,0\nADD AL,7\nHLT',
    regs: { AL: 0x07 }, flags: { PF:0, ZF:0, SF:0, CF:0, OF:0, AF:0 } },

  // ADD AL 00+03 = 03 : 0x03 two 1-bits -> even -> PF=1.
  { name: 'PF even: result 03 -> PF=1', code: 'MOV AL,0\nADD AL,3\nHLT',
    regs: { AL: 0x03 }, flags: { PF:1, ZF:0, SF:0, CF:0, OF:0, AF:0 } },

  // PF on 16-bit checks only low byte: AX = 0FF00h has low byte 0x00 (zero ones -> even) -> PF=1, ZF=0.
  { name: 'PF uses low byte only (FF00)', code: 'MOV AX,0FE00h\nADD AX,100h\nHLT',
    regs: { AX: 0xFF00 }, flags: { PF:1, ZF:0, SF:1, CF:0, OF:0, AF:0 } },

  // ADD AL 41+04 = 45 : 0x45 = 0100_0101 three 1-bits -> odd -> PF=0.
  { name: 'PF odd: result 45 -> PF=0', code: 'MOV AL,41h\nADD AL,4\nHLT',
    regs: { AL: 0x45 }, flags: { PF:0, ZF:0, SF:0, CF:0, OF:0, AF:0 } },
];
