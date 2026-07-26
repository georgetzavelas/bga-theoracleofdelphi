/**
 * Injury-card flight geometry: the deck -> player-board draw must be the
 * mirror of the board -> deck discard.
 *
 * The discard (_animateInjuryCardToDeck / _flyAllInjuriesToDeck) flies a
 * 140x94 landscape board card with rotation -90 and target dims 95/63, so it
 * makes a quarter turn and shrinks onto the 63x95 portrait deck. The draw must
 * therefore turn the other way (+90) and grow, landing landscape.
 *
 * The Titan draw flies from the deck too (it delegates to the same helper), so
 * it must carry the identical mirrored geometry rather than its own copy.
 *
 * Extracts the real shipped methods and stubs _flyCard to capture the options
 * actually passed, so the assertions are about shipped behaviour rather than a
 * reimplementation.
 *
 * _flyDeckCardToPanel defers each flight through setTimeout (the stagger), so
 * the assertions flush timers before reading the captured options.
 *
 * Run: node tests/test_injury_flight_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const LINES = fs.readFileSync(
    path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8').split('\n');

function extractMember(startRe, endRe) {
    const re = new RegExp(startRe);
    const start = LINES.findIndex(l => re.test(l));
    if (start < 0) throw new Error('not found: ' + startRe);
    const end = new RegExp(endRe);
    let i = start;
    while (!end.test(LINES[i])) {
        i++;
        if (i > start + 400) throw new Error('runaway: ' + startRe);
    }
    return LINES.slice(start, i + 1).join('\n');
}

// Methods end at an 8-space "}," ; the target table ends at an 8-space "},".
const TARGETS = extractMember('^        _DECK_TO_PANEL_TARGETS: \\{', '^        \\},');
const FLY_DECK = extractMember('^        _flyDeckCardToPanel: function', '^        \\},');
const FLY_TITAN = extractMember('^        _flyTitanInjuriesFromDialog: function', '^        \\},');
const DISCARD_ONE = extractMember('^        _animateInjuryCardToDeck: function', '^        \\},');

const game = new Function('themeImg', 'document', `return {
${TARGETS}
${FLY_DECK}
${FLY_TITAN}
${DISCARD_ONE}
};`)((p) => '/theme/' + p, makeDoc());

// Minimal DOM: every lookup resolves to a distinct fake element.
function makeDoc() {
    const el = (id) => ({ id, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }) });
    return {
        getElementById: (id) => el(id),
        querySelector: () => ({
            querySelectorAll: () => [el('popup-card-1')],
        }),
    };
}

// Capture what the real code hands to _flyCard.
let calls = [];
game._flyCard = function (opts) { calls.push(opts); if (opts.onLanding) opts.onLanding(); };
game.components = { injuryCards: { get: () => ({ element: { id: 'board-card' } }) } };

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

(async () => {
// ---- reference: the discard we are mirroring -------------------------------
calls = [];
game.player_id = 7;
game._animateInjuryCardToDeck('red');
const discard = calls[0];
check(discard.rotation === -90, `discard rotates -90, got ${discard.rotation}`);
check(discard.targetWidth === 95 && discard.targetHeight === 63,
    `discard targets 95/63, got ${discard.targetWidth}/${discard.targetHeight}`);

// ---- deck -> own board: must mirror it ------------------------------------
calls = [];
await game._flyDeckCardToPanel('injury', 7, 1);
const drawSelf = calls[0];
check(!!drawSelf, 'deck->self flight happened');
check(drawSelf.rotation === -discard.rotation,
    `draw must turn opposite the discard (${-discard.rotation}), got ${drawSelf.rotation}`);
check(drawSelf.targetWidth === 94 && drawSelf.targetHeight === 140,
    `draw targets 94/140 (destination dims swapped), got ${drawSelf.targetWidth}/${drawSelf.targetHeight}`);
// Landing size sanity: rotate-then-scale means the turned box is scaled.
// src 63x95 -> rotate 90 -> 95x63 -> scale(94/63, 140/95) -> ~142x93.
const sx = drawSelf.targetWidth / 63, sy = drawSelf.targetHeight / 95;
const landedW = 95 * sx, landedH = 63 * sy;
check(Math.abs(landedW - 140) <= 3, `lands ~140 wide, got ${landedW.toFixed(1)}`);
check(Math.abs(landedH - 94) <= 3, `lands ~94 tall, got ${landedH.toFixed(1)}`);

// ---- deck -> opponent panel: no rotation, no resize -----------------------
calls = [];
await game._flyDeckCardToPanel('injury', 99, 1);
const drawOpp = calls[0];
check(!drawOpp.rotation, `opponent panel flight must not rotate, got ${drawOpp.rotation}`);
check(drawOpp.targetWidth == null, 'opponent panel flight keeps deck size');

// ---- oracle must be untouched by the rotation plumbing -------------------
calls = [];
await game._flyDeckCardToPanel('oracle', 7, 1);
const oracle = calls[0];
check(!oracle.rotation, `oracle draw must not rotate, got ${oracle.rotation}`);
check(oracle.targetWidth === 94 && oracle.targetHeight === 140, 'oracle keeps its 94/140 growth');

// ---- Titan -> own board: same mirrored flight, from the deck ------------
calls = [];
const titanRet = game._flyTitanInjuriesFromDialog(7, ['red', 'blue']);
check(titanRet && typeof titanRet.then === 'function',
    'titan flight returns a Promise so the notif queue can block on it');
await titanRet;
check(calls.length === 2, `one flight per drawn injury, got ${calls.length}`);
const titanSelf = calls[0];
check(titanSelf.from && titanSelf.from.id === 'supply-deck-injury',
    `titan must fly FROM the deck, got ${titanSelf.from && titanSelf.from.id}`);
check(titanSelf.rotation === -discard.rotation,
    `titan must turn opposite the discard (${-discard.rotation}), got ${titanSelf.rotation}`);
check(titanSelf.targetWidth === 94 && titanSelf.targetHeight === 140,
    `titan uses the shared 94/140 geometry, got ${titanSelf.targetWidth}/${titanSelf.targetHeight}`);
// It must be literally the same geometry as the generic deck draw.
check(titanSelf.rotation === drawSelf.rotation
      && titanSelf.targetWidth === drawSelf.targetWidth
      && titanSelf.targetHeight === drawSelf.targetHeight,
    'titan and generic deck draw share one geometry (no duplicated numbers)');

// ---- Titan -> opponent panel: no rotation, natural shrink --------------
calls = [];
await game._flyTitanInjuriesFromDialog(99, ['red']);
const titanOpp = calls[0];
check(!titanOpp.rotation, `titan opponent flight must not rotate, got ${titanOpp.rotation}`);
check(titanOpp.targetWidth == null && titanOpp.targetHeight == null,
    'titan opponent flight keeps the natural shrink into the panel bar');

// ---- the shared helper reports completion ------------------------------
calls = [];
const done = game._flyDeckCardToPanel('injury', 7, 2);
check(done && typeof done.then === 'function', 'deck helper returns a Promise');
await done;
check(calls.length === 2, 'helper promise resolves only after every card lands');
check(game._flyDeckCardToPanel('injury', 7, 0) instanceof Promise,
    'zero-count guard still returns a Promise');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
})();
