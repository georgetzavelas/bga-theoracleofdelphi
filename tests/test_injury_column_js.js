/**
 * The injuries stand as a column at the right of the panel's first two rows,
 * filling from the bottom up. Kept permanently after the INJURY_COLUMN
 * experiment; the row layout it replaced is gone.
 *
 *   - the first two rows share a grid (.delphi-pp-top); the injury bar sits in
 *     a column spanning both, not inside the first row;
 *   - the cargo row is inserted into that grid;
 *   - the hand keeps its full 54px slot even with Pain Tolerance, since the
 *     extra cells grow down, not sideways;
 *   - no switch or row layout is left behind.
 *
 * Widths and heights were measured in a render of the real CSS: the five-slot
 * cargo row ends at 196px, clear of the column at 200.
 *
 * Run: node tests/test_injury_column_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const COMP = fs.readFileSync(path.join(ROOT, 'modules/js/Components.js'), 'utf8');
const GAME = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.css'), 'utf8');

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

const start = COMP.indexOf('        playerPanel: {');
let i = COMP.indexOf('{', start), d = 0;
for (; i < COMP.length; i++) { if (COMP[i] === '{') d++; else if (COMP[i] === '}') { d--; if (!d) break; } }
const pp = new Function('_t', 'themeImg', 'return ' + COMP.slice(COMP.indexOf('{', start), i + 1))((s) => s, (p) => p);
pp._syncPanelTooltip = () => {}; pp._syncStatTooltip = () => {}; pp.updateShipTile = () => {};

function render() {
    let html = '', cargoInto = null;
    global.document = {
        getElementById: (id) => id === 'pp-top-7'
            ? { insertAdjacentHTML: (_, h) => { cargoInto = 'top'; html += h; } } : null,
    };
    pp.getRoot = () => ({ insertAdjacentHTML: (_, h) => { if (cargoInto === null && /cargo-row/.test(h)) cargoInto = 'root'; html += h; } });
    const gd = { players: { 7: { player_color: 'dc3545' } }, panelState: { 7: {
        dice: [], oracleHand: [], favorTokens: 1, shieldValue: 0, storage: 2, cargo: [], equipment: [] } } };
    pp.renderActionsRow(7, gd);
    pp.renderCargoRow(7, gd, { _gameColorForPlayer: () => 'red' });
    return { html, cargoInto };
}

const r = render();
const row = (r.html.match(/<div class="delphi-pp-actions-row"[^]*?<div class="delphi-pp-injury-col">/) || [''])[0];
check(/^<div class="delphi-pp-top" id="pp-top-7">/.test(r.html), 'the first two rows share a grid');
check(/<div class="delphi-pp-injury-col"><div class="delphi-pp-injury-bar" id="pp-injury-bar-7"><\/div><\/div>/.test(r.html),
    'the injury bar stands in its own column');
check(!/delphi-pp-injury-bar/.test(row), 'not inside the first row');
check((row.match(/delphi-pp-divider/g) || []).length === 1, 'the first row keeps one divider, between dice and hand');
check(r.cargoInto === 'top', 'the cargo row goes into the same grid');
check(pp.HAND_WIDTH === 54 && pp._handWidthFor === undefined && pp.HAND_WIDTH_PT === undefined,
    'one 54px hand slot, with no Pain Tolerance variant');

check(!/INJURY_COLUMN/.test(GAME) && !/delphi-injury-column/.test(GAME + COMP + CSS),
    'the experiment switch and its body class are gone');
check(/\.delphi-pp-top > \.delphi-pp-injury-col \{/.test(CSS) && /grid-row:\s*1 \/ 3/.test(CSS),
    'the column spans both rows');
check(/\.delphi-pp-injury-bar \{[^}]*flex-wrap:\s*wrap-reverse/.test(CSS), 'it fills from the bottom up');
check(/\.delphi-pp-injury-bar > \.delphi-pp-injury-cell \{ width: 12px; height: 17px;/.test(CSS)
    && /\.delphi-pp-injury-bar\.pt-active > \.delphi-pp-injury-cell \{ width: 11px; height: 12px; \}/.test(CSS),
    'with 12x17 cells for six, 11x12 for eight');
check(/\.delphi-pp-injury-bar \{[^}]*height:\s*60px/.test(CSS), 'and the meter runs the full height of both rows\' content (60px)');
check(/\.delphi-pp-top \.delphi-pp-cargo-slots \{ gap: 2px; \}/.test(CSS), 'and the cargo slots tighten so five fit');
check(!/repeat\(3, 9px\)|repeat\(4, 9px\)|body:not\(/.test(CSS), 'no row-layout grid rules remain');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
