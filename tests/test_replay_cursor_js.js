/**
 * A replay loads even when BGA's replay cursor targets a move marker that was
 * never written.
 *
 * Reported "go to end of game" failing with "Cannot read properties of null
 * (reading 'ownerDocument')" in o.position <- slideToObjectPos <-
 * loadReplayLogs. The framework writes a move's header (and its
 * replaylogs_progression_<n> marker) only for the move's first notification
 * packet, and only if that packet has a log line; we send many silent private
 * packets ahead of the public line, so a move can be "logged" with no marker.
 * When that move is the last one replayed, the cursor slide throws.
 *
 * Our slideToObjectPos falls back to the nearest earlier marker, or does
 * nothing, instead of passing null to the framework.
 *
 * Run: node tests/test_replay_cursor_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8');

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

function extract(name) {
    const s = SRC.indexOf('        ' + name + ': function');
    if (s < 0) throw new Error('method not found: ' + name);
    let i = SRC.indexOf('{', s), d = 0;
    for (; i < SRC.length; i++) {
        if (SRC[i] === '{') d++;
        else if (SRC[i] === '}') { d--; if (!d) break; }
    }
    return SRC.slice(s, i + 1);
}

const calls = [];
global.ebg = { core: { gamegui: { prototype: {
    slideToObjectPos(mobile, target) { calls.push([mobile, target]); return { play() { return 'played'; } }; },
} } } };
const ids = new Set(['archivecursor', 'replaylogs_progression_3', 'replaylogs_progression_7', 'replaylogs_progression_12']);
global.document = {
    getElementById: (id) => ids.has(id) ? { id } : null,
    querySelectorAll: () => [...ids].filter(i => i.startsWith('replaylogs_progression_')).map(id => ({ id })),
};
const game = new Function('return {' + ['slideToObjectPos', '_nearestReplayMarker'].map(extract).join(',\n') + '}')();

// The reported case: the last move's marker was never written.
let anim = game.slideToObjectPos('archivecursor', 'replaylogs_progression_9', -30, -23);
check(calls.length === 1 && calls[0][1] === 'replaylogs_progression_7',
    'a missing move marker falls back to the nearest earlier one, got ' + JSON.stringify(calls[0]));
check(anim.play() === 'played', 'and the framework still gets an animation it can play');

calls.length = 0;
game.slideToObjectPos('archivecursor', 'replaylogs_progression_12', -30, -23);
check(calls.length === 1 && calls[0][1] === 'replaylogs_progression_12', 'a marker that exists is used as is');

calls.length = 0;
anim = game.slideToObjectPos('archivecursor', 'replaylogs_progression_2', -30, -23);
check(calls.length === 0 && typeof anim.play === 'function' && (anim.play(), true),
    'with no earlier marker it does nothing, and returns something play() works on');

calls.length = 0;
anim = game.slideToObjectPos('archivecursor', 'some_missing_div', 0, 0);
check(calls.length === 0 && typeof anim.play === 'function', 'any other missing target is a no-op, not a crash');

calls.length = 0;
game.slideToObjectPos('no_such_mobile', 'replaylogs_progression_7', 0, 0);
check(calls.length === 0, 'a missing moving element is a no-op too');

check(!/this\.inherited\(arguments\)/.test(extract('slideToObjectPos')),
    'the base method is called by prototype, not this.inherited (needs arguments.callee)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
