/**
 * A task pip keeps one shape for its whole life; only the fill climbs.
 *
 * Pips used to be painted with their colour from the moment the board was
 * dealt, so a column said almost nothing about progress: a red offering pip
 * looked the same before and after it was delivered apart from a tick. Now
 * every pip starts white and fills as the work happens.
 *
 *   open      white ground, ink glyph, ring in the task colour
 *   claimed   bottom half in the task colour, glyph white across that half
 *   done      full colour, glyph white throughout, no tick
 *
 * The glyph is the oracle die face for that colour, the symbol the game
 * already uses for it. It is painted through a CSS mask rather than dropped
 * in as an image, which is what lets one asset recolour as the fill rises.
 *
 * TWO masked layers, not one. The lower is the ink glyph on the white ground;
 * the upper is the same glyph in the colour that reads on the fill, clipped to
 * exactly the height the fill has reached. So the fill line cuts the glyph
 * rather than obscuring it, and a half-filled pip is a literal preview of the
 * finished one.
 *
 * Two things the tests exist to hold:
 *
 *   - WHICH colour a pip is about is decided in one place, the renderer, and
 *     published as data-glyph. A wildcard has no glyph until cargo claims it,
 *     then wears the claiming colour, then the colour it was spent on.
 *   - Every colour is complete across all four custom properties. A missing
 *     one fails silently: no mask is an invisible glyph, no fill is a pip that
 *     never completes.
 *
 * Run: node tests/test_task_pip_glyph_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const COMPONENTS = fs.readFileSync(path.join(ROOT, 'modules/js/Components.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.css'), 'utf8');

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

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

const COLORS = ['red', 'yellow', 'green', 'blue', 'pink', 'black'];

const renderColorColumn = new Function(
    'return { ' + extractMethod(COMPONENTS, '_renderColorColumn') + ' };'
)()._renderColorColumn;

function pips(tiles) {
    const html = renderColorColumn.call({}, 7, 'offering', tiles);
    return html.match(/<div class="delphi-pp-task-pip(?:["\s][^>]*)?>/g).map((tag) => ({
        tag,
        color: (tag.match(/data-color="([^"]*)"/) || [])[1],
        claimed: (tag.match(/data-claimed="([^"]*)"/) || [])[1],
        glyph: (tag.match(/data-glyph="([^"]*)"/) || [])[1],
        done: /\bdone\b/.test(tag),
    }));
}
const tile = (o) => Object.assign(
    { id: 1, color: null, completionValue: null, claimedColor: null, done: false }, o);

// ---- which colour is this pip about? --------------------------------------
{
    // A fixed-colour tile knows from the start. That is the case the player
    // reads before doing anything: an empty column that already says which
    // colours it wants.
    const p = pips([tile({ id: 1, color: 'red' }), tile({ id: 2, color: 'black' }),
                    tile({ id: 3, color: null })]);
    check(p[0].glyph === 'red', `a fixed-colour pip carries its glyph, got "${p[0].glyph}"`);
    check(p[1].glyph === 'black', 'each one its own');
    check(p[2].glyph === undefined,
        'and an untouched wildcard carries none, because nothing has decided '
        + 'its colour yet');
}
{
    // Loading cargo decides it. Statues are always wild, so this is the only
    // way a statue pip ever shows a glyph before it is finished.
    const p = pips([tile({ id: 1, color: null, claimedColor: 'green' }),
                    tile({ id: 2, color: null }), tile({ id: 3, color: null })]);
    check(p[0].glyph === 'green',
        `a claimed wildcard takes the claiming colour's glyph, got "${p[0].glyph}"`);
    check(p[0].color === 'any' && p[0].claimed === 'green',
        'while staying data-color="any", so the ground still reads as wild');
}
{
    const p = pips([
        tile({ id: 1, color: null, completionValue: 'blue', done: true }),
        tile({ id: 2, color: 'pink', done: true }),
        tile({ id: 3, color: null }),
    ]);
    check(p[0].glyph === 'blue', 'a finished wildcard shows what it was spent on');
    check(p[1].glyph === 'pink', 'a finished fixed pip keeps its own colour');
}
{
    // A claim must never outrank what actually happened. Same trap the
    // data-color channel has: a stale claim repainting finished work.
    const p = pips([
        tile({ id: 1, color: null, completionValue: 'green', claimedColor: 'blue', done: true }),
        tile({ id: 2, color: 'red', claimedColor: 'red' }),
        tile({ id: 3, color: null }),
    ]);
    check(p[0].glyph === 'green',
        `a done pip shows the spent colour, never a stale claim, got "${p[0].glyph}"`);
    // A fixed pip's glyph comes from its own colour, so a claim cannot change
    // it. The claim still lands: it is what half-fills the pip.
    check(p[1].glyph === 'red' && p[1].claimed === 'red',
        'a claim half-fills a fixed-colour pip without touching its glyph');
}

// ---- the tick is gone; the fill is the completion signal -------------------
{
    check(!/\.delphi-pp-task-pip\.color\.done::before/.test(CSS),
        'no ::before tick rule remains for a colour pip');
    check(!/content: '✓'/.test(CSS) || !/task-pip\.color/.test(
            (CSS.match(/[^}]*content: '✓'[^}]*/) || [''])[0]),
        'and no tick content is left behind on one');
}

// ---- every colour is complete across all four properties ------------------
{
    const props = ['--pip-glyph', '--pip-ring', '--pip-fill'];
    props.forEach(function(prop) {
        const missing = COLORS.filter(function(c) {
            const rule = (CSS.match(new RegExp(
                '\\[data-glyph="' + c + '"\\][^{]*\\{([^}]*)\\}', 'g')) || []).join(' ');
            return rule.indexOf(prop) === -1;
        });
        check(missing.length === 0,
            `every colour defines ${prop} (missing: ${missing.join(', ') || 'none'})`);
    });
}
{
    // The mask is what makes one asset serve three states. A background-image
    // would paint the die face in its own ink and could not flip to white on a
    // filled pip.
    // Both layers share one geometry rule, so the shapes cannot fall out of
    // register with each other.
    const geom = (CSS.match(
        /\.delphi-pp-task-pip\[data-glyph\]::after,[^{]*\{([^}]*)\}/) || [])[1];
    check(!!geom, 'the glyph layers share one geometry rule');
    check(!!geom && /-webkit-mask-image/.test(geom) && /\bmask-image/.test(geom),
        'as a mask, prefixed and unprefixed, so Safari paints it too');
    check(!!geom && /var\(--pip-glyph\)/.test(geom),
        'taking its shape from the per-colour custom property');
    check(!!geom && !/background-image/.test(geom),
        'and never as a background-image, which could not recolour');
    check(/\.delphi-pp-task-pip\[data-glyph\]::after\s*\{[^}]*--pp-ink/.test(CSS),
        'the lower layer is ink, which is what a white or half-filled pip shows');
}

// ---- the glyph has to read against whatever is behind it ------------------
{
    // Yellow and pink are light enough that a white glyph vanishes on them.
    // Every other colour takes white. Getting this wrong is invisible in code
    // review and obvious on screen.
    const lightFills = (CSS.match(
        /--pip-glyph-on-fill:\s*var\(--pp-ink[^)]*\)/g) || []).length;
    check(lightFills >= 2,
        `the light fills override the glyph to ink, found ${lightFills}`);
    const yellow = (CSS.match(/\[data-glyph="yellow"\][^{]*\{([^}]*)\}/g) || []).join(' ');
    check(/--pip-glyph-on-fill/.test(yellow),
        'yellow in particular, where a white glyph on a full pip disappears');
}

// ---- the fill line cuts the glyph rather than covering it -----------------
{
    // The upper layer is the same shape in the on-fill colour, clipped to the
    // height the fill has reached. Without the clip it would paint over the
    // whole glyph and a half-filled pip would read as finished.
    const onFill = CSS.match(
        /\.delphi-pp-task-pip\.color\[data-glyph\][^{]*::before[^{]*\{([^}]*)\}/g) || [];
    check(onFill.length > 0, 'there is a second, on-fill glyph layer');
    const all = onFill.join(' ');
    check(/var\(--pip-glyph-on-fill/.test(all),
        'painted in the colour that reads against the fill');
    check(/clip-path/.test(all), 'and clipped rather than drawn whole');
    check(/inset\(50%/.test(all),
        'the claimed layer is clipped to the bottom half, matching the fill');

    // The claim is the FULL colour now, not a tint: the bottom half of a
    // claimed pip is exactly what the finished pip will look like.
    check(!/--pip-fill-soft/.test(CSS),
        'the soft tint is gone, so the half really previews the finish');
    const claim = (CSS.match(
        /\.delphi-pp-task-pip\.color\[data-claimed="red"\]\s*\{([^}]*)\}/) || [])[1];
    check(!!claim && /var\(--pip-fill\)/.test(claim),
        `a claim half-fills with the finished colour, got: ${claim}`);
}

// ---- the pip is big enough to carry a glyph, and still fits ---------------
{
    const rule = (CSS.match(/\.delphi-pp-task-pip\s*\{([^}]*)\}/) || [])[1] || '';
    const size = parseFloat((rule.match(/width:\s*([\d.]+)px/) || [])[1]);
    check(size >= 14, `the pip grew enough to show a glyph, got ${size}px`);
    // The task column is 52px: a 240px panel, less 20px padding, less three
    // 4px gaps, over four columns. Three pips and two 2px gaps must fit it.
    check(size * 3 + 4 <= 52,
        `three pips plus their gaps still fit the 52px column, need ${size * 3 + 4}px`);
}

// ---- motion is opt-out, like everything else that moves here --------------
{
    check(/motion-reduced-pref[^{]*pp-(claim|fill)/.test(CSS)
       || /motion-reduced-pref[^{]*task-pip/.test(CSS),
        'the pip animations are disabled under the reduced-motion preference');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
