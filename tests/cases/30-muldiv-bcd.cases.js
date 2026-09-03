// ================================================================
//  30-muldiv-bcd.cases.js
//  MUL / IMUL / DIV / IDIV  +  BCD adjust ops
//  (AAA, AAS, AAM, AAD, DAA, DAS).
//
//  Every expected value is derived from the TRUE Intel 8086 spec
//  (felixcloutier.com/x86 pseudocode + Intel 8086 manual), NOT from
//  this engine. MUL/DIV leave SF/ZF/AF/PF UNDEFINED → those flags are
//  OMITTED; only CF/OF (MUL/IMUL) are asserted. BCD ops have DEFINED
//  AF/CF → those ARE asserted. AAM/AAD use implicit base 10.
// ================================================================
'use strict';

module.exports = [
  // ──────────────────────────────────────────────────────────────
  //  MUL  (unsigned)
  //  MUL8 : AX = AL * src8 ;  CF=OF=1 iff AH(upper half) != 0
  //  MUL16: DX:AX = AX * src16 ; CF=OF=1 iff DX(upper half) != 0
  // ──────────────────────────────────────────────────────────────
  { name: 'MUL8 reg: 12*12=144, upper=0 → CF/OF=0',
    code: 'MOV AL,12\nMOV BL,12\nMUL BL\nHLT',
    regs: { AX: 144 }, flags: { CF: 0, OF: 0 } },

  { name: 'MUL8 mem byte: 50*5=250, fits AL → CF/OF=0',
    code: '.data\nv DB 5\n.code\nMOV AL,50\nMUL BYTE PTR [v]\nHLT',
    regs: { AX: 250 }, flags: { CF: 0, OF: 0 } },

  { name: 'MUL8: 0FF*0FF=0FE01 → CF/OF=1',
    code: 'MOV AL,0FFh\nMOV BL,0FFh\nMUL BL\nHLT',
    regs: { AX: 0xFE01 }, flags: { CF: 1, OF: 1 } },

  { name: 'MUL8 by 0 → AX=0, CF/OF=0',
    code: 'MOV AL,0FFh\nMOV BL,0\nMUL BL\nHLT',
    regs: { AX: 0 }, flags: { CF: 0, OF: 0 } },

  { name: 'MUL16 reg: 1000*1000=0F4240 → DX:AX=000F:4240, CF/OF=1',
    code: 'MOV AX,1000\nMOV BX,1000\nMUL BX\nHLT',
    regs: { AX: 0x4240, DX: 0x000F }, flags: { CF: 1, OF: 1 } },

  { name: 'MUL16: 0100h*0100h=00010000 → DX:AX=0001:0000, CF/OF=1',
    code: 'MOV AX,100h\nMOV CX,100h\nMUL CX\nHLT',
    regs: { AX: 0x0000, DX: 0x0001 }, flags: { CF: 1, OF: 1 } },

  { name: 'MUL16: 5*7=35 → DX=0, CF/OF=0',
    code: 'MOV AX,5\nMOV BX,7\nMUL BX\nHLT',
    regs: { AX: 35, DX: 0 }, flags: { CF: 0, OF: 0 } },

  // ──────────────────────────────────────────────────────────────
  //  IMUL  (signed)
  //  CF=OF=0 iff full result == sign-extension of lower half, else 1.
  // ──────────────────────────────────────────────────────────────
  { name: 'IMUL8: (-3)*(4)=-12 → AX=FFF4, sign-extends → CF/OF=0',
    code: 'MOV AL,-3\nMOV BL,4\nIMUL BL\nHLT',
    regs: { AX: 0xFFF4 }, flags: { CF: 0, OF: 0 } },

  { name: 'IMUL8: (-1)*(-1)=1 → AX=0001, CF/OF=0',
    code: 'MOV AL,-1\nMOV BL,-1\nIMUL BL\nHLT',
    regs: { AX: 0x0001 }, flags: { CF: 0, OF: 0 } },

  { name: 'IMUL8: (-128)*(-128)=16384 → AX=4000, does NOT sign-extend → CF/OF=1',
    code: 'MOV AL,80h\nMOV BL,80h\nIMUL BL\nHLT',
    regs: { AX: 0x4000 }, flags: { CF: 1, OF: 1 } },

  { name: 'IMUL8: (16)*(8)=128 → AX=0080, AH=00 != sign(80h) → CF/OF=1',
    code: 'MOV AL,16\nMOV BL,8\nIMUL BL\nHLT',
    regs: { AX: 0x0080 }, flags: { CF: 1, OF: 1 } },

  { name: 'IMUL16: (-2)*(3)=-6 → DX:AX=FFFF:FFFA, sign-extends → CF/OF=0',
    code: 'MOV AX,-2\nMOV BX,3\nIMUL BX\nHLT',
    regs: { AX: 0xFFFA, DX: 0xFFFF }, flags: { CF: 0, OF: 0 } },

  { name: 'IMUL16: (1000)*(-1000)=-1000000 → DX:AX=FFF0:BDC0, CF/OF=1',
    code: 'MOV AX,1000\nMOV BX,-1000\nIMUL BX\nHLT',
    regs: { AX: 0xBDC0, DX: 0xFFF0 }, flags: { CF: 1, OF: 1 } },

  { name: 'IMUL16: (-1)*(-1)=1 → DX:AX=0000:0001, CF/OF=0',
    code: 'MOV AX,-1\nMOV BX,-1\nIMUL BX\nHLT',
    regs: { AX: 0x0001, DX: 0x0000 }, flags: { CF: 0, OF: 0 } },

  { name: 'IMUL16: (200)*(200)=40000 → DX:AX=0000:9C40, AX bit15 set → CF/OF=1',
    code: 'MOV AX,200\nMOV BX,200\nIMUL BX\nHLT',
    regs: { AX: 0x9C40, DX: 0x0000 }, flags: { CF: 1, OF: 1 } },

  // ──────────────────────────────────────────────────────────────
  //  DIV  (unsigned)
  //  DIV8 : AL=AX/src ,  AH=AX MOD src
  //  DIV16: AX=(DX:AX)/src , DX=(DX:AX) MOD src
  // ──────────────────────────────────────────────────────────────
  { name: 'DIV8: 100/7 → AL=14, AH=2',
    code: 'MOV AX,100\nMOV BL,7\nDIV BL\nHLT',
    regs: { AL: 14, AH: 2 } },

  { name: 'DIV8: 255/16 → AL=15, AH=15',
    code: 'MOV AX,255\nMOV BL,16\nDIV BL\nHLT',
    regs: { AL: 15, AH: 15 } },

  { name: 'DIV16: 100000/7 → AX=14285, DX=5',
    code: 'MOV DX,1\nMOV AX,86A0h\nMOV CX,7\nDIV CX\nHLT',
    regs: { AX: 14285, DX: 5 } },

  { name: 'DIV16: 1000/3 → AX=333, DX=1',
    code: 'MOV DX,0\nMOV AX,1000\nMOV CX,3\nDIV CX\nHLT',
    regs: { AX: 333, DX: 1 } },

  { name: 'DIV8 by zero raises error',
    code: 'MOV AX,100\nMOV BL,0\nDIV BL\nHLT',
    expectError: true },

  { name: 'DIV16 by zero raises error',
    code: 'MOV DX,0\nMOV AX,50\nMOV CX,0\nDIV CX\nHLT',
    expectError: true },

  // ──────────────────────────────────────────────────────────────
  //  IDIV  (signed) — truncates toward zero; remainder sign = dividend sign
  // ──────────────────────────────────────────────────────────────
  { name: 'IDIV8: (-100)/7 → AL=-14(0F2), AH=-2(0FE)  [rem sign = dividend]',
    code: 'MOV AX,0FF9Ch\nMOV BL,7\nIDIV BL\nHLT',
    regs: { AL: 0xF2, AH: 0xFE } },

  { name: 'IDIV8: (100)/(-7) → AL=-14(0F2), AH=+2(02)',
    code: 'MOV AX,100\nMOV BL,-7\nIDIV BL\nHLT',
    regs: { AL: 0xF2, AH: 0x02 } },

  { name: 'IDIV8: (-100)/(-7) → AL=+14(0E), AH=-2(0FE)',
    code: 'MOV AX,0FF9Ch\nMOV BL,-7\nIDIV BL\nHLT',
    regs: { AL: 0x0E, AH: 0xFE } },

  { name: 'IDIV16: (-1000)/3 → AX=-333(0FEB3), DX=-1(0FFFF)',
    code: 'MOV DX,0FFFFh\nMOV AX,0FC18h\nMOV CX,3\nIDIV CX\nHLT',
    regs: { AX: 0xFEB3, DX: 0xFFFF } },

  { name: 'IDIV16: (1000)/(-3) → AX=-333(0FEB3), DX=+1',
    code: 'MOV DX,0\nMOV AX,1000\nMOV CX,-3\nIDIV CX\nHLT',
    regs: { AX: 0xFEB3, DX: 0x0001 } },

  { name: 'IDIV8 by zero raises error',
    code: 'MOV AX,50\nMOV BL,0\nIDIV BL\nHLT',
    expectError: true },

  // ──────────────────────────────────────────────────────────────
  //  DAA — Decimal Adjust AL after Addition
  //  Spec: if (AL&0F)>9 or AF: AL+=6, AF=1, CF|=carry;
  //        if old_AL>99h or old_CF: AL+=60h, CF=1.
  // ──────────────────────────────────────────────────────────────
  { name: 'DAA: 19h ADD 1 =1Ah → 20h (nibble>9), CF=0 AF=1',
    code: 'MOV AL,19h\nADD AL,1\nDAA\nHLT',
    regs: { AL: 0x20 }, flags: { CF: 0, AF: 1 } },

  { name: 'DAA: BCD 35+48 → 83h, CF=0 AF=1',
    code: 'MOV AL,35h\nADD AL,48h\nDAA\nHLT',
    regs: { AL: 0x83 }, flags: { CF: 0, AF: 1 } },

  { name: 'DAA: BCD 99+99 → 98h with carry, CF=1 AF=1',
    code: 'MOV AL,99h\nADD AL,99h\nDAA\nHLT',
    regs: { AL: 0x98 }, flags: { CF: 1, AF: 1 } },

  { name: 'DAA: AL=9Ah standalone → 00h, CF=1 AF=1 (high-nibble adjust)',
    code: 'MOV AL,9Ah\nDAA\nHLT',
    regs: { AL: 0x00 }, flags: { CF: 1, AF: 1 } },

  { name: 'DAA: BCD 45+45 → 90h, CF=0 AF=1 (0x8A low nibble A>9 triggers +6)',
    code: 'MOV AL,45h\nADD AL,45h\nDAA\nHLT',
    regs: { AL: 0x90 }, flags: { CF: 0, AF: 1 } },

  // ──────────────────────────────────────────────────────────────
  //  DAS — Decimal Adjust AL after Subtraction
  // ──────────────────────────────────────────────────────────────
  { name: 'DAS: BCD 35-18 → 17h, CF=0 AF=1',
    code: 'MOV AL,35h\nSUB AL,18h\nDAS\nHLT',
    regs: { AL: 0x17 }, flags: { CF: 0, AF: 1 } },

  { name: 'DAS: BCD 12-29 → 83h with borrow, CF=1 AF=1',
    code: 'MOV AL,12h\nSUB AL,29h\nDAS\nHLT',
    regs: { AL: 0x83 }, flags: { CF: 1, AF: 1 } },

  { name: 'DAS: BCD 50-25 → 25h, CF=0 AF=1 (0x2B low nibble B>9 triggers -6)',
    code: 'MOV AL,50h\nSUB AL,25h\nDAS\nHLT',
    regs: { AL: 0x25 }, flags: { CF: 0, AF: 1 } },

  { name: 'DAS: AL=0A0h standalone (old_AL>99h) → 40h, CF=1 AF=0',
    code: 'MOV AL,0A0h\nDAS\nHLT',
    regs: { AL: 0x40 }, flags: { CF: 1, AF: 0 } },

  // ──────────────────────────────────────────────────────────────
  //  AAA — ASCII Adjust AL after Addition
  //  if (AL&0F)>9 or AF: AX+=106h, AF=CF=1; AL &= 0Fh.
  // ──────────────────────────────────────────────────────────────
  { name: 'AAA: 9+8=11h → AH=1 AL=7, CF=1 AF=1',
    code: 'MOV AL,9\nADD AL,8\nAAA\nHLT',
    regs: { AH: 1, AL: 7 }, flags: { CF: 1, AF: 1 } },

  { name: 'AAA: AL=5 no adjust → AH=0 AL=5, CF=0 AF=0',
    code: 'MOV AX,0005h\nAAA\nHLT',
    regs: { AH: 0, AL: 5 }, flags: { CF: 0, AF: 0 } },

  { name: 'AAA: AL=0Fh (nibble>9) AH=3 → AX=0407 then AL&0F=7, CF=1 AF=1',
    code: 'MOV AH,3\nMOV AL,0Fh\nAAA\nHLT',
    regs: { AH: 4, AL: 5 }, flags: { CF: 1, AF: 1 } },

  // ──────────────────────────────────────────────────────────────
  //  AAS — ASCII Adjust AL after Subtraction
  //  if (AL&0F)>9 or AF: AX-=6, AH-=1, AF=CF=1; AL &= 0Fh.
  // ──────────────────────────────────────────────────────────────
  { name: 'AAS: AX=020Bh (nibble B>9) → AH=1 AL=5, CF=1 AF=1',
    code: 'MOV AX,020Bh\nAAS\nHLT',
    regs: { AH: 1, AL: 5 }, flags: { CF: 1, AF: 1 } },

  { name: 'AAS: AX=0205h no adjust → AH=2 AL=5, CF=0 AF=0',
    code: 'MOV AX,0205h\nAAS\nHLT',
    regs: { AH: 2, AL: 5 }, flags: { CF: 0, AF: 0 } },

  { name: 'AAS: 13(0Dh sim) AL=0Ch AH=1 → AX-6=010Ch?,then AH-1 → AH=0 AL=6, CF=1 AF=1',
    code: 'MOV AX,010Ch\nAAS\nHLT',
    regs: { AH: 0, AL: 6 }, flags: { CF: 1, AF: 1 } },

  // ──────────────────────────────────────────────────────────────
  //  AAM — ASCII Adjust AX after Multiply (base 10)
  //  AH = AL / 10 ; AL = AL MOD 10.
  // ──────────────────────────────────────────────────────────────
  { name: 'AAM: AL=29 → AH=2 AL=9',
    code: 'MOV AL,29\nAAM\nHLT',
    regs: { AH: 2, AL: 9 } },

  { name: 'AAM: AL=63h(99) → AH=9 AL=9',
    code: 'MOV AL,63h\nAAM\nHLT',
    regs: { AH: 9, AL: 9 } },

  // ──────────────────────────────────────────────────────────────
  //  AAD — ASCII Adjust AX before Divide (base 10)
  //  AL = (AL + AH*10) AND FFh ; AH = 0.
  // ──────────────────────────────────────────────────────────────
  { name: 'AAD: AH=3 AL=7 → AL=37(25h) AH=0',
    code: 'MOV AH,3\nMOV AL,7\nAAD\nHLT',
    regs: { AH: 0, AL: 0x25 } },

  { name: 'AAD: AX=0902h → AL=92(5Ch) AH=0',
    code: 'MOV AX,0902h\nAAD\nHLT',
    regs: { AH: 0, AL: 0x5C } },

];
