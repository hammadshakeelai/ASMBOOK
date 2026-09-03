// ============================================================================
//  20-logic-shift.cases.js
//  Category: Logic + shifts + rotates on the 8086.
//  Ops: AND OR XOR TEST NOT  |  SHL/SAL SHR SAR  |  ROL ROR RCL RCR
//
//  Every expected value below is derived from the true 8086 / Intel SDM spec
//  (felixcloutier.com/x86 + Intel 8086 manual), NOT from this engine.
//
//  Flag-assertion policy (only 8086-DEFINED flags are asserted):
//   - Logic ops (AND/OR/XOR/TEST): CF=0, OF=0 always; SF/ZF/PF defined;
//       AF is UNDEFINED after logic -> OMITTED.
//   - NOT: affects NO flags (so we don't assert flags except where a prior
//       instruction set a known state we expect preserved).
//   - SHL/SAL/SHR/SAR: CF = last bit shifted out (defined for cnt>=1).
//       OF is defined ONLY for cnt==1; for cnt>1 OF is UNDEFINED -> OMITTED.
//       AF is UNDEFINED for shifts/rotates -> OMITTED.
//       For shift count == 0 (e.g. SHL by CL where CL=0) flags are UNAFFECTED.
//   - ROL/ROR: CF = bit rotated out (defined for cnt>=1).
//       OF defined ONLY for cnt==1; for cnt>1 OF UNDEFINED -> OMITTED.
//       SF/ZF/PF/AF are NOT affected by rotates -> OMITTED.
//   - RCL/RCR: rotate THROUGH carry (9-bit for byte, 17-bit for word).
//       CF = bit rotated into carry. OF defined only for cnt==1.
//
//  OF rules (count==1):
//   - SHL/SAL: OF = MSB(result) XOR CF
//   - SHR    : OF = MSB(original operand)
//   - SAR    : OF = 0
//   - ROL    : OF = MSB(result) XOR CF      (= MSB(result) XOR LSB(result))
//   - ROR    : OF = MSB(result) XOR bit-below-MSB(result)  (top two result bits)
//   - RCL    : OF = MSB(result) XOR CF(new)
//   - RCR    : OF = MSB(result) XOR bit-below-MSB(result)
//
//  NOTE: RCL/RCR may not be implemented in the engine yet; these cases are
//  written to the correct spec to drive that implementation.
// ============================================================================
'use strict';

const cases = [

  // ───────────────────────────── AND ─────────────────────────────
  // 0F0F & FFF0 = 0F00. CF=0 OF=0. SF=0 (bit15=0). ZF=0. PF over low byte
  // 0x00 -> parity even -> PF=1.
  { name: 'AND AX mask -> CF/OF cleared, PF(00)=1',
    code: 'STC\nMOV AX,0F0Fh\nAND AX,0FFF0h\nHLT',
    regs: { AX: 0x0F00 }, flags: { CF:0, OF:0, SF:0, ZF:0, PF:1 } },

  // FF & 0F = 0F. low byte 0x0F has 4 one-bits -> even -> PF=1. SF=0 ZF=0.
  { name: 'AND AL FF&0F=0F, PF even',
    code: 'MOV AL,0FFh\nAND AL,0Fh\nHLT',
    regs: { AL: 0x0F }, flags: { CF:0, OF:0, SF:0, ZF:0, PF:1 } },

  // AND that yields zero -> ZF=1, PF=1 (00 even), SF=0.
  { name: 'AND AL -> 0 sets ZF, clears CF/OF',
    code: 'STC\nMOV AL,0F0h\nAND AL,0Fh\nHLT',
    regs: { AL: 0x00 }, flags: { CF:0, OF:0, SF:0, ZF:1, PF:1 } },

  // Result 0x80 -> SF=1 (bit7), ZF=0, PF: 0x80 has 1 bit -> odd -> PF=0.
  { name: 'AND AL -> 80 sets SF, PF odd',
    code: 'MOV AL,0C0h\nAND AL,80h\nHLT',
    regs: { AL: 0x80 }, flags: { SF:1, ZF:0, PF:0, CF:0, OF:0 } },

  // 16-bit result 0x8000 -> SF=1, low byte 00 -> PF=1.
  { name: 'AND AX -> 8000 SF set PF(00)=1',
    code: 'MOV AX,0C000h\nAND AX,8000h\nHLT',
    regs: { AX: 0x8000 }, flags: { SF:1, ZF:0, PF:1, CF:0, OF:0 } },

  // ───────────────────────────── OR ──────────────────────────────
  // 0F | F0 = FF. SF=1 (bit7). low byte FF -> 8 bits -> even -> PF=1.
  { name: 'OR AL 0F|F0=FF, SF set PF even',
    code: 'STC\nMOV AL,0Fh\nOR AL,0F0h\nHLT',
    regs: { AL: 0xFF }, flags: { CF:0, OF:0, SF:1, ZF:0, PF:1 } },

  // OR of zeros -> 0, ZF=1.
  { name: 'OR AX 0|0 -> ZF, CF/OF cleared',
    code: 'STC\nMOV AX,0\nOR AX,0\nHLT',
    regs: { AX: 0x0000 }, flags: { CF:0, OF:0, SF:0, ZF:1, PF:1 } },

  // 1234 | 0F00 = 1F34. SF=0, low byte 0x34=00110100 -> 3 bits odd -> PF=0.
  { name: 'OR AX 1234|0F00=1F34 PF odd',
    code: 'MOV AX,1234h\nOR AX,0F00h\nHLT',
    regs: { AX: 0x1F34 }, flags: { CF:0, OF:0, SF:0, ZF:0, PF:0 } },

  // OR reg,reg.  01 | 02 = 03 -> low byte 0x03 has 2 bits even -> PF=1.
  { name: 'OR AL,BL 01|02=03 PF even',
    code: 'MOV AL,1\nMOV BL,2\nOR AL,BL\nHLT',
    regs: { AL: 0x03 }, flags: { CF:0, OF:0, SF:0, ZF:0, PF:1 } },

  // ───────────────────────────── XOR ─────────────────────────────
  // XOR self -> 0 (idiom). ZF=1, CF=0, OF=0, PF=1.
  { name: 'XOR AX,AX -> 0 (zero idiom)',
    code: 'STC\nMOV AX,1234h\nXOR AX,AX\nHLT',
    regs: { AX: 0x0000 }, flags: { CF:0, OF:0, SF:0, ZF:1, PF:1 } },

  // FF ^ 0F = F0. SF=1 (bit7). low byte F0 -> 4 bits even -> PF=1.
  { name: 'XOR AL FF^0F=F0, SF set PF even',
    code: 'MOV AL,0FFh\nXOR AL,0Fh\nHLT',
    regs: { AL: 0xF0 }, flags: { CF:0, OF:0, SF:1, ZF:0, PF:1 } },

  // AAAA ^ 5555 = FFFF. SF=1, low byte FF even -> PF=1.
  { name: 'XOR AX AAAA^5555=FFFF',
    code: 'MOV AX,0AAAAh\nXOR AX,5555h\nHLT',
    regs: { AX: 0xFFFF }, flags: { CF:0, OF:0, SF:1, ZF:0, PF:1 } },

  // XOR that produces 0x04 -> 1 bit -> PF=0, SF=0.
  { name: 'XOR AL 06^02=04 PF odd',
    code: 'MOV AL,6\nXOR AL,2\nHLT',
    regs: { AL: 0x04 }, flags: { CF:0, OF:0, SF:0, ZF:0, PF:0 } },

  // ───────────────────────────── TEST ────────────────────────────
  // TEST does AND but discards result; operands unchanged.
  // 04 & 01 = 00 -> ZF=1, no write.
  { name: 'TEST AL,1 (bit clear) -> ZF, AL unchanged',
    code: 'MOV AL,4\nTEST AL,1\nHLT',
    regs: { AL: 0x04 }, flags: { ZF:1, CF:0, OF:0, SF:0, PF:1 } },

  // 04 & 04 = 04 -> ZF=0, PF(04)=odd ->0, SF=0. AL preserved.
  { name: 'TEST AL,4 (bit set) -> ZF=0 PF odd',
    code: 'MOV AL,4\nTEST AL,4\nHLT',
    regs: { AL: 0x04 }, flags: { ZF:0, CF:0, OF:0, SF:0, PF:0 } },

  // TEST sign bit: 80 & 80 = 80 -> SF=1, ZF=0, PF(80)=odd->0.
  { name: 'TEST AL,80h sign bit set SF',
    code: 'MOV AL,80h\nTEST AL,80h\nHLT',
    regs: { AL: 0x80 }, flags: { SF:1, ZF:0, PF:0, CF:0, OF:0 } },

  // TEST 16-bit, AND -> 0x0300 low byte 00 -> PF=1, SF=0.
  { name: 'TEST AX word, PF over low byte',
    code: 'MOV AX,0F300h\nTEST AX,0300h\nHLT',
    regs: { AX: 0xF300 }, flags: { ZF:0, SF:0, PF:1, CF:0, OF:0 } },

  // ───────────────────────────── NOT ─────────────────────────────
  // NOT affects NO flags.  ~0F = F0.
  { name: 'NOT AL 0F->F0 (no flag change)',
    code: 'MOV AL,0Fh\nNOT AL\nHLT',
    regs: { AL: 0xF0 } },

  // NOT preserves CF: we STC first, then NOT, expect CF still 1.
  { name: 'NOT AL preserves CF (STC kept set)',
    code: 'STC\nMOV AL,0AAh\nNOT AL\nHLT',
    regs: { AL: 0x55 }, flags: { CF:1 } },

  // NOT 16-bit.  ~1234 = EDCB.
  { name: 'NOT AX 1234->EDCB',
    code: 'MOV AX,1234h\nNOT AX\nHLT',
    regs: { AX: 0xEDCB } },

  // NOT preserves ZF: set ZF via XOR(=0) then NOT, ZF must remain 1.
  { name: 'NOT BX preserves ZF from prior XOR',
    code: 'XOR AX,AX\nMOV BX,0FFFFh\nNOT BX\nHLT',
    regs: { BX: 0x0000 }, flags: { ZF:1 } },

  // ───────────────────────── SHL / SAL ───────────────────────────
  // 80 << 1 = 00. CF = bit shifted out = MSB(orig)=1. result 0 -> ZF=1.
  // OF(cnt1)=MSB(res)^CF = 0^1 = 1.
  { name: 'SHL AL 80h,1 -> CF=1 ZF=1 OF=1',
    code: 'MOV AL,80h\nSHL AL,1\nHLT',
    regs: { AL: 0x00 }, flags: { CF:1, OF:1, ZF:1, SF:0 } },

  // 40 << 1 = 80. CF=bit6=0. MSB(res)=1 -> SF=1. OF=MSB(res)^CF=1^0=1.
  { name: 'SHL AL 40h,1 -> 80 SF=1 OF=1 CF=0',
    code: 'MOV AL,40h\nSHL AL,1\nHLT',
    regs: { AL: 0x80 }, flags: { CF:0, OF:1, SF:1, ZF:0 } },

  // 01 << 1 = 02. CF=0, MSB(res)=0 -> OF=0. SF=0 ZF=0. PF(02)=odd->0.
  { name: 'SHL AL 01,1 -> 02 OF=0 CF=0',
    code: 'SHL AL,1\nMOV AL,1\nSHL AL,1\nHLT',
    regs: { AL: 0x02 }, flags: { CF:0, OF:0, SF:0, ZF:0, PF:0 } },

  // SAL is an alias of SHL. C0 << 1 = 80. CF=bit7=1. OF=MSB(res)^CF=1^1=0.
  { name: 'SAL AL C0h,1 -> 80 CF=1 OF=0 (SAL=SHL)',
    code: 'MOV AL,0C0h\nSAL AL,1\nHLT',
    regs: { AL: 0x80 }, flags: { CF:1, OF:0, SF:1, ZF:0 } },

  // SHL by CL, count 4: 0x12 << 4 = 0x120 & FF = 0x20. cnt>size? no (4<=8).
  // CF = bit (size-cnt)=bit4 of 0x12(0001_0010)=1. OF omitted (cnt>1).
  { name: 'SHL AL 12h by CL=4 -> 20h, CF=bit4=1',
    code: 'MOV AL,12h\nMOV CL,4\nSHL AL,CL\nHLT',
    regs: { AL: 0x20 }, flags: { CF:1, SF:0, ZF:0 } },

  // SHL 16-bit by CL=4: 0x1234 << 4 = 0x12340 & FFFF = 0x2340.
  // CF = bit (16-4)=bit12 of 0x1234 (0001_0010_0011_0100) = bit12=1. OF omitted.
  { name: 'SHL AX 1234h by CL=4 -> 2340h CF=1',
    code: 'MOV AX,1234h\nMOV CL,4\nSHL AX,CL\nHLT',
    regs: { AX: 0x2340 }, flags: { CF:1 } },

  // SHL count == size (8): all bits shifted out. result 0. CF = last bit out.
  // For AL=0x01, after 8 shifts the original bit0 ends as the last bit shifted
  // out -> CF = bit (8-8)=bit0 of original = 1. OF omitted (cnt>1).
  { name: 'SHL AL 01 by CL=8 (==size) -> 0, CF=1',
    code: 'MOV AL,1\nMOV CL,8\nSHL AL,CL\nHLT',
    regs: { AL: 0x00 }, flags: { CF:1, ZF:1 } },

  // SHL count > size for byte: CL=9 on AL -> result 0, CF=0 (shifted past).
  // (8086 masks count to low 5 bits = 9; for 8-bit a 9-shift empties operand
  //  and the carry is 0 since the only set bits already left.)  OF omitted.
  { name: 'SHL AL FF by CL=9 (>size) -> 0 CF=0',
    code: 'MOV AL,0FFh\nMOV CL,9\nSHL AL,CL\nHLT',
    regs: { AL: 0x00 }, flags: { CF:0, ZF:1 } },

  // SHL by CL=0 : NO operation, flags UNAFFECTED. Preset CF via STC; expect kept.
  // ENGINE-BUG?: got CF=0 — engine calls updateFlags() even when count==0,
  //   clobbering CF; 8086 leaves all flags unaffected for a zero shift count.
  { name: 'SHL AL by CL=0 -> no change, CF preserved',
    code: 'STC\nMOV AL,55h\nMOV CL,0\nSHL AL,CL\nHLT',
    regs: { AL: 0x55 }, flags: { CF:1 } },

  // ───────────────────────────── SHR ─────────────────────────────
  // 01 >> 1 = 00. CF = bit0 of orig = 1. ZF=1. OF(cnt1)=MSB(orig)=bit7 of 01=0.
  { name: 'SHR AL 01,1 -> 0 CF=1 ZF=1 OF=0',
    code: 'MOV AL,1\nSHR AL,1\nHLT',
    regs: { AL: 0x00 }, flags: { CF:1, ZF:1, OF:0, SF:0 } },

  // 80 >> 1 = 40. CF = bit0 of 80 = 0. OF(cnt1)=MSB(orig)=1. SF=0.
  { name: 'SHR AL 80,1 -> 40 CF=0 OF=1',
    code: 'MOV AL,80h\nSHR AL,1\nHLT',
    regs: { AL: 0x40 }, flags: { CF:0, OF:1, SF:0, ZF:0 } },

  // FF >> 1 = 7F. CF=bit0=1. OF=MSB(orig)=1. SF=0, low byte 7F=7 bits odd PF=0.
  { name: 'SHR AL FF,1 -> 7F CF=1 OF=1 PF odd',
    code: 'MOV AL,0FFh\nSHR AL,1\nHLT',
    regs: { AL: 0x7F }, flags: { CF:1, OF:1, SF:0, ZF:0, PF:0 } },

  // SHR by CL=4: 0xF0 >> 4 = 0x0F. CF = bit (cnt-1)=bit3 of 0xF0(1111_0000)=0.
  // OF omitted (cnt>1). low byte 0F -> 4 bits even -> PF=1.
  { name: 'SHR AL F0 by CL=4 -> 0F CF=0 PF even',
    code: 'MOV AL,0F0h\nMOV CL,4\nSHR AL,CL\nHLT',
    regs: { AL: 0x0F }, flags: { CF:0, ZF:0, PF:1 } },

  // SHR 16-bit by CL=8: 0x1234 >> 8 = 0x0012. CF=bit7 of 0x1234 = bit7 of low
  // byte 0x34(0011_0100)=0. OF omitted.
  { name: 'SHR AX 1234h by CL=8 -> 0012h CF=0',
    code: 'MOV AX,1234h\nMOV CL,8\nSHR AX,CL\nHLT',
    regs: { AX: 0x0012 }, flags: { CF:0, ZF:0 } },

  // SHR count == size (8): AL=0x80 >>8 -> 0. CF=bit(8-1)=bit7=1. OF omitted.
  { name: 'SHR AL 80 by CL=8 (==size) -> 0 CF=1',
    code: 'MOV AL,80h\nMOV CL,8\nSHR AL,CL\nHLT',
    regs: { AL: 0x00 }, flags: { CF:1, ZF:1 } },

  // ───────────────────────────── SAR ─────────────────────────────
  // SAR sign-extends.  80 (>>1 arith) = C0.  CF=bit0 of 80 = 0. OF(cnt1)=0.
  // result C0 -> SF=1.
  { name: 'SAR AL 80,1 -> C0 sign-extend CF=0 OF=0 SF=1',
    code: 'MOV AL,80h\nSAR AL,1\nHLT',
    regs: { AL: 0xC0 }, flags: { CF:0, OF:0, SF:1, ZF:0 } },

  // SAR FF,1 -> FF (all ones stays). CF=bit0=1. OF=0. SF=1.
  { name: 'SAR AL FF,1 -> FF CF=1 OF=0 SF=1',
    code: 'MOV AL,0FFh\nSAR AL,1\nHLT',
    regs: { AL: 0xFF }, flags: { CF:1, OF:0, SF:1, ZF:0 } },

  // SAR positive 40,1 -> 20 (no sign bits to extend). CF=bit0=0. OF=0. SF=0.
  { name: 'SAR AL 40,1 -> 20 CF=0 SF=0',
    code: 'MOV AL,40h\nSAR AL,1\nHLT',
    regs: { AL: 0x20 }, flags: { CF:0, OF:0, SF:0, ZF:0 } },

  // SAR 80 by CL=4 -> arithmetic: 0x80 = -128, >>4 = -8 = 0xF8. CF = bit
  // (cnt-1)=bit3 of 0x80=0. OF omitted (cnt>1). SF=1.
  { name: 'SAR AL 80 by CL=4 -> F8 (sign fill) CF=0',
    code: 'MOV AL,80h\nMOV CL,4\nSAR AL,CL\nHLT',
    regs: { AL: 0xF8 }, flags: { CF:0, SF:1, ZF:0 } },

  // SAR 16-bit negative: 0x8000 (=-32768) SAR by CL=4 -> -2048 = 0xF800.
  // CF = bit3 of 0x8000 = 0. SF=1. OF omitted.
  { name: 'SAR AX 8000h by CL=4 -> F800h CF=0 SF=1',
    code: 'MOV AX,8000h\nMOV CL,4\nSAR AX,CL\nHLT',
    regs: { AX: 0xF800 }, flags: { CF:0, SF:1, ZF:0 } },

  // SAR by count >= size for a negative value saturates to all-ones (-1).
  // AL=0x80 SAR by CL=8 -> 0xFF. CF = sign bit (last bit out) = 1. SF=1.
  { name: 'SAR AL 80 by CL=8 (==size) -> FF CF=1',
    code: 'MOV AL,80h\nMOV CL,8\nSAR AL,CL\nHLT',
    regs: { AL: 0xFF }, flags: { CF:1, SF:1, ZF:0 } },

  // ───────────────────────────── ROL ─────────────────────────────
  // ROL 80,1: rotate left 1 -> 01. CF = bit rotated out = old MSB = 1
  // (also equals new LSB). OF(cnt1)=MSB(res)^CF = 0^1 = 1.
  // ENGINE-BUG?: got OF=0 — engine never computes OF for ROL.
  { name: 'ROL AL 80,1 -> 01 CF=1 OF=1',
    code: 'MOV AL,80h\nROL AL,1\nHLT',
    regs: { AL: 0x01 }, flags: { CF:1, OF:1 } },

  // ROL 40,1 -> 80. CF = old MSB = bit7 of 40 = 0. OF=MSB(res)^CF=1^0=1.
  // ENGINE-BUG?: got OF=0 — engine never computes OF for ROL.
  { name: 'ROL AL 40,1 -> 80 CF=0 OF=1',
    code: 'MOV AL,40h\nROL AL,1\nHLT',
    regs: { AL: 0x80 }, flags: { CF:0, OF:1 } },

  // ROL 01,1 -> 02. CF=old MSB=0. OF=MSB(res)^CF=0^0=0.
  { name: 'ROL AL 01,1 -> 02 CF=0 OF=0',
    code: 'MOV AL,1\nROL AL,1\nHLT',
    regs: { AL: 0x02 }, flags: { CF:0, OF:0 } },

  // ROL by CL=4: 0x12 rol 4 -> 0x21. CF = new LSB = bit (after rotate) =
  // old bit (8-4)=bit4 of 0x12=1. OF omitted (cnt>1).
  { name: 'ROL AL 12 by CL=4 -> 21 CF=1',
    code: 'MOV AL,12h\nMOV CL,4\nROL AL,CL\nHLT',
    regs: { AL: 0x21 }, flags: { CF:1 } },

  // ROL 16-bit by CL=8: 0x1234 rol 8 -> 0x3412. CF = new LSB = old bit8 = bit0
  // of high byte 0x12 = 0. OF omitted.
  { name: 'ROL AX 1234 by CL=8 -> 3412 CF=0',
    code: 'MOV AX,1234h\nMOV CL,8\nROL AX,CL\nHLT',
    regs: { AX: 0x3412 }, flags: { CF:0 } },

  // ───────────────────────────── ROR ─────────────────────────────
  // ROR 01,1 -> 80. CF = bit rotated out = old LSB = 1 (= new MSB).
  // OF(cnt1)=MSB(res) XOR bit-below-MSB(res) = bit7^bit6 of 0x80 = 1^0 = 1.
  // ENGINE-BUG?: got OF=0 — engine never computes OF for ROR.
  { name: 'ROR AL 01,1 -> 80 CF=1 OF=1',
    code: 'MOV AL,1\nROR AL,1\nHLT',
    regs: { AL: 0x80 }, flags: { CF:1, OF:1 } },

  // ROR 02,1 -> 01. CF = old LSB = 0. result 0x01: bit7=0,bit6=0 -> OF=0^0=0.
  { name: 'ROR AL 02,1 -> 01 CF=0 OF=0',
    code: 'MOV AL,2\nROR AL,1\nHLT',
    regs: { AL: 0x01 }, flags: { CF:0, OF:0 } },

  // ROR 03,1 -> 81. CF = old LSB = 1. result 0x81: bit7=1,bit6=0 -> OF=1^0=1.
  // ENGINE-BUG?: got OF=0 — engine never computes OF for ROR.
  { name: 'ROR AL 03,1 -> 81 CF=1 OF=1',
    code: 'MOV AL,3\nROR AL,1\nHLT',
    regs: { AL: 0x81 }, flags: { CF:1, OF:1 } },

  // ROR by CL=4: 0x12 ror 4 -> 0x21. CF = new MSB = old bit (cnt-1)=bit3 of
  // 0x12(0001_0010)=0. OF omitted (cnt>1).
  { name: 'ROR AL 12 by CL=4 -> 21 CF=0',
    code: 'MOV AL,12h\nMOV CL,4\nROR AL,CL\nHLT',
    regs: { AL: 0x21 }, flags: { CF:0 } },

  // ROR 16-bit by CL=8: 0x1234 ror 8 -> 0x3412. CF = new MSB = old bit7 = bit7
  // of low byte 0x34(0011_0100)=0. OF omitted.
  { name: 'ROR AX 1234 by CL=8 -> 3412 CF=0',
    code: 'MOV AX,1234h\nMOV CL,8\nROR AX,CL\nHLT',
    regs: { AX: 0x3412 }, flags: { CF:0 } },

  // ───────────────────────── RCL (through carry) ──────────────────
  // ENGINE-MISSING?: RCL is not implemented (Unsupported instruction: RCL).
  //   All RCL cases below are written to correct 8086 spec to drive impl.
  // RCL is a 9-bit (byte) / 17-bit (word) rotate through CF.
  // CLC first so CF=0.  AL=0x80, RCL 1: {CF=0, bits}=0_1000_0000 rotate left ->
  // new MSB(old bit7=1) -> CF=1; old CF(0) becomes LSB. result = 0x00, CF=1.
  // OF(cnt1)=MSB(res)^CF = 0^1 = 1.
  { name: 'RCL AL 80,1 with CF=0 -> 00 CF=1 OF=1',
    code: 'CLC\nMOV AL,80h\nRCL AL,1\nHLT',
    regs: { AL: 0x00 }, flags: { CF:1, OF:1 } },

  // STC so CF=1. AL=0x80 RCL 1: low bit gets old CF(1) -> result 0x01,
  // old bit7=1 -> CF=1. OF=MSB(res)^CF = 0^1 = 1.
  { name: 'RCL AL 80,1 with CF=1 -> 01 CF=1 OF=1',
    code: 'STC\nMOV AL,80h\nRCL AL,1\nHLT',
    regs: { AL: 0x01 }, flags: { CF:1, OF:1 } },

  // CF=1, AL=0x00 RCL 1 -> 0x01, CF = old bit7 = 0. OF=MSB(res)^CF=0^0=0.
  { name: 'RCL AL 00,1 with CF=1 -> 01 CF=0 OF=0',
    code: 'STC\nMOV AL,0\nRCL AL,1\nHLT',
    regs: { AL: 0x01 }, flags: { CF:0, OF:0 } },

  // RCL by CL=9 on a byte == full 9-bit rotation -> value & carry return to
  // start. CF=1 in, AL=0xAB, after 9-bit rotate by 9 -> identity: AL=0xAB, CF=1.
  { name: 'RCL AL AB by CL=9 (full 9-bit) -> AB CF=1',
    code: 'STC\nMOV AL,0ABh\nMOV CL,9\nRCL AL,CL\nHLT',
    regs: { AL: 0xAB }, flags: { CF:1 } },

  // RCL 16-bit, CF=0, AX=0x8000 RCL 1 -> CF = old bit15 = 1, result = 0x0000.
  // OF = MSB(res)^CF = 0^1 = 1.
  { name: 'RCL AX 8000,1 with CF=0 -> 0000 CF=1 OF=1',
    code: 'CLC\nMOV AX,8000h\nRCL AX,1\nHLT',
    regs: { AX: 0x0000 }, flags: { CF:1, OF:1 } },

  // ───────────────────────── RCR (through carry) ──────────────────
  // ENGINE-MISSING?: RCR is not implemented (Unsupported instruction: RCR).
  //   All RCR cases below are written to correct 8086 spec to drive impl.
  // CF=1, AL=0x00 RCR 1: old CF enters MSB -> result 0x80, CF = old bit0 = 0.
  // OF(cnt1)=MSB(res)^bit-below-MSB(res) = bit7^bit6 of 0x80 = 1^0 = 1.
  { name: 'RCR AL 00,1 with CF=1 -> 80 CF=0 OF=1',
    code: 'STC\nMOV AL,0\nRCR AL,1\nHLT',
    regs: { AL: 0x80 }, flags: { CF:0, OF:1 } },

  // CF=0, AL=0x01 RCR 1: old CF(0)->MSB, CF = old bit0 = 1, result = 0x00.
  // OF = bit7^bit6 of 0x00 = 0.
  { name: 'RCR AL 01,1 with CF=0 -> 00 CF=1 OF=0',
    code: 'CLC\nMOV AL,1\nRCR AL,1\nHLT',
    regs: { AL: 0x00 }, flags: { CF:1, OF:0 } },

  // CF=1, AL=0x03 RCR 1: MSB <- old CF(1) -> 0x81; CF = old bit0 = 1.
  // OF = bit7^bit6 of 0x81 = 1^0 = 1.
  { name: 'RCR AL 03,1 with CF=1 -> 81 CF=1 OF=1',
    code: 'STC\nMOV AL,3\nRCR AL,1\nHLT',
    regs: { AL: 0x81 }, flags: { CF:1, OF:1 } },

  // RCR by CL=9 on byte = full 9-bit rotation -> identity. CF=0 in, AL=0x5A,
  // -> AL=0x5A, CF=0.
  { name: 'RCR AL 5A by CL=9 (full 9-bit) -> 5A CF=0',
    code: 'CLC\nMOV AL,5Ah\nMOV CL,9\nRCR AL,CL\nHLT',
    regs: { AL: 0x5A }, flags: { CF:0 } },

  // RCR 16-bit: CF=1, AX=0x0001 RCR 1 -> MSB <- old CF(1) = 0x8000;
  // CF = old bit0 = 1. OF = bit15^bit14 of 0x8000 = 1^0 = 1.
  { name: 'RCR AX 0001,1 with CF=1 -> 8000 CF=1 OF=1',
    code: 'STC\nMOV AX,1\nRCR AX,1\nHLT',
    regs: { AX: 0x8000 }, flags: { CF:1, OF:1 } },

];

module.exports = [ ...cases ];
