/**
 * Board overlays that must show over a hex's pieces are drawn in the pieces
 * layer: a picked island's checkmark, and the gold target disc a die puts on
 * an island.
 *
 * Board zoom scales #delphi-hex-grid and #delphi-board-pieces separately,
 * which makes each its own stacking context. The pieces layer comes second,
 * so it paints over everything in the grid, whatever the z-index. A check
 * drawn in the grid sat under the island's shrine tile (60x52 over a 50px
 * check) and vanished, though it was in the DOM. Reported with Island Scout,
 * then for the target disc on an island when a die is selected.
 *
 * Run: node tests/test_board_overlay_layer_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.css'), 'utf8');

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

function extract(name) {
    const s = SRC.indexOf('        ' + name + ': function');
    if (s < 0) throw new Error('method not found: ' + name);
    let i = SRC.indexOf('{', s), d = 0;
    for (; i < SRC.length; i++) {
        if (SRC[i] === '{') d++;
        else if (SRC[i] === '}') { d--; if (!d) break; }
    }
    return SRC.slice(s, i + 1);
}

const names = ['onHexClick', '_refreshPeekOverlays', '_showReachableOverlays',
    '_bindReachableMarkerActivation', '_clearReachableOverlays', '_highlightValidHexes'];
const G = new Function('return {' + names.map(extract).join(',\n') + '}')();

function El(tag, id) {
    return {
        tag, id, children: [], className: '', style: {}, dataset: {}, listeners: {}, parent: null,
        appendChild(c) { c.parent = this; this.children.push(c); return c; },
        remove() { if (this.parent) { this.parent.children = this.parent.children.filter(x => x !== this); this.parent = null; } },
        setAttribute() {},
        addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
        classList: { add() {}, remove() {} },
        set innerHTML(v) { this._html = v; },
    };
}
const grid = El('div', 'delphi-hex-grid');
const pieces = El('div', 'delphi-board-pieces');
global.document = {
    createElement: (t) => El(t),
    getElementById: (id) => ({ 'delphi-hex-grid': grid, 'delphi-board-pieces': pieces })[id] || null,
};
global.sessionStorage = { setItem() {}, getItem() { return null; } };

const g = Object.assign({}, G, {
    getHexCenterPixel: (q, r) => ({ x: q * 100, y: r * 100 }),
    boardHexes: [],
    _peekIslandSet: new Set(['1,2', '3,4']),
    _selectedPeekIslands: [],
    _peekMaxPeeks: 2,
});
const checks = (layer) => layer.children.filter(c => c.className === 'hex-check-overlay');

g._refreshPeekOverlays();
g.onHexClick(1, 2);
check(checks(pieces).length === 1, 'picking an island draws its check in the pieces layer');
check(checks(grid).length === 0, 'and not in the hex grid, where the shrine tile covers it');
check(grid.children.some(c => /hex-reachable-marker/.test(c.className)),
    'the unpicked island keeps its tap marker in the grid');

g.onHexClick(1, 2);
check(checks(pieces).length === 0, 'unpicking it removes the check again');

g.onHexClick(1, 2);
g.onHexClick(3, 4);
check(checks(pieces).length === 2, 'both picks show');

// ---- the target disc a die puts on an island ----------------------------------
{
    pieces.children = []; grid.children = [];
    let clicked = null;
    const h = Object.assign({}, G, {
        getHexCenterPixel: (q, r) => ({ x: q * 100, y: r * 100 }),
        addTooltipHtml() {},
    });
    h._highlightValidHexes([{ q: 2, r: 5 }], 'hex-action-target', (q, r) => { clicked = [q, r]; },
        { label: 'Build Shrine' });
    const discs = pieces.children.filter(c => /hex-action-target/.test(c.className));
    check(discs.length === 1, 'a target disc is drawn in the pieces layer, over the island');
    check(!grid.children.some(c => /hex-action-target/.test(c.className)), 'not under it in the grid');
    check(h._hexActionTargetOverlays.length === 1, 'and is still tracked for clearing');
    discs[0].listeners.click[0]({ stopPropagation() {} });
    check(clicked && clicked[0] === 2 && clicked[1] === 5, 'and still takes the click');
}

check(/#delphi-board-pieces\s*>\s*\.hex-check-overlay\s*\{[^}]*pointer-events:\s*none/.test(CSS),
    'the check never takes the tap that unpicks its island');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
