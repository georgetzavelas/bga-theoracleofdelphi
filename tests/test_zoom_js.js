/**
 * User zoom: ONE multiplier layered on top of the automatic fit, applied to the
 * game board and the player board together.
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

const METHODS = ['_clampZoom', '_zoomStorageKey', '_loadZoom', '_saveZoom', 'setZoom',
    '_applyBoardZoom', '_updateGameScale',
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

const store = {};
const game = new Function('document', 'window', `return {
    ZOOM_MIN: 0.6, ZOOM_MAX: 1.6, ZOOM_STEP: 0.1, _zoom: null,
${METHODS.map(extractMethod).join('\n')}
};`)(
    { getElementById: (id) => game._els[id] || null },
    { localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
    } }
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
check(game._clampZoom(0.1) === 0.6, 'clamps below the floor');
check(game._clampZoom(9) === 1.6, 'clamps above the ceiling');
check(game._clampZoom('abc') === 1, 'non-numeric falls back to 1');
check(game._clampZoom(undefined) === 1, 'undefined falls back to 1');

// ---- persistence ----------------------------------------------------------
fresh(1400);
game.setZoom(1.3);
check(store['delphi.zoom.T7.P9'] === '{"zoom":1.3}', 'zoom is persisted');
check(game._zoomStorageKey().indexOf('T7') !== -1 && game._zoomStorageKey().indexOf('P9') !== -1,
    'storage key carries both table and player, so tables cannot collide');
game._zoom = null;
game._loadZoom();
check(game._zoom === 1.3, 'zoom is restored on reload');

store['delphi.zoom.T7.P9'] = 'garbage{';
game._zoom = null; game._loadZoom();
check(game._zoom === 1, 'corrupt storage falls back to 1');

store['delphi.zoom.T7.P9'] = '{"zoom":50}';
game._zoom = null; game._loadZoom();
check(game._zoom === 1.6, 'out-of-range stored values are clamped, not trusted');

// The short-lived two-slider shape must carry across rather than resetting.
store['delphi.zoom.T7.P9'] = '{"board":1.2,"player":1.4}';
game._zoom = null; game._loadZoom();
check(game._zoom === 1.4, 'a legacy two-value entry migrates to the larger of the two');

// ---- the multiplier composes with auto-fit, rather than replacing it ------
fresh(1400);
const wideFit = appliedScale(game._els['delphi-current-player-area']);
check(isNaN(wideFit), 'a window that fits needs no scale at all');

game.setZoom(1.3);
check(Math.abs(appliedScale(game._els['delphi-current-player-area']) - 1.3) < 0.001,
    'with room to spare the applied scale is just the multiplier');

// Narrow the window: auto-fit must reassert itself UNDER the multiplier.
game._els['delphi-game-container'].parentElement.clientWidth = 1000;
game._updateGameScale();
const narrow = appliedScale(game._els['delphi-current-player-area']);
const expected = Math.min(1, (1000 - 40) / 1136) * 1.3;
check(Math.abs(narrow - expected) < 0.005,
    `narrow window composes fit x zoom, expected ${expected.toFixed(3)} got ${narrow}`);
check(game._zoom === 1.3, 'the multiplier itself is untouched by a relayout');

// THE regression guard: re-running the layout must not discard the zoom.
game._updateGameScale();
game._updateGameScale();
check(Math.abs(appliedScale(game._els['delphi-current-player-area']) - narrow) < 0.001,
    'repeated relayouts keep the zoom applied (no second writer)');

// ---- scaling ABOVE 1 must actually be applied ----------------------------
fresh(1400);
game.setZoom(1.5);
const el = game._els['delphi-current-player-area'];
check(el.hasAttribute('data-js-scaled'), 'an enlarging scale is applied, not discarded');
check(Math.abs(appliedMargin(el) - (1.5 - 1) * 790) < 0.5,
    'the compensation margin tracks the enlarging scale');

// Shrinking still compensates in the other direction.
game.setZoom(0.8);
check(appliedMargin(el) < 0, 'a shrinking scale compensates with a negative margin');

// ---- supply strip stays in step with the player area ---------------------
fresh(1400);
game.setZoom(1.2);
check(Math.abs(appliedScale(game._els['delphi-supply-strip'])
             - appliedScale(game._els['delphi-current-player-area'])) < 0.001,
    'supply strip tracks the player area so the two never disagree');

// ---- one control moves BOTH regions --------------------------------------
fresh(1400);
game.setZoom(1.4);
check(game.hexGrid.currentZoom === 1.4, 'stacked: the board follows the single zoom');
check(Math.abs(appliedScale(game._els['delphi-current-player-area']) - 1.4) < 0.001,
    'stacked: the player board follows the same zoom');

// Beside: one composition scale covers both columns, and the grid's own zoom
// is released or it would apply a second time on top of it.
game._besideLayout = true;
game._updateGameScale();
const besideScaled = parseFloat(
    game._els['delphi-game-container'].style._p['--beside-scale']);
check(game.hexGrid.currentZoom === 1, 'beside: the grid zoom is released');
check(besideScaled > 0, 'beside: a composition scale is applied');

// The trap this design has to avoid: if the zoom were folded INTO the fit
// division, the fit would cancel it exactly and the slider would do nothing in
// this layout. Compare a constrained window at 1.0 against 1.4.
game._els['delphi-game-container'].parentElement.clientWidth = 1200;
game.setZoom(1);
game._updateGameScale();
const at100 = parseFloat(game._els['delphi-game-container'].style._p['--beside-scale']);
game.setZoom(1.4);
const at140 = parseFloat(game._els['delphi-game-container'].style._p['--beside-scale']);
check(at140 > at100 * 1.35,
    `beside zoom must actually enlarge, 100% gave ${at100} and 140% gave ${at140}`);

game._besideLayout = false;
game._els['delphi-game-container'].parentElement.clientWidth = 1400;
game._updateGameScale();
check(game.hexGrid.currentZoom === 1.4, 'returning to stacked restores the grid zoom');

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
};`)(doc);
    wiring._zoom = 1;

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
