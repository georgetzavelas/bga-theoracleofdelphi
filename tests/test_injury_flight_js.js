/**
 * Injury- and Oracle-card flight geometry.
 *
 * Drawing an injury should read as the card turning face-up off the deck: the
 * clone leaves showing the deck's BACK, flips over early in the flight to
 * reveal the injury colour, and grows into the landscape board slot. That means
 * the draw must carry
 *   - a landscape source size (so the artwork is never dragged round sideways),
 *   - the destination size to grow into,
 *   - a per-colour face image, which is what makes the clone two-sided,
 *   - and NO in-plane rotation.
 *
 * The Oracle draw flips the same way. It needs no source override because its
 * deck and its destination card are both portrait, so it only flips and grows.
 *
 * The discard is the opposite motion but keeps its quarter turn, because it has
 * to land on the portrait deck footprint. That asymmetry is deliberate and is
 * pinned here so nobody "restores" symmetry by accident.
 *
 * _revealDrawnCard is pulled in too because the flight's onLanding calls it
 * (drawn cards are held invisible until they land; see
 * test_drawn_card_reveal_js.js).
 *
 * Extracts the real shipped methods and stubs _flyCard to capture the options
 * actually passed, so the assertions are about shipped behaviour rather than a
 * reimplementation. _flyDeckCardToPanel staggers its flights through
 * setTimeout, so the tests await the promise it returns.
 *
 * Run: node tests/test_injury_flight_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const LINES = fs.readFileSync(
    path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8').split('\n');

function extractMember(startRe) {
    const re = new RegExp(startRe);
    const start = LINES.findIndex(l => re.test(l));
    if (start < 0) throw new Error('not found: ' + startRe);
    let i = start;
    while (!/^        \},\s*$/.test(LINES[i])) {
        i++;
        if (i > start + 400) throw new Error('runaway: ' + startRe);
    }
    return LINES.slice(start, i + 1).join('\n');
}

function makeDoc() {
    const el = (id) => ({ id, style: {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }) });
    return { getElementById: (id) => el(id), querySelector: () => null };
}

const game = new Function('themeImg', 'document', `return {
${extractMember('^        _DECK_TO_PANEL_TARGETS: \\{')}
${extractMember('^        _flyDeckCardToPanel: function')}
${extractMember('^        _flyTitanInjuriesFromDialog: function')}
${extractMember('^        _animateInjuryCardToDeck: function')}
${extractMember('^        _revealDrawnCard: function')}
};`)((p) => '/theme/' + p, makeDoc());

let calls = [];
game._flyCard = function (opts) { calls.push(opts); if (opts.onLanding) opts.onLanding(); };
game.components = { injuryCards: { get: () => ({ element: { id: 'board-card' } }) } };
game.player_id = 7;

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

(async () => {

// ---- the discard keeps its quarter turn onto the portrait deck ------------
calls = [];
game._animateInjuryCardToDeck('red');
const discard = calls[0];
check(discard.rotation === -90, `discard rotates -90, got ${discard.rotation}`);
check(discard.targetWidth === 95 && discard.targetHeight === 63,
    `discard targets 95/63, got ${discard.targetWidth}/${discard.targetHeight}`);
check(!discard.faceImage, 'discard is single-sided (its face is already showing)');

// ---- the draw turns face-up instead of turning in-plane -------------------
calls = [];
await game._flyDeckCardToPanel('injury', 7, 1, ['red']);
const draw = calls[0];
check(!!draw, 'deck->self flight happened');
check(!draw.rotation,
    `draw must NOT rotate in-plane or the face lands sideways, got ${draw.rotation}`);
check(draw.srcWidth === 84 && draw.srcHeight === 56,
    `draw leaves the deck landscape at 84/56, got ${draw.srcWidth}/${draw.srcHeight}`);
check(draw.targetWidth === 140 && draw.targetHeight === 94,
    `draw grows to the slot's 140/94, got ${draw.targetWidth}/${draw.targetHeight}`);
const srcAspect = draw.srcWidth / draw.srcHeight;
const dstAspect = draw.targetWidth / draw.targetHeight;
check(Math.abs(srcAspect - dstAspect) < 0.02,
    `growth must not distort: ${srcAspect.toFixed(3)} vs ${dstAspect.toFixed(3)}`);

// The face image is what makes the clone two-sided, so the reveal exists.
check(typeof draw.faceImage === 'string' && draw.faceImage.indexOf('red') !== -1,
    `draw carries the red face image, got ${draw.faceImage}`);
check(draw.backgroundImage && draw.backgroundImage.indexOf('card-back') !== -1,
    `draw still starts on the card back, got ${draw.backgroundImage}`);

// ---- unknown colour: no face, so it degrades to a plain card back ---------
calls = [];
await game._flyDeckCardToPanel('injury', 7, 1);
check(!calls[0].faceImage, 'without a known colour the clone stays single-sided');

// ---- opponent panel flights stay untouched -------------------------------
calls = [];
await game._flyDeckCardToPanel('injury', 99, 1, ['red']);
const opp = calls[0];
check(!opp.rotation && !opp.faceImage, 'opponent flight does not flip');
check(opp.srcWidth == null && opp.targetWidth == null,
    'opponent flight keeps the deck size and natural shrink');

// ---- oracle draw flips too, but portrait to portrait ---------------------
calls = [];
await game._flyDeckCardToPanel('oracle', 7, 1, ['blue']);
const oracle = calls[0];
check(typeof oracle.faceImage === 'string' && oracle.faceImage.indexOf('blue') !== -1,
    `oracle draw reveals its colour, got ${oracle.faceImage}`);
check(oracle.backgroundImage && oracle.backgroundImage.indexOf('card-back') !== -1,
    'oracle draw starts on the oracle card back');
check(!oracle.rotation, `oracle draw must not rotate in-plane, got ${oracle.rotation}`);
check(oracle.targetWidth === 94 && oracle.targetHeight === 140,
    'oracle keeps its own 94/140 growth');
check(oracle.srcWidth == null,
    'oracle needs no source override: deck and destination are both portrait');
check(oracle.faceImage.indexOf('img/oracle/') !== -1
      && draw.faceImage.indexOf('img/injury/') !== -1,
    'each deck resolves its own face art, not a shared path');

// ---- opponent oracle flights do not flip either --------------------------
calls = [];
await game._flyDeckCardToPanel('oracle', 99, 1, ['blue']);
check(!calls[0].faceImage, 'opponent oracle flight stays single-sided');

// ---- Titan draw: same flight, from the deck, one per injury --------------
calls = [];
const titanRet = game._flyTitanInjuriesFromDialog(7, ['red', 'blue']);
check(titanRet && typeof titanRet.then === 'function',
    'titan flight returns a Promise so the notif queue can block on it');
await titanRet;
check(calls.length === 2, `one flight per drawn injury, got ${calls.length}`);
check(calls[0].from && calls[0].from.id === 'supply-deck-injury',
    `titan must fly FROM the deck, got ${calls[0].from && calls[0].from.id}`);
check(calls[0].faceImage.indexOf('red') !== -1 && calls[1].faceImage.indexOf('blue') !== -1,
    'each titan card reveals its own colour');
check(calls[0].srcWidth === draw.srcWidth
      && calls[0].targetWidth === draw.targetWidth
      && calls[0].targetHeight === draw.targetHeight
      && !calls[0].rotation,
    'titan and generic deck draw share one geometry (no duplicated numbers)');

// ---- the shared helper reports completion --------------------------------
calls = [];
const done = game._flyDeckCardToPanel('injury', 7, 2, ['red', 'blue']);
check(done && typeof done.then === 'function', 'deck helper returns a Promise');
await done;
check(calls.length === 2, 'helper promise resolves only after every card lands');
check(game._flyDeckCardToPanel('injury', 7, 0) instanceof Promise,
    'zero-count guard still returns a Promise');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
})();
