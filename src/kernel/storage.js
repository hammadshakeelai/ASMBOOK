const DB_NAME = 'asmbook';
const DB_VERSION = 1;
const STORE_NAME = 'notebooks';
const AUTOSAVE_KEY = 'autosave';
// ── IndexedDB helpers ──────────────────────────────────────────
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(STORE_NAME);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function dbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
    });
}
async function dbSet(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}
/** Save notebook to IndexedDB (autosave). */
export async function autosave(cells) {
    await dbSet(AUTOSAVE_KEY, { cells, savedAt: Date.now() });
}
/** Load notebook from IndexedDB. Returns null if nothing saved. */
export async function loadAutosave() {
    const data = await dbGet(AUTOSAVE_KEY);
    if (!data?.cells?.length)
        return null;
    return data.cells;
}
/** Clear the autosave. */
export async function clearAutosave() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(AUTOSAVE_KEY);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}
// ── Import / Export (.asmnb) ──────────────────────────────────
/** Export cells to a JSON string (.asmnb format). */
export function exportNotebook(cells) {
    return JSON.stringify({ version: 1, cells }, null, 2);
}
function isValidCell(c) {
    return c && typeof c === 'object' && typeof c.id === 'string' && (c.kind === 'code' || c.kind === 'markdown') && typeof c.source === 'string';
}
/** Import cells from a JSON string. Returns null on invalid input. */
export function importNotebook(json) {
    try {
        const data = JSON.parse(json);
        let cells = null;
        if (data?.version === 1 && Array.isArray(data.cells)) {
            cells = data.cells;
        } else if (Array.isArray(data)) {
            cells = data;
        }
        if (!cells || !cells.every(isValidCell)) return null;
        return cells;
    }
    catch {
        return null;
    }
}
/** Trigger a browser download of the .asmnb file. */
export function downloadNotebook(cells, filename = 'notebook.asmnb') {
    const blob = new Blob([exportNotebook(cells)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
// ── Share URL ──────────────────────────────────────────────
/** Max notebook size for share URL (bytes). Larger notebooks should use file export. */
const MAX_SHARE_SIZE = 8192;
/** Create a share URL with notebook data encoded in the hash. Returns null if too large. */
export function createShareURL(cells) {
    const json = exportNotebook(cells);
    if (json.length > MAX_SHARE_SIZE)
        return null;
    const encoded = btoa(encodeURIComponent(json));
    const url = new URL(window.location.href);
    url.hash = `notebook=${encoded}`;
    return url.toString();
}
/** Load notebook from share URL hash. Returns null if not present or invalid. */
export function loadFromShareURL() {
    const hash = window.location.hash;
    if (!hash.startsWith('#notebook='))
        return null;
    try {
        const encoded = hash.slice('#notebook='.length);
        const json = decodeURIComponent(atob(encoded));
        return importNotebook(json);
    }
    catch {
        return null;
    }
}
/** Clear the share URL hash after loading. */
export function clearShareHash() {
    if (window.location.hash.startsWith('#notebook=')) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
    }
}
