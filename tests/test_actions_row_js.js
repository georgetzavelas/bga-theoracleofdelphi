/**
 * Dice, oracle hand, injuries, favor and shield share one panel row.
 *
 * The injuries had a row of their own, with the shield pill on it; the dice
 * row carried the favor pill. Merged, the row has to fit 220px, so:
 *
 *   - favor and shield are upright chips (icon over number) side by side,
 *     keeping the ids and the .pp-stat-value that updateFavor/updateShield
 *     write to;
 *   - a hand of three or more cards overlaps into a stack of at most four
 *     slivers with the true count on a corner badge (measured: beside an
 *     eight-cell grid the hand gets about 40px);
 *   - injuries are a 3x2 grid, 4x2 with Pain Tolerance (up to eight), with
 *     no text total: the frame warns one short of the limit and at it, and
 *     the count is in the title;
 *   - renderInjuryRow no longer draws a row; it fills the grid.
 *
 * Run: node tests/test_actions_row_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'modules/js/Components.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.css'), 'utf8');

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

function extract(name) {
    const s = SRC.indexOf('            ' + name + ': function');
    if (s < 0) throw new Error('method not found: ' + name);
    let i = SRC.indexOf('{', s), d = 0;
    for (; i < SRC.length; i++) {
        if (SRC[i] === '{') d++;
        else if (SRC[i] === '}') { d--; if (!d) break; }
    }
    return SRC.slice(s, i + 1);
}
const names = ['_renderStatChip', 'renderActionsRow', '_diceMarkup', '_handMarkup',
    'renderInjuryRow', 'updateInjuries', '_playerColorName', '_updateStatValue'];
const panel = new Function('_t', 'return { HAND_SPREAD: 2, HAND_STACK_MAX: 4, '
    + '_escape: function(s) { return String(s); }, '
    + names.map(extract).join(',\n') + ' };')((s) => s);

// Stand-in DOM: the row is parsed just enough to find the injury bar.
const els = {};
function bar(id) {
    return els[id] = els[id] || {
        id, innerHTML: '', title: '', attrs: {}, classes: new Set(),
        classList: { toggle(c, on) { on ? els[id].classes.add(c) : els[id].classes.delete(c); } },
        setAttribute(k, v) { this.attrs[k] = v; },
    };
}
let rowHtml = '';
const root = { insertAdjacentHTML(_, html) { rowHtml += html; } };
panel.getRoot = () => root;
global.document = { getElementById: (id) => (id.indexOf('pp-injury-bar-') === 0 ? bar(id) : null) };

const gd = {
    players: { 7: { player_color: '007bff' } },
    panelState: { 7: {
        dice: [{ color: 'red', spent: 0 }], oracleHand: [{ id: 1, color: 'green' }],
        favorTokens: 12, shieldValue: 2, equipment: [],
        injuries: [{ color: 'red', n: 2 }, { color: 'blue', n: 1 }],
    } },
};

// ---- one row -----------------------------------------------------------------
panel.renderActionsRow(7, gd);
const order = ['delphi-pp-dice', 'delphi-pp-oracle-hand', 'delphi-pp-injury-bar', 'delphi-pp-stat-chips']
    .map(c => rowHtml.indexOf('class="' + c));
check(order.every(i => i > 0) && order.every((v, i) => !i || v > order[i - 1]),
    'one row holds dice, hand, injuries, then the chips, in that order');
check(/id="pp-favor-7" class="delphi-pp-stat-chip delphi-pp-stat-favor"[^>]*>\s*<span class="pp-stat-icon"><\/span><span class="pp-stat-value">12<\/span>/.test(rowHtml),
    'favor is an upright chip, icon then number, with the id updateFavor finds');
check(/id="pp-shield-7" class="delphi-pp-stat-chip delphi-pp-stat-shield" data-color="blue"/.test(rowHtml),
    'shield is one too, in the player\'s colour');
check(!/delphi-pp-stat-pill/.test(SRC) && !/delphi-pp-stat-pill/.test(CSS), 'the horizontal pill is gone');

// ---- injuries ----------------------------------------------------------------
panel.renderInjuryRow(7, gd);
check(!/delphi-pp-injury-row/.test(rowHtml) && !/delphi-pp-injury-row/.test(SRC),
    'there is no injury row any more');
let b = bar('pp-injury-bar-7');
check((b.innerHTML.match(/delphi-pp-injury-cell/g) || []).length === 6, 'six cells without Pain Tolerance');
check(b.title === 'Injuries: 3/6' && b.attrs['aria-label'] === 'Injuries: 3/6', 'the count is in the title');
check(!b.classes.has('warn') && !b.classes.has('danger'), 'three of six: no warning');
check((b.innerHTML.match(/warn-2/g) || []).length === 2, 'two reds ring their cells amber');

panel.updateInjuries(7, [{ color: 'red', n: 2 }, { color: 'blue', n: 2 }, { color: 'pink', n: 1 }], {});
check(b.classes.has('warn') && !b.classes.has('danger'), 'five of six: the frame warns');
panel.updateInjuries(7, [{ color: 'red', n: 3 }, { color: 'blue', n: 3 }], {});
check(b.classes.has('danger') && !b.classes.has('warn'), 'six of six: the frame is at the limit');

panel.updateInjuries(7, [{ color: 'red', n: 2 }, { color: 'black', n: 5 }], { painTolerance: true });
check((b.innerHTML.match(/delphi-pp-injury-cell/g) || []).length === 8, 'eight cells with Pain Tolerance');
check(b.classes.has('pt-active') && b.title === 'Injuries: 7/8', 'gold frame, and the count out of eight');
check(b.classes.has('warn'), 'seven of eight warns');

check(/\.delphi-pp-injury-bar\s*\{[^}]*grid-template-columns:\s*repeat\(3,/.test(CSS), 'the grid is three wide');
check(/\.delphi-pp-injury-bar\.pt-active\s*\{[^}]*grid-template-columns:\s*repeat\(4,/.test(CSS),
    'four wide with Pain Tolerance, so eight fit on two lines');
check(/\.delphi-pp-injury-bar\.warn\s*\{[^}]*border-color/.test(CSS)
    && /\.delphi-pp-injury-bar\.danger\s*\{[^}]*border-color/.test(CSS), 'the frame carries the warning');
check(!/group-start\s*\{/.test(CSS), 'run outlines that would break across the two lines are gone');

// ---- the hand ----------------------------------------------------------------
const hand = (n) => Array.from({ length: n }, (_, i) => ({ id: i, color: ['red', 'blue', 'green'][i % 3] }));
let h = panel._handMarkup(hand(2));
check(!/delphi-pp-oracle-stack/.test(h) && (h.match(/delphi-pp-oracle-card/g) || []).length === 2,
    'two cards sit side by side');
h = panel._handMarkup(hand(3));
check(/delphi-pp-oracle-stack/.test(h) && /delphi-pp-oracle-count">3</.test(h), 'three cards stack, with the count');
h = panel._handMarkup(hand(9));
check((h.match(/delphi-pp-oracle-card/g) || []).length === 4 && /delphi-pp-oracle-count">9</.test(h),
    'a big hand shows four slivers and the true count');
check(/<div class="delphi-pp-oracle-stack">[^]*<span class="delphi-pp-oracle-count">9<\/span><\/div>$/.test(h),
    'the count is a badge on the stack, costing no width');
check(/\.delphi-pp-oracle-stack\s*>\s*\.delphi-pp-oracle-card\s*\+\s*\.delphi-pp-oracle-card\s*\{[^}]*margin-left:\s*-/.test(CSS),
    'the stacked cards overlap');
['red', 'yellow', 'green', 'blue', 'pink', 'black'].forEach(function(c) {
    check(new RegExp('\\.delphi-pp-oracle-stack > \\.delphi-pp-oracle-card\\[data-color="' + c + '"\\]\\s*\\{[^}]*border-color').test(CSS),
        'a stacked ' + c + ' card shows its colour on its sliver');
});

// ---- chips -------------------------------------------------------------------
check(/\.delphi-pp-stat-chip\s*\{[^}]*flex-direction:\s*column/.test(CSS), 'the chips stand upright');
check(/\.delphi-pp-stat-chip \.pp-stat-icon\s*\{[^}]*width:\s*14px;\s*height:\s*14px/.test(CSS), 'with a 14px icon');
check(/\.delphi-pp-stat-chip\s*\{[^}]*font-size:\s*12px/.test(CSS), 'and a 12px number');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
