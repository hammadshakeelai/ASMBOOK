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