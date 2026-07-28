/**
 * User zoom: one BALANCE slider between the game board and the player board,
 * driving two multipliers layered on top of the automatic fit.
 *
 * 50 is neutral (both 100%). Left favours the game board, right favours the
 * player board, and the two move as mirror images.
 *
 * The property that matters most is that a zoom SURVIVES a relayout. The bug
 * this design exists to prevent is a second writer: _updateGameScale() runs on
 * resize, on a ResizeObserver tick, after the board renders and on preference
 * changes, so if a slider wrote the scale directly the next relayout would
 * silently revert it. Here the multipliers are inputs that function reads, so
 * the checks below re-run it and assert the zoom is still applied.
 *
 * Exercises the real shipped methods against a stand-in DOM.
 *
 * Run: node tests/test_zoom_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const LINES = fs.readFileSync(
    path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8').split('\n');

function extractMethod(name) {
    const re = new RegExp('^        ' + name + ': function');
    const start = LINES.findIndex(l => re.test(l));
    if (start < 0) throw new Error('not found: ' + name);
    let i = start;
    while (!/^        \},\s*$/.test(LINES[i])) i++;
    return LINES.slice(start, i + 1).join('\n');
}

const METHODS = ['_clampZoom', '_zoomStorageKey', '_loadZoom', '_saveZoom',
    '_zoomFromBalance', '_balanceFromZoom', 'setZoomBalance',
    '_applyBoardZoom', '_updateGameScale', '_applyColumnZoom', '_clearColumnZoom',
    '_applyElementScale', '_clearElementScale', '_clearContainerScale', '_syncZoomPanel'];

// --- stand-in DOM ----------------------------------------------------------
function makeEl(id, w, h) {
    return {
        id, offsetWidth: w, offsetHeight: h,
        _props: {}, _attrs: {},
        style: {
            setProperty(k, v) { this._p[k] = String(v); },
            removeProperty(k) { delete this._p[k]; },
            _p: {},
        },
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
                     contains(c) { return this._s.has(c); } },
        setAttribute(k, v) { this._attrs[k] = v; },
        removeAttribute(k) { delete this._attrs[k]; },
        hasAttribute(k) { return k in this._attrs; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
    };
}
function makeWorld(availableWidth) {
    const els = {
        'delphi-game-container': makeEl('delphi-game-container', 1136, 900),
        'delphi-current-player-area': makeEl('delphi-current-player-area', 1136, 790),
        'delphi-supply-strip': makeEl('delphi-supply-strip', 1136, 140),
        'delphi-hex-grid': makeEl('delphi-hex-grid', 900, 700),
        'delphi-board-wrapper': makeEl('delphi-board-wrapper', 900, 700),
        'delphi-board-container': makeEl('delphi-board-container', 900, 700),
    };
    els['delphi-game-container'].parentElement = { clientWidth: availableWidth };
    els['delphi-board-container'].clientWidth = 900;
    els['delphi-board-container'].clientHeight = 700;
    els['delphi-board-container'].scrollLeft = 0;
    els['delphi-board-container'].scrollTop = 0;
    return els;
}

// Read the tuning constants from the source rather than restating them, so a
// change there cannot leave these checks quietly asserting the old numbers.
function constant(name) {
    const line = LINES.find(l => new RegExp('^\\s*' + name + ':\\s*[0-9.]+,').test(l));
    if (!line) throw new Error('constant not found: ' + name);
    return parseFloat(line.split(':')[1]);
}
const ZOOM_MIN = constant('ZOOM_MIN');
const ZOOM_MAX = constant('ZOOM_MAX');
const ZOOM_STEP = constant('ZOOM_STEP');

const store = {};
const game = new Function('document', 'window', 'ZOOM_MIN', 'ZOOM_MAX', 'ZOOM_STEP', `return {
    ZOOM_MIN: ZOOM_MIN, ZOOM_MAX: ZOOM_MAX, ZOOM_STEP: ZOOM_STEP, _zoom: null,
${METHODS.map(extractMethod).join('\n')}
};`)(
    { getElementById: (id) => game._els[id] || null },
    { localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
    } },
    ZOOM_MIN, ZOOM_MAX, ZOOM_STEP
);
game.table_id = 'T7';
game.player_id = 'P9';
game.hexGrid = {
    currentZoom: 1, minZoom: 0.5, maxZoom: 1.5,
    setZoom(z) { this.currentZoom = Math.max(this.minZoom, Math.min(this.maxZoom, z)); },
};

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }
function appliedScale(el) { return parseFloat(el.style._p['--game-scale']); }
function appliedMargin(el) { return parseFloat(el.style._p['--game-scale-margin']); }

function fresh(width) {
    for (const k of Object.keys(store)) delete store[k];
    game._els = makeWorld(width);
    game._zoom = null;
    game._besideLayout = false;
    game.hexGrid.currentZoom = 1;
    game._loadZoom();
    game._updateGameScale();
}

// ---- clamping -------------------------------------------------------------
fresh(1400);
check(game._clampZoom(0.1) === ZOOM_MIN, 'clamps below the floor');
check(game._clampZoom(9) === ZOOM_MAX, 'clamps above the ceiling');
check(game._clampZoom('abc') === 1, 'non-numeric falls back to 1');
check(game._clampZoom(undefined) === 1, 'undefined falls back to 1');

// ---- persistence ----------------------------------------------------------
fresh(1400);
game.setZoomBalance(75);
check(/"player":/.test(store['delphi.zoom.T7.P9'] || ''), 'the balance is persisted');
check(game._zoomStorageKey().indexOf('T7') !== -1 && game._zoomStorageKey().indexOf('P9') !== -1,
    'storage key carries both table and player, so tables cannot collide');
game._zoom = null;
game._loadZoom();
check(game._zoom.player > 1 && game._zoom.board < 1, 'the balance is restored on reload');

store['delphi.zoom.T7.P9'] = 'garbage{';
game._zoom = null; game._loadZoom();
check(game._zoom.player === 1 && game._zoom.board === 1, 'corrupt storage falls back to 1');

// An entry written by the short-lived single-slider build must not silently
// reset someone who had already chosen a size.
store['delphi.zoom.T7.P9'] = '{"zoom":1.3}';
game._zoom = null; game._loadZoom();
check(game._zoom.board === 1.3 && game._zoom.player === 1.3,
    'a single-value entry is applied to both sliders');

store['delphi.zoom.T7.P9'] = '{"board":50,"player":-3}';
game._zoom = null; game._loadZoom();
check(game._zoom.board === ZOOM_MAX && game._zoom.player === ZOOM_MIN,
    'out-of-range stored values are clamped, not trusted');

// ---- the multiplier composes with auto-fit, rather than replacing it ------
fresh(1400);
const wideFit = appliedScale(game._els['delphi-current-player-area']);
check(isNaN(wideFit), 'a window that fits needs no scale at all');

game.setZoomBalance(100);   // hard right: player board as large as it goes
const pz = game._zoom.player;
check(Math.abs(appliedScale(game._els['delphi-current-player-area']) - pz) < 0.001,
    'with room to spare the applied scale is just the multiplier');

// Narrow the window: auto-fit must reassert itself UNDER the multiplier.
game._els['delphi-game-container'].parentElement.clientWidth = 1000;
game._updateGameScale();
const narrow = appliedScale(game._els['delphi-current-player-area']);
const expected = Math.min(1, (1000 - 40) / 1136) * pz;
check(Math.abs(narrow - expected) < 0.005,
    `narrow window composes fit x zoom, expected ${expected.toFixed(3)} got ${narrow}`);
check(game._zoom.player === pz, 'the multiplier itself is untouched by a relayout');

// THE regression guard: re-running the layout must not discard the zoom.
game._updateGameScale();
game._updateGameScale();
check(Math.abs(appliedScale(game._els['delphi-current-player-area']) - narrow) < 0.001,
    'repeated relayouts keep the zoom applied (no second writer)');

// ---- scaling ABOVE 1 must actually be applied ----------------------------
fresh(1400);
game.setZoomBalance(100);
const el = game._els['delphi-current-player-area'];
check(el.hasAttribute('data-js-scaled'), 'an enlarging scale is applied, not discarded');
check(Math.abs(appliedMargin(el) - (game._zoom.player - 1) * 790) < 0.5,
    'the compensation margin tracks the enlarging scale');

// Shrinking still compensates in the other direction.
game.setZoomBalance(0);   // hard left: player board at its smallest
check(appliedMargin(el) < 0, 'a shrinking scale compensates with a negative margin');

// ---- supply strip stays in step with the player area ---------------------
fresh(1400);
game.setZoomBalance(80);
check(Math.abs(appliedScale(game._els['delphi-supply-strip'])
             - appliedScale(game._els['delphi-current-player-area'])) < 0.001,
    'supply strip tracks the player area so the two never disagree');

// ---- board zoom is independent of the player area ------------------------
fresh(1400);
game.setZoomBalance(0);     // hard left: game board as large as it goes
check(game.hexGrid.currentZoom === game._clampZoom(game._zoom.board),
    'stacked: the board multiplier drives the hex grid');
check(game._zoom.board > 1 && game._zoom.player < 1,
    'left favours the board and shrinks the player board');

// In beside mode the grid zoom must be released, or it double-applies on top
// of the column scale and spills over the player column.
game._besideLayout = true;
game._updateGameScale();
check(game.hexGrid.currentZoom === 1, 'beside mode releases the grid zoom');
check(game._els['delphi-board-wrapper'].hasAttribute('data-col-zoomed'),
    'beside mode scales the board column instead');
game._besideLayout = false;
game._updateGameScale();
check(!game._els['delphi-board-wrapper'].hasAttribute('data-col-zoomed'),
    'returning to stacked clears the column scaling');
check(game.hexGrid.currentZoom === game._clampZoom(game._zoom.board), 'and restores the grid zoom');

// ---- the balance mapping -------------------------------------------------
fresh(1400);
check(game._zoomFromBalance(50).board === 1 && game._zoomFromBalance(50).player === 1,
    'centre is neutral: both regions at 100%');

const left = game._zoomFromBalance(0);
const right = game._zoomFromBalance(100);
check(left.board === game.ZOOM_MAX && left.player === game.ZOOM_MIN,
    `hard left maxes the game board, got ${JSON.stringify(left)}`);
check(right.player === game.ZOOM_MAX && right.board === game.ZOOM_MIN,
    `hard right maxes the player board, got ${JSON.stringify(right)}`);

// The two ends must mirror each other, or the control reads as lopsided.
check(Math.abs(left.board - right.player) < 1e-9 && Math.abs(left.player - right.board) < 1e-9,
    'the two directions are mirror images');

// Monotonic: sliding right must never shrink the player board.
let prev = -Infinity, monotonic = true;
for (let p = 0; p <= 100; p += 5) {
    const v = game._zoomFromBalance(p).player;
    if (v < prev - 1e-9) monotonic = false;
    prev = v;
}
check(monotonic, 'player size increases monotonically from left to right');

// Round trip: the slider must land back where the state says it is.
[0, 25, 50, 75, 100].forEach(function(p) {
    game.setZoomBalance(p);
    check(game._balanceFromZoom() === p, `balance ${p} round-trips, got ${game._balanceFromZoom()}`);
});

// Fit returns to neutral.
game.setZoomBalance(100);
game.setZoomBalance(50);
check(game._zoom.board === 1 && game._zoom.player === 1, 'Fit restores both to 100%');

// The promised ceiling must be reachable. HexGrid clamps at its own maxZoom,
// so a higher ZOOM_MAX would make the readout claim a size the board never
// takes.
fresh(1400);
game.setZoomBalance(0);
check(game.hexGrid.currentZoom === game._zoom.board,
    `the board actually reaches the promised size, readout says ${game._zoom.board} `
    + `but the grid is at ${game.hexGrid.currentZoom}`);
check(game.ZOOM_MAX <= game.hexGrid.maxZoom,
    `ZOOM_MAX (${game.ZOOM_MAX}) must not exceed HexGrid maxZoom (${game.hexGrid.maxZoom})`);

// ---- the wiring must bind exactly once -----------------------------------
// setup() mounts the markup in one place and wires it in another. When both
// places called setupZoomControls(), every handler bound twice: the toggle
// opened the panel and its duplicate immediately closed it, so the button
// looked dead, and each +/- step applied 0.2 instead of 0.1.
{
    var listeners = 0;
    var fakeEl = function() {
        return {
            hidden: true, style: { _p: {} },
            classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
            addEventListener() { listeners++; },
            setAttribute() {}, removeAttribute() {},
            querySelector() { return null; },
            querySelectorAll() { return []; },
            contains() { return false; },
            getBoundingClientRect() { return { left: 0, top: 0 }; },
        };
    };
    var nodes = {
        'delphi-zoom-toggle': fakeEl(),
        'delphi-zoom-panel': fakeEl(),
        'delphi-board-container': fakeEl(),
        'delphi-current-player-area': fakeEl(),
    };
    var doc = {
        getElementById: function(id) { return nodes[id] || null; },
        addEventListener: function() { listeners++; },
    };
    var wiring = new Function('document', `return {
${extractMethod('setupZoomControls')}
${extractMethod('_syncZoomPanel')}
${extractMethod('_balanceFromZoom')}
};`)(doc);
    wiring.ZOOM_MIN = ZOOM_MIN; wiring.ZOOM_MAX = ZOOM_MAX;
    wiring._zoom = { board: 1, player: 1 };

    wiring.setupZoomControls();
    var afterFirst = listeners;
    check(afterFirst > 0, 'first call binds handlers');

    wiring.setupZoomControls();
    check(listeners === afterFirst,
        `a second call must bind nothing more (was ${afterFirst}, now ${listeners})`);
}

// The markup is mounted once and wired once. Two wiring calls in setup() is
// exactly what made the button dead.
{
    var src = LINES.join('\n');
    var wireCalls = (src.match(/this\.setupZoomControls\(\)/g) || []).length;
    check(wireCalls === 1, `setupZoomControls() is called once in setup, found ${wireCalls}`);
    var mountCalls = (src.match(/this\._buildZoomControls\(\)/g) || []).length;
    check(mountCalls === 1, `the zoom markup is mounted once, found ${mountCalls}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
