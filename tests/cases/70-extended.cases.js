// Wave 1 — extended ISA, port I/O, and expanded INT services.
'use strict';

module.exports = [
  // ── PUSHA / POPA ──
  { name: 'PUSHA/POPA preserves all regs',
    code: 'MOV AX,1\nMOV BX,2\nMOV CX,3\nMOV DX,4\nMOV SI,5\nMOV DI,6\nPUSHA\nMOV AX,0\nMOV BX,0\nMOV SI,0\nPOPA\nHLT',
    regs: { AX:1, BX:2, CX:3, DX:4, SI:5, DI:6, SP:0xFFFE } },

  // ── LAHF / SAHF ──
  { name: 'LAHF loads flags into AH (CF=1)', code: 'STC\nLAHF\nHLT', regs: { AH: 0x03 } },
  { name: 'SAHF sets flags from AH=0C5h', code: 'MOV AH,0C5h\nSAHF\nHLT', flags: { CF:1, PF:1, AF:0, ZF:1, SF:1 } },

  // ── LES / LDS ──
  { name: 'LES BX,[fp] loads offset+segment',
    code: '.data\nfp DW 1234h, 5678h\n.code\nLES BX,[fp]\nHLT',
    regs: { BX: 0x1234, ES: 0x5678 } },
  { name: 'LDS SI,[fp] loads offset+segment',
    code: '.data\nfp DW 0ABCDh, 1111h\n.code\nLDS SI,[fp]\nHLT',
    regs: { SI: 0xABCD, DS: 0x1111 } },

  // ── ENTER / LEAVE ──
  { name: 'ENTER 4 / LEAVE restores BP & SP',
    code: 'MOV BP,0\nENTER 4,0\nLEAVE\nHLT',
    regs: { BP: 0, SP: 0xFFFE } },

  // ── Port I/O ──
  { name: 'OUT then IN byte roundtrip', code: 'MOV AL,5Ah\nOUT 60h, AL\nMOV AL,0\nIN AL, 60h\nHLT', regs: { AL: 0x5A } },
  { name: 'OUT/IN via DX port', code: 'MOV DX,300h\nMOV AL,99h\nOUT DX, AL\nMOV AL,0\nIN AL, DX\nHLT', regs: { AL: 0x99 } },
  { name: 'OUT/IN word', code: 'MOV AX,1234h\nOUT 40h, AX\nMOV AX,0\nIN AX, 40h\nHLT', regs: { AX: 0x1234 } },

  // ── INT 21h input services ──
  { name: 'INT21 AH=1 reads char with echo', code: 'MOV AH,1\nINT 21h\nHLT', input: 'A', regs: { AL: 0x41 }, output: 'A' },
  { name: 'INT21 AH=8 reads char no echo',   code: 'MOV AH,8\nINT 21h\nHLT', input: 'B', regs: { AL: 0x42 }, output: '' },
  { name: 'INT21 AH=1 two reads',
    code: 'MOV AH,1\nINT 21h\nMOV BL,AL\nMOV AH,1\nINT 21h\nHLT', input: 'XY', regs: { BL: 0x58, AL: 0x59 }, output: 'XY' },

  // ── INT 21h AH=0Ah buffered input ──
  { name: 'INT21 AH=0Ah buffered input fills DS:DX',
    code: '.data\nmax DB 12\ncnt DB 0\nbuf DB 16 DUP(0)\n.code\nMOV AH,0Ah\nMOV DX, max\nINT 21h\nHLT',
    input: 'Hi\r',
    mem: [ {addr:0x0201, size:8, val:2}, {addr:0x0202, size:8, val:0x48}, {addr:0x0203, size:8, val:0x69}, {addr:0x0204, size:8, val:0x0D} ] },

  // ── INT 21h info services ──
  { name: 'INT21 AH=30h reports DOS 6.22', code: 'MOV AH,30h\nINT 21h\nHLT', regs: { AL: 6, AH: 22 } },
  { name: 'INT21 AH=2Ch get time (smoke, no crash)', code: 'MOV AH,2Ch\nINT 21h\nHLT' },
  { name: 'INT21 AH=2Ah get date (smoke, no crash)', code: 'MOV AH,2Ah\nINT 21h\nHLT' },

  // ── INT 16h keyboard ──
  { name: 'INT16 AH=0 reads scan char', code: 'MOV AH,0\nINT 16h\nHLT', input: 'Z', regs: { AL: 0x5A } },
  { name: 'INT16 AH=1 peek sets ZF when empty', code: 'MOV AH,1\nINT 16h\nHLT', flags: { ZF: 1 } },
  { name: 'INT16 AH=1 peek clears ZF when key waiting', code: 'MOV AH,1\nINT 16h\nHLT', input: 'Q', flags: { ZF: 0 }, regs: { AL: 0x51 } },

  // ── INT 20h terminate ──
  { name: 'INT 20h terminates', code: 'MOV AX,7\nINT 20h\nMOV AX,9\nHLT', regs: { AX: 7 } },

  // ── Unknown INT is a no-op (does not crash) ──
  { name: 'INT 13h unhandled = no-op', code: 'MOV AX,5\nINT 13h\nHLT', regs: { AX: 5 } },

  // ── NOP-likes accepted ──
  { name: 'WAIT/LOCK/NOP accepted', code: 'MOV AX,1\nWAIT\nLOCK\nNOP\nHLT', regs: { AX: 1 } },

  // ── PUSH immediate (186) + PUSH/POP segment ──
  { name: 'PUSH imm then POP', code: 'PUSH 1234h\nPOP AX\nHLT', regs: { AX: 0x1234, SP: 0xFFFE } },
  { name: 'PUSH/POP segment reg', code: 'MOV AX,1357h\nMOV DS,AX\nPUSH DS\nPOP BX\nHLT', regs: { BX: 0x1357 } },
];
