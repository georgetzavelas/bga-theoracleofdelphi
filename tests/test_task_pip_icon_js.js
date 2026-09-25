/**
 * A task pip carries its task's piece art and keeps one shape for its whole
 * life; only the fill climbs.
 *
 *   open      white ground, icon and ring in the colour it is about
 *   claimed   bottom half in that colour, the icon white across that half
 *   done      full colour, icon white throughout, no tick
 *
 * The icon is the task's own piece (shrine, monster, statue, offering), the
 * art the panel used to show once per task in a bigger circle above the pips.
 * Every pip carries it now, so those circles are gone and the task row is
 * about half as tall.
 *
 * It is painted through a CSS mask in TWO layers: the task colour underneath,
 * and on top
 * the same shape in the colour that reads on the fill, clipped to exactly the
 * height the fill has reached. The fill line cuts the icon rather than hiding
 * it, so a half-filled pip previews the finished one.
 *
 * Which colour a pip is about is decided in one place, the renderer, and
 * published as data-hue. A fixed tile knows from the deal; a wildcard knows
 * nothing until cargo claims it, then wears that colour, then the colour it
 * was spent on. A shrine is about its owner's colour, which it fills with.
 *
 * Run: node tests/test_task_pip_icon_js.js
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
const TASKS = ['shrine', 'monster', 'statue', 'offering'];

const panel = new Function('_t', 'return { SHRINE_GLYPHS: { omega: "Ω", phi: "Φ", sigma: "Σ", psi: "Ψ" }, '
    + extractMethod(COMPONENTS, '_renderColorColumn') + ', '
    + extractMethod(COMPONENTS, '_renderShrineColumn') + ', '
    + extractMethod(COMPONENTS, '_playerHue') + ' };')((s) => s);

function pips(html) {
    return html.match(/<div class="delphi-pp-task-pip(?:["\s][^>]*)?>/g).map((tag) => ({
        tag,
        color: (tag.match(/data-color="([^"]*)"/) || [])[1],
        claimed: (tag.match(/data-claimed="([^"]*)"/) || [])[1],
        hue: (tag.match(/data-hue="([^"]*)"/) || [])[1],
        title: (tag.match(/title="([^"]*)"/) || [])[1],
        done: /\bdone\b/.test(tag),
    }));
}
const tile = (o) => Object.assign(
    { id: 1, color: null, completionValue: null, claimedColor: null, done: false }, o);
const colorPips = (tiles) => pips(panel._renderColorColumn(7, 'offering', tiles));

// ---- which colour is this pip about? --------------------------------------
{
    const p = colorPips([tile({ id: 1, color: 'red' }), tile({ id: 2, color: 'black' }),
                         tile({ id: 3, color: null })]);
    check(p[0].hue === 'red' && p[1].hue === 'black', 'a fixed tile knows its colour from the deal');
    check(p[2].hue === undefined, 'an untouched wildcard has no colour yet');
}
{
    const p = colorPips([tile({ id: 1, color: null, claimedColor: 'green' }),
                         tile({ id: 2, color: 'pink', claimedColor: 'pink' }),
                         tile({ id: 3, color: null })]);
    check(p[0].hue === 'green' && p[0].claimed === 'green', 'a claimed wildcard wears the claim');
    check(p[0].color === 'any', 'while staying data-color="any", so the ring stays neutral');
    check(p[1].hue === 'pink' && p[1].claimed === 'pink',
        'a fixed tile with its cargo aboard is claimed too (exact colour is matched first)');
}
{
    const p = colorPips([
        tile({ id: 1, color: null, completionValue: 'green', claimedColor: 'blue', done: true }),
        tile({ id: 2, color: 'red', done: true }),
        tile({ id: 3, color: null }),
    ]);
    check(p[0].hue === 'green' && p[0].claimed === undefined,
        'a finished wildcard shows what it was spent on, never a stale claim');
    check(p[1].hue === 'red' && p[1].done, 'a finished fixed tile keeps its colour');
}

// ---- shrines ----------------------------------------------------------------
{
    const html = panel._renderShrineColumn(7, [
        { id: 1, letter: 'omega', done: false },
        { id: 2, letter: 'phi', done: true },
        { id: 3, letter: 'psi', done: false },
    ], '#ffc107');
    const p = pips(html);
    check(p.every((x) => x.hue === 'yellow'), 'a shrine is about its owner\'s colour');
    check(p[0].title === 'Ω shrine' && p[1].title === 'Φ shrine',
        `the letter moves to the pip's title, got ${JSON.stringify(p.map((x) => x.title))}`);
    check(!/data-letter/.test(html), 'and is no longer drawn inside the pip');
    check(p[1].done && !p[0].done, 'a built shrine is done');
}
{
    check(panel._playerHue('#dc3545') === 'red' && panel._playerHue('#007bff') === 'blue'
          && panel._playerHue('#28a745') === 'green' && panel._playerHue('#ffc107') === 'yellow',
        'the four player colours map to their hue');
    check(panel._playerHue('#abcdef') === '', 'an unknown colour maps to nothing, not a guess');
}

// ---- the big circles are gone -------------------------------------------------
{
    check(!/delphi-pp-task-icon/.test(panel._renderColorColumn(7, 'offering', [tile({})])),
        'a colour column renders no separate task circle');
    check(!/delphi-pp-task-icon/.test(panel._renderShrineColumn(7, [], '#dc3545')),
        'nor does the shrine column');
    check(!/\.delphi-pp-task-icon/.test(CSS), 'and its rules are gone from the stylesheet');
}

// ---- the icon: per task, masked, two layers, on top in the right order -------
{
    TASKS.forEach(function(t) {
        check(new RegExp('\\[data-task="' + t + '"\\]\\s+\\.delphi-pp-task-pip\\s*\\{[^}]*--pip-icon:\\s*url\\([\'"]?img/pieces/' + t + '\\.png').test(CSS),
            `the ${t} column's pips carry the ${t} piece art`);
    });
    const geom = (CSS.match(/\.delphi-pp-task-pip\[data-tile-id\]::before,[^{]*\{([^}]*)\}/) || [])[1] || '';
    check(/-webkit-mask-image:\s*var\(--pip-icon\)/.test(geom) && /\bmask-image:\s*var\(--pip-icon\)/.test(geom),
        'the icon is a mask, prefixed and unprefixed, taken from --pip-icon');
    check(/border-radius:\s*50%/.test(geom), 'rounded to the pip\'s inner disc');
    check(/inset:\s*1\.5px/.test(geom), 'inset by the ring width');
    // Both layers are absolutely positioned with no z-index, so they stack in
    // tree order and ::after paints on top. The ink layer is the whole shape;
    // on top it would bury the on-fill half.
    // The lower layer is the task colour, taken from the ring rather than the
    // fill, so yellow gets its deeper gold and stays visible on white, and a
    // pip with no colour yet matches its own neutral ring.
    const lower = (CSS.match(/\.delphi-pp-task-pip\[data-tile-id\]::before\s*\{([^}]*)\}/) || [])[1] || '';
    check(/background-color:\s*var\(--pip-ring,/.test(lower),
        `the lower layer, ::before underneath, is the task colour, got: ${lower.trim()}`);
    const ring = (CSS.match(/\.delphi-pp-task-pip\s*\{([^}]*)\}/) || [])[1] || '';
    const fallback = (s) => ((s.match(/var\(--pip-ring,\s*([^;]*?)\);?\s*$/m) || [])[1] || '').trim();
    check(fallback(lower) !== '' && fallback(lower) === fallback(ring.match(/border:[^;]*;/)[0]),
        'with the same fallback as the ring, so an uncoloured pip\'s icon and ring agree');
    check(/\.delphi-pp-task-pip\[data-tile-id\]\[data-claimed\]::after\s*\{[^}]*clip-path:\s*inset\(50%/.test(CSS),
        'the on-fill layer is ::after, on top, clipped to half when claimed');
    check(/\.delphi-pp-task-pip\[data-tile-id\]\.done::after\s*\{[^}]*clip-path:\s*inset\(0/.test(CSS),
        'and whole when done');
}

// ---- a pip with no colour yet: black ring, hollow black icon ---------------
// An any-colour pip (an open wildcard, every statue until claimed) has no
// colour to draw in. It takes a black ring and a HOLLOW black icon, which also
// tells it apart from a black-colour pip, whose icon is solid black.
{
    const ring = (CSS.match(/\.delphi-pp-task-pip\s*\{([^}]*)\}/) || [])[1] || '';
    check(/border:[^;]*var\(--pip-ring,\s*#000\)/.test(ring),
        'a pip with no colour falls back to a black ring');
    const anyRing = (CSS.match(/\.delphi-pp-task-pip\[data-color="any"\]\[data-hue\]\s*\{([^}]*)\}/) || [])[1] || '';
    check(/--pip-ring:\s*#000/.test(anyRing), 'and so does a claimed wildcard');

    const hollow = (CSS.match(/\.delphi-pp-task-pip\[data-tile-id\]\[data-color="any"\]::before\s*\{([^}]*)\}/) || [])[1] || '';
    check(!!hollow, 'an any-colour pip has its own icon rule');
    // A mask can only fill a shape, never stroke it. So the image itself is
    // drawn, turned white, and traced by black drop-shadows.
    check(/mask-image:\s*none/.test(hollow) && /-webkit-mask-image:\s*none/.test(hollow),
        'it drops the mask, prefixed and unprefixed');
    check(/background-image:\s*var\(--pip-icon\)/.test(hollow), 'and draws the piece art itself');
    check(/background-color:\s*transparent/.test(hollow),
        'with no fill behind it, or the unmasked layer would paint a solid disc');
    check(/brightness\(0\)\s*invert\(1\)/.test(hollow), 'turned white');
    check((hollow.match(/drop-shadow\([^)]*#000\)/g) || []).length === 4,
        'and outlined on all four sides in black');
}

// ---- every colour is complete ---------------------------------------------------
{
    ['--pip-ring', '--pip-fill'].forEach(function(prop) {
        const missing = COLORS.filter(function(c) {
            const rule = (CSS.match(new RegExp('\\[data-hue="' + c + '"\\][^{]*\\{([^}]*)\\}', 'g')) || []).join(' ');
            return rule.indexOf(prop) === -1;
        });
        check(missing.length === 0, `every colour defines ${prop} (missing: ${missing.join(', ') || 'none'})`);
    });
    const yellow = (CSS.match(/\[data-hue="yellow"\][^{]*\{([^}]*)\}/g) || []).join(' ');
    check(/--pip-icon-on-fill:\s*var\(--pp-ink/.test(yellow), 'yellow takes an ink icon over its fill');
    const others = ['red', 'green', 'blue', 'pink', 'black'].filter(function(c) {
        return /--pip-icon-on-fill/.test((CSS.match(new RegExp('\\[data-hue="' + c + '"\\][^{]*\\{([^}]*)\\}', 'g')) || []).join(' '));
    });
    check(others.length === 0, `every other colour keeps the white default (overridden: ${others.join(', ') || 'none'})`);
}

// ---- the fills --------------------------------------------------------------------
{
    const done = (CSS.match(/\.delphi-pp-task-pip\.done\s*\{([^}]*)\}/) || [])[1] || '';
    check(/linear-gradient\(to top,\s*var\(--pip-fill/.test(done), 'done fills with the pip\'s colour');
    check(/background-origin:\s*border-box/.test(done),
        'from the border box, or the square fill shows through the translucent ring');
    const claim = (CSS.match(/\.delphi-pp-task-pip\[data-claimed\]\s*\{([^}]*)\}/) || [])[1] || '';
    check(/var\(--pip-fill\)\s*50%/.test(claim), 'a claim half-fills with the same colour');
    check(/background-origin:\s*border-box/.test(claim), 'from the border box too');
}

// ---- size ------------------------------------------------------------------------
{
    const rule = (CSS.match(/\.delphi-pp-task-pip\s*\{([^}]*)\}/) || [])[1] || '';
    const size = parseFloat((rule.match(/width:\s*([\d.]+)px/) || [])[1]);
    check(size === 16, `the pip is 16px so the icon reads, got ${size}px`);
    check(size * 3 + 4 <= 52, 'three pips plus their gaps still fit the 52px column');
}

// ---- motion ------------------------------------------------------------------------
{
    check(/motion-reduced-pref[^{]*pp-(claim|done)-new/.test(CSS),
        'the pip animations stop under the reduced-motion preference');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
