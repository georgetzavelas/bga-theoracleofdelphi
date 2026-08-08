/**
 * Hover-to-peek on your OWN ship.
 *
 * Opponents' ships fade the instant you hover them (pure CSS,
 * `.delphi-ship:not(.my-ship):hover`). Your own ship now does the same, but
 * only after a dwell (MY_SHIP_PEEK_DELAY) AND only when nothing is selected —
 * so a cursor
 * crossing the board never dims the piece you are about to move, and the fade
 * never fights the click-to-move affordance.
 *
 * Drives the REAL shipped _setupMyShipPeek / _cancelMyShipPeek /
 * _canPeekMyShip against stub DOM elements and a controllable clock, so the
 * dwell, the re-check at fire time, and the teardown are actually exercised
 * rather than grepped for.
 *
 * The interesting case is #3: the state can change during the three seconds,
 * so the "nothing selected" test has to run when the timer FIRES, not when the
 * hover starts. And #2 exists because .source-selected — the obvious signal —
 * is cleared by onLeavingState('SelectAction') and is therefore already gone
 * during MoveShip/LoadCargo, where a die IS committed; the check reads the
 * state name instead.
 *
 * Run: node tests/test_my_ship_peek_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8');
const LINES = SRC.split('\n');

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

// --- stub DOM -------------------------------------------------------------
function makeEl(classes) {
    const set = new Set(String(classes).split(' ').filter(Boolean));
    const el = {
        _classes: set,
        classList: {
            add: (c) => set.add(c),
            remove: (c) => set.delete(c),
            contains: (c) => set.has(c),
        },
        // Ships have no children today; a nested target would report true here.
        contains: () => false,
        closest: (sel) => sel.split('.').filter(Boolean).every((c) => set.has(c)) ? el : null,
    };
    return el;
}

// --- controllable clock ---------------------------------------------------
function makeClock() {
    let timers = [], nextId = 1, now = 0;
    return {
        setTimeout: (fn, ms) => { const id = nextId++; timers.push({ id, fn, at: now + ms }); return id; },
        clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id); },
        advance(ms) {
            now += ms;
            const due = timers.filter((t) => t.at <= now);
            timers = timers.filter((t) => t.at > now);
            due.forEach((t) => t.fn());
        },
        pending: () => timers.length,
    };
}

const METHODS = ['_setupMyShipPeek', '_cancelMyShipPeek', '_canPeekMyShip']
    .map(extractMethod).join('\n');

// The dwell is a plain property, not a method — read it from source so the
// test asserts the shipped value rather than a copy of it.
const DELAY = (() => {
    const m = SRC.match(/MY_SHIP_PEEK_DELAY:\s*(\d+)/);
    if (!m) throw new Error('MY_SHIP_PEEK_DELAY not found');
    return parseInt(m[1], 10);
})();

function makeGame(opts) {
    opts = opts || {};
    const clock = makeClock();
    const handlers = {};
    const pieces = {
        addEventListener: (type, fn) => { (handlers[type] = handlers[type] || []).push(fn); },
    };

    const game = new Function('setTimeout', 'clearTimeout',
        `return { ${METHODS} };`)(clock.setTimeout, clock.clearTimeout);

    game.MY_SHIP_PEEK_DELAY = DELAY;
    game.components = { boardPieces: pieces };
    game._active = opts.active !== undefined ? opts.active : true;
    game.isCurrentPlayerActive = () => game._active;
    game.gamedatas = { gamestate: { name: opts.state || 'PlayerActions' } };

    game._setupMyShipPeek();

    return {
        game, clock,
        fire: (type, ev) => (handlers[type] || []).forEach((fn) => fn(ev)),
        hasHandlers: () => !!(handlers.mouseover && handlers.mouseout),
    };
}

const MY_SHIP = () => makeEl('delphi-ship my-ship ship-red');
const OPP_SHIP = () => makeEl('delphi-ship ship-blue');
const faded = (el) => el.classList.contains('my-ship-peek');

// --- 0. wiring ------------------------------------------------------------
{
    const h = makeGame();
    check(h.hasHandlers(), 'delegation binds both mouseover and mouseout');
    // A band, not an exact value: the dwell is a taste knob (it has already
    // been retuned once) and nothing else depends on the number. What must
    // hold is that there IS a deliberate hold — not instant, so a cursor
    // crossing the board can't dim the ship — and that it isn't so long it
    // reads as broken.
    check(DELAY > 250 && DELAY <= 3000,
          'the dwell is a deliberate, non-instant hold (got ' + DELAY + 'ms)');
}

// --- 1. the happy path: dwell 3s at the hub, ship fades -------------------
{
    const h = makeGame({ state: 'PlayerActions' });
    const ship = MY_SHIP();
    h.fire('mouseover', { target: ship });
    h.clock.advance(DELAY - 1);
    check(!faded(ship), 'not faded a moment before the dwell elapses');
    h.clock.advance(1);
    check(faded(ship), 'faded once the full dwell elapses');
}

// --- 2. a source/action IS in flight: never fades -------------------------
//     Covers the sub-action states too, which is the whole reason the check
//     reads the state name rather than the action bar's .source-selected.
for (const state of ['SelectAction', 'MoveShip', 'LoadCargo', 'DeliverCargo', 'UseGodAbility']) {
    const h = makeGame({ state });
    const ship = MY_SHIP();
    h.fire('mouseover', { target: ship });
    h.clock.advance(DELAY * 2);
    check(!faded(ship), 'no fade while in ' + state);
}

// --- 3. state changes DURING the dwell: re-checked at fire time -----------
{
    const h = makeGame({ state: 'PlayerActions' });
    const ship = MY_SHIP();
    h.fire('mouseover', { target: ship });
    h.clock.advance(DELAY - 1);
    h.game.gamedatas.gamestate.name = 'SelectAction';   // player picks a die
    h.clock.advance(1);
    check(!faded(ship),
          'a die selected mid-dwell cancels the fade (condition re-checked when '
          + 'the timer fires, not only when the hover began)');
}

// --- 4. leaving early cancels the dwell ----------------------------------
{
    const h = makeGame();
    const ship = MY_SHIP();
    h.fire('mouseover', { target: ship });
    h.fire('mouseout', { target: ship, relatedTarget: null });
    check(h.clock.pending() === 0, 'mouseout clears the pending timer');
    h.clock.advance(DELAY * 2);
    check(!faded(ship), 'no fade after leaving before the dwell elapsed');
}

// --- 5. leaving after the fade clears it --------------------------------
{
    const h = makeGame();
    const ship = MY_SHIP();
    h.fire('mouseover', { target: ship });
    h.clock.advance(DELAY);
    check(faded(ship), 'faded (precondition)');
    h.fire('mouseout', { target: ship, relatedTarget: null });
    check(!faded(ship), 'mouseout restores full opacity');
}

// --- 6. not your turn: nothing of yours is selected, so peeking is fine ---
{
    const h = makeGame({ active: false, state: 'PlayerActions' });
    const ship = MY_SHIP();
    h.fire('mouseover', { target: ship });
    h.clock.advance(DELAY);
    check(faded(ship), 'peek works when it is not your turn');
}
{
    // ...even in a state that would block it on your own turn.
    const h = makeGame({ active: false, state: 'MoveShip' });
    const ship = MY_SHIP();
    h.fire('mouseover', { target: ship });
    h.clock.advance(DELAY);
    check(faded(ship), "an opponent's MoveShip does not block your peek");
}

// --- 7. opponents' ships are untouched by this path ---------------------
//     They fade via CSS :hover instantly; the JS must not arm a timer for
//     them or it would fight the stylesheet.
{
    const h = makeGame();
    const opp = OPP_SHIP();
    h.fire('mouseover', { target: opp });
    check(h.clock.pending() === 0, "no dwell timer armed for an opponent's ship");
    h.clock.advance(DELAY * 2);
    check(!faded(opp), "opponent's ship never gets .my-ship-peek");
}

// --- 8. a repeat mouseover must not RESTART the dwell -------------------
//     "Only one timer pending" is not a real assertion — cancel-then-re-arm
//     also satisfies it. What matters is that the countdown keeps running, so
//     a spurious re-entry (or a future child element) can't stop the fade from
//     ever firing. That is what the `_myShipPeekEl === shipEl` guard buys.
{
    const h = makeGame();
    const ship = MY_SHIP();
    h.fire('mouseover', { target: ship });
    h.clock.advance(DELAY - 1);
    h.fire('mouseover', { target: ship });   // spurious re-entry near the end
    h.clock.advance(1);
    check(faded(ship), 'a repeat mouseover does not restart the dwell');
    check(h.clock.pending() === 0, 'and leaves no stray timer behind');
}

// --- 9. cancel is safe with nothing pending ----------------------------
{
    const h = makeGame();
    h.game._cancelMyShipPeek();
    h.game._cancelMyShipPeek();
    check(true, 'cancel with nothing pending does not throw');
}

// --- 10. a move between two of your own ship's children keeps the dwell --
{
    const h = makeGame();
    const ship = MY_SHIP();
    ship.contains = () => true;      // pretend the cursor went to a child
    h.fire('mouseover', { target: ship });
    h.fire('mouseout', { target: ship, relatedTarget: {} });
    check(h.clock.pending() === 1, 'a mouseout into a descendant does not cancel');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
