// ================================================================
//  50-data-mem-io — Data movement, memory addressing, directives,
//  I/O (INT 21h), and string instructions (MOVS/STOS/LODS/SCAS/CMPS
//  with REP/REPE/REPNE + direction flag).
//
//  Every expected value is derived from the true 8086 spec
//  (Intel SDM / felixcloutier), NOT from the engine.
//
//  Data variables lay out from offset 0x0200 in declaration order.
//  CPU init: SP=0xFFFE, IF=1, all other flags 0 (DF=0).
//
//  NOTE (engine status at time of writing):
//   * String ops (MOVSB/MOVSW, STOSB/STOSW, LODSB/LODSW, SCASB/SCASW,
//     CMPSB/CMPSW) and the REP/REPE/REPNE prefixes are NOT yet
//     implemented — those cases are correct-by-spec and will fail
//     until the engine adds them (ENGINE-MISSING).
//   * Absolute hex memory references like [1234h] / [0x1234] currently
//     fail to parse the address (ENGINE-BUG) — the [1234h] case keeps
//     the spec-correct value and will fail until fixed.
// ================================================================
'use strict';

module.exports = [
  // ════════════════════════════════════════════════════════════
  //  MOV — all forms
  // ════════════════════════════════════════════════════════════
  { name: 'MOV imm16 → reg', code: 'MOV AX,1234h\nHLT', regs: { AX: 0x1234 } },
  { name: 'MOV imm8 → reg8', code: 'MOV BL,0ABh\nHLT', regs: { BL: 0xAB } },
  { name: 'MOV reg → reg', code: 'MOV CX,0BEEFh\nMOV DX,CX\nHLT', regs: { CX: 0xBEEF, DX: 0xBEEF } },
  { name: 'MOV imm → mem (word, little-endian)',
    code: '.data\nw DW 0\n.code\nMOV WORD PTR [w],1234h\nHLT',
    mem: [ { addr: 0x200, size: 8, val: 0x34 }, { addr: 0x201, size: 8, val: 0x12 }, { addr: 0x200, size: 16, val: 0x1234 } ] },
  { name: 'MOV mem → reg (word)',
    code: '.data\nv DW 0CAFEh\n.code\nMOV AX,[v]\nHLT',
    regs: { AX: 0xCAFE } },
  { name: 'MOV reg → mem then mem → reg roundtrip',
    code: '.data\nv DW 0\n.code\nMOV AX,7777h\nMOV [v],AX\nMOV BX,[v]\nHLT',
    regs: { BX: 0x7777 }, mem: [ { addr: 0x200, size: 16, val: 0x7777 } ] },
  { name: 'MOV 8-bit halves compose 16-bit reg',
    code: 'MOV AH,12h\nMOV AL,34h\nHLT', regs: { AH: 0x12, AL: 0x34, AX: 0x1234 } },
  { name: 'MOV imm8 → byte mem (BYTE PTR)',
    code: '.data\nb DB 0\n.code\nMOV BYTE PTR [b],41h\nMOV AL,[b]\nHLT',
    regs: { AL: 0x41 }, mem: [ { addr: 0x200, size: 8, val: 0x41 } ] },

  // ════════════════════════════════════════════════════════════
  //  OFFSET (bare symbol) vs contents ([symbol])
  // ════════════════════════════════════════════════════════════
  { name: 'Bare symbol = its OFFSET (0x0200)',
    code: '.data\nx DW 1111h\n.code\nMOV AX,x\nHLT', regs: { AX: 0x0200 } },
  { name: '[symbol] = its CONTENTS',
    code: '.data\nx DW 1111h\n.code\nMOV AX,[x]\nHLT', regs: { AX: 0x1111 } },
  { name: 'OFFSET vs contents side by side',
    code: '.data\nptr DW 4321h\n.code\nMOV BX,ptr\nMOV CX,[ptr]\nHLT',
    regs: { BX: 0x0200, CX: 0x4321 } },
  { name: 'Second var offset = 0x0202 (DW advances 2)',
    code: '.data\na DW 1\nb DW 9999h\n.code\nMOV AX,b\nMOV CX,[b]\nHLT',
    regs: { AX: 0x0202, CX: 0x9999 } },

  // ════════════════════════════════════════════════════════════
  //  XCHG
  // ════════════════════════════════════════════════════════════
  { name: 'XCHG reg,reg swaps',
    code: 'MOV AX,1\nMOV BX,2\nXCHG AX,BX\nHLT', regs: { AX: 2, BX: 1 } },
  { name: 'XCHG reg,mem swaps',
    code: '.data\nw DW 1111h\n.code\nMOV AX,2222h\nXCHG AX,[w]\nHLT',
    regs: { AX: 0x1111 }, mem: [ { addr: 0x200, size: 16, val: 0x2222 } ] },
  { name: 'XCHG AL,AH swaps byte halves',
    code: 'MOV AX,0AB12h\nXCHG AL,AH\nHLT', regs: { AX: 0x12AB } },

  // ════════════════════════════════════════════════════════════
  //  LEA — effective address (not contents)
  // ════════════════════════════════════════════════════════════
  { name: 'LEA loads symbol offset',
    code: '.data\nv DW 5555h\n.code\nLEA BX,[v]\nHLT', regs: { BX: 0x0200 } },
  { name: 'LEA computes [BX+SI+disp]',
    code: 'MOV BX,100h\nMOV SI,4\nLEA AX,[BX+SI+2]\nHLT', regs: { AX: 0x0106 } },
  { name: 'LEA vs MOV: address vs contents',
    code: '.data\nv DW 0DEADh\n.code\nLEA SI,[v]\nMOV AX,[v]\nHLT',
    regs: { SI: 0x0200, AX: 0xDEAD } },

  // ════════════════════════════════════════════════════════════
  //  Memory addressing modes
  // ════════════════════════════════════════════════════════════
  { name: '[DI] direct register-indirect',
    code: 'MOV DI,300h\nMOV WORD PTR [DI],0BABEh\nMOV AX,[DI]\nHLT',
    regs: { AX: 0xBABE }, mem: [ { addr: 0x300, size: 16, val: 0xBABE } ] },
  { name: '[BX+SI] based-indexed (DW array element)',
    code: '.data\narr DW 1234h,5678h,9ABCh\n.code\nMOV BX,arr\nMOV SI,2\nMOV AX,[BX+SI]\nHLT',
    regs: { AX: 0x5678 } },
  { name: '[BX+SI+disp] reaches 3rd element',
    code: '.data\narr DW 1111h,2222h,3333h\n.code\nMOV BX,arr\nMOV SI,0\nMOV AX,[BX+SI+4]\nHLT',
    regs: { AX: 0x3333 } },
  { name: '[1234h] absolute offset (word)',
    // 8086 spec: MOV reg,[disp16] reads the word at DS:0x1234.
    // ENGINE-BUG?: parser rejects the hex displacement (expected ABCDh).
    code: 'MOV WORD PTR [1234h],0ABCDh\nMOV AX,[1234h]\nHLT',
    regs: { AX: 0xABCD } },
  { name: 'Word little-endian: low byte then high byte in memory',
    code: '.data\nw DW 0\n.code\nMOV WORD PTR [w],0BEEFh\nMOV AL,[w]\nHLT',
    regs: { AL: 0xEF }, mem: [ { addr: 0x200, size: 8, val: 0xEF }, { addr: 0x201, size: 8, val: 0xBE } ] },

  // ════════════════════════════════════════════════════════════
  //  Segment registers
  // ════════════════════════════════════════════════════════════
  { name: 'Segment regs init to 0',
    code: 'HLT', regs: { CS: 0, DS: 0, ES: 0, SS: 0 } },
  { name: 'MOV to DS/ES via reg',
    code: 'MOV AX,1000h\nMOV DS,AX\nMOV ES,AX\nHLT', regs: { DS: 0x1000, ES: 0x1000 } },
  { name: 'MOV ES,reg then read back into reg',
    code: 'MOV BX,0B800h\nMOV ES,BX\nMOV CX,ES\nHLT', regs: { ES: 0xB800, CX: 0xB800 } },

  // ════════════════════════════════════════════════════════════
  //  DB / DW directives — layout, lists, DUP, strings, ?
  // ════════════════════════════════════════════════════════════
  { name: 'DB list lays out consecutive bytes',
    code: '.data\nlst DB 10h,20h,30h,40h\n.code\nMOV SI,202h\nMOV AL,[SI]\nHLT',
    regs: { AL: 0x30 },
    mem: [ { addr: 0x200, size: 8, val: 0x10 }, { addr: 0x203, size: 8, val: 0x40 } ] },
  { name: 'DB string layout + index into it',
    code: ".data\ns DB 'HELLO$'\n.code\nMOV SI,202h\nMOV AL,[SI]\nHLT",
    regs: { AL: 0x4C }, // 'L'
    mem: [ { addr: 0x200, size: 8, val: 0x48 }, { addr: 0x205, size: 8, val: 0x24 } ] }, // 'H' ... '$'
  { name: "DB string with ,'$' appends 0x24 terminator",
    code: ".data\nm DB 'Hi','$'\n.code\nMOV DI,202h\nMOV AL,[DI]\nHLT",
    regs: { AL: 0x24 },
    mem: [ { addr: 0x200, size: 8, val: 0x48 }, { addr: 0x201, size: 8, val: 0x69 } ] }, // 'H','i'
  { name: 'DW array little-endian bytes in memory',
    code: '.data\narr DW 0AABBh\n.code\nHLT',
    mem: [ { addr: 0x200, size: 8, val: 0xBB }, { addr: 0x201, size: 8, val: 0xAA } ] },
  { name: 'DB DUP fills N copies, next var follows',
    code: '.data\nbuf DB 5 DUP(0)\nval DB 99h\n.code\nMOV DI,205h\nMOV AL,[DI]\nHLT',
    regs: { AL: 0x99 } },
  { name: 'DW DUP(?) reserves zero-filled words',
    code: '.data\nbuf DW 3 DUP(?)\ntail DW 7777h\n.code\nMOV BX,206h\nMOV AX,[BX]\nHLT',
    regs: { AX: 0x7777 } },
  { name: '? uninitialized still reserves space',
    code: '.data\nx DW ?\ny DW 1357h\n.code\nMOV AX,[y]\nHLT',
    regs: { AX: 0x1357 }, mem: [ { addr: 0x202, size: 16, val: 0x1357 } ] },

  // ════════════════════════════════════════════════════════════
  //  INT 21h — DOS I/O
  // ════════════════════════════════════════════════════════════
  { name: 'INT21 AH=2 prints DL char',
    code: "MOV AH,2\nMOV DL,'A'\nINT 21h\nMOV AH,4Ch\nINT 21h", output: 'A' },
  { name: 'INT21 AH=2 twice prints two chars',
    code: "MOV AH,2\nMOV DL,'O'\nINT 21h\nMOV DL,'K'\nINT 21h\nMOV AH,4Ch\nINT 21h", output: 'OK' },
  { name: "INT21 AH=9 prints string until '$'",
    code: ".data\nmsg DB 'ABC$'\n.code\nMOV AH,9\nMOV DX,msg\nINT 21h\nMOV AH,4Ch\nINT 21h",
    output: 'ABC' },
  { name: "INT21 AH=9 stops at '$', ignores trailing bytes",
    code: ".data\nmsg DB 'Hi$'\ntail DB 'XX$'\n.code\nMOV AH,9\nMOV DX,msg\nINT 21h\nMOV AH,4Ch\nINT 21h",
    output: 'Hi' },
  { name: 'INT21 AH=4Ch halts (exit)',
    code: "MOV AH,2\nMOV DL,'Z'\nINT 21h\nMOV AH,4Ch\nINT 21h\nMOV DL,'!'\nINT 21h",
    output: 'Z' }, // exit halts before second char

  // ════════════════════════════════════════════════════════════
  //  String instructions — direction flag + REP/REPE/REPNE
  //  (ENGINE-MISSING until implemented; values are spec-correct)
  // ════════════════════════════════════════════════════════════

  // ── MOVSB / MOVSW ──
  { name: 'MOVSB DF=0 copies byte, SI++/DI++',
    code: '.data\nsrc DB 0A1h\ndst DB 0\n.code\nMOV SI,200h\nMOV DI,201h\nCLD\nMOVSB\nHLT',
    regs: { SI: 0x201, DI: 0x202 }, mem: [ { addr: 0x201, size: 8, val: 0xA1 } ] },
  { name: 'MOVSW DF=0 copies word, SI+=2/DI+=2',
    code: '.data\nsrc DW 1234h\ndst DW 0\n.code\nMOV SI,200h\nMOV DI,202h\nCLD\nMOVSW\nHLT',
    regs: { SI: 0x202, DI: 0x204 }, mem: [ { addr: 0x202, size: 16, val: 0x1234 } ] },
  { name: 'REP MOVSB copies CX bytes (buffer), CX→0',
    code: '.data\nsrc DB 11h,22h,33h\ndst DB 3 DUP(0)\n.code\nMOV SI,200h\nMOV DI,203h\nMOV CX,3\nCLD\nREP MOVSB\nHLT',
    regs: { CX: 0, SI: 0x203, DI: 0x206 },
    mem: [ { addr: 0x203, size: 8, val: 0x11 }, { addr: 0x204, size: 8, val: 0x22 }, { addr: 0x205, size: 8, val: 0x33 } ] },
  { name: 'MOVSB DF=1 decrements SI/DI',
    code: '.data\nsrc DB 7Eh\ndst DB 0\n.code\nMOV SI,200h\nMOV DI,201h\nSTD\nMOVSB\nHLT',
    regs: { SI: 0x1FF, DI: 0x200 }, mem: [ { addr: 0x201, size: 8, val: 0x7E } ] },

  // ── STOSB / STOSW ──
  { name: 'STOSB stores AL at ES:[DI], DI++',
    code: '.data\ndst DB 4 DUP(0)\n.code\nMOV AL,0FFh\nMOV DI,200h\nCLD\nSTOSB\nHLT',
    regs: { DI: 0x201 }, mem: [ { addr: 0x200, size: 8, val: 0xFF } ] },
  { name: 'REP STOSB fills buffer with AL, CX→0',
    code: '.data\ndst DB 4 DUP(0)\n.code\nMOV AL,55h\nMOV DI,200h\nMOV CX,4\nCLD\nREP STOSB\nHLT',
    regs: { CX: 0, DI: 0x204 },
    mem: [ { addr: 0x200, size: 8, val: 0x55 }, { addr: 0x203, size: 8, val: 0x55 } ] },
  { name: 'STOSW stores AX (little-endian), DI+=2',
    code: '.data\ndst DW 0\n.code\nMOV AX,0BEEFh\nMOV DI,200h\nCLD\nSTOSW\nHLT',
    regs: { DI: 0x202 },
    mem: [ { addr: 0x200, size: 8, val: 0xEF }, { addr: 0x201, size: 8, val: 0xBE } ] },

  // ── LODSB / LODSW ──
  { name: 'LODSB loads DS:[SI] into AL, SI++',
    code: '.data\nsrc DB 5Ah,0\n.code\nMOV SI,200h\nCLD\nLODSB\nHLT',
    regs: { AL: 0x5A, SI: 0x201 } },
  { name: 'LODSW loads word into AX, SI+=2',
    code: '.data\nsrc DW 0C0DEh\n.code\nMOV SI,200h\nCLD\nLODSW\nHLT',
    regs: { AX: 0xC0DE, SI: 0x202 } },

  // ── SCASB / SCASW (sets ZF) ──
  { name: 'SCASB match sets ZF=1, DI++',
    code: '.data\nbuf DB 41h\n.code\nMOV AL,41h\nMOV DI,200h\nCLD\nSCASB\nHLT',
    regs: { DI: 0x201 }, flags: { ZF: 1, CF: 0 } },
  { name: 'SCASB mismatch (AL>mem) clears ZF, CF=0',
    code: '.data\nbuf DB 10h\n.code\nMOV AL,20h\nMOV DI,200h\nCLD\nSCASB\nHLT',
    regs: { DI: 0x201 }, flags: { ZF: 0, CF: 0 } },
  { name: 'SCASW match sets ZF, DI+=2',
    code: '.data\nbuf DW 1234h\n.code\nMOV AX,1234h\nMOV DI,200h\nCLD\nSCASW\nHLT',
    regs: { DI: 0x202 }, flags: { ZF: 1 } },
  { name: 'REPNE SCASB scans for 0Dh, stops on match',
    // src = "AB\r"; scan for 0Dh starting at DI=0x200, CX=3.
    // step1 cmp 'A'≠CR ZF=0 cont, step2 'B'≠CR cont, step3 CR==CR ZF=1 stop.
    code: '.data\nbuf DB 41h,42h,0Dh\n.code\nMOV AL,0Dh\nMOV DI,200h\nMOV CX,3\nCLD\nREPNE SCASB\nHLT',
    regs: { CX: 0, DI: 0x203 }, flags: { ZF: 1 } },

  // ── CMPSB / CMPSW (sets ZF) + REPE ──
  { name: 'CMPSB equal bytes sets ZF, SI++/DI++',
    code: '.data\na DB 77h\nb DB 77h\n.code\nMOV SI,200h\nMOV DI,201h\nCLD\nCMPSB\nHLT',
    regs: { SI: 0x201, DI: 0x202 }, flags: { ZF: 1 } },
  { name: 'CMPSB unequal clears ZF',
    code: '.data\na DB 77h\nb DB 88h\n.code\nMOV SI,200h\nMOV DI,201h\nCLD\nCMPSB\nHLT',
    regs: { SI: 0x201, DI: 0x202 }, flags: { ZF: 0 } },
  { name: 'REPE CMPSB equal strings: runs full CX, ZF=1',
    code: '.data\ns1 DB 41h,42h,43h\ns2 DB 41h,42h,43h\n.code\nMOV SI,200h\nMOV DI,203h\nMOV CX,3\nCLD\nREPE CMPSB\nHLT',
    regs: { CX: 0, SI: 0x203, DI: 0x206 }, flags: { ZF: 1 } },
  { name: 'REPE CMPSB stops at first difference, ZF=0',
    // s1=ABX s2=ABY; cmp A==A (CX 3->2), B==B (2->1), X!=Y ZF=0 stop (CX 1->0).
    code: '.data\ns1 DB 41h,42h,58h\ns2 DB 41h,42h,59h\n.code\nMOV SI,200h\nMOV DI,203h\nMOV CX,3\nCLD\nREPE CMPSB\nHLT',
    regs: { CX: 0, SI: 0x203, DI: 0x206 }, flags: { ZF: 0 } },
  { name: 'CMPSW compares words, SI+=2/DI+=2',
    code: '.data\na DW 0AAAAh\nb DW 0AAAAh\n.code\nMOV SI,200h\nMOV DI,202h\nCLD\nCMPSW\nHLT',
    regs: { SI: 0x202, DI: 0x204 }, flags: { ZF: 1 } },

  // ── Combined string copy pattern (REP MOVSB) producing output ──
  { name: 'Copy then print via REP MOVSB + INT21 AH=9',
    code: ".data\nsrc DB 'Yo$'\ndst DB 3 DUP(0)\n.code\nMOV SI,200h\nMOV DI,203h\nMOV CX,3\nCLD\nREP MOVSB\nMOV AH,9\nMOV DX,203h\nINT 21h\nMOV AH,4Ch\nINT 21h",
    output: 'Yo' },
];
