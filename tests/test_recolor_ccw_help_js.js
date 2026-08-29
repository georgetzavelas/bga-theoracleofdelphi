/**
 * The counter-clockwise help marker on the oracle wheel (Deep Hold).
 *
 * Five of the six between-slot positions carry a recolour target while a die
 * is selected. The sixth, immediately counter-clockwise of the die, never
 * does: a chip there would sell you the colour you already have. That is also
 * exactly where a Deep Hold player reaches, because the tile's own art shows a
 * counter-clockwise arrow. So it carries the explanation instead.
 *
 * It must not look like a purchase. It is the one spot on the wheel where a
 * click can do nothing, so it takes no handler, no pointer cursor and no
 * hover-scale, and its fill is muted away from the favour-token art.
 *
 * Run: node tests/test_recolor_ccw_help_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.css'), 'utf8');
const LINES = SRC.split('\n');

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

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
function extractProp(name) {
    const m = SRC.match(new RegExp('^        ' + name + ': [\\[{][\\s\\S]*?^        [\\]}],', 'm'));
    if (!m) throw new Error('property not found: ' + name);
    return m[0];
}
function extractScalar(name) {
    const m = SRC.match(new RegExp('^        ' + name + ': [^\\n]*,', 'm'));
    if (!m) throw new Error('scalar not found: ' + name);
    return m[0];
}
/** Body of the first CSS rule whose selector list contains `sel`, comments stripped. */
function ruleBody(sel) {
    const m = CSS.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
    return m ? m[1].replace(/\/\*[\s\S]*?\*\//g, '') : '';
}

function makeEl() {
    const classes = new Set();
    const el = {
        style: { props: {}, setProperty(k, v) { el.style.props[k] = v; } },
        dataset: {}, attrs: {}, children: [], listeners: {},
        classList: {
            add: function () { Array.prototype.forEach.call(arguments, c => classes.add(c)); },
            remove: function () { Array.prototype.forEach.call(arguments, c => classes.delete(c)); },
            contains: (c) => classes.has(c),
        },
        appendChild(c) { el.children.push(c); return c; },
        addEventListener(t, fn) { (el.listeners[t] = el.listeners[t] || []).push(fn); },
        has(c) { return classes.has(c); },
    };
    Object.defineProperty(el, 'className', {
        get: () => Array.from(classes).join(' '),
        set: (v) => { classes.clear(); String(v).split(' ').filter(Boolean).forEach(c => classes.add(c)); },
    });
    Object.defineProperty(el, 'id', { get: () => el.attrs.id || '', set: (v) => { el.attrs.id = v; } });
    return el;
}

const PIECES = [
    extractProp('WHEEL_ORDER'), extractProp('BETWEEN_POSITIONS'), extractProp('WHEEL_CENTER'),
    extractScalar('RECOLOR_BASE_ROTATION'), extractScalar('RECOLOR_ARROW_W'),
    extractScalar('RECOLOR_ARROW_H'), extractScalar('RECOLOR_LABEL_OFFSET'),
    extractMethod('_setupRecolorArrows'), extractMethod('_recolorTooltipHtml'),
    extractMethod('_addCcwHelpMarker'),
].join('\n');

function makeGame() {
    const wheel = makeEl();
    const document_ = {
        getElementById: (id) => (id === 'delphi-oracle-wheel' ? wheel : null),
        createElement: () => makeEl(),
    };
    const dojo_ = {
        string: {
            substitute: (t, a) => t.replace(/\$\{(\w+)\}/g, (_m, k) => String(a[k])),
        },
    };
    const game = new Function('document', 'dojo', '_',
        `return { ${PIECES} };`)(document_, dojo_, (s) => s);

    game.tooltips = {};
    game.addTooltipHtml = (id, html) => { game.tooltips[id] = html; };
    game.bgaPerformAction = () => {};
    game._clearRecolorArrows = () => { wheel.children.length = 0; };

    return { game, wheel };
}

const args = (over) => Object.assign({
    dieColor: 'black', playerFavor: 10, reverseRecolor: true,
}, over || {});

const chips = (wheel) => wheel.children.filter(c => c.has('recolor-arrow'));
const help = (wheel) => chips(wheel).filter(c => c.has('recolor-arrow-ccw-help'));
const targets = (wheel) => chips(wheel).filter(c => !c.has('recolor-arrow-ccw-help'));

// ============ 1. it lands on the one position nothing else uses =============
{
    const { game, wheel } = makeGame();
    game._setupRecolorArrows(args());

    check(help(wheel).length === 1, 'exactly one help marker (got ' + help(wheel).length + ')');
    check(targets(wheel).length === 5, 'the five paid targets are unaffected (got ' + targets(wheel).length + ')');

    // black is WHEEL_ORDER[1], so its counter-clockwise boundary is
    // BETWEEN_POSITIONS[0] — the red/black one, which carries no target.
    const pos = game.BETWEEN_POSITIONS[0];
    const m = help(wheel)[0] || makeEl();
    check(parseFloat(m.style.left) === pos.x - game.RECOLOR_ARROW_W / 2
        && parseFloat(m.style.top) === pos.y - game.RECOLOR_ARROW_H / 2,
        'it sits at the boundary immediately counter-clockwise of the die, which is '
        + 'the one of six that never carries a target');

    const used = chips(wheel).map(c => c.style.left).sort();
    check(new Set(used).size === 6,
        'all six boundaries are occupied exactly once, so the marker cannot land '
        + 'on top of a target the player meant to click');

    check(m.style.props['--rot'] === (game.RECOLOR_BASE_ROTATION + pos.rotationStep) + 'deg',
        'it takes the same per-position rotation as the real chips, so the diamond '
        + 'sits square to the wheel like its neighbours');
}

// ============ 2. it explains, it does not sell ==============================
{
    const { game, wheel } = makeGame();
    game._setupRecolorArrows(args());
    const m = help(wheel)[0] || makeEl();

    check(help(wheel).length === 1 && (m.listeners.click || []).length === 0,
        'no click handler: this is the one spot on the wheel where a click can do '
        + 'nothing, and a dead click target is worse than none');

    const html = game.tooltips[m.id] || '';
    check(html.indexOf('action-colour-counterclockwise') >= 0,
        'the tooltip carries the counter-clockwise action glyph');
    check(html.indexOf('How to colour a die counterclockwise') >= 0,
        'and the sentence that names what it is about');
    check(html.indexOf('hex-action-tooltip') >= 0,
        'built from the icon-plus-label tooltip already used elsewhere, so it reads '
        + 'like every other action explanation in the game');
}

// ============ 3. only for the tile that needs it ============================
{
    const { game, wheel } = makeGame();
    game._setupRecolorArrows(args({ reverseRecolor: false }));
    check(help(wheel).length === 0,
        'without Deep Hold there is no counter-clockwise recolour to explain');
    check(targets(wheel).length === 5, 'and the five targets still render');
}
{
    const { game, wheel } = makeGame();
    game._setupRecolorArrows(args({ apolloNeedsRecolor: true }));
    check(help(wheel).length === 0,
        'an Apollo free recolour picks any colour at no cost, so direction is moot');
}
{
    const { game, wheel } = makeGame();
    game._setupRecolorArrows(args({ demigodWild: true }));
    check(help(wheel).length === 0, 'same for a Demigod wild');
}

// Even with no favour to spend, the explanation is still worth showing.
{
    const { game, wheel } = makeGame();
    game._setupRecolorArrows(args({ playerFavor: 0 }));
    check(targets(wheel).length === 0, 'no favour, no affordable targets');
    check(help(wheel).length === 1,
        'but the marker stays: it costs nothing to read, and a player with no favour '
        + 'is exactly the one working out what the wheel does');
}

// ============ 4. it is cleaned up with everything else ======================
{
    const { game, wheel } = makeGame();
    game._setupRecolorArrows(args());
    game._setupRecolorArrows(args({ dieColor: 'blue' }));
    check(help(wheel).length === 1, 'reselecting does not accumulate markers');
    check(parseFloat((help(wheel)[0] || makeEl()).style.left)
        === game.BETWEEN_POSITIONS[2].x - game.RECOLOR_ARROW_W / 2,
        'and it follows the new die: blue is WHEEL_ORDER[3], so its counter-clockwise '
        + 'boundary is BETWEEN_POSITIONS[2]');
    check((help(wheel)[0] || makeEl()).has('recolor-arrow'),
        'it carries .recolor-arrow, so the real _clearRecolorArrows sweeps it up with '
        + 'the paid chips instead of needing its own teardown');
}

// ============ 5. CSS: it must not read as a sixth thing to buy ==============
{
    const body = ruleBody('.recolor-arrow.recolor-arrow-ccw-help');
    check(/cursor:\s*help/.test(body),
        'cursor: help, not the pointer .recolor-arrow sets — the cursor is the first '
        + 'thing that tells a player whether clicking does anything');
    check(/opacity:\s*0?\.[0-9]/.test(body) || /filter:\s*grayscale/.test(body)
        || /background-image:\s*(none|url)/.test(body),
        'its fill is pulled away from the favour-token art the paid chips wear');

    const hoverBody = ruleBody('.recolor-arrow.recolor-arrow-ccw-help:hover');
    check(hoverBody.length > 0 && !/scale\(/.test(hoverBody),
        'and it does not grow on hover the way a real target does (that scale is the '
        + 'other half of "this is clickable")');
}

console.log((fail === 0 ? 'PASS' : 'FAIL') + ': recolor ccw help  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
