/**
 * INJURY_COLUMN experiment: the injuries leave the panel's first row and stand
 * as a column at the right of the first two rows, filling from the bottom up.
 *
 *   - the first two rows share a grid (.delphi-pp-top); the injury bar sits in
 *     a column spanning both, not inside the first row;
 *   - the cargo row is inserted into that grid;
 *   - the hand keeps its full 54px slot even with Pain Tolerance, since the
 *     extra cells grow down, not sideways;
 *   - the switch is one constant, applied as a body class before the panels
 *     are drawn; with it off the first row is unchanged.
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

function render(column) {
    let html = '', cargoInto = null;
    global.document = {
        body: { classList: { contains: (c) => column && c === 'delphi-injury-column' } },
        getElementById: (id) => id === 'pp-top-7' && column
            ? { insertAdjacentHTML: (_, h) => { cargoInto = 'top'; html += h; } } : null,
    };
    pp.getRoot = () => ({ insertAdjacentHTML: (_, h) => { if (cargoInto === null && /cargo-row/.test(h)) cargoInto = 'root'; html += h; } });
    const gd = { players: { 7: { player_color: 'dc3545' } }, panelState: { 7: {
        dice: [], oracleHand: [], favorTokens: 1, shieldValue: 0, storage: 2, cargo: [], equipment: [] } } };
    pp.renderActionsRow(7, gd);
    pp.renderCargoRow(7, gd, { _gameColorForPlayer: () => 'red' });
    return { html, cargoInto };
}

// ---- on -----------------------------------------------------------------------
let r = render(true);
const row = (r.html.match(/<div class="delphi-pp-actions-row"[^]*?<div class="delphi-pp-injury-col">/) || [''])[0];
check(/^<div class="delphi-pp-top" id="pp-top-7">/.test(r.html), 'the first two rows share a grid');
check(/<div class="delphi-pp-injury-col"><div class="delphi-pp-injury-bar" id="pp-injury-bar-7"><\/div><\/div>/.test(r.html),
    'the injury bar stands in its own column');
check(!/delphi-pp-injury-bar/.test(row), 'not inside the first row');
check((row.match(/delphi-pp-divider/g) || []).length === 1, 'the first row keeps one divider, between dice and hand');
check(r.cargoInto === 'top', 'the cargo row goes into the same grid');
pp._painTolerance = { 7: true };
check(pp._handWidthFor(7) === 54, 'the hand keeps its full slot with Pain Tolerance');

// ---- off ----------------------------------------------------------------------
r = render(false);
check(!/delphi-pp-top/.test(r.html) && /<div class="delphi-pp-actions-row"[^]*delphi-pp-injury-bar[^]*delphi-pp-stat-chips/.test(r.html),
    'with the switch off the first row is unchanged');
check(r.cargoInto === 'root', 'and the cargo row goes where it always did');
check(pp._handWidthFor(7) === 42, 'and Pain Tolerance still narrows the hand there');
pp._painTolerance = {};

// ---- switch and CSS -----------------------------------------------------------
check(/INJURY_COLUMN:\s*true/.test(GAME), 'the experiment is on, behind one constant');
const setupAt = GAME.indexOf("document.body.classList.toggle('delphi-injury-column', !!this.INJURY_COLUMN);");
check(setupAt > 0 && setupAt < GAME.indexOf('self.components.playerPanel.renderActionsRow(pid, gamedatas);'),
    'setup applies it as a body class before any panel is drawn');
const B = 'body.delphi-injury-column ';
check(CSS.includes(B + '.delphi-pp-top > .delphi-pp-injury-col {') && /grid-row:\s*1 \/ 3/.test(CSS),
    'the column spans both rows');
check(/body\.delphi-injury-column \.delphi-pp-injury-bar \{[^}]*flex-wrap:\s*wrap-reverse/.test(CSS),
    'it fills from the bottom up');
check(/body\.delphi-injury-column \.delphi-pp-injury-bar > \.delphi-pp-injury-cell \{ width: 12px; height: 16px;/.test(CSS)
    && /body\.delphi-injury-column \.delphi-pp-injury-bar\.pt-active > \.delphi-pp-injury-cell \{ width: 11px; height: 11px; \}/.test(CSS),
    'with bigger cells: 12x16 for six, 11x11 for eight');
check(/body\.delphi-injury-column \.delphi-pp-top \.delphi-pp-cargo-slots \{ gap: 2px; \}/.test(CSS),
    'and the cargo slots tighten so five fit');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
