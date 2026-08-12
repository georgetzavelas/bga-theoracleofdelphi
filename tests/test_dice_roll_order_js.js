/**
 * Roll first, THEN move the dice to their glyph slots.
 *
 * animateDiceRoll used to call _arrangeAllWheelDice() inside the same
 * requestAnimationFrame as the spin-start class swap. Mirror top/left carry a
 * ~0.4s CSS transition, so every die slid toward its destination colour slot
 * while it was still tumbling — telling the player the result roughly a second
 * before the die landed on it. Spent dice flying out of the centre pyramid gave
 * it away the same way.
 *
 * The fix is purely an ordering one, which is why this test is behavioural: it
 * drives the REAL animateAllDiceRoll body against a fake clock and a fake
 * requestAnimationFrame, and asserts WHEN the arrange happens relative to the
 * spin. A source lint could only check that the call moved lines, not that it
 * now lands after the tumble.
 *
 * The mirror SYNC deliberately stays in the spin frame — the wheel mirrors
 * tumble in lockstep with the tray dice, which is part of the roll. Only the
 * positioning is deferred. Asserted below so the two don't get collapsed.
 *
 * Run: node tests/test_dice_roll_order_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'modules', 'js', 'Components.js'), 'utf8');
const LINES = SRC.split('\n');

/** Components methods are indented 8 spaces, same shape as the game module. */
function extractMethod(name) {
    const re = new RegExp('^        ' + name + ': (async )?function');
    const start = LINES.findIndex(l => re.test(l));
    if (start < 0) throw new Error('method not found: ' + name);
    let i = start;
    while (!/^        \},\s*$/.test(LINES[i])) {
        i++;
        if (i > start + 400) throw new Error('runaway extracting ' + name);
    }
    return LINES.slice(start, i + 1).join('\n');
}

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

function makeDie(color, roll) {
    const classes = new Set(['delphi-die', 'die-used']);
    const inner = { style: { transition: '' } };
    // A real element's dataset stringifies everything written to it. Mimic that
    // with a Proxy rather than a plain object: animateDiceRoll assigns a NUMBER
    // to dataset.roll, and a stub that kept it numeric would let a
    // string-vs-number bug pass here while the CSS attribute selectors
    // ([data-roll="3"]) that drive the die faces are string-matched.
    const rawData = { color: color, roll: String(roll) };
    const el = {
        dataset: new Proxy(rawData, {
            set: (t, k, v) => { t[k] = String(v); return true; },
        }),
        _classes: classes,
        offsetHeight: 0,
        classList: {
            add: (c) => classes.add(c),
            remove: (...cs) => cs.forEach(c => classes.delete(c)),
            contains: (c) => classes.has(c),
            replace: (a, b) => { if (classes.delete(a)) classes.add(b); },
        },
        querySelector: () => inner,
        _inner: inner,
    };
    return el;
}

function run(newColors) {
    const events = [];               // ordered log of what happened when
    let now = 0;
    let timers = [];
    const rafQueue = [];

    const fakeSetTimeout = (fn, ms) => { timers.push({ fn, at: now + ms }); return timers.length; };
    const fakeRaf = (fn) => { rafQueue.push(fn); };

    const dice = new Map();
    [0, 1, 2].forEach(i => dice.set(`7_${i}`, makeDie('red', 1)));

    const body = extractMethod('animateDiceRoll');
    const host = new Function('setTimeout', 'requestAnimationFrame',
        `return { ${body} };`)(fakeSetTimeout, fakeRaf);

    host.dice = dice;
    host.dieMirrors = new Map();
    host.COLOR_TO_FACE = { red: 1, yellow: 2, green: 3, blue: 4, pink: 5, black: 6 };
    host._spentDiceByPlayer = new Map();
    host._bonusTokenPlayerId = null;
    host.clearBonusToken = () => {};
    host._syncDieMirror = (key) => events.push('sync:' + key);
    host._arrangeAllWheelDice = () => events.push('arrange');

    let resolved = false;
    host.animateDiceRoll(7, newColors).then(() => { resolved = true; });

    // Drain: advance the clock, flushing rAF callbacks the way a browser
    // would between frames.
    const flushRaf = () => { while (rafQueue.length) rafQueue.shift()(); };
    const advance = (ms) => {
        now += ms;
        const due = timers.filter(t => t.at <= now);
        timers = timers.filter(t => t.at > now);
        due.forEach(t => {
            t.fn();
            events.push('@' + now);
            flushRaf();
        });
    };

    return {
        events, dice,
        advance,
        spinStarted: () => dice.get('7_0')._classes.has('even-roll')
                        || dice.get('7_0')._classes.has('odd-roll'),
        isResolved: () => resolved,
    };
}

// The promise settles on a microtask, so anything checking isResolved() has to
// let the queue drain first.
const tick = () => new Promise(r => setImmediate(r));

async function main() {

// --- the ordering the request is about -----------------------------------
{
    const h = run(['green', 'blue', 'black']);

    // Before the 400ms lead-in: nothing has spun and nothing has moved.
    check(!h.spinStarted(), 'no spin before the lead-in elapses');
    check(!h.events.includes('arrange'), 'no arrange before the lead-in');

    // Lead-in fires: the spin starts.
    h.advance(400);
    check(h.spinStarted(), 'the spin starts after the 400ms lead-in');
    check(!h.events.includes('arrange'),
          'the dice do NOT move to their colour slots when the spin starts — '
          + 'that movement is what telegraphed the result');

    // Mid-tumble: still no movement.
    h.advance(900);
    check(!h.events.includes('arrange'), 'still no movement mid-tumble');

    // Spin completes: NOW they move.
    h.advance(400);
    check(h.events.includes('arrange'),
          'the dice move to their colour slots once the tumble has finished');
    await tick();
    check(h.isResolved(), 'and the roll promise resolves');
}

// --- the mirror sync stays with the spin ---------------------------------
//     Mirrors tumble alongside the tray dice; only their POSITION waits. If a
//     future change moves the sync to the end too, the wheel would stop
//     tumbling at all — a different animation, not this one.
{
    const h = run(['green', 'blue', 'black']);
    h.advance(400);
    // Count only syncs in the SPIN FRAME. Three more happen at t=0, when spent
    // dice are restored to available — counting cumulatively let a mutation
    // that deleted the spin-frame syncs entirely still pass.
    const leadIn = h.events.indexOf('@400');
    check(leadIn !== -1, 'the lead-in boundary is marked in the event log');
    const syncsInSpinFrame = h.events.slice(leadIn + 1)
        .filter(e => e.startsWith('sync:')).length;
    check(syncsInSpinFrame >= 3,
          'all three mirrors sync in the spin frame, so the wheel tumbles too '
          + '(got ' + syncsInSpinFrame + ')');
    const arrangeIdx = h.events.indexOf('arrange');
    const lastSyncIdx = h.events.map(e => e.startsWith('sync:')).lastIndexOf(true);
    h.advance(1300);
    check(h.events.indexOf('arrange') > lastSyncIdx,
          'the arrange comes after the syncs, never in the same frame');
    check(arrangeIdx === -1, 'and it had not run at spin time');
}

// --- the roll still lands on the right faces ------------------------------
//     Ordering must not disturb what the dice show: data-color/data-roll are
//     applied before the class swap, so the face is correct from the first
//     frame of the tumble.
{
    const h = run(['green', 'blue', 'black']);
    h.advance(400);
    check(h.dice.get('7_0').dataset.color === 'green', 'die 0 takes its new colour');
    check(h.dice.get('7_1').dataset.color === 'blue', 'die 1 takes its new colour');
    check(h.dice.get('7_2').dataset.color === 'black', 'die 2 takes its new colour');
    check(h.dice.get('7_0').dataset.roll === '3', 'die 0 shows the green face');
    check(h.dice.get('7_2').dataset.roll === '6', 'die 2 shows the black face');
}

// --- spent dice are restored, and the inline spin transition is cleaned up -
{
    const h = run(['red', 'red', 'red']);
    check(!h.dice.get('7_0')._classes.has('die-used'), 'a spent die is restored to available');
    h.advance(400);
    check(h.dice.get('7_0')._inner.style.transition !== '',
          'the spin transition is forced inline while tumbling');
    h.advance(1300);
    check(h.dice.get('7_0')._inner.style.transition === '',
          'and cleared afterwards so the next roll starts clean');
}

}

main().then(() => {
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail === 0 ? 0 : 1);
});
