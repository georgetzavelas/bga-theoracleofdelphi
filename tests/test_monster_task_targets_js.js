/**
 * Unit test for MonsterTaskTargets.js (pure Zeus monster-tile matching, used
 * by the hover/pin highlight that lights the monsters a task still needs).
 *
 * Mirrors Game::findCompletableZeusTileForType — exact task_color match first,
 * then the "any" tile, gated by sibling exclusion.
 * Run: node tests/test_monster_task_targets_js.js
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
    fs.readFileSync(path.join(__dirname, '..', 'modules', 'js', 'MonsterTaskTargets.js'), 'utf8'),
    sandbox
);
const MTT = sandbox.captured;
ok(MTT && typeof MTT.typesForTile === 'function', 'MonsterTaskTargets module loaded');
sameSet(MTT.MONSTER_TYPES,
    ['cyclops', 'minotaur', 'chimera', 'hydra', 'gorgon', 'siren'],
    'MONSTER_TYPES mirrors MaterialDefs::MONSTERS');

// --- Fixture: the standard hand of three monster tiles ---
// Every player gets the same two flipped types plus one "any" tile.
const WILD = { id: 1, color: null, done: false };
const HYDRA = { id: 2, color: 'hydra', done: false };
const SIREN = { id: 3, color: 'siren', done: false };
function hand(over) { return [WILD, HYDRA, SIREN].map(function (t) { return Object.assign({}, t, (over || {})[t.id]); }); }

// === typesForTile ===

sameSet(MTT.typesForTile(HYDRA, hand()), ['hydra'], 'named tile wants only its own type');

sameSet(MTT.typesForTile(WILD, hand()),
    ['cyclops', 'minotaur', 'chimera', 'gorgon'],
    'any-tile wants every type its siblings do not claim');

sameSet(MTT.typesForTile({ id: 2, color: 'hydra', done: true }, hand({ 2: { done: true } })),
    [], 'completed tile wants nothing');

sameSet(MTT.typesForTile(WILD, hand({ 3: { done: true } })),
    ['cyclops', 'minotaur', 'chimera', 'gorgon'],
    'a completed sibling still excludes its type from the any-tile');

sameSet(MTT.typesForTile(WILD, [
        { id: 1, color: null, done: false },
        { id: 2, color: 'hydra', done: false },
        { id: 3, color: null, done: true, completionValue: 'gorgon' }
    ]),
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

sameSet(MTT.targetsForTile(HYDRA, hand(), BOARD), [10, 11], 'named tile targets every live monster of its type');
sameSet(MTT.targetsForTile(WILD, hand(), BOARD), [13, 14], 'any-tile targets only unclaimed live types');
sameSet(MTT.targetsForTile(SIREN, hand(), []), [], 'no live monsters means no targets');
sameSet(MTT.targetsForTile({ id: 2, color: 'hydra', done: true }, hand({ 2: { done: true } }), BOARD),
    [], 'completed tile targets nothing');

// === tileForType (reverse: which tile does defeating this monster credit) ===

eq(MTT.tileForType('hydra', hand()), 2, 'exact match beats the any-tile');
eq(MTT.tileForType('gorgon', hand()), 1, 'an unclaimed type falls through to the any-tile');
eq(MTT.tileForType('hydra', hand({ 2: { done: true } })), null,
    'once the hydra tile is done, hydras credit nothing (still a sibling colour)');
eq(MTT.tileForType('gorgon', hand({ 1: { done: true, completionValue: 'chimera' } })), null,
    'a spent any-tile leaves nothing to credit');
eq(MTT.tileForType('cyclops', [
        { id: 1, color: null, done: true, completionValue: 'cyclops' },
        { id: 2, color: 'hydra', done: false },
        { id: 3, color: 'siren', done: false }
    ]), null, 'a type already used on the any-tile credits nothing');

console.log((fail === 0 ? 'PASS' : 'FAIL') + ': MonsterTaskTargets  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
