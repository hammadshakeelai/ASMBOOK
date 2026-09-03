// ================================================================
//  40-flow-stack.cases.js
//  Control flow + stack: JMP, every Jcc, LOOP family, CALL/RET,
//  PUSH/POP, PUSHF/POPF, XCHG.
//
//  Every expected value is derived from the TRUE 8086 spec
//  (Jcc flag conditions per Intel SDM / felixcloutier.com/x86/jcc):
//    JE/JZ   ZF=1            JNE/JNZ ZF=0
//    JL/JNGE SF!=OF          JGE/JNL SF=OF
//    JLE/JNG ZF=1|SF!=OF     JG/JNLE ZF=0&SF=OF
//    JB/JC   CF=1            JAE/JNC CF=0
//    JBE/JNA CF=1|ZF=1       JA/JNBE CF=0&ZF=0
//    JS SF=1  JNS SF=0  JO OF=1  JNO OF=0  JP PF=1  JNP PF=0
//    JCXZ CX=0
//  CMP a,b computes a-b: CF=(a<b unsigned); SF=sign(a-b);
//  OF=signed overflow; ZF=(a==b); PF=parity(low byte of a-b).
//
//  Convention: observable BX=1 on the TAKEN path, BX=9 on fall-through.
//  CPU init: SP=0xFFFE, IF=1, all else 0. Stack grows DOWN.
// ================================================================
'use strict';

const T = (name, code, expect) => Object.assign({ name, code }, expect);

module.exports = [
  // ───────────────────────── JMP ─────────────────────────
  T('JMP unconditional skips fall-through',
    'MOV BX,9\nJMP tgt\nMOV BX,7\ntgt:\nMOV AX,1\nHLT',
    { regs: { BX: 9, AX: 1 } }),

  // ───────────────── JE / JZ , JNE / JNZ ─────────────────
  // CMP 7,7 -> a-b=0 : ZF=1, CF=0
  T('JE taken when equal (ZF=1)',
    'MOV AX,7\nCMP AX,7\nJE yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { ZF: 1 } }),
  // CMP 7,3 -> ZF=0
  T('JE not taken when unequal (ZF=0)',
    'MOV AX,7\nCMP AX,3\nJE yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 9 }, flags: { ZF: 0 } }),
  T('JNE taken when unequal (ZF=0)',
    'MOV AX,7\nCMP AX,3\nJNE yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { ZF: 0 } }),
  T('JNZ not taken when equal (ZF=1)',
    'MOV AX,4\nCMP AX,4\nJNZ yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 9 }, flags: { ZF: 1 } }),

  // ───────────── Signed jumps: JL/JGE/JLE/JG/JNL ─────────────
  // CMP 2,3 (signed 2<3): a-b=-1=0FFh ; CF=1(2<3), SF=1, OF=0 -> SF!=OF
  T('JL taken when signed less (SF!=OF)',
    'MOV AX,2\nCMP AX,3\nJL yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { SF: 1, OF: 0, CF: 1, ZF: 0 } }),
  // CMP 5,3 : a-b=2 ; SF=0, OF=0 -> SF=OF (not less)
  T('JL not taken when signed greater (SF=OF)',
    'MOV AX,5\nCMP AX,3\nJL yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 9 }, flags: { SF: 0, OF: 0 } }),
  // CMP 80h,1 byte: 80h(-128) - 1 = 7Fh ; signed overflow OF=1, SF=0 -> SF!=OF -> JL taken
  T('JL taken on signed overflow (80h<1) SF=0 OF=1',
    'MOV AL,80h\nCMP AL,1\nJL yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { SF: 0, OF: 1, CF: 0 } }),
  // CMP 5,5 -> ZF=1, SF=OF=0 ; JGE taken, JG NOT taken, JLE taken, JL NOT taken
  T('JGE taken when equal (SF=OF)',
    'MOV AX,5\nCMP AX,5\nJGE yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { ZF: 1, SF: 0, OF: 0 } }),
  T('JG not taken when equal (ZF=1)',
    'MOV AX,5\nCMP AX,5\nJG yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 9 }, flags: { ZF: 1 } }),
  T('JLE taken when equal (ZF=1)',
    'MOV AX,5\nCMP AX,5\nJLE yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { ZF: 1 } }),
  // CMP 9,2 : a-b=7, ZF=0, SF=0 OF=0 -> JG taken, JLE not taken
  T('JG taken when signed greater (ZF=0 & SF=OF)',
    'MOV AX,9\nCMP AX,2\nJG yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { ZF: 0, SF: 0, OF: 0, CF: 0 } }),
  T('JLE not taken when signed greater',
    'MOV AX,9\nCMP AX,2\nJLE yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 9 } }),
  T('JNL (=JGE) taken when signed greater',
    'MOV AX,9\nCMP AX,2\nJNL yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { SF: 0, OF: 0 } }),

  // ───────────── Unsigned jumps: JA/JAE/JB/JBE ─────────────
  // CMP 5,3 unsigned 5>3 : CF=0 ZF=0 -> JA taken
  T('JA taken when unsigned above (CF=0 & ZF=0)',
    'MOV AX,5\nCMP AX,3\nJA yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { CF: 0, ZF: 0 } }),
  // CMP 3,5 : CF=1 -> JB taken, JA not taken, JAE not taken
  T('JB taken when unsigned below (CF=1)',
    'MOV AX,3\nCMP AX,5\nJB yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { CF: 1 } }),
  T('JAE not taken when unsigned below (CF=1)',
    'MOV AX,3\nCMP AX,5\nJAE yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 9 }, flags: { CF: 1 } }),
  // CMP 5,5 -> CF=0 ZF=1 : JAE taken, JBE taken, JA not, JB not
  T('JAE taken when equal (CF=0)',
    'MOV AX,5\nCMP AX,5\nJAE yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { CF: 0, ZF: 1 } }),
  T('JBE taken when equal (CF=0 | ZF=1)',
    'MOV AX,5\nCMP AX,5\nJBE yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { ZF: 1 } }),
  T('JA not taken when equal (ZF=1)',
    'MOV AX,5\nCMP AX,5\nJA yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 9 }, flags: { ZF: 1 } }),
  // CMP 8,8? no - use below: 2 vs 9 -> CF=1 -> JBE taken
  T('JBE taken when unsigned below (CF=1)',
    'MOV AX,2\nCMP AX,9\nJBE yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { CF: 1 } }),
  T('JNC (=JAE) taken when no carry',
    'MOV AX,9\nCMP AX,2\nJNC yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { CF: 0 } }),

  // ─────────── SIGNED vs UNSIGNED differ (key case) ───────────
  // AL=05h, CMP AL,0FBh : unsigned 5 vs 251 -> CF=1 (below); signed 5 vs -5 -> greater.
  // a-b = 5-251 = -246 -> 0Ah. CF=1, ZF=0, SF=0, OF=0 (sa=0,sb=80h,sr=0 -> sr==sa).
  // => JB TAKEN (unsigned below) but JL NOT taken (signed not less). They differ.
  T('signed/unsigned differ: JB taken (CF=1) on 05h vs 0FBh',
    'MOV AL,5\nCMP AL,0FBh\nJB yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { CF: 1, SF: 0, OF: 0, ZF: 0 } }),
  T('signed/unsigned differ: JL NOT taken on 05h vs 0FBh (5 > -5)',
    'MOV AL,5\nCMP AL,0FBh\nJL yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 9 }, flags: { CF: 1, SF: 0, OF: 0 } }),
  T('signed/unsigned differ: JG taken on 05h vs 0FBh (5 > -5)',
    'MOV AL,5\nCMP AL,0FBh\nJG yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { ZF: 0, SF: 0, OF: 0 } }),

  // ───────────── JS / JNS / JO / JNO ─────────────
  // CMP 3,5 -> result FEh negative : SF=1, OF=0
  T('JS taken when result negative (SF=1)',
    'MOV AX,3\nCMP AX,5\nJS yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { SF: 1 } }),
  T('JNS taken when result non-negative (SF=0)',
    'MOV AX,5\nCMP AX,3\nJNS yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { SF: 0 } }),
  // ADD 7Fh+1 byte -> 80h : signed overflow OF=1, SF=1
  T('JO taken on signed overflow (7Fh+1) OF=1',
    'MOV AL,7Fh\nADD AL,1\nJO yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { OF: 1, SF: 1 } }),
  // ADD 1+1 -> 2 : OF=0
  T('JNO taken when no overflow (1+1) OF=0',
    'MOV AL,1\nADD AL,1\nJNO yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { OF: 0 } }),

  // ───────────── JP/JPE , JNP/JPO ─────────────
  // AND 3,1 -> 1 (one set bit, odd parity) PF=0 ; AND 3,3 -> 3 (two bits, even) PF=1
  T('JP taken when even parity (AND 3,3 -> 03h, PF=1)',
    'MOV AL,3\nAND AL,3\nJP yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { PF: 1 } }),
  T('JNP taken when odd parity (AND 3,1 -> 01h, PF=0)',
    'MOV AL,3\nAND AL,1\nJNP yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1 }, flags: { PF: 0 } }),
  T('JPE not taken on odd parity (01h)',
    'MOV AL,3\nAND AL,1\nJPE yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 9 }, flags: { PF: 0 } }),

  // ───────────── JCXZ ─────────────
  T('JCXZ taken when CX=0',
    'MOV CX,0\nJCXZ yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 1, CX: 0 } }),
  T('JCXZ not taken when CX!=0',
    'MOV CX,5\nJCXZ yes\nMOV BX,9\nJMP end\nyes:\nMOV BX,1\nend:\nHLT',
    { regs: { BX: 9, CX: 5 } }),

  // ───────────── LOOP family ─────────────
  // LOOP: CX-- then branch if CX!=0. Sum 1..5 -> AX=15, CX ends at 0.
  T('LOOP runs CX times (sum 1..5 = 15), CX->0',
    'MOV CX,5\nMOV AX,0\nMOV BX,0\ntop:\nINC BX\nADD AX,BX\nLOOP top\nHLT',
    { regs: { AX: 15, BX: 5, CX: 0 } }),
  // LOOP with CX=1: decremented to 0 -> fall through immediately (body runs once)
  T('LOOP with CX=1 falls through after one body pass',
    'MOV CX,1\nMOV AX,0\ntop:\nINC AX\nLOOP top\nHLT',
    { regs: { AX: 1, CX: 0 } }),
  // LOOP with CX=0: first decrement makes CX=0FFFFh -> branches 65535 more times.
  // Body runs 65536 times total: AX increments wrap -> AX = 65536 & 0xFFFF = 0, CX=0.
  T('LOOP with CX=0 wraps to 65536 iterations (AX wraps to 0)',
    'MOV CX,0\nMOV AX,0\ntop:\nINC AX\nLOOP top\nHLT',
    { regs: { AX: 0, CX: 0 }, maxSteps: 300000 }),
  // LOOPE/LOOPZ: continue while CX!=0 AND ZF=1. Set ZF=1 via CMP equal each pass.
  // CX=3: pass1 CX=2 ZF=1 loop; pass2 CX=1 ZF=1 loop; pass3 CX=0 stop. body 3x.
  T('LOOPE loops while equal (ZF=1), CX->0',
    'MOV CX,3\nMOV AX,0\ntop:\nINC AX\nMOV DX,7\nCMP DX,7\nLOOPE top\nHLT',
    { regs: { AX: 3, CX: 0 }, flags: { ZF: 1 } }),
  // LOOPE exits early when ZF=0: CMP makes ZF=0 -> stop after first decrement.
  // CX=5 -> body once, CX=4, ZF=0 -> exit. CX stays 4.
  T('LOOPE exits early when ZF=0 (CX stays 4)',
    'MOV CX,5\nMOV AX,0\ntop:\nINC AX\nMOV DX,1\nCMP DX,2\nLOOPE top\nHLT',
    { regs: { AX: 1, CX: 4 }, flags: { ZF: 0 } }),
  // LOOPNE/LOOPNZ: continue while CX!=0 AND ZF=0. CMP unequal keeps ZF=0.
  T('LOOPNE loops while not-equal (ZF=0), CX->0',
    'MOV CX,3\nMOV AX,0\ntop:\nINC AX\nMOV DX,1\nCMP DX,2\nLOOPNE top\nHLT',
    { regs: { AX: 3, CX: 0 }, flags: { ZF: 0 } }),
  // LOOPNE exits early when ZF=1: CMP equal -> ZF=1 -> stop after one decrement.
  T('LOOPNE exits early when ZF=1 (CX stays 4)',
    'MOV CX,5\nMOV AX,0\ntop:\nINC AX\nMOV DX,9\nCMP DX,9\nLOOPNE top\nHLT',
    { regs: { AX: 1, CX: 4 }, flags: { ZF: 1 } }),

  // ───────────── PUSH / POP : LIFO + SP movement ─────────────
  // PUSH = SP-=2 then store. From SP=0xFFFE: 1st push -> SP=0xFFFC (word at FFFC),
  // 2nd push -> SP=0xFFFA (word at FFFA). Two pushes leave SP=0xFFFA.
  T('PUSH twice drops SP to 0xFFFA (decrement-then-store)',
    'MOV AX,1111h\nMOV BX,2222h\nPUSH AX\nPUSH BX\nHLT',
    { regs: { SP: 0xFFFA }, mem: [{ addr: 0xFFFA, size: 16, val: 0x2222 }, { addr: 0xFFFC, size: 16, val: 0x1111 }] }),
  // LIFO: push AX then BX, pop into CX (gets BX) then DX (gets AX). SP back to 0xFFFE.
  T('POP is LIFO (last pushed pops first), SP restored',
    'MOV AX,0AAAAh\nMOV BX,0BBBBh\nPUSH AX\nPUSH BX\nPOP CX\nPOP DX\nHLT',
    { regs: { CX: 0xBBBB, DX: 0xAAAA, SP: 0xFFFE } }),
  // Swap two regs via stack (push A push B pop A pop B) -> values exchanged.
  T('PUSH/POP swap via stack exchanges values',
    'MOV AX,1234h\nMOV BX,5678h\nPUSH AX\nPUSH BX\nPOP AX\nPOP BX\nHLT',
    { regs: { AX: 0x5678, BX: 0x1234, SP: 0xFFFE } }),
  // PUSH memory word, POP into register.
  T('PUSH/POP a word through memory operand',
    '.data\nv DW 0BEEFh\n.code\nPUSH WORD PTR [v]\nPOP AX\nHLT',
    { regs: { AX: 0xBEEF, SP: 0xFFFE } }),

  // ───────────── PUSHF / POPF preserve flags ─────────────
  // Set CF=1 via STC, PUSHF, clear CF via CLC, POPF restores CF=1.
  T('PUSHF/POPF preserve CF across a CLC',
    'STC\nPUSHF\nCLC\nPOPF\nHLT',
    { flags: { CF: 1 } }),
  // CMP sets ZF=1; PUSHF; alter flags with CMP unequal (ZF=0); POPF restores ZF=1.
  T('PUSHF/POPF preserve ZF across intervening CMP',
    'MOV AX,4\nCMP AX,4\nPUSHF\nMOV AX,4\nCMP AX,1\nPOPF\nHLT',
    { flags: { ZF: 1 } }),
  // PUSHF leaves SP-2 then POPF restores: net SP unchanged at 0xFFFE.
  T('PUSHF then POPF restores SP to 0xFFFE',
    'STC\nPUSHF\nPOPF\nHLT',
    { regs: { SP: 0xFFFE }, flags: { CF: 1 } }),

  // ───────────── CALL / RET ─────────────
  // CALL pushes return (SP 0xFFFE->0xFFFC during call), RET pops it -> SP back 0xFFFE.
  T('CALL/RET: subroutine adds, SP returns to 0xFFFE',
    'MOV AX,10\nCALL addfive\nMOV BX,1\nHLT\naddfive:\nADD AX,5\nRET',
    { regs: { AX: 15, BX: 1, SP: 0xFFFE } }),
  // CALL pushes return address; inside sub SP=0xFFFC (one word pushed).
  T('CALL pushes one word: SP=0xFFFC inside subroutine',
    'CALL sub\nHLT\nsub:\nMOV BX,SP\nRET',
    { regs: { BX: 0xFFFC } }),
  // Nested calls: outer calls inner; depth 2 -> SP=0xFFFA at deepest; unwinds to 0xFFFE.
  T('Nested CALL depth 2 unwinds SP back to 0xFFFE',
    'MOV AX,0\nCALL outer\nMOV DX,1\nHLT\nouter:\nADD AX,1\nCALL inner\nRET\ninner:\nADD AX,10\nRET',
    { regs: { AX: 11, DX: 1, SP: 0xFFFE } }),
  // Deepest SP observable: outer pushes ret (FFFC), inner pushes ret (FFFA).
  T('Nested CALL: SP=0xFFFA at deepest nesting',
    'CALL outer\nHLT\nouter:\nCALL inner\nRET\ninner:\nMOV BX,SP\nRET',
    { regs: { BX: 0xFFFA } }),
  // Two sequential calls reuse stack: SP balanced after each.
  T('Two sequential CALLs leave SP at 0xFFFE',
    'MOV AX,0\nCALL inc\nCALL inc\nHLT\ninc:\nADD AX,3\nRET',
    { regs: { AX: 6, SP: 0xFFFE } }),

  // ───────────── XCHG ─────────────
  T('XCHG reg,reg swaps register values',
    'MOV AX,1234h\nMOV BX,0ABCDh\nXCHG AX,BX\nHLT',
    { regs: { AX: 0xABCD, BX: 0x1234 } }),
  T('XCHG reg8,reg8 swaps byte halves',
    'MOV AL,11h\nMOV BL,99h\nXCHG AL,BL\nHLT',
    { regs: { AL: 0x99, BL: 0x11 } }),
  // XCHG reg,mem swaps register with memory word.
  T('XCHG reg,mem swaps register with memory word',
    '.data\nw DW 0CAFEh\n.code\nMOV AX,1234h\nXCHG AX,WORD PTR [w]\nHLT',
    { regs: { AX: 0xCAFE }, mem: [{ addr: 0x0200, size: 16, val: 0x1234 }] }),
];
