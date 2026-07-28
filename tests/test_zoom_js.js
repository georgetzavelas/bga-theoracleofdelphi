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
    '_applyElementScale', '_clearElementScale', '_clearContainerScale', '_syncZoomPanel',
    '_alignZoomButton', '_sizeBoardWindow', '_besideActive'];

// --- stand-in DOM ----------------------------------------------------------
function makeEl(id, w, h) {
    return {
        id, offsetWidth: w, offsetHeight: h,
        _props: {}, _attrs: {},
        style: {
            setProperty(k, v) { this._p[k] = String(v); this[k] = String(v); },
            removeProperty(k) { delete this._p[k]; delete this[k]; },
            _p: {},
        },
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
                     contains(c) { return this._s.has(c); } },
        setAttribute(k, v) { this._attrs[k] = v; },
        removeAttribute(k) { delete this._attrs[k]; },
        hasAttribute(k) { return k in this._attrs; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        // Right edges the aligner can measure. Deliberately different so the
        // computed inset is non-zero and the maths is actually exercised.
        getBoundingClientRect() { return { left: 0, top: 0, right: this._right || 0,
                                           bottom: 0, width: w, height: h }; },
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
    // Zoom button alignment: the anchor spans the game area, the action bar is
    // 120px narrower, so the expected inset is 120.
    els['delphi-zoom-ui'] = makeEl('delphi-zoom-ui', availableWidth, 0);
    els['delphi-zoom-ui']._right = availableWidth;
    els['delphi-zoom-toggle'] = makeEl('delphi-zoom-toggle', 38, 38);
    els['page-title'] = makeEl('page-title', availableWidth - 120, 34);
    els['page-title']._right = availableWidth - 120;
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
    { innerWidth: 1600, localStorage: {
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

// Effective layout, read the way production reads it.
function isBeside() {
    return game._els['delphi-game-container'].classList.contains('delphi-layout-beside');
}
function boardWindow() {
    var st = game._els['delphi-board-container'].style;
    return { w: st.width ? parseFloat(st.width) : null,
             h: st.height ? parseFloat(st.height) : null };
}

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
// 1800px, not 1400: wide enough that 150% of the player area (1704px) still
// fits, so the stacked cap cannot bite and these checks measure composition
// alone. The cap has its own checks further down.
fresh(1800);
const wideFit = appliedScale(game._els['delphi-current-player-area']);
check(isNaN(wideFit), 'a window that fits needs no scale at all');

game.setZoomBalance(100);   // hard right: player board as large as it goes
const pz = game._zoom.player;
check(Math.abs(appliedScale(game._els['delphi-current-player-area']) - pz) < 0.001,
    'with room to spare the applied scale is just the multiplier');

// Narrow the window: auto-fit must reassert itself UNDER the multiplier, and
// the cap trims whatever would then hang off the page edge.
game._els['delphi-game-container'].parentElement.clientWidth = 1000;
game._updateGameScale();
const narrow = appliedScale(game._els['delphi-current-player-area']);
const fit1000 = Math.min(1, (1000 - 40) / 1136);
const expected = Math.min(fit1000 * pz, Math.max(fit1000, (1000 - 40) / 1136));
check(Math.abs(narrow - expected) < 0.005,
    `narrow window composes fit x zoom under the cap, expected ${expected.toFixed(3)} got ${narrow}`);
// Consequence worth pinning: at 1000px the player area already fills the width,
// so there is no spare room and the cap holds it at the fit. The player-board
// end of the slider still shrinks the GAME board, but cannot grow this one.
check(Math.abs(narrow - fit1000) < 0.005,
    'with no spare width the player board is held at the fit, not pushed off-screen');
check(game._zoom.player === pz, 'the multiplier itself is untouched by a relayout');

// THE regression guard: re-running the layout must not discard the zoom.
game._updateGameScale();
game._updateGameScale();
check(Math.abs(appliedScale(game._els['delphi-current-player-area']) - narrow) < 0.001,
    'repeated relayouts keep the zoom applied (no second writer)');

// ---- scaling ABOVE 1 must actually be applied ----------------------------
fresh(1800);                // room for the full multiplier, see above
game.setZoomBalance(100);
const el = game._els['delphi-current-player-area'];
check(el.hasAttribute('data-js-scaled'), 'an enlarging scale is applied, not discarded');
check(Math.abs(appliedMargin(el) - (game._zoom.player - 1) * 790) < 0.5,
    'the compensation margin tracks the enlarging scale');

// Shrinking still compensates in the other direction.
game.setZoomBalance(0);   // hard left: player board at its smallest
check(appliedMargin(el) < 0, 'a shrinking scale compensates with a negative margin');

// ---- the component strip is NOT zoomed -----------------------------------
// It is a fixed shelf of decks and supply cards, not part of the player's
// board, so the slider must leave it alone.
fresh(1800);                // room for the full multiplier, see above
const stripAtRest = appliedScale(game._els['delphi-supply-strip']);
game.setZoomBalance(100);          // player board as large as it goes
check(Math.abs(appliedScale(game._els['delphi-current-player-area']) - game._zoom.player) < 0.001,
    'the player board follows the slider');
const stripZoomedRight = appliedScale(game._els['delphi-supply-strip']);
check((isNaN(stripAtRest) && isNaN(stripZoomedRight)) || stripAtRest === stripZoomedRight,
    `the component strip must not move with the slider, was ${stripAtRest} now ${stripZoomedRight}`);

game.setZoomBalance(0);            // and the other direction
check((isNaN(stripAtRest) && isNaN(appliedScale(game._els['delphi-supply-strip'])))
      || stripAtRest === appliedScale(game._els['delphi-supply-strip']),
    'the component strip is unmoved favouring the game board too');

// It must still follow the automatic fit, just not the user's zoom.
game._els['delphi-game-container'].parentElement.clientWidth = 900;
game._updateGameScale();
const fitOnly = Math.max(0.35, Math.min(1, (900 - 40) / 1136));
check(Math.abs(appliedScale(game._els['delphi-supply-strip']) - fitOnly) < 0.005,
    `the strip still auto-fits, expected ${fitOnly.toFixed(3)} got `
    + appliedScale(game._els['delphi-supply-strip']));

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

// ---- the zoom button lines up with the action bar -------------------------
// Measured rather than hardcoded, because the button is positioned against the
// game area and the action bar need not share that width.
fresh(1400);
check(game._els['delphi-zoom-toggle'].style._p === undefined
      || game._els['delphi-zoom-toggle'].style.right === '120px',
    `expected a 120px inset to match the narrower bar, got `
    + game._els['delphi-zoom-toggle'].style.right);

// A relayout must not lose the alignment.
game._els['delphi-game-container'].parentElement.clientWidth = 1000;
game._updateGameScale();
check(game._els['delphi-zoom-toggle'].style.right === '120px',
    'the alignment survives a relayout');

// ---- the platform zoom chord drives the balance --------------------------
// Ctrl on Windows/Linux, Cmd on macOS, so both modifiers must work. '+' needs
// Shift on most layouts, so the unshifted '=' and the numpad keys have to be
// accepted too or the shortcut feels unreliable.
{
    var keyHandlers = [];
    var fakeEl = function() {
        return {
            hidden: true, style: { _p: {} },
            classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
            addEventListener() {},
            setAttribute() {}, removeAttribute() {},
            querySelector() { return null; }, querySelectorAll() { return []; },
            contains() { return false; },
            getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0 }; },
        };
    };
    var nodes = {
        'delphi-zoom-toggle': fakeEl(), 'delphi-zoom-panel': fakeEl(),
        'delphi-board-container': fakeEl(), 'delphi-current-player-area': fakeEl(),
    };
    var doc = {
        getElementById: function(id) { return nodes[id] || null; },
        addEventListener: function(type, fn) { if (type === 'keydown') keyHandlers.push(fn); },
    };
    var kb = new Function('document', `return {
${extractMethod('setupZoomControls')}
${extractMethod('_syncZoomPanel')}
${extractMethod('_balanceFromZoom')}
${extractMethod('_zoomFromBalance')}
${extractMethod('_clampZoom')}
};`)(doc);
    kb.ZOOM_MIN = ZOOM_MIN; kb.ZOOM_MAX = ZOOM_MAX;
    kb._zoom = { board: 1, player: 1 };
    // Capture what the chord asks for without running the whole layout.
    var asked = [];
    kb.setZoomBalance = function(pct) { asked.push(pct); };
    kb.setupZoomControls();
    check(keyHandlers.length > 0, 'a keydown handler is registered');

    var press = function(opts) {
        asked = [];
        var prevented = false;
        var ev = Object.assign({
            ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
            key: '', code: '', target: null,
            preventDefault: function() { prevented = true; },
        }, opts);
        keyHandlers.forEach(function(h) { h(ev); });
        return { asked: asked.slice(), prevented: prevented };
    };

    // Toward the player board (right / higher balance).
    check(press({ ctrlKey: true, key: '+' }).asked[0] === 55, 'Ctrl + moves toward the player board');
    check(press({ metaKey: true, key: '+' }).asked[0] === 55, 'Cmd + works too (macOS)');
    check(press({ ctrlKey: true, key: '=' }).asked[0] === 55, "unshifted '=' counts as plus");
    check(press({ ctrlKey: true, code: 'NumpadAdd' }).asked[0] === 55, 'numpad plus counts as plus');

    // Toward the game board (left / lower balance).
    check(press({ ctrlKey: true, key: '-' }).asked[0] === 45, 'Ctrl - moves toward the game board');
    check(press({ metaKey: true, key: '-' }).asked[0] === 45, 'Cmd - works too');
    check(press({ ctrlKey: true, code: 'NumpadSubtract' }).asked[0] === 45, 'numpad minus counts as minus');

    // The chord must be claimed, or the browser zooms the page as well.
    check(press({ ctrlKey: true, key: '+' }).prevented === true, 'the chord is claimed from the browser');

    // Things that must NOT trigger it.
    check(press({ key: '+' }).asked.length === 0, 'plus alone does nothing');
    check(press({ ctrlKey: true, key: 'a' }).asked.length === 0, 'other chords are ignored');
    check(press({ ctrlKey: true, altKey: true, key: '+' }).asked.length === 0,
        'Ctrl+Alt+ is left alone');
    check(press({ ctrlKey: true, key: '+', target: { tagName: 'INPUT' } }).asked.length === 0,
        'typing in an input keeps the chord');
    check(press({ ctrlKey: true, key: '-', target: { tagName: 'TEXTAREA' } }).asked.length === 0,
        'typing in a textarea keeps the chord');
    check(press({ ctrlKey: true, key: '-', target: { isContentEditable: true } }).asked.length === 0,
        'a contenteditable keeps the chord');

    // The keyboard step must match the slider and the +/- buttons.
    check(press({ ctrlKey: true, key: '+' }).asked[0] - 50 === 5,
        'the key steps by the same 5 as the slider');
}

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

// ---- the layout decision must be independent of the zoom -----------------
// Zoom moving the layout out from under the player is disorienting in BOTH
// directions. These widths are chosen so the neutral composition sits either
// side of the readability floor.
{
    // 1000px: too narrow to read side by side, so stacked even though the
    // preference asks for beside. No slider position may change that.
    fresh(1000);
    game._besideLayout = true;
    game._updateGameScale();
    check(!isBeside(), 'a window too narrow for beside stays stacked at neutral');
    game.setZoomBalance(55);
    check(!isBeside(), 'one slider nudge must not flip a stacked table into beside');
    game.setZoomBalance(0);
    check(!isBeside(), 'nor does the hard game-board end');
    game.setZoomBalance(100);
    check(!isBeside(), 'nor the hard player-board end');

    // 1700px: comfortably beside. The zoom must not eject the player either.
    fresh(1700);
    game._besideLayout = true;
    game._updateGameScale();
    check(isBeside(), 'a roomy window uses beside at neutral');
    game.setZoomBalance(0);
    check(isBeside(), 'zooming the board must not eject a beside table to stacked');
    game.setZoomBalance(100);
    check(isBeside(), 'nor does zooming the player board');
}

// ---- stacked: the board multiplier must actually reach the board ----------
// The bug: _applyBoardZoom keyed off the PREFERENCE, so when beside was
// preferred but refused for width, the game-board half of the slider was dead.
{
    fresh(1100);
    game._besideLayout = true;     // preference says beside...
    game._updateGameScale();
    check(!isBeside(), 'setup: 1100px refuses beside, so this is the stacked path');
    game.setZoomBalance(0);        // ...ask for the largest game board
    check(Math.abs(game.hexGrid.currentZoom - game._zoom.board) < 0.001,
        `the board multiplier reaches the grid even when beside was preferred, `
        + `asked ${game._zoom.board} applied ${game.hexGrid.currentZoom}`);
    check(game.hexGrid.currentZoom > 1, 'and it is genuinely a zoom in, not 1');
}

// ---- stacked: the board window spends spare width before clipping ---------
{
    const USABLE_1400 = 1400 - 40;
    const GRID_W = 900, GRID_H = 700;
    fresh(1400);
    game._besideLayout = false;
    game.setZoomBalance(50);
    check(boardWindow().w === GRID_W,
        `at neutral the window is exactly the board, got ${boardWindow().w}`);
    game.setZoomBalance(20);        // board 130%
    const z13 = game._zoom.board;
    check(Math.abs(boardWindow().w - GRID_W * z13) < 1,
        `a zoom inside the spare width shows the WHOLE board, expected `
        + `${Math.round(GRID_W * z13)} got ${boardWindow().w}`);
    game.setZoomBalance(0);         // board 150% -> 1350, still under 1360
    check(Math.abs(boardWindow().w - GRID_W * game.ZOOM_MAX) < 1,
        'the board still fits at max zoom on a 1400px window');
    check(boardWindow().w <= USABLE_1400,
        'and the window never exceeds what fits on the page');
    // Height is never capped: vertical room costs only page scroll, so the
    // board must not lose its bottom edge.
    check(Math.abs(boardWindow().h - GRID_H * game.ZOOM_MAX) < 1,
        `the window is as tall as the zoomed board, expected `
        + `${Math.round(GRID_H * game.ZOOM_MAX)} got ${boardWindow().h}`);

    // Narrow window: exceeding the page is clipped (and pannable), not spilled.
    fresh(900);
    game._besideLayout = false;
    game.setZoomBalance(0);
    check(boardWindow().w === 900 - 40,
        `a board wider than the page is clipped to it, got ${boardWindow().w}`);
    check(boardWindow().w < GRID_W * game.ZOOM_MAX,
        'which is genuinely narrower than the board, so DragScroller has work to do');
}

// ---- stacked: the player board is capped at what fits --------------------
// It has no pan and grows from top center, so anything past the edge spills off
// BOTH sides and the left half is gone for good.
{
    const STACKED_REF = 1136;
    fresh(1400);
    game._besideLayout = false;
    game.setZoomBalance(100);       // ask for the largest player board
    const applied = appliedScale(game._els['delphi-current-player-area']);
    const cap = (1400 - 40) / STACKED_REF;
    check(applied <= cap + 0.001,
        `the player board is capped at the page width, cap ${cap.toFixed(3)} got ${applied.toFixed(3)}`);
    check(applied > 1, 'but it still grows into the spare width it does have');
    check(game._zoom.player > applied,
        'the request is deliberately larger than what fits, so the cap is doing work');
    // A readout that kept counting past the cap would promise a size the
    // layout refuses to give.
    check(game._zoomEffective.player < game._zoom.player,
        'the panel reports the capped size, not the request');
    check(Math.abs(game._zoomEffective.player - applied) < 0.001,
        'and it reports exactly what was applied');

    // Beside mode applies both multipliers in full, so nothing is capped there.
    fresh(1700);
    game._besideLayout = true;
    game.setZoomBalance(100);
    check(isBeside(), 'setup: 1700px is beside');
    check(game._zoomEffective.player === game._zoom.player,
        'beside applies the player multiplier in full');
}

// ---- switching layouts must not leave stale sizing behind -----------------
{
    fresh(1100);
    game._besideLayout = true;
    game.setZoomBalance(0);                 // stacked and zoomed: window set
    check(boardWindow().w !== null, 'setup: the stacked path sizes the board window');
    const stackedW = boardWindow().w, stackedH = boardWindow().h;

    game._els['delphi-game-container'].parentElement.clientWidth = 1700;
    game._updateGameScale();
    check(isBeside(), 'widening the window switches to beside');
    check(boardWindow().w === null && boardWindow().h === null,
        'beside clears the stacked board window, which would otherwise clip the board');

    game._els['delphi-game-container'].parentElement.clientWidth = 1100;
    game._updateGameScale();
    check(!isBeside(), 'narrowing switches back to stacked');
    check(boardWindow().w === stackedW && boardWindow().h === stackedH,
        `and restores the same window, was ${stackedW}x${stackedH} now `
        + `${boardWindow().w}x${boardWindow().h}`);
}

// ---- the panel readout must report what was APPLIED ----------------------
// Exercises _syncZoomPanel itself, not just the stored value: the stacked cap
// is invisible to the player unless the number they read moves with it.
{
    var cells = { board: { textContent: '' }, player: { textContent: '' } };
    var slider = { value: '50' };
    var fitBtn = { classList: { _on: false, toggle(c, v) { this._on = v; } } };
    var panel = {
        querySelector: function(sel) {
            var m = /data-zoom-value="(\w+)"/.exec(sel);
            if (m) return cells[m[1]] || null;
            if (sel.indexOf('data-zoom-slider') !== -1) return slider;
            if (sel.indexOf('data-zoom-fit') !== -1) return fitBtn;
            return null;
        },
    };
    var pg = new Function('document', `return {
${extractMethod('_syncZoomPanel')}
${extractMethod('_balanceFromZoom')}
};`)({ getElementById: (id) => (id === 'delphi-zoom-panel' ? panel : null) });
    pg.ZOOM_MIN = ZOOM_MIN; pg.ZOOM_MAX = ZOOM_MAX;

    pg._zoom = { board: 1, player: 1.5 };           // asked for 150%
    pg._zoomEffective = { board: 1, player: 1.2 };  // the page only allowed 120%
    pg._syncZoomPanel();
    check(cells.player.textContent === '120%',
        `the readout shows the size actually applied, got ${cells.player.textContent}`);

    // Before the first layout pass nothing has been applied, so the request is
    // the only honest thing to show.
    pg._zoomEffective = null;
    pg._syncZoomPanel();
    check(cells.player.textContent === '150%',
        `with nothing applied yet it falls back to the request, got ${cells.player.textContent}`);
}

// ---- board zoom must move EVERY layer in board coordinates ---------------
// The pieces overlay is a SIBLING of the hex art, so scaling the art alone left
// every ship, shrine, statue and monster behind: measured 150px adrift at 150%
// zoom, still at their original size while the hexes under them grew.
{
    const HEX = fs.readFileSync(
        path.join(__dirname, '..', 'modules', 'js', 'HexGrid.js'), 'utf8').split('\n');
    const hStart = HEX.findIndex(l => /^        setZoom: function/.test(l));
    let hEnd = hStart;
    while (!/^        \},\s*$/.test(HEX[hEnd])) hEnd++;
    const setZoomSrc = HEX.slice(hStart, hEnd + 1).join('\n');

    const layer = () => ({ style: { transform: '', transformOrigin: '' } });
    const gridEl = layer(), piecesEl = layer();
    const hg = new Function(`return { currentZoom: 1, minZoom: 0.5, maxZoom: 1.5,
${setZoomSrc}
};`)();
    hg.containerEl = gridEl; hg.piecesEl = piecesEl;

    hg.setZoom(1.5);
    check(gridEl.style.transform === 'scale(1.5)', 'the hex art scales');
    check(piecesEl.style.transform === 'scale(1.5)',
        `the pieces overlay scales with it, got "${piecesEl.style.transform}"`);
    check(gridEl.style.transformOrigin === 'top left'
       && piecesEl.style.transformOrigin === 'top left',
        'both share one origin, or they would diverge further the more they grow');

    // setZoom can run before the board has rendered.
    hg.piecesEl = null;
    let threw = false;
    try { hg.setZoom(1.2); } catch (e) { threw = true; }
    check(!threw, 'a missing layer is tolerated rather than throwing');

    hg.piecesEl = piecesEl;
    hg.setZoom(99);
    check(hg.currentZoom === 1.5, 'setZoom still clamps to its own maxZoom');
}

// Zeus is positioned in board coordinates too, but as a LEAF a transform of its
// own cannot save it: scaling about its own corner makes it bigger without
// moving it to where its hex went. It has to be a CHILD of the scaled overlay.
{
    const markup = LINES.join('\n');
    check(/delphi-board-pieces">'\s*\+[\s\S]{0,200}?delphi-zeus-token/.test(markup),
        'the Zeus token is nested inside the pieces overlay, not beside it');
}

// ---- flights into the pieces overlay must divide out its scale -----------
// The overlay is scaled now, so a raw viewport delta used as a CSS offset gets
// multiplied by that scale again when drawn, landing the flight off target by
// exactly the zoom factor.
{
    const NATURAL = 900;
    var layer = null;
    var conv = new Function('document', `return {
${extractMethod('_toBoardPiecesPoint')}
};`)({ getElementById: () => layer });

    // Unscaled: a plain viewport delta, unchanged.
    layer = { offsetWidth: NATURAL,
        getBoundingClientRect: () => ({ left: 100, top: 50, width: NATURAL }) };
    var p = conv._toBoardPiecesPoint(400, 250);
    check(p.x === 300 && p.y === 200,
        `at scale 1 the offset is the plain delta, got ${p.x},${p.y}`);

    // Scaled 1.5x: rect is post-transform, offsetWidth is not.
    layer = { offsetWidth: NATURAL,
        getBoundingClientRect: () => ({ left: 100, top: 50, width: NATURAL * 1.5 }) };
    p = conv._toBoardPiecesPoint(400, 250);
    check(Math.abs(p.x - 200) < 0.001 && Math.abs(p.y - 400 / 3) < 0.001,
        `at scale 1.5 the offset is divided by the scale, got ${p.x},${p.y}`);
    // The point of the division: drawn back through the transform it lands on
    // the viewport point we asked for.
    check(Math.abs((100 + p.x * 1.5) - 400) < 0.001,
        'so the piece renders exactly at the requested viewport point');

    // Shrunk: the correction runs the other way too.
    layer = { offsetWidth: NATURAL,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: NATURAL * 0.6 }) };
    p = conv._toBoardPiecesPoint(300, 60);
    check(Math.abs(p.x - 500) < 0.001 && Math.abs(p.y - 100) < 0.001,
        `at scale 0.6 the offset grows, got ${p.x},${p.y}`);

    // Degenerate cases must not produce NaN coordinates, which would place the
    // piece nowhere at all.
    layer = { offsetWidth: 0, getBoundingClientRect: () => ({ left: 10, top: 10, width: 0 }) };
    p = conv._toBoardPiecesPoint(30, 40);
    check(p.x === 20 && p.y === 30, 'an unrendered layer falls back to scale 1');
    layer = null;
    p = conv._toBoardPiecesPoint(7, 9);
    check(p.x === 7 && p.y === 9, 'a missing layer returns the point untouched');
}

// Both flight endpoints must go through the conversion, or the piece takes off
// from the right place and lands in the wrong one.
{
    check(/_toBoardPiecesPoint/.test(extractMethod('_flyShrinePiece')),
        'the flight source goes through the conversion');
    const src = LINES.join('\n');
    check(!/zeusRect\.left - boardRect\.left/.test(src),
        'the flight destination no longer uses a raw viewport delta');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
