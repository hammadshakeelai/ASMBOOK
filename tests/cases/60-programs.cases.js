// Full-program integration tests — realistic student programs, end-to-end.
'use strict';

module.exports = [
  { name: 'GCD(48,36) by subtraction → 12',
    code: `
      MOV AX,48
      MOV BX,36
    g:CMP AX,BX
      JE  done
      JA  agtb
      SUB BX,AX
      JMP g
   agtb:SUB AX,BX
      JMP g
   done:HLT`,
    regs: { AX: 12 } },

  { name: 'Sum of DW array {10,20,30,40,50} → 150',
    code: `
      .data
      arr DW 10,20,30,40,50
      .code
      MOV CX,5
      MOV BX, arr
      MOV AX,0
   sl:ADD AX,[BX]
      ADD BX,2
      LOOP sl
      HLT`,
    regs: { AX: 150 } },

  { name: "String length of 'Hello$' → 5",
    code: `
      .data
      s DB 'Hello$'
      .code
      MOV SI, s
      MOV CX,0
   sl:MOV AL,[SI]
      CMP AL,'$'
      JE  d
      INC CX
      INC SI
      JMP sl
    d:HLT`,
    regs: { CX: 5 } },

  { name: 'Max of DW array {3,7,2,9,5} → 9',
    code: `
      .data
      arr DW 3,7,2,9,5
      .code
      MOV CX,5
      MOV BX, arr
      MOV AX,[BX]
   ml:CMP [BX],AX
      JLE sk
      MOV AX,[BX]
   sk:ADD BX,2
      LOOP ml
      HLT`,
    regs: { AX: 9 } },

  { name: 'Power 2^5 via MUL loop → 32',
    code: `
      MOV AX,1
      MOV BX,2
      MOV CX,5
   pl:MUL BX
      LOOP pl
      HLT`,
    regs: { AX: 32, DX: 0 } },

  { name: 'Multiply 7*6 by repeated addition → 42',
    code: `
      MOV AX,0
      MOV BX,7
      MOV CX,6
   ml:ADD AX,BX
      LOOP ml
      HLT`,
    regs: { AX: 42 } },

  { name: 'Stack reversal: push 1,2,3 pop AX,BX,CX → 3,2,1',
    code: `
      MOV AX,1
      PUSH AX
      MOV AX,2
      PUSH AX
      MOV AX,3
      PUSH AX
      POP AX
      POP BX
      POP CX
      HLT`,
    regs: { AX: 3, BX: 2, CX: 1, SP: 0xFFFE } },

  { name: 'Fibonacci: 10th term → 55',
    code: `
      MOV AX,0       ; fib(0)
      MOV BX,1       ; fib(1)
      MOV CX,9       ; iterate 9 times
   fl:MOV DX,AX
      ADD DX,BX      ; next = a+b
      MOV AX,BX
      MOV BX,DX
      LOOP fl
      HLT`,
    regs: { BX: 55 } },

  { name: "INT21 print 'HI'",
    code: `
      MOV AH,2
      MOV DL,'H'
      INT 21h
      MOV DL,'I'
      INT 21h
      MOV AH,4Ch
      INT 21h`,
    output: 'HI' },

  { name: 'Count even numbers in {1..6} via AND 1 → 3',
    code: `
      MOV CX,6
      MOV BX,1       ; current number
      MOV DX,0       ; even count
   cl:MOV AX,BX
      AND AX,1
      JNZ odd
      INC DX
  odd:INC BX
      LOOP cl
      HLT`,
    regs: { DX: 3 } },
];
