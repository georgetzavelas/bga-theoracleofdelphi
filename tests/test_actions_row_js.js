/**
 * Dice, oracle hand, injuries, favor and shield share one panel row.
 *
 * The injuries had a row of their own, with the shield pill on it; the dice
 * row carried the favor pill. Merged, the row has to fit 220px, so:
 *
 *   - favor and shield are upright chips (icon over number) side by side,
 *     keeping the ids and the .pp-stat-value that updateFavor/updateShield
 *     write to;
 *   - the hand has a fixed slot (54px, 42px with Pain Tolerance) so nothing
 *     in the row moves: cards sit side by side while they fit, then overlap
 *     evenly across the slot with the count on a corner badge;
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
const names = ['_renderStatChip', 'renderActionsRow', '_diceMarkup', '_handMarkup', '_handWidthFor',
    'updateOracleHand', 'renderInjuryRow', 'updateInjuries', '_playerColorName', '_updateStatValue',
    '_syncPanelTooltip', '_syncStatTooltip'];
const constant = (k) => +(SRC.match(new RegExp(k + ':\\s*(\\d+)')) || [])[1];
const panel = new Function('_t', 'return { HAND_WIDTH: ' + constant('HAND_WIDTH') + ', HAND_WIDTH_PT: '
    + constant('HAND_WIDTH_PT') + ', HAND_CARD_W: ' + constant('HAND_CARD_W') + ', HAND_GAP: '
    + constant('HAND_GAP') + ', HAND_MIN_STEP: ' + constant('HAND_MIN_STEP') + ', '
    + '_escape: function(s) { return String(s); }, '
    + names.map(extract).join(',\n') + ' };')((s) => s);

// Stand-in DOM: the row is parsed just enough to find the injury bar.
const els = {};
function bar(id) {
    return els[id] = els[id] || {
        id, innerHTML: '', title: '', attrs: {}, classes: new Set(), dataset: {}, offsetWidth: 0,
        listeners: [],
        classList: {
            toggle(c, on) { on ? els[id].classes.add(c) : els[id].classes.delete(c); },
            add(c) { els[id].classes.add(c); },
            remove(c) { els[id].classes.delete(c); },
        },
        setAttribute(k, v) { this.attrs[k] = v; },
        addEventListener(t, f) { this.listeners.push(f); },
        removeEventListener(t, f) { this.listeners = this.listeners.filter(x => x !== f); },
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
check(rowHtml.indexOf('id="pp-shield-7"') < rowHtml.indexOf('id="pp-favor-7"'), 'shield comes before favor');
check(!/delphi-pp-stat-pill/.test(SRC) && !/delphi-pp-stat-pill/.test(CSS), 'the horizontal pill is gone');

// ---- injuries ----------------------------------------------------------------
panel.renderInjuryRow(7, gd);
check(!/delphi-pp-injury-row/.test(rowHtml) && !/delphi-pp-injury-row/.test(SRC),
    'there is no injury row any more');
let b = bar('pp-injury-bar-7');
check((b.innerHTML.match(/delphi-pp-injury-cell/g) || []).length === 6, 'six cells without Pain Tolerance');
check(b.attrs['aria-label'] === 'Injuries: 3/6', 'the count is in the aria-label');
check(b.title === '', 'no title attribute, which would show beside the BGA tooltip');
check(!b.classes.has('warn') && !b.classes.has('danger'), 'three of six: no warning');
check((b.innerHTML.match(/warn-2/g) || []).length === 2, 'two reds ring their cells amber');

panel.updateInjuries(7, [{ color: 'red', n: 2 }, { color: 'blue', n: 2 }, { color: 'pink', n: 1 }], {});
check(b.classes.has('warn') && !b.classes.has('danger'), 'five of six: the frame warns');
panel.updateInjuries(7, [{ color: 'red', n: 3 }, { color: 'blue', n: 3 }], {});
check(b.classes.has('danger') && !b.classes.has('warn'), 'six of six: the frame is at the limit');

panel.updateInjuries(7, [{ color: 'red', n: 2 }, { color: 'black', n: 5 }], { painTolerance: true });
check((b.innerHTML.match(/delphi-pp-injury-cell/g) || []).length === 8, 'eight cells with Pain Tolerance');
check(b.classes.has('pt-active') && b.attrs['aria-label'] === 'Injuries: 7/8', 'gold frame, and the count out of eight');
check(b.classes.has('warn'), 'seven of eight warns');

// ---- one short of the limit ---------------------------------------------------
{
    const fresh = bar('pp-injury-bar-8');
    panel.updateInjuries(8, [{ color: 'red', n: 5 }], {});
    check(!fresh.classes.has('pp-injury-alarm'), 'a first paint at 5/6 (a load) does not shake');
    check((fresh.innerHTML.match(/last-slot/g) || []).length === 1, 'the one slot left is marked');
    panel.updateInjuries(8, [{ color: 'red', n: 4 }], {});
    check(!/last-slot/.test(fresh.innerHTML), 'two left: no slot is marked');
    panel.updateInjuries(8, [{ color: 'red', n: 5 }], {});
    check(fresh.classes.has('pp-injury-alarm'), 'reaching 5/6 live shakes the grid once');
    fresh.listeners.slice().forEach(f => f({ target: fresh }));
    check(!fresh.classes.has('pp-injury-alarm') && fresh.listeners.length === 0,
        'and the shake clears itself when it ends');
    panel.updateInjuries(8, [{ color: 'red', n: 4 }], {});
    check(!fresh.classes.has('pp-injury-alarm'), 'dropping back (an undo) does not shake');
    panel.updateInjuries(8, [{ color: 'red', n: 6 }], {});
    check(fresh.classes.has('pp-injury-alarm'), 'reaching the limit live shakes it too');
    fresh.listeners.slice().forEach(f => f({ target: fresh }));
    panel.updateInjuries(8, [{ color: 'red', n: 6 }, { color: 'blue', n: 1 }], { painTolerance: true });
    check((fresh.innerHTML.match(/last-slot/g) || []).length === 1 && fresh.classes.has('warn'),
        'with Pain Tolerance, 7/8 marks the last slot');
}
check(/\.delphi-pp-injury-bar\.warn \.delphi-pp-injury-cell\.last-slot\s*\{[^}]*animation:\s*pp-last-slot[^;]*infinite/.test(CSS),
    'the last slot breathes amber');
check(/\.delphi-pp-injury-bar\.warn::before,\s*\.delphi-pp-injury-bar\.danger::before\s*\{[^}]*opacity:\s*0\.6/.test(CSS),
    'the skull wakes up');
check(/\.delphi-pp-injury-bar\.pp-injury-alarm\s*\{[^}]*animation:\s*pp-injury-shake/.test(CSS)
    && !/pp-injury-shake[^;]*infinite/.test(CSS), 'the shake plays once');
check(/body\.motion-reduced-pref \.delphi-pp-injury-bar\.warn \.delphi-pp-injury-cell\.last-slot\s*\{[^}]*animation:\s*none/.test(CSS)
    && /body\.motion-reduced-pref \.delphi-pp-injury-bar\.pp-injury-alarm\s*\{\s*animation:\s*none/.test(CSS),
    'reduced motion: a steady light, no shake');

check(/\.delphi-pp-injury-bar\s*\{[^}]*grid-template-columns:\s*repeat\(3,/.test(CSS), 'the grid is three wide');
check(/\.delphi-pp-injury-bar\.pt-active\s*\{[^}]*grid-template-columns:\s*repeat\(4,/.test(CSS),
    'four wide with Pain Tolerance, so eight fit on two lines');
check(/\.delphi-pp-injury-bar\.warn\s*\{[^}]*border-color/.test(CSS)
    && /\.delphi-pp-injury-bar\.danger\s*\{[^}]*border-color/.test(CSS), 'the frame carries the warning');
check(/\.delphi-pp-injury-bar::before\s*\{[^}]*position:\s*absolute[^}]*url\('img\/pieces\/injury\.png'\)[^}]*opacity:\s*0\.\d/.test(CSS),
    'the injury skull sits faded behind the grid, out of the grid flow');
check(/\.delphi-pp-injury-cell\s*\{[^}]*position:\s*relative/.test(CSS), 'the cells sit above it');
check(/\.delphi-pp-injury-cell\.filled\s*\{[^}]*background-color:\s*#fff/.test(CSS),
    'a filled cell is opaque, so the skull never shows through a die face');
check(/\.delphi-pp-injury-cell\.filled\[data-color="yellow"\]\s*\{[^}]*border:\s*1px solid #c9a400/.test(CSS),
    'yellow takes the darker gold ring, not the bright yellow lost on white');
check(/\.delphi-pp-injury-cell:not\(\.filled\)\s*\{[^}]*box-shadow/.test(CSS), 'empty slots keep an outline');
check(!/group-start\s*\{/.test(CSS), 'run outlines that would break across the two lines are gone');

// ---- the hand ----------------------------------------------------------------
const hand = (n) => Array.from({ length: n }, (_, i) => ({ id: i, color: ['red', 'blue', 'green'][i % 3] }));
const margins = (h) => (h.match(/margin-left:(-?[\d.]+)px/g) || []).map(m => parseFloat(m.slice(12)));
const cardsIn = (h) => (h.match(/delphi-pp-oracle-card"/g) || []).length;
const span = (h) => 17 + margins(h).reduce((a, m) => a + 17 + m, 0);
let h = panel._handMarkup(hand(3), 54);
check(cardsIn(h) === 3 && !/delphi-pp-oracle-stack/.test(h) && margins(h).every(m => m > 0),
    'three cards sit side by side in the six-injury slot');
check(span(h) <= 54, 'inside the slot, got ' + span(h));
h = panel._handMarkup(hand(4), 54);
check(/delphi-pp-oracle-stack/.test(h) && /delphi-pp-oracle-count">4</.test(h), 'a fourth card overlaps them, with the count');
check(Math.abs(span(h) - 54) < 0.1, 'spread evenly to fill the slot exactly, got ' + span(h));
h = panel._handMarkup(hand(3), 42);
check(/delphi-pp-oracle-stack/.test(h) && Math.abs(span(h) - 42) < 0.1,
    'with Pain Tolerance the slot is narrower, and three already overlap to fit it');
h = panel._handMarkup(hand(20), 54);
check(margins(h).every(m => 17 + m >= 4 - 1e-9) && /delphi-pp-oracle-count">20</.test(h),
    'a huge hand never shows less than 4px of a card, and the badge has the true count');
check(panel._handMarkup([], 54) === '', 'an empty hand leaves the slot empty');

// The slot follows Pain Tolerance, and the hand is laid out again when it changes.
{
    const handEl = { innerHTML: '' };
    const prevGet = global.document.getElementById;
    global.document.getElementById = (id) => id === 'pp-oracle-hand-9' ? handEl
        : (id.indexOf('pp-injury-bar-') === 0 ? bar(id) : null);
    const b9 = bar('pp-injury-bar-9');
    const rowEl = { classes: new Set(), classList: { toggle(c, on) { on ? rowEl.classes.add(c) : rowEl.classes.delete(c); } } };
    b9.parentNode = rowEl;
    panel.updateOracleHand(9, hand(3));
    check(!/delphi-pp-oracle-stack/.test(handEl.innerHTML), 'three cards spread while the grid holds six');
    panel.updateInjuries(9, [], { painTolerance: true });
    check(rowEl.classes.has('pt-active'), 'Pain Tolerance marks the row, which narrows the slot');
    check(/delphi-pp-oracle-stack/.test(handEl.innerHTML), 'and the hand is re-laid to the narrower slot');
    global.document.getElementById = prevGet;
}
check(/\.delphi-pp-oracle-hand\s*\{[^}]*width:\s*54px;\s*flex:\s*none/.test(CSS)
    && /\.delphi-pp-actions-row\.pt-active \.delphi-pp-oracle-hand\s*\{\s*width:\s*42px/.test(CSS)
    && constant('HAND_WIDTH') === 54 && constant('HAND_WIDTH_PT') === 42,
    'the slot widths in the CSS and the layout constants agree');

check(/\.delphi-pp-oracle-card\[data-color="yellow"\]\s*\{\s*background-color:\s*#fff;\s*border-color:\s*#c9a400/.test(CSS)
    && CSS.lastIndexOf('.delphi-pp-oracle-card[data-color="yellow"] {') > CSS.indexOf('.delphi-pp-oracle-card[data-color="black"]'),
    'a yellow oracle card is white with the darker gold ring, after the colour rules so it holds');
check(/\.delphi-pp-oracle-stack > \.delphi-pp-oracle-card\[data-color="yellow"\]\s*\{\s*border-color:\s*#c9a400/.test(CSS),
    'and keeps the gold in a stack');

// ---- chips -------------------------------------------------------------------
check(/\.delphi-pp-stat-chip\s*\{[^}]*flex-direction:\s*column/.test(CSS), 'the chips stand upright');
check(/\.delphi-pp-stat-chip \.pp-stat-icon\s*\{[^}]*width:\s*14px;\s*height:\s*14px/.test(CSS), 'with a 14px icon');
check(/\.delphi-pp-stat-chip\s*\{[^}]*font-size:\s*12px/.test(CSS), 'and a 12px number');
check(/\.delphi-pp-stat-chip\s*\{[^}]*\bwidth:\s*22px/.test(CSS), 'at a fixed width, so a two-digit count moves nothing');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
