/**
 * User zoom: two multipliers layered on top of the automatic fit.
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

const METHODS = ['_clampZoom', '_zoomStorageKey', '_loadZoom', '_saveZoom', 'setZoomLevel',
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
game.setZoomLevel('player', 1.3);
check(store['delphi.zoom.T7.P9'] === '{"board":1,"player":1.3}', 'zoom is persisted');
check(game._zoomStorageKey().indexOf('T7') !== -1 && game._zoomStorageKey().indexOf('P9') !== -1,
    'storage key carries both table and player, so tables cannot collide');
game._zoom = null;
game._loadZoom();
check(game._zoom.player === 1.3, 'zoom is restored on reload');

store['delphi.zoom.T7.P9'] = 'garbage{';
game._zoom = null; game._loadZoom();
check(game._zoom.player === 1 && game._zoom.board === 1, 'corrupt storage falls back to 1');

store['delphi.zoom.T7.P9'] = '{"board":50,"player":-3}';
game._zoom = null; game._loadZoom();
check(game._zoom.board === 1.6 && game._zoom.player === 0.6,
    'out-of-range stored values are clamped, not trusted');

// ---- the multiplier composes with auto-fit, rather than replacing it ------
fresh(1400);
const wideFit = appliedScale(game._els['delphi-current-player-area']);
check(isNaN(wideFit), 'a window that fits needs no scale at all');

game.setZoomLevel('player', 1.3);
check(Math.abs(appliedScale(game._els['delphi-current-player-area']) - 1.3) < 0.001,
    'with room to spare the applied scale is just the multiplier');

// Narrow the window: auto-fit must reassert itself UNDER the multiplier.
game._els['delphi-game-container'].parentElement.clientWidth = 1000;
game._updateGameScale();
const narrow = appliedScale(game._els['delphi-current-player-area']);
const expected = Math.min(1, (1000 - 40) / 1136) * 1.3;
check(Math.abs(narrow - expected) < 0.005,
    `narrow window composes fit x zoom, expected ${expected.toFixed(3)} got ${narrow}`);
check(game._zoom.player === 1.3, 'the multiplier itself is untouched by a relayout');

// THE regression guard: re-running the layout must not discard the zoom.
game._updateGameScale();
game._updateGameScale();
check(Math.abs(appliedScale(game._els['delphi-current-player-area']) - narrow) < 0.001,
    'repeated relayouts keep the zoom applied (no second writer)');

// ---- scaling ABOVE 1 must actually be applied ----------------------------
fresh(1400);
game.setZoomLevel('player', 1.5);
const el = game._els['delphi-current-player-area'];
check(el.hasAttribute('data-js-scaled'), 'an enlarging scale is applied, not discarded');
check(Math.abs(appliedMargin(el) - (1.5 - 1) * 790) < 0.5,
    'the compensation margin tracks the enlarging scale');

// Shrinking still compensates in the other direction.
game.setZoomLevel('player', 0.8);
check(appliedMargin(el) < 0, 'a shrinking scale compensates with a negative margin');

// ---- supply strip stays in step with the player area ---------------------
fresh(1400);
game.setZoomLevel('player', 1.2);
check(Math.abs(appliedScale(game._els['delphi-supply-strip'])
             - appliedScale(game._els['delphi-current-player-area'])) < 0.001,
    'supply strip tracks the player area so the two never disagree');

// ---- board zoom is independent of the player area ------------------------
fresh(1400);
game.setZoomLevel('board', 1.4);
check(game.hexGrid.currentZoom === 1.4, 'stacked board zoom drives the hex grid');
check(isNaN(appliedScale(game._els['delphi-current-player-area'])),
    'board zoom leaves the player area alone');

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
check(game.hexGrid.currentZoom === 1.4, 'and restores the grid zoom');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
