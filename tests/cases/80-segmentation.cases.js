// Wave 2 — real segmented memory (virtual-CPU model).
// Every memory access goes through a segment register:
//   physical = (segment << 4) + offset   (20-bit, 1 MB).
// `mem` addresses asserted below are LINEAR/physical, since the runner's
// memRead() now takes a linear address.
'use strict';

module.exports = [
  // ── Stack lives in SS:SP ──
  { name: 'PUSH stores at SS:SP linear address',
    code: 'MOV AX,1000h\nMOV SS,AX\nMOV SP,20h\nMOV BX,1234h\nPUSH BX\nHLT',
    regs: { SP: 0x1E },
    mem:  [ { addr: 0x1001E, size: 16, val: 0x1234 } ] },

  { name: 'PUSH/POP roundtrip through non-zero SS',
    code: 'MOV AX,1000h\nMOV SS,AX\nMOV SP,20h\nPUSH 0BEEFh\nPOP DX\nHLT',
    regs: { DX: 0xBEEF, SP: 0x20 } },

  // ── Segment override prefixes ──
  { name: 'MASM override ES:[off] reads & writes ES segment',
    code: 'MOV AX,2000h\nMOV ES,AX\nMOV BX,0ABCDh\nMOV ES:[10h],BX\nMOV DX,ES:[10h]\nHLT',
    regs: { DX: 0xABCD },
    mem:  [ { addr: 0x20010, size: 16, val: 0xABCD } ] },

  { name: 'NASM override [ES:DI] with WORD PTR',
    code: 'MOV AX,3000h\nMOV ES,AX\nMOV DI,4\nMOV WORD PTR [ES:DI],1111h\nMOV CX,[ES:DI]\nHLT',
    regs: { CX: 0x1111 },
    mem:  [ { addr: 0x30004, size: 16, val: 0x1111 } ] },

  // ── BP-based addressing defaults to the stack segment ──
  { name: '[BP] defaults to SS segment',
    code: 'MOV AX,5000h\nMOV SS,AX\nMOV BP,8\nMOV WORD PTR [BP],4321h\nMOV DX,[BP]\nHLT',
    regs: { DX: 0x4321 },
    mem:  [ { addr: 0x50008, size: 16, val: 0x4321 } ] },

  { name: 'explicit override beats the BP→SS default',
    code: 'MOV AX,5000h\nMOV SS,AX\nMOV CX,6000h\nMOV DS,CX\nMOV BP,8\n' +
          'MOV WORD PTR DS:[BP],0AAAAh\nMOV DX,[BP]\nHLT',
    regs: { DX: 0x0000 },                              // [BP] reads SS:8 (still 0)
    mem:  [ { addr: 0x60008, size: 16, val: 0xAAAA } ] }, // write went to DS:8

  // ── String ops: source DS:SI, destination ES:DI ──
  { name: 'MOVSB copies DS:SI → ES:DI across segments',
    code: 'MOV AX,1000h\nMOV DS,AX\nMOV SI,0\nMOV BYTE PTR [SI],99h\n' +
          'MOV AX,2000h\nMOV ES,AX\nMOV DI,0\nMOVSB\nHLT',
    regs: { SI: 1, DI: 1 },
    mem:  [ { addr: 0x10000, size: 8, val: 0x99 }, { addr: 0x20000, size: 8, val: 0x99 } ] },

  { name: 'STOSW writes to ES:DI',
    code: 'MOV AX,7000h\nMOV ES,AX\nMOV DI,0\nMOV AX,0DEADh\nSTOSW\nHLT',
    regs: { DI: 2 },
    mem:  [ { addr: 0x70000, size: 16, val: 0xDEAD } ] },

  { name: 'LODSB reads from DS:SI (loads AL only)',
    code: 'MOV AX,1000h\nMOV DS,AX\nMOV SI,5\nMOV BYTE PTR [SI],7Bh\nLODSB\nHLT',
    regs: { AL: 0x7B, SI: 6 } },

  // ── Far / cleanup returns ──
  { name: 'RETF restores CS and IP from the stack',
    code: 'PUSH 0BBBBh\nPUSH 5\nRETF\nMOV BX,11h\nHLT\nMOV BX,22h\nHLT',
    regs: { BX: 0x22, CS: 0xBBBB } },

  { name: 'CALL/RET balance through non-zero SS',
    code: 'MOV AX,4000h\nMOV SS,AX\nMOV SP,100h\nMOV BX,1\nCALL sub\nHLT\nsub:\nMOV BX,2\nRET',
    regs: { BX: 2, SP: 0x100 } },

  { name: 'RET imm cleans caller arguments off the stack',
    code: 'MOV SP,100h\nPUSH 1234h\nCALL sub\nHLT\nsub:\nRET 2',
    regs: { SP: 0x100 } },
];
