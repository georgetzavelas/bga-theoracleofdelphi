/**
 * A white task pip shows the colour already heading for it.
 *
 * An "any colour" Zeus tile renders as a white pip and stays white until the
 * task is finished, at which point it takes the colour it was spent on
 * (completionValue). But the colour is decided earlier than that: the moment
 * cargo is loaded, CargoNeeds::assign has allocated it to a tile, and the load
 * gate already treats that tile as spoken for — SelectAction refuses a second
 * colour that would want the same wildcard, with the reason 'reserved'. The
 * panel was the only place that did not know.
 *
 * So the pip gains a middle state. White, then half-filled with a soft tint of
 * the claiming colour, then filled with it outright. The white half is what
 * keeps saying "this slot is still wild"; nothing has been spent until
 * delivery. The glyph and the full fill are covered in
 * test_task_pip_glyph_js.js; this file is about WHICH pip takes a claim.
 *
 * What the tests pin, and why each one is here:
 *
 *   - Only an OPEN WILDCARD tile can be claimed. A fixed-colour pip already
 *     wears its colour, and a done pip already tells the whole story; marking
 *     either would be a second colour competing with the one that is true.
 *   - claimedColor never overrides completionValue on a done tile, which is
 *     the same attribute channel and would otherwise repaint finished work.
 *   - The CSS paints the claim without touching the background, so the top
 *     half is literally the untouched wild pip rather than a lighter tint of
 *     the claiming colour.
 *   - Every colour the game uses has a claim rule. A missing one fails open
 *     to a transparent gradient, i.e. an invisible claim.
 *
 * Run: node tests/test_claimed_pip_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const COMPONENTS = fs.readFileSync(path.join(ROOT, 'modules/js/Components.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.css'), 'utf8');

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

/** Pull one `name: function(...) { ... }` out of Components.js by brace depth. */
function extractMethod(src, name) {
    const start = src.indexOf(name + ': function');
    if (start < 0) throw new Error('method not found: ' + name);
    let i = src.indexOf('{', start);
    let depth = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(start, i + 1);
}

const renderColorColumn = new Function(
    'return { ' + extractMethod(COMPONENTS, '_renderColorColumn') + ' };'
)()._renderColorColumn;

/** data-color / data-claimed for each pip, in order. */
function pips(tiles) {
    const html = renderColorColumn.call({}, 7, 'offering', tiles);
    // The class-name boundary matters: `delphi-pp-task-pips` is the row that
    // wraps them, and a loose prefix match would count it as a fourth pip.
    return html.match(/<div class="delphi-pp-task-pip(?:["\s][^>]*)?>/g).map((tag) => ({
        color: (tag.match(/data-color="([^"]*)"/) || [])[1],
        claimed: (tag.match(/data-claimed="([^"]*)"/) || [])[1],
        done: /\bdone\b/.test(tag),
    }));
}

const tile = (o) => Object.assign(
    { id: 1, color: null, completionValue: null, claimedColor: null, done: false }, o);

// ============ 1. the claim colours an open wildcard pip =====================
{
    const p = pips([
        tile({ id: 1, color: null, claimedColor: 'red' }),
        tile({ id: 2, color: null }),
        tile({ id: 3, color: null }),
    ]);
    check(p[0].color === 'any' && p[0].claimed === 'red',
        'a claimed wildcard pip stays data-color="any" and gains data-claimed — '
        + 'the white ground is what still reads as wild');
    check(p[1].claimed === undefined && p[2].claimed === undefined,
        'unclaimed wildcards carry no claim attribute at all');
}

// ============ 2. a fixed-colour tile is marked too ==========================
{
    // CargoNeeds::assign matches exact colour BEFORE wildcard, so loading a red
    // offering with a red tile open claims the RED tile, not the white one.
    //
    // This pip used to be skipped on the grounds that it already wore its
    // colour, which was true while fixed-colour pips were painted at the deal.
    // They start white now, so skipping it meant loading an offering changed
    // nothing on screen at all — the reported bug.
    const p = pips([
        tile({ id: 1, color: 'red', claimedColor: 'red' }),
        tile({ id: 2, color: 'yellow' }),
        tile({ id: 3, color: null }),
    ]);
    check(p[0].claimed === 'red',
        `a claimed fixed-colour pip half-fills like any other, got "${p[0].claimed}"`);
    check(p[0].color === 'red', 'and keeps its own colour on the data-color channel');
    check(p[1].claimed === undefined, 'an unclaimed fixed pip is untouched');
    check(p[2].claimed === undefined,
        'and the wildcard beside it stays empty, which is the whole point of '
        + 'the exact-colour-first rule');
}

// ============ 2b. the half-fill is not a wildcard-only rule =================
{
    // The CSS selector has to widen with the renderer, or a fixed-colour pip
    // carries data-claimed and still paints nothing.
    const claimRule = (CSS.match(
        /\.delphi-pp-task-pip\.color\[data-claimed\]\s*\{([^}]*)\}/) || [])[1];
    check(!!claimRule,
        'the half-fill rule matches any claimed colour pip, not only a wildcard');
    check(!!claimRule && /linear-gradient/.test(claimRule),
        'and still paints the claim as a gradient stop');
    const COLORS2 = ['red', 'yellow', 'green', 'blue', 'pink', 'black'];
    const missing2 = COLORS2.filter((c) => !new RegExp(
        '\\.delphi-pp-task-pip\\.color\\[data-claimed="' + c + '"\\]').test(CSS));
    check(missing2.length === 0,
        'every colour has a wildcard-independent claim rule (missing: '
        + missing2.join(', ') + ')');
}

// ============ 3. a finished tile keeps telling its own story ================
{
    const p = pips([
        tile({ id: 1, color: null, completionValue: 'green', claimedColor: 'blue', done: true }),
        tile({ id: 2, color: null }),
        tile({ id: 3, color: null }),
    ]);
    check(p[0].color === 'green' && p[0].claimed === undefined,
        'a done wildcard shows what it was spent on, never a stale claim');
    check(p[0].done, 'and keeps its done class, which is what fills the pip');
}

// ============ 4. missing tiles still render empty slots =====================
{
    const p = pips([tile({ id: 1, color: null, claimedColor: 'pink' })]);
    check(p.length === 3, 'the column is always three pips wide');
    check(p[1].color === undefined && p[2].color === undefined,
        'the two placeholder pips carry no colour data');
}

// ============ 5. the CSS half-fills without repainting the pip ==============
{
    const rule = (CSS.match(
        /\.delphi-pp-task-pip\.color\[data-claimed\]\s*\{([^}]*)\}/) || [])[1];
    check(!!rule, 'there is a rule for a claimed pip');
    check(!!rule && /linear-gradient/.test(rule),
        'it paints the claim as a gradient stop rather than a flat fill, so '
        + 'the pip is half one colour and half the original white');
    check(!!rule && /50%/.test(rule),
        'and stops at the halfway mark — a claim is halfway to a completion');
    // The wildcard keeps its neutral ring while claimed. The half-fill and the
    // glyph say which colour is coming; the ring goes on saying the slot will
    // take anything, which is still true until the cargo is delivered.
    const anyRing = (CSS.match(
        /\.delphi-pp-task-pip\.color\[data-color="any"\]\s*\{([^}]*)\}/) || [])[1];
    check(!!anyRing && /--pip-ring/.test(anyRing),
        'an open wildcard sets its own neutral ring');
    check(!!rule && !/background-color/.test(rule),
        'it never sets background-color, which would replace the white ground '
        + 'the top half depends on');

    const COLORS = ['red', 'yellow', 'green', 'blue', 'pink', 'black'];
    const missing = COLORS.filter((c) => !new RegExp(
        '\\[data-claimed="' + c + '"\\]').test(CSS));
    check(missing.length === 0,
        'every die colour has a claim rule (missing: ' + missing.join(', ') + ') — '
        + 'one without would fail open to a transparent gradient, an invisible claim');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
