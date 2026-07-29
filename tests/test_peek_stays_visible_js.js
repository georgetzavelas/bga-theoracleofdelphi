/**
 * Peeked islands stay face up on touch clients, and still flip back on pointer
 * clients.
 *
 * On a pointer device you recall a past peek by hovering the island for its
 * "Peeked Shrine Island" tooltip. Touch has no hover, so that recall path does
 * not exist and the island face has to stay visible instead.
 *
 * Drives the REAL shipped _isTouchLikeClient / _settlePeekedShrines and asserts
 * the CSS contract the face-up state depends on.
 *
 * Run: node tests/test_peek_stays_visible_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.css'), 'utf8');
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

function shrine(overlay) {
    const el = { dataset: { overlay: overlay }, classes: new Set(['shrine-' + overlay]) };
    el.classList = {
        add: (...c) => c.forEach(x => el.classes.add(x)),
        remove: (...c) => c.forEach(x => el.classes.delete(x)),
        contains: (c) => el.classes.has(c),
    };
    return el;
}

/** hover: 'none' models a touch client, 'hover' a pointer client. */
function makeGame(touchLike) {
    const METHODS = ['_isTouchLikeClient', '_settlePeekedShrines']
        .map(extractMethod).join('\n');
    const game = new Function(`return { ${METHODS} };`)();
    global.window = { matchMedia: (q) => ({ matches: touchLike, media: q }) };
    // A peeked island as it stands the instant the peek ends: face up, overlay
    // painted, marked as private knowledge.
    const el = shrine('red-psi');
    el.classList.add('shrine-revealed', 'shrine-peeked');
    game.components = { shrines: new Map([[1, el]]) };
    game._peekedShrineIds = [1];
    game.el = el;
    return game;
}

// ---------- touch client: the island stays face up ----------
{
    const game = makeGame(true);
    check(game._isTouchLikeClient() === true, 'a hover-less client reads as touch-like');
    game._settlePeekedShrines();
    check(game.el.classList.contains('shrine-revealed'),
        'the island stays face up when the peek ends');
    check(game.el.classList.contains('shrine-red-psi'),
        'its overlay art is kept');
    check(game.el.dataset.overlay === 'red-psi', 'the overlay record is kept');
    check(!game.el.classList.contains('shrine-unknown'),
        'it is not reverted to the unknown back face');
    check(game.el.classList.contains('shrine-peeked'),
        'it stays marked as private knowledge, not as explored');
    check(game._peekedShrineIds === null, 'the live peek list is cleared either way');
}

// ---------- pointer client: unchanged, it flips back ----------
{
    const game = makeGame(false);
    check(game._isTouchLikeClient() === false, 'a hover-capable client is not touch-like');
    game._settlePeekedShrines();
    check(!game.el.classList.contains('shrine-revealed'),
        'a pointer client still flips the island back');
    check(game.el.classList.contains('shrine-unknown'),
        'the unknown back face is restored');
    check(!game.el.classList.contains('shrine-red-psi'), 'the overlay art is removed');
    check(game.el.dataset.overlay === 'unknown', 'the overlay record is reset');
    check(game._peekedShrineIds === null, 'the live peek list is cleared');
}

// ---------- no matchMedia: fail closed to the old behaviour ----------
{
    const METHODS = ['_isTouchLikeClient', '_settlePeekedShrines']
        .map(extractMethod).join('\n');
    const game = new Function(`return { ${METHODS} };`)();
    global.window = {};
    check(game._isTouchLikeClient() === false,
        'without matchMedia it fails closed to the pointer behaviour');
}

// ---------- reload path is gated by the same test ----------
{
    // The setup renderer must consult the same capability, or a touch client
    // would lose its face-up islands on refresh (and a desktop would gain them).
    check(/privatelyKnown = !isRevealed[\s\S]{0,160}_isTouchLikeClient\(\)/.test(SRC),
        'the reload renderer gates privately-known islands on the same capability');
}

// ---------- CSS contract ----------
{
    // The base rule hides the eye marker on ANY revealed shrine, which was safe
    // while revealed only meant explored. A privately-known island is revealed
    // too now, so the marker needs an explicit override or the distinction dies.
    check(/\.delphi-shrine\.shrine-revealed \.shrine-peek-marker \{\s*display: none/.test(CSS),
        'the base marker-hide rule still exists (the reason the override is needed)');
    check(/body\.delphi-touch \.delphi-shrine\.shrine-peeked\.shrine-revealed \.shrine-peek-marker \{\s*display: block/.test(CSS),
        'the marker is forced visible for privately-known islands on touch');
    // And a visual separator from a genuinely explored island.
    const rim = CSS.match(/body\.delphi-touch \.delphi-shrine\.shrine-peeked\.shrine-revealed \{([^}]*)\}/);
    check(!!rim && /outline/.test(rim[1]),
        'privately-known islands carry a rim distinguishing them from explored ones');
    // Both must be scoped to touch so pointer clients are visually untouched.
    check(!/^\.delphi-shrine\.shrine-peeked\.shrine-revealed \{/m.test(CSS),
        'the rim is not applied unscoped (pointer clients keep their look)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
