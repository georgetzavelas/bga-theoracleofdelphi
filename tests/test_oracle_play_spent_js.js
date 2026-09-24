/**
 * Once the turn's oracle-card play is spent, no card in hand still looks, or
 * acts, playable.
 *
 * Reported from a turn-based game: HutchSea played a pink oracle card at
 * 11:05, came back at 11:39, drew another card with the black die, and was
 * refused when they tried to play it ("You have already played an oracle card
 * this turn"). Nothing on screen had said the play was used.
 *
 * _bindHandOracleCardSelectable makes each hand card on the player board glow
 * (.oracle-card-selectable) and dispatch actPlayOracleCard. The only teardown
 * ran at the top of _setupOracleCardClickHandlers, which runs only while a
 * play is still available. notif_oracleCardPlayed greyed the action-bar icons
 * but never touched the hand. So every other stack kept glowing and stayed
 * clickable, and a card drawn later in a colour already held joined that same
 * glowing element.
 *
 * A reload was always right (the bar rebuilds greyed, nothing binds). The bug
 * lives in a session that stays open, which in a turn-based game is the norm.
 *
 * Run: node tests/test_oracle_play_spent_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8');
const LINES = SRC.split('\n');

function extractMethod(name) {
    const re = new RegExp('^        ' + name + ': (async )?function');
    const start = LINES.findIndex(l => re.test(l));
    if (start < 0) throw new Error('not found: ' + name);
    let i = start;
    while (!/^        \},\s*$/.test(LINES[i])) i++;
    return LINES.slice(start, i + 1).join('\n');
}

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

// ---- the binding and its teardown -------------------------------------------
{
    function makeCard(color) {
        const cls = new Set(['delphi-oracle-card', 'oracle-' + color]);
        const handlers = [];
        return {
            classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
            addEventListener: (t, fn) => handlers.push(fn),
            removeEventListener: (t, fn) => { const i = handlers.indexOf(fn); if (i >= 0) handlers.splice(i, 1); },
            click() { handlers.slice().forEach((fn) => fn()); },
            get bound() { return handlers.length; },
        };
    }
    const pink = makeCard('pink');
    const area = { querySelector: (sel) => (/oracle-pink/.test(sel) ? pink : null) };
    const game = new Function('document', `return {
${extractMethod('_bindHandOracleCardSelectable')}
${extractMethod('_teardownOracleCardClickHandlers')}
};`)({ getElementById: (id) => (id === 'delphi-oracle-cards-area' ? area : null) });
    const sent = [];
    game.bgaPerformAction = (a) => sent.push(a);

    game._bindHandOracleCardSelectable('pink', 42, false);
    check(pink.classList.contains('oracle-card-selectable') && pink.bound === 1,
        'setup: a playable hand card glows and is clickable');

    game._teardownOracleCardClickHandlers();
    check(!pink.classList.contains('oracle-card-selectable'), 'teardown drops the glow');
    pink.click();
    check(sent.length === 0, 'and the card no longer sends a play');
}

// ---- the play drops the glow the moment it happens -------------------------
// Between the play and the next PlayerActions entry the player can still see
// the hand; the glow must not outlive the play by even that long.
{
    const src = extractMethod('notif_oracleCardPlayed');
    check(/this\._teardownOracleCardClickHandlers\(\)/.test(src),
        'notif_oracleCardPlayed tears down the hand bindings');
}

// ---- and a spent play never leaves stale bindings on re-entry ---------------
// PlayerActions only rebuilt the bindings when a play was available, and only
// that rebuild tore the old ones down. With the play spent, nothing ran.
{
    const i = SRC.indexOf("case 'PlayerActions':");
    const block = SRC.slice(i, i + 2500);
    check(/canPlayOracleCard[\s\S]*?_setupOracleCardClickHandlers[\s\S]*?\}\s*else\s*\{[\s\S]*?_teardownOracleCardClickHandlers\(\)/.test(block),
        'entering PlayerActions with the play spent tears the bindings down');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
