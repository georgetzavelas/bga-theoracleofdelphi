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
    '_alignZoomButton', '_besideActive', '_syncZoomAvailability', '_applyBoardLayout'];

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
function zoomHidden() { return game._els['delphi-zoom-ui'].hidden === true; }
function colZoom(el) { return parseFloat(el.style._p['--col-zoom']); }
function besideScale() {
    return parseFloat(game._els['delphi-game-container'].style._p['--beside-scale']);
}
function storedZoom() { return JSON.parse(store['delphi.zoom.T7.P9'] || '{}'); }

function fresh(width) {
    for (const k of Object.keys(store)) delete store[k];
    game._els = makeWorld(width);
    game._zoom = null;
    game._besideLayout = false;
    game.hexGrid.currentZoom = 1;
    game._loadZoom();
    game._updateGameScale();
}

// The zoom only exists side by side, so anything that zooms has to start there.
// The preference alone is not enough: the window must also be wide enough to
// clear the readability floor.
function freshBeside(width) {
    for (const k of Object.keys(store)) delete store[k];
    game._els = makeWorld(width);
    game._zoom = null;
    game._besideLayout = true;
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
freshBeside(1400);
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

// ---- the multipliers compose with the beside fit, not replace it ---------
freshBeside(1700);
check(isBeside(), 'setup: 1700px is wide enough for side by side');
const neutralComposition = besideScale();

game.setZoomBalance(100);   // hard right: player board as large as it goes
const pz = game._zoom.player;
check(Math.abs(colZoom(game._els['delphi-current-player-area']) - pz) < 0.001,
    `the player column carries the multiplier in full, got ${colZoom(game._els['delphi-current-player-area'])}`);
// The fit base absorbs the total, which is what keeps the composition fitting
// while the two columns trade width against each other.
const compW = 900 * game._zoom.board + 20 + 1136 * pz;
check(Math.abs(besideScale() - Math.min(1, (1700 - 40) / compW)) < 0.005,
    `the fit base absorbs both multipliers, expected `
    + `${Math.min(1, (1700 - 40) / compW).toFixed(3)} got ${besideScale()}`);
check(besideScale() !== neutralComposition, 'and that is a real change from neutral');
check(game._zoom.player === pz, 'the multiplier itself is untouched by a relayout');

// THE regression guard: re-running the layout must not discard the zoom.
const appliedCol = colZoom(game._els['delphi-current-player-area']);
game._updateGameScale();
game._updateGameScale();
check(Math.abs(colZoom(game._els['delphi-current-player-area']) - appliedCol) < 0.001,
    'repeated relayouts keep the zoom applied (no second writer)');

// ---- an enlarging scale must be applied, not discarded --------------------
// _applyElementScale once read `if (scale < 0.99)`, silently dropping anything
// above 1. Exercised directly, because the stacked path it serves only shrinks.
{
    fresh(1400);
    const target = game._els['delphi-current-player-area'];
    game._applyElementScale(target, 1.3, 790);
    check(target.hasAttribute('data-js-scaled'), 'an enlarging scale is applied');
    check(Math.abs(appliedScale(target) - 1.3) < 0.001, 'at the value asked for');
    check(Math.abs(appliedMargin(target) - 0.3 * 790) < 0.5,
        'with a compensation margin sized to its own growth');
    game._applyElementScale(target, 0.8, 790);
    check(appliedMargin(target) < 0, 'shrinking compensates in the other direction');
    game._applyElementScale(target, 1, 790);
    check(!target.hasAttribute('data-js-scaled'), 'and a neutral scale is cleared entirely');
}

// ---- the component strip is NOT zoomed -----------------------------------
// It is a fixed shelf of decks and supply cards, not part of the player's
// board, so the slider must leave it alone.
freshBeside(1700);
game.setZoomBalance(100);          // player board as large as it goes
check(isNaN(colZoom(game._els['delphi-supply-strip'])),
    'the strip takes no zoom favouring the player board');
check(!isNaN(colZoom(game._els['delphi-current-player-area'])),
    'while the player column does, so this is not vacuous');
game.setZoomBalance(0);            // and the other direction
check(isNaN(colZoom(game._els['delphi-supply-strip'])),
    'the strip is unmoved favouring the game board too');

// It must still follow the automatic fit, just not the user's zoom.
fresh(900);
const fitOnly = Math.max(0.35, Math.min(1, (900 - 40) / 1136));
check(Math.abs(appliedScale(game._els['delphi-supply-strip']) - fitOnly) < 0.005,
    `the strip still auto-fits, expected ${fitOnly.toFixed(3)} got `
    + appliedScale(game._els['delphi-supply-strip']));

// ---- the board multiplier goes to the column, never the grid -------------
freshBeside(1700);
game.setZoomBalance(0);     // hard left: game board as large as it goes
check(game._zoom.board > 1 && game._zoom.player < 1,
    'left favours the board and shrinks the player board');
// The grid's own zoom must stay released, or it double-applies on top of the
// column scale and spills the board over the player column.
check(game.hexGrid.currentZoom === 1, 'beside mode releases the grid zoom');
check(game._els['delphi-board-wrapper'].hasAttribute('data-col-zoomed'),
    'beside mode scales the board column instead');

// ---- the balance mapping -------------------------------------------------
freshBeside(1400);
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
// Feeding zoom into the readability floor moved the layout out from under the
// player. Deciding on the NATURAL widths removes the possibility in both
// directions, and matters more now: the decision cannot depend on a zoom that
// the decision itself is about to erase.
{
    // 1700px: comfortably side by side. A zoom must not eject the player.
    freshBeside(1700);
    check(isBeside(), 'a roomy window uses beside at neutral');
    game.setZoomBalance(0);
    check(isBeside(), 'zooming the board must not eject a beside table to stacked');
    check(game._zoom.board > 1, 'and the zoom really was applied, so this is not vacuous');
    game.setZoomBalance(100);
    check(isBeside(), 'nor does zooming the player board');

    // 1000px: too narrow to read side by side, so stacked even though the
    // preference asks for beside.
    freshBeside(1000);
    check(!isBeside(), 'a window too narrow for beside stays stacked');
}

// ---- the zoom is a side-by-side-only control ------------------------------
// Stacked, the two regions sit in separate rows and share no width, so a
// balance between them has nothing left to trade. The control is hidden and any
// zoom is returned to neutral rather than left stuck on with no way to undo it.
{
    freshBeside(1700);
    game.setZoomBalance(0);
    check(!zoomHidden(), 'the control is offered while side by side');
    check(game._zoom.board !== 1 && storedZoom().board !== 1, 'setup: zoomed and persisted');

    game._els['delphi-game-container'].parentElement.clientWidth = 1000;
    game._updateGameScale();
    check(!isBeside(), 'narrowing the window drops to the stacked layout');
    check(zoomHidden(), 'which hides the zoom control');
    check(game._zoom.board === 1 && game._zoom.player === 1,
        `and resets the zoom to neutral, got ${JSON.stringify(game._zoom)}`);
    check(game.hexGrid.currentZoom === 1, 'the board returns to its natural size');
    check(!game._els['delphi-current-player-area'].hasAttribute('data-col-zoomed'),
        'and no column zoom is left behind');
    check(storedZoom().board === 1 && storedZoom().player === 1,
        'the reset is persisted, so storage matches what is on screen');
    game._zoom = null;
    game._loadZoom();
    check(game._zoom.board === 1, 'so a reload cannot resurrect the old zoom');

    // Widening again offers the control, still at neutral: reset, not suspended.
    game._els['delphi-game-container'].parentElement.clientWidth = 1700;
    game._updateGameScale();
    check(isBeside() && !zoomHidden(), 'widening offers the control again');
    check(game._zoom.board === 1, 'at neutral, because the zoom was reset not suspended');
}

// The preference does the same at any width.
{
    freshBeside(1700);
    game.setZoomBalance(100);
    check(!zoomHidden() && game._zoom.player !== 1, 'setup: zoomed and offered');
    game._applyBoardLayout(1);          // "below the game board"
    check(!isBeside(), 'the preference stacks the layout');
    check(zoomHidden(), 'which hides the zoom even on a roomy window');
    check(game._zoom.player === 1, 'and resets it');
    game._applyBoardLayout(2);          // back to "beside the board"
    check(isBeside() && !zoomHidden(), 'and choosing beside again offers it');
}

// Every entry point must refuse while stacked, not just the hidden slider: the
// wheel and keyboard handlers are bound to the region and the document, so they
// would otherwise still drive a control the player cannot see.
{
    fresh(1400);
    check(!isBeside() && zoomHidden(), 'setup: stacked, control hidden');

    // Watch the grid rather than only the end state. The stacked relayout resets
    // the zoom anyway, so without the guard the board is zoomed and then snapped
    // back within the same call: identical end state, visible flicker. The spy
    // is what makes the difference observable.
    const zooms = [];
    const realSetZoom = game.hexGrid.setZoom;
    game.hexGrid.setZoom = function(z) { zooms.push(z); return realSetZoom.call(this, z); };
    game.setZoomBalance(0);
    game.hexGrid.setZoom = realSetZoom;

    check(game._zoom.board === 1 && game._zoom.player === 1,
        'setZoomBalance is a no-op while stacked, whatever calls it');
    check(zooms.every(function(z) { return z === 1; }),
        `the board is never even transiently zoomed, saw ${JSON.stringify(zooms)}`);
    check(game.hexGrid.currentZoom === 1, 'and it ends at its natural size');
    const ps = appliedScale(game._els['delphi-current-player-area']);
    check(isNaN(ps) || ps <= 1, 'the player area only ever shrinks to fit');
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
