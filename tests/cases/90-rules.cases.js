// Assembly-language rule enforcement — the engine behaves like a real CPU /
// assembler and rejects illegal forms instead of silently "doing something".
'use strict';

module.exports = [
  // ── Segment-register load rules ──
  { name: 'MOV CS,AX is illegal',            code: 'MOV CS,AX\nHLT',      expectError: true },
  { name: 'MOV DS,immediate is illegal',     code: 'MOV DS,1000h\nHLT',   expectError: true },
  { name: 'MOV DS,ES (seg→seg) is illegal',  code: 'MOV DS,ES\nHLT',      expectError: true },
  { name: 'MOV DS,AL (size mismatch) illegal',code: 'MOV DS,AL\nHLT',     expectError: true },
  { name: 'MOV DS,AX is legal',              code: 'MOV AX,1000h\nMOV DS,AX\nHLT', regs: { DS: 0x1000 } },

  // ── Operand-size matching ──
  { name: 'MOV AL,BX (8≠16) is illegal',     code: 'MOV AL,BX\nHLT',      expectError: true },
  { name: 'MOV AX,BL (16≠8) is illegal',     code: 'MOV AX,BL\nHLT',      expectError: true },

  // ── Byte vs word memory writes use the operand size ──
  { name: 'MOV [mem],AL writes exactly one byte',
    code: 'MOV DI,10h\nMOV WORD PTR [DI],0AABBh\nMOV AL,0CCh\nMOV [DI],AL\nMOV DX,[DI]\nHLT',
    regs: { DX: 0xAACC },
    mem:  [ { addr: 0x10, size: 8, val: 0xCC }, { addr: 0x11, size: 8, val: 0xAA } ] },

  // ── Divide overflow (real INT 0 condition) ──
  { name: 'DIV byte quotient overflow raises',  code: 'MOV AX,0200h\nMOV BL,1\nDIV BL\nHLT',  expectError: true },
  { name: 'DIV byte within range is fine',      code: 'MOV AX,00FFh\nMOV BL,1\nDIV BL\nHLT',  regs: { AL: 0xFF, AH: 0 } },
  { name: 'IDIV signed quotient overflow raises',code: 'MOV AX,4000h\nMOV BL,1\nIDIV BL\nHLT', expectError: true },

  // ── Far CALL / RETF roundtrip ──
  { name: 'CALL FAR then RETF returns cleanly',
    code: 'MOV AX,1\nCALL FAR sub\nHLT\nsub:\nMOV AX,2\nRETF',
    regs: { AX: 2, SP: 0xFFFE, CS: 0 } },
];
