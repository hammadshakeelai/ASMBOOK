// ================================================================
//  friendly errors — turn NASM/engine diagnostics into plain English
//  for the teaching layer (R2). Pure functions, DOM-free, testable.
// ================================================================

export interface FriendlyError {
  line: number | null;
  original: string;
  friendly: string;
  hint: string;
  message?: string;
}

const NASM_PATTERNS = [
  { re: /parser: error: (.+)/i,
    explain: (m: RegExpMatchArray) => ({
      friendly: 'The assembler could not understand: "' + m[1] + '".',
      hint: 'Check the instruction name, register spelling, and operand order.'
    }) },
  { re: /error: invalid operand \d+ for ([A-Z]+): immediate value cannot be a destination/i,
    explain: (m: RegExpMatchArray) => ({
      friendly: 'A destination for ' + m[1] + ' cannot be an immediate value.',
      hint: 'Write the destination first as a register or memory, then the immediate, e.g. MOV AX, 5.'
    }) },
  { re: /(?:error:\s*)?(?:invalid|unknown) (?:combination of|instruction|mnemonic|register|operand)[\s:]*(.+)?/i,
    explain: (m: RegExpMatchArray) => ({
      friendly: 'Invalid instruction/operand' + (m[1] ? ' (' + m[1] + ')' : ''),
      hint: 'Maybe the operands are the wrong size, or that form does not exist on the 8086.'
    }) },
  { re: /error: (?:symbol|label) ['"]?(.+?)['"]? (?:redefined|already defined)/i,
    explain: (m: RegExpMatchArray) => ({
      friendly: 'The name "' + m[1] + '" is used more than once.',
      hint: 'Each label must have a unique name.'
    }) },
  { re: /error: (?:symbol|label) ['"]?(.+?)['"]? (?:not defined|undefined|is undefined)/i,
    explain: (m: RegExpMatchArray) => ({
      friendly: 'The name "' + m[1] + '" is used but never defined.',
      hint: 'Did you spell the label the same way when you defined it?'
    }) },
  { re: /error: (?:short|near|far) jump (?:out of range|is out of range)/i,
    explain: () => ({
      friendly: 'A jump tries to go too far.',
      hint: 'Use a closer jump target or restructure the code.'
    }) },
  { re: /error: register size mismatch in ([A-Z]+) operands/i,
    explain: (m: RegExpMatchArray) => ({
      friendly: 'The two register operands for ' + m[1] + ' are different sizes.',
      hint: 'Both registers must be 8-bit or both must be 16-bit (e.g. MOV AX, BX).'
    }) },
  { re: /error: ([A-Z]+) expects (.+?) but got (\d+)/i,
    explain: (m: RegExpMatchArray) => ({
      friendly: m[1] + ' needs ' + m[2] + ', but this line has ' + m[3] + '.',
      hint: 'Count the operands after the instruction name and separate them with commas.'
    }) },
  { re: /error: unbalanced brackets in operand '(.+)'/i,
    explain: (m: RegExpMatchArray) => ({
      friendly: 'Unbalanced square brackets in "' + m[1] + '".',
      hint: 'Every "[" needs a matching "]" (memory operands are written like [SI]).'
    }) },
  { re: /error: .*/i,
    explain: (m: RegExpMatchArray) => ({
      friendly: 'Assembler error: ' + m[0],
      hint: 'Look at this line for typos.'
    }) }
];

const RUNTIME_PATTERNS = [
  { re: /divide (?:by zero|overflow)/i,
    explain: () => ({
      friendly: 'The CPU tried to divide by zero.',
      hint: 'Make sure the divisor is not zero before DIV/IDIV.'
    }) },
  { re: /infinite loop/i,
    explain: () => ({
      friendly: 'The program ran a very long time without stopping.',
      hint: 'Does every loop have a way to end?'
    }) }
];

function matchError(text: string, patterns: typeof NASM_PATTERNS): { friendly: string; hint: string } | null {
  for (const p of patterns) {
    const m = text.match(p.re);
    if (m) return p.explain(m);
  }
  return null;
}

export function friendlyParse(text: string, line: number | null): FriendlyError {
  const txt = text.trim();
  const nas = matchError(txt, NASM_PATTERNS);
  if (nas) return { line, original: txt, friendly: nas.friendly, hint: nas.hint, message: nas.friendly };
  const run = matchError(txt, RUNTIME_PATTERNS);
  if (run) return { line, original: txt, friendly: run.friendly, hint: run.hint, message: run.friendly };
  const display = txt.length > 65 ? txt.slice(0, 62) + '…' : txt;
  const friendly = 'Something went wrong: "' + display + '".';
  return { line, original: txt, friendly, hint: 'Look at the flagged line.', message: friendly };
}

export function friendlyErrors(errors: { line: number | null; message: string }[]): FriendlyError[] {
  return errors.map(e => friendlyParse(e.message, e.line));
}

/** Short explanations of flag names, for hover docs. */
export const FLAG_EXPLANATIONS: Record<string, string> = {
  CF: 'Carry — set when a math operation carries out of the highest bit.',
  PF: 'Parity — set when the low byte has an even number of 1-bits.',
  AF: 'Auxiliary Carry — used for BCD math (rarely checked directly).',
  ZF: 'Zero — set when a result equals zero. Most important for comparisons.',
  SF: 'Sign — set when the result is negative (high bit is 1).',
  TF: 'Trap — when set, the CPU stops after each instruction (debuggers).',
  IF: 'Interrupt Enable — when 0, hardware interrupts are ignored.',
  DF: 'Direction — string instructions move forward (0) or backward (1).',
  OF: 'Overflow — set when a signed result is too big for the register.'
};

/** Short explanations of register names, for hover docs. */
export const REG_EXPLANATIONS: Record<string, string> = {
  AX: 'Accumulator — arithmetic, multiply/divide, I/O.',
  BX: 'Base — often a pointer into memory ([BX]).',
  CX: 'Count — loop counter (LOOP), shift counts.',
  DX: 'Data — paired with AX for multiply/divide; port I/O.',
  SI: 'Source Index — source in string/memory ops.',
  DI: 'Destination Index — destination in string ops.',
  SP: 'Stack Pointer — top of the stack (SS:SP).',
  BP: 'Base Pointer — function parameters and locals on the stack.',
  CS: 'Code Segment — where instructions live.',
  DS: 'Data Segment — default segment for data access.',
  ES: 'Extra Segment — destination for string ops.',
  SS: 'Stack Segment — where the stack lives.',
  IP: 'Instruction Pointer — next instruction to execute.'
};