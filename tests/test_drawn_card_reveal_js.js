/**
 * A drawn card must not appear on the player board until its flight from the
 * deck actually lands.
 *
 * The add happens before the flight on purpose (the flight aims at the card's
 * final stacked position), so _addDrawnCardHidden hides whatever the add
 * produced and _revealDrawnCard restores it on landing. The renderers do one of
 * two things, both covered here: create a new colour element, or increment an
 * existing colour stack's badge.
 *
 * Exercises the real shipped helpers against a stand-in hand map.
 *
 * Run: node tests/test_drawn_card_reveal_js.js
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

const game = new Function(`return {
${extractMethod('_addDrawnCardHidden')}
${extractMethod('_revealDrawnCard')}
};`)();

// Stand-in for a hand: a colour -> {count, element} map, matching what
// Components.addInjuryCard / addOracleCardToHand maintain.
function makeHand() {
    const map = new Map();
    return {
        map,
        add(color) {
            const existing = map.get(color);
            if (existing) {
                existing.count++;
                existing.element.badge.textContent = String(existing.count);
            } else {
                const badge = { textContent: '1' };
                const element = {
                    style: { visibility: '' },
                    badge,
                    querySelector: (sel) => (sel === '.card-count-badge' ? badge : null),
                };
                map.set(color, { count: 1, element });
            }
        },
        vis(color) { return map.get(color).element.style.visibility; },
        badge(color) { return map.get(color).element.badge.textContent; },
    };
}

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

// ---- brand new colour: element hidden until the flight lands --------------
{
    const hand = makeHand();
    game._pendingDrawReveals = null;
    game._addDrawnCardHidden('injury', hand.map, 'red', () => hand.add('red'));
    check(hand.vis('red') === 'hidden', `new colour must be hidden in flight, got "${hand.vis('red')}"`);
    game._revealDrawnCard('injury', 'red');
    check(hand.vis('red') === '', 'revealed once the flight lands');
    check(hand.badge('red') === '1', 'badge reads 1 after reveal');
}

// ---- existing colour: badge must not jump ahead of the flight -------------
{
    const hand = makeHand();
    game._pendingDrawReveals = null;
    hand.add('blue');                       // already holding one blue
    check(hand.badge('blue') === '1', 'starts at 1');
    game._addDrawnCardHidden('oracle', hand.map, 'blue', () => hand.add('blue'));
    check(hand.badge('blue') === '1', `badge must still read 1 during flight, got ${hand.badge('blue')}`);
    check(hand.vis('blue') === '', 'the already-held card stays visible');
    game._revealDrawnCard('oracle', 'blue');
    check(hand.badge('blue') === '2', `badge reaches 2 on landing, got ${hand.badge('blue')}`);
}

// ---- two of one colour in flight: reveal only after the last lands --------
{
    const hand = makeHand();
    game._pendingDrawReveals = null;
    game._addDrawnCardHidden('injury', hand.map, 'green', () => hand.add('green'));
    game._addDrawnCardHidden('injury', hand.map, 'green', () => hand.add('green'));
    check(hand.vis('green') === 'hidden', 'still hidden with two in flight');
    game._revealDrawnCard('injury', 'green');
    check(hand.vis('green') === 'hidden',
        'first landing must not reveal while a second card is still flying');
    game._revealDrawnCard('injury', 'green');
    check(hand.vis('green') === '', 'revealed after the last landing');
    check(hand.badge('green') === '2', `badge syncs to the live count, got ${hand.badge('green')}`);
}

// ---- kinds are independent ------------------------------------------------
{
    const hand = makeHand();
    game._pendingDrawReveals = null;
    game._addDrawnCardHidden('injury', hand.map, 'pink', () => hand.add('pink'));
    game._revealDrawnCard('oracle', 'pink');   // wrong kind
    check(hand.vis('pink') === 'hidden', 'an oracle landing must not reveal an injury card');
    game._revealDrawnCard('injury', 'pink');
    check(hand.vis('pink') === '', 'the matching kind reveals it');
}

// ---- reveal is safe to call spuriously -----------------------------------
{
    game._pendingDrawReveals = null;
    let threw = false;
    try { game._revealDrawnCard('injury', 'black'); } catch (e) { threw = true; }
    check(!threw, 'revealing with nothing pending is a no-op, not a throw');
}

// ---- the safety net must outlast the Titan popup hold ---------------------
{
    const src = LINES.join('\n');
    const i = src.indexOf('_addDrawnCardHidden');
    const seg = src.slice(i, i + 3000);
    const m = seg.match(/_revealDrawnCard\(kind, color, true\); \}, (\d+)\)/);
    check(!!m, 'safety timer found');
    const ms = m ? parseInt(m[1], 10) : 0;
    // Titan: 4000ms table hold + 500ms pause + 700ms flight before it lands.
    check(ms > 5200,
        `safety timer must outlast the Titan hold (>5200ms) or it reinstates the bug, got ${ms}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
