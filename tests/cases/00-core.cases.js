// Seed/core sanity cases (hand-verified against 8086 semantics).
'use strict';
const { EXAMPLES } = require('../../src/kernel/engine.mjs');

module.exports = [
  // ── MOV / register halves ──
  { name: 'MOV imm16 + reg→reg', code: 'MOV AX,1234h\nMOV BX,AX\nHLT', regs: { AX:0x1234, BX:0x1234 } },
  { name: 'MOV 8-bit halves compose AX', code: 'MOV AH,11h\nMOV AL,0FFh\nHLT', regs: { AL:0xFF, AH:0x11, AX:0x11FF } },

  // ── ADD flag edge cases ──
  { name: 'ADD AL 0F+1 → AF set', code: 'MOV AL,0Fh\nADD AL,1\nHLT', regs: { AL:0x10 }, flags: { AF:1, CF:0, ZF:0, SF:0, OF:0 } },
  { name: 'ADD AL FF+1 → wrap', code: 'MOV AL,0FFh\nADD AL,1\nHLT', regs: { AL:0x00 }, flags: { CF:1, ZF:1, AF:1, PF:1, SF:0, OF:0 } },
  { name: 'ADD AL 7F+1 → signed overflow', code: 'MOV AL,7Fh\nADD AL,1\nHLT', regs: { AL:0x80 }, flags: { OF:1, SF:1, CF:0, AF:1, ZF:0 } },

  // ── SUB / CMP ──
  { name: 'SUB AX 5-10 → borrow', code: 'MOV AX,5\nSUB AX,10\nHLT', regs: { AX:0xFFFB }, flags: { CF:1, SF:1, ZF:0, OF:0 } },
  { name: 'CMP equal sets ZF, no write', code: 'MOV AX,7\nCMP AX,7\nHLT', regs: { AX:7 }, flags: { ZF:1, CF:0 } },

  // ── INC/DEC keep CF ──
  { name: 'INC AL FF→00 keeps CF', code: 'MOV AL,0FFh\nSTC\nINC AL\nHLT', regs: { AL:0 }, flags: { ZF:1, CF:1, AF:1 } },
  { name: 'DEC AL 0→FF', code: 'MOV AL,0\nDEC AL\nHLT', regs: { AL:0xFF }, flags: { SF:1, ZF:0 } },
  { name: 'NEG AL 1→FF sets CF', code: 'MOV AL,1\nNEG AL\nHLT', regs: { AL:0xFF }, flags: { CF:1, SF:1 } },

  // ── Logic clears CF/OF ──
  { name: 'AND masks + clears CF/OF', code: 'MOV AX,0F0Fh\nAND AX,0FF0h\nHLT', regs: { AX:0x0F00 }, flags: { CF:0, OF:0, ZF:0 } },
  { name: 'XOR self → 0, ZF', code: 'MOV AX,0FFFFh\nXOR AX,0FFFFh\nHLT', regs: { AX:0 }, flags: { ZF:1, CF:0, OF:0 } },
  { name: 'TEST sets ZF, no write', code: 'MOV AX,4\nTEST AX,1\nHLT', regs: { AX:4 }, flags: { ZF:1 } },
  { name: 'NOT AL', code: 'MOV AL,0Fh\nNOT AL\nHLT', regs: { AL:0xF0 } },

  // ── Shifts / rotates ──
  { name: 'SHL drops MSB into CF', code: 'MOV AL,80h\nSHL AL,1\nHLT', regs: { AL:0 }, flags: { CF:1, ZF:1 } },
  { name: 'SHR drops LSB into CF', code: 'MOV AL,1\nSHR AL,1\nHLT', regs: { AL:0 }, flags: { CF:1, ZF:1 } },
  { name: 'SAR sign-extends', code: 'MOV AL,80h\nSAR AL,1\nHLT', regs: { AL:0xC0 } },
  { name: 'SHL by CL', code: 'MOV AL,1\nMOV CL,3\nSHL AL,CL\nHLT', regs: { AL:8 } },
  { name: 'ROR 1 → MSB', code: 'MOV AL,1\nROR AL,1\nHLT', regs: { AL:0x80 }, flags: { CF:1 } },

  // ── MUL / DIV ──
  { name: 'MUL8 10*10', code: 'MOV AL,10\nMOV BL,10\nMUL BL\nHLT', regs: { AX:100 }, flags: { CF:0, OF:0 } },
  { name: 'MUL8 FF*FF → CF/OF', code: 'MOV AL,0FFh\nMOV BL,0FFh\nMUL BL\nHLT', regs: { AX:0xFE01 }, flags: { CF:1, OF:1 } },
  { name: 'DIV8 100/7', code: 'MOV AX,100\nMOV BL,7\nDIV BL\nHLT', regs: { AL:14, AH:2 } },
  { name: 'DIV16 1000/3', code: 'MOV DX,0\nMOV AX,1000\nMOV CX,3\nDIV CX\nHLT', regs: { AX:333, DX:1 } },

  // ── Stack ──
  { name: 'PUSH/POP roundtrip + SP restored', code: 'MOV AX,1234h\nPUSH AX\nMOV AX,0\nPOP AX\nHLT', regs: { AX:0x1234, SP:0xFFFE } },

  // ── Control flow ──
  { name: 'JG taken when greater', code: 'MOV AX,5\nCMP AX,3\nJG yes\nMOV BX,0\nJMP end\nyes:\nMOV BX,1\nend:\nHLT', regs: { BX:1 } },
  { name: 'JG not taken when less', code: 'MOV AX,2\nCMP AX,3\nJG yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT', regs: { BX:9 } },

  // ── INT 21h output ──
  { name: 'INT21 AH=2 prints char', code: "MOV AH,2\nMOV DL,'A'\nINT 21h\nMOV AH,4Ch\nINT 21h", output: 'A' },

  // ── Documented example programs ──
  { name: 'EXAMPLE Sum 1..10 → AX=55', code: EXAMPLES[0].code, regs: { AX:55 } },
  { name: 'EXAMPLE Factorial 5 → AX=120', code: EXAMPLES[1].code, regs: { AX:120 } },
  { name: 'EXAMPLE Max(25,42) → AX=42', code: EXAMPLES[2].code, regs: { AX:42 } },
  { name: 'EXAMPLE INT21 → Hello, World!', code: EXAMPLES[3].code, output: 'Hello, World!' },
  { name: 'EXAMPLE CALL/RET → AX=30', code: EXAMPLES[4].code, regs: { AX:30 } },
  { name: 'EXAMPLE Bubble sort → 1,3,4,5,8', code: EXAMPLES[5].code,
    mem: [ {addr:0x0200,size:16,val:1}, {addr:0x0202,size:16,val:3}, {addr:0x0204,size:16,val:4}, {addr:0x0206,size:16,val:5}, {addr:0x0208,size:16,val:8} ] },
];
