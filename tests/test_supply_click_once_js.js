/**
 * Clicking the oracle deck or the favor pile sends its action once.
 *
 * Reported as "BadMethodCallException: actDrawOracleCard method is not
 * defined in this game". The draw spends the action source and leaves
 * SelectAction at once, but the state change that deactivates the deck is
 * queued behind the draw's flight animation. Through that window the request
 * has finished (interface unlocked), the client still believes it is in
 * SelectAction (so checkAction passes), and the deck still has its handler.
 * A second click reached a server that had already moved on.
 *
 * The favor pile has the same lifecycle and the same hole.
 *
 * So each is one-shot: a click disarms it before sending, and the next state
 * render re-arms it where still valid. A refused action leaves the state
 * unchanged and nothing re-renders, so the rejection re-arms it; otherwise
 * the affordance would stay dead.
 *
 * Run: node tests/test_supply_click_once_js.js
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

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

function makeEl() {
    const cls = new Set();
    const handlers = [];
    return {
        classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), has: (c) => cls.has(c) },
        addEventListener: (t, fn) => { if (t === 'click') handlers.push(fn); },
        removeEventListener: (t, fn) => {
            const i = handlers.indexOf(fn); if (i >= 0) handlers.splice(i, 1);
        },
        click() { handlers.slice().forEach((fn) => fn()); },
        get armed() { return handlers.length > 0; },
    };
}

function world() {
    const els = { 'supply-deck-oracle': makeEl(), 'delphi-favor-pile': makeEl() };
    const game = new Function('document', `return {
${extractMethod('_activateFavorPile')}
${extractMethod('_deactivateFavorPile')}
${extractMethod('_activateOracleDeck')}
${extractMethod('_deactivateOracleDeck')}
${extractMethod('_sendOnce')}
};`)({ getElementById: (id) => els[id] || null });
    const sent = [];
    let reject = null;
    game.bgaPerformAction = function(action) {
        sent.push(action);
        // A real Promise, so the re-arm path runs exactly as in the browser.
        return new Promise(function(res, rej) { reject = rej; });
    };
    return { game, els, sent, rejectLast: () => reject && reject(new Error('refused')) };
}

(async function() {
    // ---- the oracle deck --------------------------------------------------
    {
        const w = world();
        const deck = w.els['supply-deck-oracle'];
        w.game._activateOracleDeck();
        check(deck.armed, 'setup: the deck is clickable in SelectAction');

        deck.click();
        check(w.sent.length === 1 && w.sent[0] === 'actDrawOracleCard', 'the first click draws');
        check(!deck.armed, 'and disarms the deck at once');
        check(!deck.classList.has('supply-deck-active'), 'dropping its active look too');

        // THE regression: a second click while the state change is still
        // queued behind the draw animation. No re-render has happened.
        deck.click();
        check(w.sent.length === 1,
            `a second click before the next state render sends nothing, sent ${w.sent.length}`);
    }
    {
        const w = world();
        const deck = w.els['supply-deck-oracle'];
        w.game._activateOracleDeck();
        deck.click();
        w.rejectLast();                         // e.g. "No oracle cards left"
        await new Promise((r) => setImmediate(r));
        check(deck.armed,
            'a refused draw re-arms the deck, since nothing will re-render it');
    }

    // ---- the favor pile ---------------------------------------------------
    {
        const w = world();
        const pile = w.els['delphi-favor-pile'];
        w.game._activateFavorPile('actTakeFavorTokens');
        pile.click();
        pile.click();
        check(w.sent.length === 1 && w.sent[0] === 'actTakeFavorTokens',
            `the favor pile takes once, sent ${JSON.stringify(w.sent)}`);
        check(!pile.armed, 'and is disarmed after the click');

        w.rejectLast();
        await new Promise((r) => setImmediate(r));
        check(pile.armed, 'and re-arms on a refusal');
        pile.click();
        check(w.sent[1] === 'actTakeFavorTokens',
            'with the same action it was armed with, not a default');
    }

    // ---- a framework without a promise still disarms safely ----------------
    {
        const w = world();
        const deck = w.els['supply-deck-oracle'];
        w.game.bgaPerformAction = function(a) { w.sent.push(a); /* returns undefined */ };
        w.game._activateOracleDeck();
        let threw = null;
        try { deck.click(); } catch (e) { threw = e.message; }
        check(threw === null, `a non-promise return does not throw, got: ${threw}`);
        check(!deck.armed, 'and the deck is still disarmed');
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
