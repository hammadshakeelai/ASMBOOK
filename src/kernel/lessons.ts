// Lesson manifest — each entry maps a display name to a .asmnb file URL.
export const LESSONS = [
  { id: '01', name: '1. Hello World', file: '01-hello-world.asmnb' },
  { id: '02', name: '2. Registers & MOV', file: '02-registers-mov.asmnb' },
  { id: '03', name: '3. Arithmetic', file: '03-arithmetic.asmnb' },
  { id: '04', name: '4. Comparison & Branching', file: '04-comparison-branching.asmnb' },
  { id: '05', name: '5. The Stack', file: '05-stack.asmnb' },
  { id: '06', name: '6. Loops', file: '06-loops.asmnb' },
  { id: '07', name: '7. String Operations', file: '07-strings.asmnb' },
  { id: '08', name: '8. Putting It Together', file: '08-putting-it-together.asmnb' },
  { id: '09', name: '9. Flags Deep Dive', file: '09-flags-deep-dive.asmnb' },
  { id: '10', name: '10. Interrupts & DOS I/O', file: '10-interrupts-dos-io.asmnb' },
  { id: '11', name: '11. Number Conversion', file: '11-number-conversion.asmnb' },
  { id: '12', name: '12. Doomsday Algorithm', file: '12-doomsday.asmnb' },
] as const;

/** Fetch a lesson .asmnb file and return parsed cells. */
export async function loadLesson(file: string): Promise<import('./session.js').Cell[] | null> {
  try {
    const base = (typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL) || './';
    const cleanBase = base.endsWith('/') ? base : base + '/';
    const url = `${cleanBase}lessons/${file}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.version === 1 && Array.isArray(data.cells)) {
      return data.cells as import('./session.js').Cell[];
    }
    return null;
  } catch {
    return null;
  }
}
