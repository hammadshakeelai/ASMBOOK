// Type surface for src/kernel/engine.js (ported legacy engine, CJS).
// This file grows as the kernel is incrementally TypeScript-ified (R0 → R1).
export declare class CPU {
  constructor();
  reset(): void;
  halted: boolean;
  ip: number;
  inputBuffer: number[];
  flags: Record<string, number>;
  getReg(name: string): number;
  setReg(name: string, value: number): void;
  linear(seg: string | number, off: number): number;
  memRead(addr: number, size?: number): number;
  memWrite(addr: number, value: number, size?: number): void;
}

export declare class Parser {
  constructor();
  parse(code: string): { errors: { message: string }[]; instrs: unknown[] };
}

export declare class Executor {
  constructor(cpu: CPU, parsed: ReturnType<Parser['parse']>);
  instrs: unknown[];
  output: string[];
  step(): void;
}

export declare const EXAMPLES: { name: string; code: string }[];
export declare function hex(v: number): string;
export declare function hex2(v: number): string;
export declare function dec(v: number): string;