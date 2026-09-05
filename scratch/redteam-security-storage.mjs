import { exportNotebook, importNotebook } from '../src/kernel/storage.js';

const findings = [];
function record(category, testName, pass, details = '') {
  if (pass) {
    console.log(`  [PASS] ${category}: ${testName}`);
  } else {
    console.error(`  [FAIL] ${category}: ${testName} -> ${details}`);
    findings.push({ category, testName, details });
  }
}

console.log('=== [RED TEAM 4] Security, Persistence & Serialization ===\n');

// 1. Corrupted base64 / invalid URL hash decoding
{
  function decodeHash(hash) {
    if (!hash.startsWith('#notebook=')) return null;
    try {
      const encoded = hash.slice('#notebook='.length);
      const json = decodeURIComponent(atob(encoded));
      return importNotebook(json);
    } catch {
      return null;
    }
  }

  const badHashes = [
    '#notebook=bad!!base64==',
    '#notebook=',
    '#notebook=!!!',
    '#notebook=' + encodeURIComponent('bad_base64_strings%%'),
    '#notebook=' + btoa('{"invalid: json')
  ];

  let allHandled = true;
  for (const bh of badHashes) {
    try {
      const res = decodeHash(bh);
      if (res !== null) allHandled = false;
    } catch (e) {
      allHandled = false;
    }
  }
  record('URL Security', 'Corrupted / invalid share hashes gracefully return null without throw', allHandled);
}

// 2. Prototype Pollution Resistance
{
  const pollutedPayload = JSON.stringify({
    version: 1,
    __proto__: { admin: true },
    cells: [
      {
        id: 'c1',
        kind: 'code',
        source: 'NOP',
        __proto__: { injected: true }
      }
    ]
  });

  const imported = importNotebook(pollutedPayload);
  const isProtoClean = ({}).admin === undefined && ({}).injected === undefined;
  record('Security', 'Prototype pollution payload does not pollute Object prototype', isProtoClean);
}

// 3. Reject invalid / malicious cell kinds
{
  const maliciousCells = [
    { id: 'c1', kind: 'executable_bash', source: 'rm -rf /' },
    { id: 'c2', kind: 'eval', source: 'process.exit(1)' },
    { id: 'c3', kind: '', source: 'NOP' },
    { id: 123, kind: 'code', source: 'NOP' }
  ];

  for (const badCell of maliciousCells) {
    const json = JSON.stringify([badCell]);
    const res = importNotebook(json);
    record('Validation', `Rejects malicious/invalid cell: ${JSON.stringify(badCell)}`, res === null);
  }
}

// 4. Large payload stress testing
{
  const cells = [];
  for (let i = 0; i < 2000; i++) {
    cells.push({ id: `cell_${i}`, kind: i % 2 === 0 ? 'code' : 'markdown', source: `MOV AX, ${i}` });
  }
  const exported = exportNotebook(cells);
  const t0 = performance.now();
  const imported = importNotebook(exported);
  const dur = performance.now() - t0;

  record('Stress', '2000 cells serialize and deserialize within 150ms', dur < 150 && imported?.length === 2000, `duration=${Math.round(dur)}ms`);
}

// 5. Autograder state integrity (evalCtx read-only behavior)
{
  import('../src/kernel/session.js').then(({ LiveSession }) => {
    const s = new LiveSession();
    s.setCells([
      { id: 'c1', kind: 'code', source: "MOV AX, 42h\n; expect: AX == 42h\nHLT" }
    ]);
    s.runCell('c1');
    const ctx = s.evalCtx();

    // Verify ctx only exposes read functions
    const hasMutators = 'setReg' in ctx || 'memWrite' in ctx;
    record('Autograder Security', 'EvalContext is strictly read-only (no state mutation methods)', !hasMutators);

    console.log(`\n=== Suite 4 Results: ${findings.length === 0 ? 'ALL PASSED' : findings.length + ' ISSUES FOUND'} ===\n`);
    if (findings.length > 0) {
      console.log(JSON.stringify(findings, null, 2));
    }
  });
}
