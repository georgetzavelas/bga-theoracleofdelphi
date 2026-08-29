/**
 * Unit test for ZeusTaskTargets.js — the "which value completes this tile"
 * rule, shared by the monster and offering hover highlights.
 *
 * Mirrors Game::findCompletableZeusTileForType, which is itself task-type
 * agnostic: exact task_color match first, then the "any" tile, gated by
 * sibling exclusion. Only the universe of possible values differs (six monster
 * types, six offering colours).
 * Run: node tests/test_zeus_task_targets_js.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(cond, msg) {
    if (cond) { pass++; }
    else { console.log('  FAIL: ' + msg); fail++; }
}
function sameSet(a, b, msg) {
    var norm = function (l) { return (l || []).slice().sort().join('|'); };
    ok(norm(a) === norm(b), msg + '  (got ' + norm(a) + ' want ' + norm(b) + ')');
}
function eq(a, b, msg) {
    ok(a === b, msg + '  (got ' + a + ' want ' + b + ')');
}

const sandbox = { console, captured: null, define(_d, f) { sandbox.captured = f(); } };
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'modules', 'js', 'ZeusTaskTargets.js'), 'utf8'),
    sandbox
);
const ZTT = sandbox.captured;
ok(ZTT && typeof ZTT.typesForTile === 'function', 'ZeusTaskTargets module loaded');
sameSet(ZTT.MONSTER_TYPES,
    ['cyclops', 'minotaur', 'chimera', 'hydra', 'gorgon', 'siren'],
    'MONSTER_TYPES mirrors MaterialDefs::MONSTERS');

const M = ZTT.MONSTER_TYPES;

// --- Fixture: the standard hand of three monster tiles ---
// Every player gets the same two flipped types plus one "any" tile.
const WILD = { id: 1, color: null, done: false };
const HYDRA = { id: 2, color: 'hydra', done: false };
const SIREN = { id: 3, color: 'siren', done: false };
function hand(over) { return [WILD, HYDRA, SIREN].map(function (t) { return Object.assign({}, t, (over || {})[t.id]); }); }

// === typesForTile ===

sameSet(ZTT.typesForTile(HYDRA, hand(), M), ['hydra'], 'named tile wants only its own type');

sameSet(ZTT.typesForTile(WILD, hand(), M),
    ['cyclops', 'minotaur', 'chimera', 'gorgon'],
    'any-tile wants every type its siblings do not claim');

sameSet(ZTT.typesForTile({ id: 2, color: 'hydra', done: true }, hand({ 2: { done: true } }), M),
    [], 'completed tile wants nothing');

sameSet(ZTT.typesForTile(WILD, hand({ 3: { done: true } }), M),
    ['cyclops', 'minotaur', 'chimera', 'gorgon'],
    'a completed sibling still excludes its type from the any-tile');

sameSet(ZTT.typesForTile(WILD, [
        { id: 1, color: null, done: false },
        { id: 2, color: 'hydra', done: false },
        { id: 3, color: null, done: true, completionValue: 'gorgon' }
    ], M),
    ['cyclops', 'minotaur', 'chimera', 'siren'],
    'a sibling any-tile excludes the type it was already fulfilled with');

// === targetsForTile ===

const BOARD = [
    { id: 10, type: 'hydra' },
    { id: 11, type: 'hydra' },
    { id: 12, type: 'siren' },
    { id: 13, type: 'gorgon' },
    { id: 14, type: 'minotaur' }
];

sameSet(ZTT.targetsForTile(HYDRA, hand(), BOARD, M), [10, 11], 'named tile targets every live monster of its type');
sameSet(ZTT.targetsForTile(WILD, hand(), BOARD, M), [13, 14], 'any-tile targets only unclaimed live types');
sameSet(ZTT.targetsForTile(SIREN, hand(), [], M), [], 'no live monsters means no targets');
sameSet(ZTT.targetsForTile({ id: 2, color: 'hydra', done: true }, hand({ 2: { done: true } }), BOARD, M),
    [], 'completed tile targets nothing');

// === tileForType (reverse: which tile does defeating this monster credit) ===

eq(ZTT.tileForType('hydra', hand()), 2, 'exact match beats the any-tile');
eq(ZTT.tileForType('gorgon', hand()), 1, 'an unclaimed type falls through to the any-tile');
eq(ZTT.tileForType('hydra', hand({ 2: { done: true } })), null,
    'once the hydra tile is done, hydras credit nothing (still a sibling colour)');
eq(ZTT.tileForType('gorgon', hand({ 1: { done: true, completionValue: 'chimera' } })), null,
    'a spent any-tile leaves nothing to credit');
eq(ZTT.tileForType('cyclops', [
        { id: 1, color: null, done: true, completionValue: 'cyclops' },
        { id: 2, color: 'hydra', done: false },
        { id: 3, color: 'siren', done: false }
    ]), null, 'a type already used on the any-tile credits nothing');

// === the same rule over offering colours ===
// Offerings have the identical shape: one "any" tile plus two flipped colours,
// and the server completes them through the very same
// findCompletableZeusTileForType. Only the universe of values differs.
sameSet(ZTT.OFFERING_COLORS, ['red', 'yellow', 'green', 'blue', 'pink', 'black'],
    'OFFERING_COLORS mirrors MaterialDefs::COLORS');

const C = ZTT.OFFERING_COLORS;
const OFF = [
    { id: 1, color: null,   done: false },
    { id: 2, color: 'blue', done: false },
    { id: 3, color: 'pink', done: false },
];

sameSet(ZTT.typesForTile(OFF[1], OFF, C), ['blue'], 'a named offering tile wants only its own colour');
sameSet(ZTT.typesForTile(OFF[0], OFF, C), ['red', 'yellow', 'green', 'black'],
    'the any offering tile wants every colour its siblings do not claim');
eq(ZTT.tileForType('blue', OFF), 2, 'delivering blue credits the blue tile, not the any tile');
eq(ZTT.tileForType('green', OFF), 1, 'an unclaimed colour falls through to the any tile');
eq(ZTT.tileForType('blue', [
        { id: 1, color: null, done: false },
        { id: 2, color: 'blue', done: true },
        { id: 3, color: 'pink', done: false },
    ]), null, 'once the blue tile is done, blue credits nothing');

// The universe is what makes one rule serve both; nothing leaks between them.
sameSet(ZTT.typesForTile(OFF[0], OFF, C).filter(v => M.indexOf(v) >= 0), [],
    'no monster type ever appears in an offering answer');

console.log((fail === 0 ? 'PASS' : 'FAIL') + ': ZeusTaskTargets  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
