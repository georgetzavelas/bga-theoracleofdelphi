/**
 * A task pip carries its task's piece art and keeps one shape for its whole
 * life; only the fill climbs.
 *
 *   open      white ground, the piece art, with the die glyph of its colour
 *             over it on an offering or monster of a set colour
 *   claimed   bottom half in that colour, the art untinted across that half
 *   done      full colour, the untinted art on it, no tick
 *
 * The icon is the task's own piece (shrine, monster, statue, offering), the
 * art the panel used to show once per task in a bigger circle above the pips.
 * Every pip carries it now, so those circles are gone and the task row is
 * about half as tall.
 *
 * It is the ORIGINAL art in TWO layers: tinted underneath, untinted on top,
 * the top one clipped to exactly the height the fill has reached. The fill
 * line cuts the icon rather than hiding it, so a half-filled pip previews the
 * finished one. The art is white marble with grey shading and a dark outline,
 * so a multiply tint keeps the shading and the outline where a flat colour
 * lost both, and the untinted marble reads on every fill, yellow included.
 *
 * Which colour a pip is about is decided in one place, the renderer, and
 * published as data-hue. A fixed tile knows from the deal; a wildcard knows
 * nothing until cargo claims it, then wears that colour, then the colour it
 * was spent on. A shrine has no colour at all: a grey ring, the plain shrine
 * art, and a grey fill once built.
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
    + extractMethod(COMPONENTS, '_renderShrineColumn') + ' };')((s) => s);

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
// A shrine pip carries no hue. Its owner's colour once coloured the ring, the
// icon and the built fill; all three are neutral now, so there is nothing for
// a hue to do. Without one the ring falls back to grey and the tint, which
// needs a hue, never applies.
{
    const html = panel._renderShrineColumn(7, [
        { id: 1, letter: 'omega', done: false },
        { id: 2, letter: 'phi', done: true },
        { id: 3, letter: 'psi', done: false },
    ]);
    const p = pips(html);
    check(p.every((x) => x.hue === undefined), 'a shrine pip carries no hue');
    check(p[0].title === 'Ω shrine' && p[1].title === 'Φ shrine',
        `the letter moves to the pip's title, got ${JSON.stringify(p.map((x) => x.title))}`);
    check(!/data-letter/.test(html), 'and is no longer drawn inside the pip');
    check(p[1].done && !p[0].done, 'a built shrine is done');
    check(!/_playerHue/.test(COMPONENTS), 'the player-colour lookup is gone with it');
}

// ---- the big circles are gone -------------------------------------------------
{
    check(!/delphi-pp-task-icon/.test(panel._renderColorColumn(7, 'offering', [tile({})])),
        'a colour column renders no separate task circle');
    check(!/delphi-pp-task-icon/.test(panel._renderShrineColumn(7, [])),
        'nor does the shrine column');
    check(!/\.delphi-pp-task-icon/.test(CSS), 'and its rules are gone from the stylesheet');
}

// ---- the icon: the original art, per task, two layers in the right order ----
{
    TASKS.forEach(function(t) {
        check(new RegExp('\\[data-task="' + t + '"\\]\\s+\\.delphi-pp-task-pip\\s*\\{[^}]*--pip-icon:\\s*url\\([\'"]?img/pieces/' + t + '\\.png').test(CSS),
            `the ${t} column's pips carry the ${t} piece art`);
    });
    const geom = (CSS.match(/\.delphi-pp-task-pip\[data-tile-id\]::before,[^{]*\{([^}]*)\}/) || [])[1] || '';
    check(/background-image:\s*var\(--pip-icon\)/.test(geom),
        'both layers draw the original art itself, not a silhouette');
    check(/border-radius:\s*50%/.test(geom), 'rounded to the pip\'s inner disc');
    check(/inset:\s*1\.5px/.test(geom), 'inset by the ring width');

    // An offering or monster of a set colour (the only tiles with one) shows
    // the die glyph of that colour over the piece art, outlined in white. The
    // glyph is its own element so a filter can outline it alone; a filter on
    // the art layers would outline the piece too.
    const html = panel._renderColorColumn(7, 'offering', [tile({ id: 1, color: 'red' }), tile({ id: 2 })]);
    check((html.match(/class="delphi-pp-task-glyph"/g) || []).length === 2,
        'every tile pip carries a glyph element; the CSS decides when it shows');
    check(/<div class="delphi-pp-task-pip"><\/div>/.test(html),
        'and an empty slot carries none');
    check(/delphi-pp-task-glyph"[^>]*aria-hidden="true"/.test(html),
        'hidden from screen readers: it repeats the colour the pip already names');

    const glyphBase = (CSS.match(/^\.delphi-pp-task-glyph\s*\{([^}]*)\}/m) || [])[1] || '';
    check(/display:\s*none/.test(glyphBase), 'hidden unless a rule shows it');
    const shown = CSS.match(/(\.delphi-pp-task-pip\[data-hue\]:not\(\[data-color="any"\]\):not\(\.done\)\s*>\s*\.delphi-pp-task-glyph)\s*\{([^}]*)\}/);
    check(!!shown, 'shown only on an open pip of a set colour');
    const g = shown ? shown[2] : '';
    check(/background-image:\s*var\(--pip-glyph\)/.test(g), 'as that colour\'s glyph');
    check((g.match(/drop-shadow\([^)]*var\(--pip-glyph-outline,\s*#fff\)\)/g) || []).length === 4,
        'outlined on all four sides, white unless the colour says otherwise');
    // White vanishes against the white marble for yellow, the palest glyph,
    // so yellow alone takes a dark outline.
    const hueRule = (c) => (CSS.match(new RegExp('\\[data-hue="' + c + '"\\][^{]*\\{([^}]*)\\}', 'g')) || []).join(' ');
    check(/--pip-glyph-outline:\s*var\(--pp-ink/.test(hueRule('yellow')), 'yellow\'s glyph takes a dark outline');
    const others = ['red', 'green', 'blue', 'pink', 'black'].filter((c) => /--pip-glyph-outline/.test(hueRule(c)));
    check(others.length === 0, `every other glyph keeps the white outline (overridden: ${others.join(', ') || 'none'})`);
    check(/z-index:\s*1/.test(g),
        'above both art layers, so a claim\'s upper layer cannot cut it at the fill line');
    check(/pointer-events:\s*none/.test(g), 'and never in the way of the pip\'s own hover');
    check(!/var\(--pip-glyph\),\s*var\(--pip-icon\)/.test(CSS),
        'the art layers carry only the art now');
    check(!/background-blend-mode/.test(CSS), 'the tint is gone');

    check(/\.delphi-pp-task-pip\[data-tile-id\]\[data-claimed\]::after\s*\{[^}]*clip-path:\s*inset\(50%/.test(CSS),
        'the untinted layer is ::after, on top, clipped to half when claimed');
    check(/\.delphi-pp-task-pip\[data-tile-id\]\.done::after\s*\{[^}]*clip-path:\s*inset\(0/.test(CSS),
        'and whole when done');
    check(!/--pip-icon-on-fill/.test(CSS),
        'no per-colour override over the fill: the marble reads on every colour');
}

// ---- white pips: a solid grey ring -----------------------------------------------
// A pip with nothing coloured yet (an open wildcard, every statue until
// claimed, a claimed wildcard whose ring stays neutral, an empty slot) takes a
// solid ring in the panel's one grey, the same --pip-grey that fills a built
// shrine or a returned tile.
{
    const ring = (CSS.match(/^\.delphi-pp-task-pip\s*\{([^}]*)\}/m) || [])[1] || '';
    check(/border:\s*1\.5px solid var\(--pip-ring,\s*var\(--pip-grey\)\)/.test(ring),
        'a pip with no colour falls back to a solid grey ring');
    const anyRing = (CSS.match(/\.delphi-pp-task-pip\[data-color="any"\]\[data-hue\]\s*\{([^}]*)\}/) || [])[1] || '';
    check(/--pip-ring:\s*var\(--pip-grey\)/.test(anyRing), 'and so does a claimed wildcard');
    const pipRules = CSS.slice(CSS.indexOf('.delphi-pp-task-pip'), CSS.indexOf('/* ── Pantheon'));
    check(!/dotted/.test(pipRules.replace(/\/\*[\s\S]*?\*\//g, '')), 'no pip ring is dotted');
    check(!/inset 0 0 0 1px #fff/.test(CSS) && !/inset 0 0 0 2px #000/.test(CSS),
        'and the double-ring inset shadows stay gone');
}

// ---- shrines and statues never carry a glyph ------------------------------
{
    // The glyph needs a hue and a set colour. A shrine pip has no hue; a statue
    // tile is always a wildcard. So neither can match.
    const html = panel._renderShrineColumn(7, [{ id: 1, letter: 'omega', done: false }]);
    check(!/data-hue/.test(html), 'a shrine pip carries no hue, so no glyph');
    const st = pips(panel._renderColorColumn(7, 'statue', [tile({ id: 1, color: null })]));
    check(st[0].color === 'any', 'a statue tile is a wildcard, so no glyph');
}

// ---- grey fills: a built shrine, and a tile returned to the box -------------
// A built shrine fills grey rather than in its owner's colour. So does a Zeus
// tile returned to the box by the fewer-tasks ship tile. The discard marks the
// tile is_completed = 1 exactly like a real completion, so the server records
// the returned ids in a global and the panel data flags them; without that the
// client cannot tell a returned tile from a finished one.
{
    const PHP = fs.readFileSync(path.join(ROOT, 'modules/php/States/DiscardZeusTile.php'), 'utf8');
    const GAME = fs.readFileSync(path.join(ROOT, 'modules/php/Game.php'), 'utf8');
    check(/zeus_tiles_returned/.test(PHP), 'the discard records the tile in zeus_tiles_returned');
    check(/'returned'\s*=>/.test(GAME), 'and the panel data flags returned tiles');

    const JS = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.js'), 'utf8');
    const handler = JS.slice(JS.indexOf('notif_zeusTileDiscarded: function'));
    check(/tile\.returned\s*=\s*true/.test(handler.slice(0, 2000)),
        'the live discard flags the tile too, so it goes grey without a reload');

    const col = pips(panel._renderColorColumn(7, 'offering', [
        tile({ id: 1, color: 'red', done: true, returned: true }),
        tile({ id: 2, color: 'blue', done: true }),
        tile({ id: 3, color: null }),
    ]));
    check(/\breturned\b/.test(col[0].tag) && !/\breturned\b/.test(col[1].tag),
        'a returned tile carries the returned class, a finished one does not');
    const sh = pips(panel._renderShrineColumn(7, [{ id: 4, letter: 'psi', done: true, returned: true }]));
    check(/\breturned\b/.test(sh[0].tag), 'shrines too');

    const grey = (CSS.match(/--pip-grey:\s*([^;]+);/) || [])[1];
    check(!!grey, `a single grey is defined, got ${grey}`);
    const shrineDone = (CSS.match(/\.delphi-pp-task-pip\.shrine\.done(?:\s*,[^{]*)?\s*\{([^}]*)\}/) || [])[1] || '';
    check(/--pip-fill:\s*var\(--pip-grey\)/.test(shrineDone), 'a built shrine fills grey');
    const returned = (CSS.match(/\.delphi-pp-task-pip\.done\.returned\s*\{([^}]*)\}/) || [])[1] || '';
    check(/--pip-fill:\s*var\(--pip-grey\)/.test(returned), 'a returned tile fills grey');
    check(!/border-style/.test(returned),
        'with no ring override: nothing is dotted any more, so there is nothing to undo');
}

// ---- a finished pip's ring IS its fill -------------------------------------
// Every completed pip is one disc of one colour. The done rule sets the ring
// to the fill itself, with the fill's own fallback, so the two cannot differ
// for any hue, grey included, and yellow's deeper-gold ring (kept for an open
// pip, where it has to show on cream) does not follow it into completion.
{
    const done = (CSS.match(/^\.delphi-pp-task-pip\.done\s*\{([^}]*)\}/m) || [])[1] || '';
    const fillFallback = (done.match(/linear-gradient\(to top,\s*var\(--pip-fill,\s*([^)]*\))\)/) || [])[1];
    const ring = (done.match(/border-color:\s*var\(--pip-fill,\s*([^;]*)\);/) || [])[1];
    check(!!ring, `a finished pip's ring is its fill colour, got: ${ring}`);
    check(!!fillFallback && ring === fillFallback,
        `with the fill's own fallback, ring ${ring} vs fill ${fillFallback}`);
    const base = (CSS.match(/^\.delphi-pp-task-pip\s*\{([^}]*)\}/m) || [])[1] || '';
    check(/box-shadow:\s*0 0 0 0\.5px/.test(base), 'the hairline still edges every pip');

    // With the ring following the fill, the grey rules only set the fill.
    const grey = (CSS.match(/\.delphi-pp-task-pip\.shrine\.done(?:\s*,[^{]*)?\s*\{([^}]*)\}/) || [])[1] || '';
    check(/--pip-fill:\s*var\(--pip-grey\)/.test(grey) && !/--pip-ring/.test(grey),
        'the grey rules set the fill and leave the ring to follow it');
}

// ---- every colour is complete ---------------------------------------------------
{
    ['--pip-ring', '--pip-fill', '--pip-glyph'].forEach(function(prop) {
        const missing = COLORS.filter(function(c) {
            const rule = (CSS.match(new RegExp('\\[data-hue="' + c + '"\\][^{]*\\{([^}]*)\\}', 'g')) || []).join(' ');
            return rule.indexOf(prop) === -1;
        });
        check(missing.length === 0, `every colour defines ${prop} (missing: ${missing.join(', ') || 'none'})`);
    });
    COLORS.forEach(function(c) {
        const rule = (CSS.match(new RegExp('\\[data-hue="' + c + '"\\][^{]*\\{([^}]*)\\}', 'g')) || []).join(' ');
        check(new RegExp("--pip-glyph:\\s*url\\(['\"]?img/oracle-dice/die-face-" + c + "\\.png").test(rule),
            `${c}'s glyph is its oracle die face`);
    });
    const ring = (CSS.match(/^\.delphi-pp-task-pip\s*\{([^}]*)\}/m) || [])[1] || '';
    check(/border:[^;]*var\(--pip-ring,\s*var\(--pip-grey\)\)/.test(ring), 'a pip with no colour has a grey ring');
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

// ---- size, and the inverted V -------------------------------------------------
// 21px pips, so the icons read. Three side by side overrun the 52px task
// column, so they sit in an inverted V: outer two low, middle raised,
// neighbours overlapping.
{
    const rule = (CSS.match(/^\.delphi-pp-task-pip\s*\{([^}]*)\}/m) || [])[1] || '';
    const size = parseFloat((rule.match(/width:\s*([\d.]+)px/) || [])[1]);
    const height = parseFloat((rule.match(/height:\s*([\d.]+)px/) || [])[1]);
    check(size === 21 && height === 21, `the pip is 21px, got ${size}x${height}px`);

    const pips = (CSS.match(/\.delphi-pp-task-pips\s*\{([^}]*)\}/) || [])[1] || '';
    check(/align-items:\s*flex-end/.test(pips), 'the pips sit on a common baseline');
    const overlap = -parseFloat((CSS.match(/\.delphi-pp-task-pip\s*\+\s*\.delphi-pp-task-pip\s*\{[^}]*margin-left:\s*(-?[\d.]+)px/) || [])[1]);
    check(size * 3 - overlap * 2 <= 52,
        `three pips, overlapping by ${overlap}px, fit the 52px column: need ${size * 3 - overlap * 2}px`);

    const mid = (CSS.match(/\.delphi-pp-task-pip:nth-child\(2\)\s*\{([^}]*)\}/) || [])[1] || '';
    const lift = parseFloat((mid.match(/margin-bottom:\s*([\d.]+)px/) || [])[1]);
    // Two circles of diameter d with centres dx apart clear each other once
    // their centres are d apart: dy >= sqrt(d^2 - dx^2).
    const dx = size - overlap;
    const need = Math.sqrt(size * size - dx * dx);
    check(lift >= need, `the middle pip rises ${lift}px, enough to clear its neighbours (${need.toFixed(1)}px)`);
    // The rise is a margin, not a transform: the completion pop animates
    // transform, and would drop a transformed pip back down mid-animation.
    check(!/transform/.test(mid), 'the rise is a margin, not a transform the pop would override');
}

// ---- motion ------------------------------------------------------------------------
{
    check(/motion-reduced-pref[^{]*pp-(claim|done)-new/.test(CSS),
        'the pip animations stop under the reduced-motion preference');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
