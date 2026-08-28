/**
 * Unit test for ShrineTaskTargets.js — locating the island behind one of your
 * shrine Zeus tiles, and how you came to know about it.
 *
 * Two states reach the player differently and mean different actions:
 *   discovered — another player explored it. Public. Sail there and Build.
 *                (Exploring your OWN shrine island builds it on the spot, see
 *                 ExploreIsland::buildOwnShrine, so this state only ever comes
 *                 from someone else's exploration.)
 *   peeked     — only you know. Sail there and Explore, which builds it.
 *
 * Run: node tests/test_shrine_task_targets_js.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { console.log('  FAIL: ' + msg); fail++; } }
function eq(a, b, msg) { ok(a === b, msg + '  (got ' + a + ' want ' + b + ')'); }

const sandbox = { console, captured: null, define(_d, f) { sandbox.captured = f(); } };
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'modules', 'js', 'ShrineTaskTargets.js'), 'utf8'),
    sandbox
);
const STT = sandbox.captured;
ok(STT && typeof STT.locate === 'function', 'ShrineTaskTargets module loaded');

// --- Board fixture. I am the blue player: omega, phi, sigma. -----------------
// The server fills shrineGameColor + shrineLetter on an UNREVEALED hex only
// when this player has peeked it, so that pairing is the "privately known"
// signal. isRevealed arrives as a DB string on load and as a number from the
// islandRevealed notif, so both shapes have to work.
const HEXES = [
    { q: 1, r: 1, color: 'red',   isRevealed: '1', shrineGameColor: 'blue',  shrineLetter: 'omega' },
    { q: 2, r: 2, color: 'green', isRevealed: '0', shrineGameColor: 'blue',  shrineLetter: 'phi'   },
    { q: 3, r: 3, color: 'blue',  isRevealed: '0', shrineGameColor: null,    shrineLetter: null    },
    { q: 4, r: 4, color: 'pink',  isRevealed: '1', shrineGameColor: 'green', shrineLetter: 'sigma' },
    { q: 5, r: 5, color: 'black', isRevealed: '0', shrineGameColor: 'empty', shrineLetter: null    },
];

// === locate ===

const disc = STT.locate('omega', 'blue', HEXES);
ok(disc !== null, 'a revealed island of my colour and letter is located');
eq(disc.state, 'discovered', 'a revealed island reads as discovered');
eq(disc.q, 1, 'it carries its hex q');
eq(disc.r, 1, 'it carries its hex r');
eq(disc.dieColor, 'red',
    'dieColor is the hex exploration colour, which is the die you need to build there');

const peeked = STT.locate('phi', 'blue', HEXES);
ok(peeked !== null, 'an island I peeked is located');
eq(peeked.state, 'peeked', 'an unrevealed island I know the identity of reads as peeked');
eq(peeked.dieColor, 'green', 'the peeked island carries its die colour too');

eq(STT.locate('sigma', 'blue', HEXES), null,
    'my sigma island is neither explored nor peeked, so there is nothing to point at');

eq(STT.locate('sigma', 'green', HEXES) === null, false,
    'the same letter for a different colour is a different island');

eq(STT.locate('omega', 'red', HEXES), null,
    "another player's letter does not match my colour's island");

// isRevealed also arrives as a number from notif_islandRevealed.
eq(STT.locate('omega', 'blue',
        [{ q: 9, r: 9, color: 'red', isRevealed: 1, shrineGameColor: 'blue', shrineLetter: 'omega' }]).state,
    'discovered', 'isRevealed works as a number as well as a DB string');

eq(STT.locate('omega', 'empty', HEXES), null,
    "the legacy 'empty' owner colour never matches");

eq(STT.locate(null, 'blue', HEXES), null, 'no letter, nothing to locate');

// === letterForHex (reverse: hovering the island) ===

eq(STT.letterForHex(HEXES[0], 'blue'), 'omega', 'a revealed island of mine names its letter');
eq(STT.letterForHex(HEXES[1], 'blue'), 'phi', 'a peeked island of mine names its letter too');
eq(STT.letterForHex(HEXES[2], 'blue'), null, 'an island I know nothing about names nothing');
eq(STT.letterForHex(HEXES[3], 'blue'), null, "another player's island is not mine to build");
eq(STT.letterForHex(HEXES[4], 'blue'), null, "a taskless 'empty' island names nothing");

console.log((fail === 0 ? 'PASS' : 'FAIL') + ': ShrineTaskTargets  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
