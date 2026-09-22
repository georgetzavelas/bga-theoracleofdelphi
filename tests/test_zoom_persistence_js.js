/**
 * The zoom persists across games, not just across reloads.
 *
 * It was stored under 'delphi.zoom.<table>.<player>', so every new table
 * started at neutral and the player re-set it each game. The key is now per
 * PLAYER: the zoom is a statement about your eyesight and your screen, and
 * neither changes when you sit at a different table.
 *
 * Two things have to hold, and the second is the one that bites:
 *
 *   - a value saved at one table is read at another;
 *   - a value stored under the OLD per-table key is adopted, once, rather than
 *     appearing to reset. Everyone already using the zoom has one of those, so
 *     shipping without the migration would read to them as the feature
 *     breaking on the very release that improved it.
 *
 * localStorage rather than a BGA preference because the value is continuous;
 * BGA preferences are enumerated and could only carry coarse buckets.
 *
 * Drives the REAL shipped _loadZoom / _saveZoom / _parseStoredZoom /
 * _zoomStorageKey / _legacyZoomStorageKey / _clampZoom against a fake store.
 *
 * Run: node tests/test_zoom_persistence_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8');
const LINES = SRC.split('\n');

function extractMethod(name) {
    const re = new RegExp('^        ' + name + ': (async )?function');
    const start = LINES.findIndex(l => re.test(l));
    if (start < 0) throw new Error('method not found: ' + name);
    let i = start;
    while (!/^        \},\s*$/.test(LINES[i])) {
        i++;
        if (i > start + 400) throw new Error('runaway extracting ' + name);
    }
    return LINES.slice(start, i + 1).join('\n');
}

function constFromSrc(name) {
    const m = SRC.match(new RegExp(name + ':\\s*([\\d.]+)'));
    if (!m) throw new Error('constant not found: ' + name);
    return parseFloat(m[1]);
}

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

// A store shared across "games", exactly as one browser's localStorage is.
function makeStore(seed) {
    const data = Object.assign({}, seed || {});
    return {
        data,
        getItem: k => (k in data ? data[k] : null),
        setItem: (k, v) => { data[k] = String(v); },
    };
}

const METHODS = [
    '_zoomStorageKey', '_legacyZoomStorageKey', '_parseStoredZoom',
    '_loadZoom', '_saveZoom', '_clampZoom', '_clampStripZoom',
].map(extractMethod).join('\n');

function makeGame(store, tableId, playerId) {
    const game = new Function(`return { ${METHODS} };`)();
    game.ZOOM_MIN = constFromSrc('ZOOM_MIN');
    game.ZOOM_MAX = constFromSrc('ZOOM_MAX');
    game.table_id = tableId;
    game.player_id = playerId;
    global.window = { localStorage: store };
    return game;
}

// ---------- the key is per player, not per table ----------
{
    const store = makeStore();
    const g = makeGame(store, 111, 7);
    check(!g._zoomStorageKey().includes('111'),
        'the storage key does NOT include the table id, got: ' + g._zoomStorageKey());
    check(g._zoomStorageKey().includes('7'),
        'the storage key does include the player id');
    const h = makeGame(store, 222, 7);
    check(g._zoomStorageKey() === h._zoomStorageKey(),
        'two different tables, same player -> the same key');
    const other = makeGame(store, 111, 8);
    check(g._zoomStorageKey() !== other._zoomStorageKey(),
        'two players sharing a browser keep separate keys');
}

// ---------- a zoom set at one table is read at the next ----------
{
    const store = makeStore();
    const first = makeGame(store, 111, 7);
    first._loadZoom();
    first._zoom = { board: 1.3, player: 0.8 };
    first._saveZoom();

    const second = makeGame(store, 999, 7);   // a different game entirely
    const z = second._loadZoom();
    check(z.board === 1.3 && z.player === 0.8,
        'the zoom carries into a new table, got: ' + JSON.stringify(z));
}

// ---------- an old per-table value is adopted, once ----------
{
    const legacyKey = 'delphi.zoom.111.7';
    const store = makeStore({ [legacyKey]: JSON.stringify({ board: 1.4, player: 0.7 }) });
    const g = makeGame(store, 111, 7);
    const z = g._loadZoom();
    check(z.board === 1.4 && z.player === 0.7,
        'a pre-existing per-table zoom is adopted rather than reset, got: '
        + JSON.stringify(z));
    // Migrated forward, so the next table reads it directly.
    check(store.getItem(g._zoomStorageKey()) !== null,
        'the adopted value is written under the shared key');
    const next = makeGame(store, 222, 7);
    const z2 = next._loadZoom();
    check(z2.board === 1.4 && z2.player === 0.7,
        'and is therefore present at the NEXT table, which has no legacy key');
}

// ---------- the shared key wins over a stale per-table one ----------
{
    const store = makeStore({
        'delphi.zoom.7': JSON.stringify({ board: 1.1, player: 1.1 }),
        'delphi.zoom.111.7': JSON.stringify({ board: 1.5, player: 0.5 }),
    });
    const g = makeGame(store, 111, 7);
    const z = g._loadZoom();
    check(z.board === 1.1 && z.player === 1.1,
        'the shared key is authoritative; the legacy key is only a fallback, got: '
        + JSON.stringify(z));
}

// ---------- a corrupt shared key must not hide the legacy one ----------
{
    const store = makeStore({
        'delphi.zoom.7': '{not json',
        'delphi.zoom.111.7': JSON.stringify({ board: 1.2, player: 0.9 }),
    });
    const g = makeGame(store, 111, 7);
    const z = g._loadZoom();
    check(z.board === 1.2 && z.player === 0.9,
        'a corrupt shared key falls through to the legacy key rather than '
        + 'aborting the whole load, got: ' + JSON.stringify(z));
}

// ---------- clamping still applies on read ----------
{
    const store = makeStore({ 'delphi.zoom.7': JSON.stringify({ board: 99, player: -5 }) });
    const g = makeGame(store, 111, 7);
    const z = g._loadZoom();
    check(z.board === g.ZOOM_MAX && z.player === g.ZOOM_MIN,
        'a hand-edited value is clamped, not trusted, got: ' + JSON.stringify(z));
}

// ---------- the single-slider legacy shape still loads ----------
{
    const store = makeStore({ 'delphi.zoom.7': JSON.stringify({ zoom: 1.25 }) });
    const g = makeGame(store, 111, 7);
    const z = g._loadZoom();
    check(z.board === 1.25 && z.player === 1.25,
        'the old {zoom} payload applies to both regions, got: ' + JSON.stringify(z));
    check(z.strip === 1,
        'and leaves the strip neutral, since that build had no strip slider');
}

// ---------- the strip is the third multiplier ----------
// Added after the two-slider build shipped, so the payload everyone already
// has carries only {board, player}. A missing strip must read as neutral: the
// alternative is every existing player's panel opening on a strip they never
// chose, or worse, the whole entry failing to parse.
{
    const store = makeStore({
        'delphi.zoom.7': JSON.stringify({ board: 1.2, player: 0.8 }),
    });
    const g = makeGame(store, 111, 7);
    const z = g._loadZoom();
    check(z.strip === 1,
        'a two-slider payload reads the strip as neutral, got: ' + JSON.stringify(z));
    check(z.board === 1.2 && z.player === 0.8,
        'without disturbing the two it does carry');
}
{
    const store = makeStore();
    const first = makeGame(store, 111, 7);
    first._loadZoom();
    first._zoom = { board: 1, player: 1, strip: 1.4 };
    first._saveZoom();
    check(/"strip":/.test(store.getItem('delphi.zoom.7')),
        'the strip size is written to storage');
    const second = makeGame(store, 999, 7);
    const z = second._loadZoom();
    check(z.strip === 1.4,
        'and carries into the next table like the other two, got: '
        + JSON.stringify(z));
}
{
    const store = makeStore({
        'delphi.zoom.7': JSON.stringify({ board: 1, player: 1, strip: 42 }),
    });
    const g = makeGame(store, 111, 7);
    check(g._loadZoom().strip === g.ZOOM_MAX,
        'a hand-edited strip value is capped at the ceiling');
}

// The strip only ever grows, so its floor is the DEFAULT size rather than
// ZOOM_MIN. The first version of this slider could go below that, so a value
// written by it has to be raised on read rather than trusted.
{
    const store = makeStore({
        'delphi.zoom.7': JSON.stringify({ board: 1.2, player: 0.9, strip: 0.6 }),
    });
    const g = makeGame(store, 111, 7);
    const z = g._loadZoom();
    check(z.strip === 1,
        'a shrunk strip stored by the earlier build is raised to the default, got: '
        + JSON.stringify(z));
    check(z.board === 1.2 && z.player === 0.9,
        'and the board and player board, which DO shrink, are left alone');
}

// ---------- storage entirely unavailable ----------
{
    const throwing = {
        getItem() { throw new Error('denied'); },
        setItem() { throw new Error('denied'); },
    };
    const g = makeGame(throwing, 111, 7);
    let z;
    check((() => { try { z = g._loadZoom(); return true; } catch (e) { return false; } })(),
        'private mode / disabled storage does not throw');
    check(z && z.board === 1 && z.player === 1 && z.strip === 1,
        'and falls back to neutral, got: ' + JSON.stringify(z));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
