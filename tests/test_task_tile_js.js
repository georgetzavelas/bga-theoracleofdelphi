/**
 * The panel's Zeus tiles: one tall tile per tile, the die glyph (or a shrine's
 * Greek letter) on top and the piece below.
 *
 *   open       white, ring in its colour, the marble piece
 *   loaded     the piece becomes the coloured cargo on the ship for it, with
 *              the player's own ship as a badge in the corner
 *   delivered  filled with its colour, ring the same; grey for a built shrine
 *              or a tile returned to the box
 *
 * Loading is shown as the cargo itself rather than a half fill: the tile holds
 * the very offering or statue that is heading for it, so "what is on my ship
 * and where is it going" reads straight off the panel.
 *
 * Run: node tests/test_task_tile_js.js
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
const panel = new Function('_t', 'return { SHRINE_GLYPHS: { omega: "Ω", phi: "Φ", sigma: "Σ", psi: "Ψ" }, '
    + extractMethod(COMPONENTS, '_renderColorColumn') + ', '
    + extractMethod(COMPONENTS, '_renderShrineColumn') + ', '
    + extractMethod(COMPONENTS, '_shipColour') + ' };')((s) => s);

function tiles(html) {
    // Each tile, opening tag plus its children.
    return (html.match(/<div class="delphi-pp-task-pip[^"]*"[^>]*>(?:(?!<div class="delphi-pp-task-pip)[\s\S])*?<\/div>/g) || []).map((t) => ({
        t,
        hue: (t.match(/data-hue="([^"]*)"/) || [])[1],
        claimed: (t.match(/data-claimed="([^"]*)"/) || [])[1],
        color: (t.match(/data-color="([^"]*)"/) || [])[1],
        done: /class="delphi-pp-task-pip[^"]*\bdone\b/.test(t),
    }));
}
const tile = (o) => Object.assign({ id: 1, color: null, completionValue: null, claimedColor: null, done: false }, o);
const rule = (sel) => (CSS.match(new RegExp(sel + '\\s*\\{([^}]*)\\}')) || [])[1] || '';

// ---- markup ---------------------------------------------------------------------
{
    const t = tiles(panel._renderColorColumn(7, 'offering', [
        tile({ id: 1, color: 'red' }),
        tile({ id: 2, color: null, claimedColor: 'green' }),
        tile({ id: 3, color: null, completionValue: 'pink', done: true }),
    ]));
    check(t.length === 3, 'three tiles to a column');
    check(t.every((x) => /delphi-pp-task-glyph/.test(x.t) && /delphi-pp-task-piece/.test(x.t) && /delphi-pp-task-ship/.test(x.t)),
        'each carries a glyph, a piece and a ship badge; the CSS decides which show');
    check(t[0].hue === 'red', 'a set-colour tile is about its colour from the deal');
    check(t[1].hue === 'green' && t[1].claimed === 'green' && t[1].color === 'any',
        'a loaded wildcard is about its cargo\'s colour, and its slot stays wild');
    check(t[2].hue === 'pink' && t[2].done && t[2].claimed === undefined,
        'a finished wildcard is about the colour it was spent on, and carries no claim');

    const empty = panel._renderColorColumn(7, 'offering', [tile({ id: 1 })]);
    check(/<div class="delphi-pp-task-pip"><\/div>/.test(empty), 'an empty slot has no parts');
}
{
    const html = panel._renderShrineColumn(7, [
        { id: 1, letter: 'omega', done: false }, { id: 2, letter: 'phi', done: true }]);
    const t = tiles(html);
    check(/<span class="delphi-pp-task-letter"[^>]*>Ω<\/span>/.test(t[0].t),
        'a shrine tile shows its Greek letter on top, now there is room for it');
    check(/delphi-pp-task-piece/.test(t[0].t), 'and the shrine piece below');
    check(/title="Ω shrine"/.test(t[0].t), 'with the letter in its title too');
    check(!/data-hue/.test(html), 'a shrine carries no hue');
    check(!/delphi-pp-task-ship/.test(html), 'and no ship badge: a shrine is never cargo');
}
{
    check(panel._shipColour('#dc3545') === 'red' && panel._shipColour('#ffc107') === 'yellow'
          && panel._shipColour('#28a745') === 'green' && panel._shipColour('#007bff') === 'blue',
        'the four player colours map to their ship');
    check(panel._shipColour('#abcdef') === '', 'an unknown colour maps to none, not a guess');
    check(/class="delphi-pp-tasks"[^;]*data-ship/.test(extractMethod(COMPONENTS, 'renderTasks')),
        'the task row names the player\'s ship, so every badge in it matches');
}

// ---- geometry ---------------------------------------------------------------------
{
    const base = rule('^\\.delphi-pp-task-pip'.replace('^', '(?:^|\\n)'));
    const w = parseFloat((base.match(/width:\s*([\d.]+)px/) || [])[1]);
    const h = parseFloat((base.match(/height:\s*([\d.]+)px/) || [])[1]);
    check(w === 16 && h === 36, `a tile is 16 x 36, got ${w} x ${h}`);
    const row = rule('\\.delphi-pp-task-pips');
    const gap = parseFloat((row.match(/gap:\s*([\d.]+)px/) || [])[1]);
    check(w * 3 + gap * 2 <= 52, `three tiles and their gaps fit the 52px column: ${w * 3 + gap * 2}px`);
    check(!/nth-child\(2\)/.test(CSS.slice(CSS.indexOf('.delphi-pp-task-pips'), CSS.indexOf('/* ── Pantheon'))),
        'no inverted V: the middle tile is not lifted');
}

// ---- top: the glyph ----------------------------------------------------------------
{
    check(/display:\s*none/.test(rule('(?:^|\\n)\\.delphi-pp-task-glyph')), 'the glyph is hidden by default');
    const shown = rule('\\.delphi-pp-task-pip\\[data-hue\\]\\s*>\\s*\\.delphi-pp-task-glyph');
    check(/background-image:\s*var\(--pip-glyph\)/.test(shown),
        'shown whenever the tile is about a colour, including a loaded wildcard\'s cargo');
    check((shown.match(/drop-shadow\([^)]*var\(--pip-glyph-outline,\s*#fff\)\)/g) || []).length === 4,
        'outlined, white unless the colour says otherwise');
    COLORS.forEach(function(c) {
        const r = (CSS.match(new RegExp('\\[data-hue="' + c + '"\\]\\s*\\{([^}]*)\\}')) || [])[1] || '';
        check(new RegExp("--pip-glyph:\\s*url\\(['\"]?img/oracle-dice/die-face-" + c + "\\.png").test(r)
              && /--pip-ring/.test(r) && /--pip-fill/.test(r),
            `${c} names its glyph, ring and fill`);
    });
    const yellow = (CSS.match(/\[data-hue="yellow"\]\s*\{([^}]*)\}/) || [])[1] || '';
    check(/--pip-glyph-outline:\s*var\(--pp-ink/.test(yellow), 'yellow\'s glyph takes a dark outline');
}

// ---- bottom: the piece, and the cargo once loaded ------------------------------------
{
    ['shrine', 'monster', 'statue', 'offering'].forEach(function(t) {
        check(new RegExp('\\[data-task="' + t + '"\\]\\s+\\.delphi-pp-task-pip\\s*\\{[^}]*--pip-icon:\\s*url\\([\'"]?img/pieces/' + t + '\\.png').test(CSS),
            `the ${t} column shows the ${t} piece`);
    });
    check(/background-image:\s*var\(--pip-icon\)/.test(rule('(?:^|\\n)\\.delphi-pp-task-piece')),
        'the piece sits in the bottom of the tile');
    // Only offerings and statues are ever cargo. Every colour of each needs its
    // own rule, or a load would show nothing at all.
    const missing = [];
    ['offering', 'statue'].forEach(function(t) {
        COLORS.forEach(function(c) {
            const re = new RegExp('\\[data-task="' + t + '"\\]\\s+\\.delphi-pp-task-pip\\[data-claimed="' + c
                + '"\\]\\s*>\\s*\\.delphi-pp-task-piece\\s*\\{[^}]*url\\([\'"]?img/pieces/' + c + '-' + t + '\\.png');
            if (!re.test(CSS)) missing.push(c + '-' + t);
        });
    });
    check(missing.length === 0, `a loaded tile shows the coloured cargo piece (missing: ${missing.join(', ') || 'none'})`);

    check(/display:\s*none/.test(rule('(?:^|\\n)\\.delphi-pp-task-ship')), 'the ship badge is hidden by default');
    const ship = rule('\\.delphi-pp-task-pip\\[data-claimed\\]\\s*>\\s*\\.delphi-pp-task-ship');
    check(/display:\s*block/.test(ship), 'and shown on a loaded tile');
    check(/var\(--pip-ship,\s*url\([^)]*ship\.png/.test(ship), 'as the player\'s ship, the marble one if unknown');
    ['red', 'yellow', 'green', 'blue'].forEach(function(c) {
        check(new RegExp('\\.delphi-pp-tasks\\[data-ship="' + c + '"\\]\\s*\\{[^}]*img/pieces/' + c + '-ship\\.png').test(CSS),
            `a ${c} player's badge is the ${c} ship`);
    });
    check(!/\[data-claimed\]\s*\{[^}]*linear-gradient/.test(CSS),
        'no half fill: the cargo piece says "loaded" on its own');
}

// ---- delivered --------------------------------------------------------------------
{
    const done = rule('(?:^|\\n)\\.delphi-pp-task-pip\\.done');
    const fb = (done.match(/linear-gradient\(to top,\s*var\(--pip-fill,\s*([^)]*\))\)/) || [])[1];
    check(!!fb, 'a delivered tile fills with its colour');
    check(new RegExp('border-color:\\s*var\\(--pip-fill,\\s*' + (fb || '').replace(/[()]/g, '\\$&') + '\\)').test(done),
        'ringed in exactly its fill, one solid tile');
    check(/background-origin:\s*border-box/.test(done), 'filled from the border box');
    const grey = (CSS.match(/\.delphi-pp-task-pip\.shrine\.done(?:\s*,[^{]*)?\s*\{([^}]*)\}/) || [])[1] || '';
    check(/--pip-fill:\s*var\(--pip-grey\)/.test(grey), 'a built shrine and a returned tile fill grey');
    check(/\.done\.returned/.test(CSS), 'returned tiles included');
}

// ---- rings ------------------------------------------------------------------------
{
    const base = rule('(?:^|\\n)\\.delphi-pp-task-pip');
    check(/border:\s*1\.5px solid var\(--pip-ring,\s*var\(--pip-grey\)\)/.test(base), 'no colour, grey ring');
    check(/--pip-ring:\s*var\(--pip-grey\)/.test(rule('\\.delphi-pp-task-pip\\[data-color="any"\\]\\[data-hue\\]')),
        'a loaded wildcard keeps its grey ring: the slot still takes anything');
}

// ---- motion -----------------------------------------------------------------------
{
    check(/\.pp-claim-new\s*>\s*\.delphi-pp-task-piece\s*\{[^}]*animation:\s*pp-cargo-in/.test(CSS),
        'the cargo piece pops in when it is loaded');
    check(/\.done\.pp-done-new\s*\{[^}]*pp-claim-rise/.test(CSS), 'the fill rises on delivery');
    check(/motion-reduced-pref[^{]*pp-done-new/.test(CSS) && /motion-reduced-pref[^{]*delphi-pp-task-piece/.test(CSS),
        'both stop under the reduced-motion preference');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
