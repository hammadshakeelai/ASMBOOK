// ESM entry for the kernel. The kernel is a true ES module (engine.mjs);
// this wrapper keeps a stable import surface for the UI. As the kernel is
// TypeScript-ified, exports migrate here directly.
export {
  CPU,
  Parser,
  Executor,
  EXAMPLES,
  hex,
  hex2,
  dec
} from './engine.mjs';
export { friendlyParse, friendlyErrors } from './errors.js';
export {
  parseNumber,
  parseExpectLine,
  parseExpects,
  evaluateExpects,
  type ExpectClause,
  type EvalContext
} from './expect.js';
export {
  COVERAGE_MATRIX,
  uniqueMnemonicCount,
  coverageByCategory,
  coverageByVerify,
  totalForms,
  GPR16,
  GPR8,
  SEGREGS,
  FLAGS,
  type InstructionForm,
  type AddressingMode,
  type VerifyClass,
  type Category
} from './coverage.js';