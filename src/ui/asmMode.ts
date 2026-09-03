// ================================================================
//  asmMode — a lightweight NASM/8086 StreamLanguage highlighter for
//  CodeMirror 6. Not a parser — purely visual tagging.
// ================================================================
import { StreamLanguage, type StreamParser } from '@codemirror/language';

const REGS = new Set([
  'AX', 'BX', 'CX', 'DX', 'AL', 'AH', 'BL', 'BH', 'CL', 'CH', 'DL', 'DH',
  'SI', 'DI', 'BP', 'SP', 'CS', 'DS', 'ES', 'SS', 'IP'
]);

const DIRECTIVES = new Set([
  'DB', 'DW', 'DD', 'DQ', 'DT', 'RESB', 'RESW', 'RESD', 'RESQ', 'REST',
  'EQU', 'TIMES', 'INCBIN', 'SECTION', 'SEGMENT', 'ENDS', 'PROC', 'ENDP',
  'MACRO', 'ENDM', 'ORG', 'BITS', 'GLOBAL', 'EXTERN', 'COMMON', 'STRUC',
  'ENDSTRUC', 'ALIGN', 'GROUP', 'ASCII', 'NUL'
]);

function atLineStart(stream: { string: string; start: number }): boolean {
  return stream.string.slice(0, stream.start).trim() === '';
}

const parser: StreamParser<unknown> = {
  name: 'nasm',
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/^;.*/)) return 'comment';
    if (stream.match(/^["'][^"']*/)) return 'string';
    if (stream.match(/^0[xX][0-9a-fA-F]+/)) return 'number';
    if (stream.match(/^\$?[0-9a-fA-F]+[hH]/)) return 'number';
    if (stream.match(/^[01]+[bB]/)) return 'number';
    if (stream.match(/^[0-9]+/)) return 'number';

    // symbol-ish token
    if (stream.match(/^[%\-]?[A-Za-z_.$?@~][\w.$?@#~]*/)) {
      const w = stream.current().toUpperCase();
      const rest = stream.string.slice(stream.pos);
      if (/^\s*:/.test(rest)) return 'labelName';      // label definition
      const core = w.replace(/^-/, '');
      if (REGS.has(core)) return 'atom';              // register
      if (DIRECTIVES.has(core) || core.startsWith('%')) return 'keyword';
      if (atLineStart(stream)) return 'keyword';      // mnemonic
      return 'variableName';                          // label reference / symbol
    }

    if (stream.match(/^:/)) return 'operator';
    if (stream.match(/^[[\],()+\-*/]|^[<>]/)) return 'operator';
    stream.next();
    return null;
  }
};

export const nasm = StreamLanguage.define(parser);