// ================================================================
//  @expect clause parsing & evaluation (R2)
//  Supports assertion directives embedded in cell source:
//    ; @expect AX = 0005        ; @expect ZF = 1
//    ; @expect [0x100] = 42
//    ; @expect screen[0,0] = 'H'
//  Lines starting with ; @expect are directives.
// ================================================================
/** Parse a number literal. Supports 0x prefix, h suffix, decimal, char literals, and bare hex. */
export function parseNumber(s) {
    s = s.trim();
    const m = s.match(/^'(.)'$/);
    if (m)
        return m[1].charCodeAt(0);
    // Decimal first (must not be caught by hex patterns)
    if (/^-?\d+$/.test(s))
        return parseInt(s, 10);
    // Handle hex: 0x prefix, h suffix, or bare hex (e.g., A, FF, but NOT bare decimal like 10)
    if (/^0[xX][0-9a-fA-F]+$/.test(s))
        return parseInt(s.slice(2), 16);
    if (/^[0-9a-fA-F]+[hH]$/.test(s))
        return parseInt(s.slice(0, -1), 16);
    // Bare hex: only if contains a-f/A-F characters (not pure decimal like 10, 123)
    if (/^[0-9a-fA-F]+$/.test(s) && !/^\d+$/.test(s))
        return parseInt(s, 16);
    return null;
}
/** Parse a single @expect line. Returns null for non-@expect lines. */
export function parseExpectLine(line) {
    const s = line.trim();
    let body = s;
    if (body.startsWith(';'))
        body = body.slice(1).trim();
    body = body.trim();
    if (!body.startsWith('@expect'))
        return null;
    body = body.slice(7).trim();
    let m = body.match(/^([A-Za-z_]\w*)\s*(==?|!=)\s*(.+)$/);
    if (m) {
        const target = m[1].toUpperCase();
        const op = m[2] === '!=' ? '!=' : '=';
        const value = parseNumber(m[3]);
        if (value !== null) {
            const FLAGS = ['CF', 'PF', 'AF', 'ZF', 'SF', 'TF', 'IF', 'DF', 'OF'];
            if (FLAGS.includes(target)) {
                return { target, targetLabel: target + ' (flag)', expected: value, op, rawLine: 0, raw: s };
            }
            return { target, targetLabel: target, expected: value, op, rawLine: 0, raw: s };
        }
    }
    // memory: [0x100] = 42
    m = body.match(/^\[([^\]]+)\]\s*(=|!=)\s*(.+)$/);
    if (m) {
        const addrStr = m[1].trim();
        const addr = parseNumber(addrStr);
        if (addr !== null) {
            const op = m[2] === '!=' ? '!=' : '=';
            const val = parseNumber(m[3]);
            if (val !== null) {
                return { target: '[' + addrStr.toUpperCase() + ']', targetLabel: 'MEM[' + addr.toString(16).toUpperCase().padStart(4, '0') + ']', expected: val, op, rawLine: 0, raw: s };
            }
        }
    }
    // screen: screen[0,0] = 'H'
    m = body.match(/^screen\[(\d+),(\d+)\]\s*(=|!=)\s*(.+)$/);
    if (m) {
        const row = parseInt(m[1], 10);
        const col = parseInt(m[2], 10);
        const op = m[3] === '!=' ? '!=' : '=';
        const val = parseNumber(m[4]);
        if (val !== null) {
            return { target: 'SCREEN[' + row + ',' + col + ']', targetLabel: 'SCREEN[' + row + ',' + col + ']', expected: val, op, rawLine: 0, raw: s };
        }
    }
    return null;
}
/** Parse @expect clauses from a cell's source text. */
export function parseExpects(source) {
    const out = [];
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const clause = parseExpectLine(lines[i]);
        if (clause) {
            clause.rawLine = i + 1;
            out.push(clause);
        }
    }
    return out;
}
/** Evaluate clauses against an EvalContext. */
export function evaluateExpects(ctx, clauses) {
    return clauses.map(clause => {
        let actual = null;
        if (clause.targetLabel.endsWith(' (flag)')) {
            actual = ctx.getFlag(clause.target);
        }
        else if (clause.target.startsWith('SCREEN[')) {
            const m = clause.target.match(/SCREEN\[(\d+),(\d+)\]/);
            if (m && ctx.getScreenChar) {
                actual = ctx.getScreenChar(parseInt(m[1], 10), parseInt(m[2], 10));
            }
        }
        else if (clause.target.startsWith('[')) {
            const addrStr = clause.target.replace(/[\[\]]/g, '');
            const addr = parseNumber(addrStr);
            if (addr !== null)
                actual = ctx.memReadByte(addr);
        }
        else {
            actual = ctx.getReg(clause.target);
            if (actual === null && ctx.getVar) {
                actual = ctx.getVar(clause.target);
            }
        }
        let passed = false;
        if (actual !== null) {
            if (clause.op === '=')
                passed = actual === clause.expected;
            else
                passed = actual !== clause.expected;
        }
        return {
            clause,
            actual,
            passed,
            message: passed
                ? (clause.raw + '  ✓')
                : (clause.raw + '  ✗  expected ' + clause.expected + ', got ' + (actual === null ? 'unreadable' : actual))
        };
    });
}
