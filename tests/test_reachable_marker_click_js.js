/**
 * The pulsing destination markers are the click target for picking a hex.
 *
 * Reported twice now: on iPhone a player selects a die, selects their ship,
 * sees the destinations light up, and then cannot pick one. The second report
 * came from the Google app's in-app WebView (UA `GSA/434.2`, iOS 26.6).
 *
 * Why destinations and nothing else. Every other board interaction is a tap on
 * a real element with its own listener -- ships, dice, monsters, cards. Hexes
 * have none. BoardRenderer paints whole clusters as single images with
 * pointer-events: none, and per-hex hit targets (.island-hover-target) exist
 * only for island and city hexes. A ship destination is open water, so there
 * was nothing under the finger at all: the tap landed on the bare
 * #delphi-hex-grid div and was resolved geometrically by _hexFromEvent against
 * the grid's live bounding rect, with the only click responder a delegated
 * listener on a scroll container. That path has no interactive element to
 * anchor a synthesized click, and it moves if the board pans between
 * finger-down and click.
 *
 * The markers already exist at exactly the legal destinations. Making them the
 * hit target removes the whole class of failure: no delegation to a bare
 * ancestor, no pixel math, no pan drift. Exact coordinates come off the
 * element that was tapped.
 *
 * What the tests pin, and why each one is here:
 *
 *   - The marker carries its own q/r and dispatches from them, so the answer
 *     cannot drift with the board. This is the fix.
 *   - Activation routes through the real onHexClick rather than straight to
 *     actConfirmMove. _showReachableOverlays is shared with PeekIslands /
 *     ScoutIslands (via _refreshPeekOverlays), so hard-wiring it to a move
 *     would break island selection. Both flows are checked.
 *   - The click stops propagating. The board container's delegated handler
 *     would otherwise resolve the same tap a second time by pixel and run
 *     onHexClick twice -- which in peek mode toggles a selection on and
 *     straight back off.
 *   - The hit box does not breathe. The pulse animates transform: scale(),
 *     and transforms move hit testing, so the animation has to sit on an
 *     inner element or the target shrinks to 85% for part of every cycle.
 *   - The favor-cost badge stays pointer-events: none, or it swallows taps on
 *     the corner of every hex that costs favor.
 *
 * Run: node tests/test_reachable_marker_click_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.css'), 'utf8');
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

/** Body of the first CSS rule whose selector list contains `selector`. */
function cssRule(selector) {
    const re = new RegExp('(^|\\n)([^{}]*\\' + selector + '[^{}]*)\\{([^}]*)\\}');
    const m = CSS.match(re);
    return m ? m[3] : null;
}

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

// --- stub DOM ---------------------------------------------------------------
function makeEl() {
    const classes = new Set();
    const el = {
        style: {}, dataset: {}, attrs: {}, children: [], listeners: {},
        innerHTML: '', removed: false,
        classList: {
            add: (c) => classes.add(c),
            remove: (c) => classes.delete(c),
            contains: (c) => classes.has(c),
        },
        setAttribute(k, v) { el.attrs[k] = String(v); },
        getAttribute(k) { return el.attrs[k]; },
        appendChild(c) { el.children.push(c); return c; },
        addEventListener(t, fn) { (el.listeners[t] = el.listeners[t] || []).push(fn); },
        remove() { el.removed = true; },
        querySelector(sel) {
            const want = sel.replace(/^\./, '');
            return el.children.find((c) => c.classList.contains(want)) || null;
        },
        fire(type, ev) { (el.listeners[type] || []).forEach((fn) => fn(ev)); },
        has(c) { return classes.has(c); },
    };
    Object.defineProperty(el, 'className', {
        get: () => Array.from(classes).join(' '),
        set: (v) => { classes.clear(); String(v).split(' ').filter(Boolean).forEach((c) => classes.add(c)); },
    });
    return el;
}

/** A click/keydown event that records whether it was stopped or defaulted. */
function makeEvent(extra) {
    return Object.assign({
        stopped: false, defaulted: false,
        stopPropagation() { this.stopped = true; },
        preventDefault() { this.defaulted = true; },
    }, extra || {});
}

const METHODS = ['_showReachableOverlays', '_clearReachableOverlays',
    '_bindReachableMarkerActivation', 'onHexClick']
    .map(extractMethod).join('\n');

function makeGame(opts) {
    opts = opts || {};
    const grid = makeEl();
    const stored = {};
    const document_ = {
        createElement: () => makeEl(),
        getElementById: (id) => (id === 'delphi-hex-grid' ? grid : null),
    };
    const sessionStorage_ = {
        setItem: (k, v) => { stored[k] = v; },
        getItem: (k) => (k in stored ? stored[k] : null),
    };

    const game = new Function('document', 'sessionStorage',
        `return { ${METHODS} };`)(document_, sessionStorage_);

    game.calls = [];
    game.bgaPerformAction = (action, args) => { game.calls.push({ action, args }); };
    game.getHexCenterPixel = (q, r) => ({ x: 100 + Number(q) * 80, y: 100 + Number(r) * 92 });
    game.boardHexes = (opts.boardHexes || []);
    game.clearRangeOverlays = () => { game.rangeCleared = true; };
    game.components = { deselectShips: () => { game.shipDeselected = true; } };
    game._refreshPeekOverlays = () => { game.peekRefreshes = (game.peekRefreshes || 0) + 1; };

    return { game, grid, stored };
}

const markers = (grid) => grid.children.filter((c) => c.classList.contains('hex-reachable-marker'));

// The shape MoveShip hands over: hexes plus how far each one is.
const REACHABLE = [
    { q: 3, r: -1, distance: 1 },
    { q: 4, r: -2, distance: 2 },
    { q: 5, r: -2, distance: 5 },   // beyond a base range of 3 -> costs favor
];

// ============ 1. the marker carries its own coordinates ======================
{
    const { game, grid } = makeGame();
    game._showReachableOverlays(REACHABLE, 3);
    const ms = markers(grid);
    check(ms.length === 3, 'one marker per reachable hex (got ' + ms.length + ')');
    check(ms.every((m) => m.dataset.q !== undefined && m.dataset.r !== undefined),
        'every marker carries data-q / data-r, so the tap resolves from the element '
        + 'rather than from pixel math against a rect that can pan');
    check(String(ms[1].dataset.q) === '4' && String(ms[1].dataset.r) === '-2',
        'the coordinates on the marker are the ones the server sent');
}

// ============ 2. the marker is a real hit target =============================
{
    const { game, grid } = makeGame();
    game._showReachableOverlays(REACHABLE, 3);
    const ms = markers(grid);
    check(ms.every((m) => (m.listeners.click || []).length === 1),
        'every marker has its own click listener — the whole point, since open '
        + 'water has no other element under the finger');
    check(ms.every((m) => m.getAttribute('role') === 'button' && m.getAttribute('tabindex') === '0'),
        'and is announced and reachable as a button');
}

// ============ 3. clicking one confirms THAT hex ==============================
{
    const { game, grid } = makeGame();
    game._moveShipReachable = new Map([['3,-1', 1], ['4,-2', 2], ['5,-2', 5]]);
    game._showReachableOverlays(REACHABLE, 3);

    const ev = makeEvent();
    markers(grid)[1].fire('click', ev);

    check(game.calls.length === 1 && game.calls[0].action === 'actConfirmMove',
        'a tap on a destination marker dispatches actConfirmMove');
    check(game.calls[0] && String(game.calls[0].args.q) === '4'
        && String(game.calls[0].args.r) === '-2',
        'with the coordinates of the marker that was tapped');
    check(ev.stopped,
        'and stops propagating, so the board container does not resolve the same '
        + 'tap a second time by pixel');
    check(!game.shipDeselected,
        'the ship keeps its selection — the fall-through that silently deselects '
        + 'is never reached');
}

// ============ 4. keyboard parity =============================================
for (const key of ['Enter', ' ']) {
    const { game, grid } = makeGame();
    game._moveShipReachable = new Map([['3,-1', 1]]);
    game._showReachableOverlays([REACHABLE[0]], 3);
    const ev = makeEvent({ key });
    markers(grid)[0].fire('keydown', ev);
    check(game.calls.length === 1 && game.calls[0].action === 'actConfirmMove',
        '"' + key + '" activates a focused marker');
    check(ev.defaulted, 'and preventDefaults so Space does not scroll the page');
}
{
    const { game, grid } = makeGame();
    game._moveShipReachable = new Map([['3,-1', 1]]);
    game._showReachableOverlays([REACHABLE[0]], 3);
    markers(grid)[0].fire('keydown', makeEvent({ key: 'Tab' }));
    check(game.calls.length === 0, 'Tab moves on rather than activating');
}

// ============ 5. the overlay is shared with island peeking ===================
//     _refreshPeekOverlays reuses _showReachableOverlays to pulse the islands
//     you may look at. Wiring the marker straight to actConfirmMove would have
//     turned every peek into a ship move.
{
    const { game, grid, stored } = makeGame();
    game._peekIslandSet = new Set(['3,-1', '4,-2']);
    game._selectedPeekIslands = [];
    game._peekMaxPeeks = 2;
    game._showReachableOverlays(REACHABLE.slice(0, 2));

    markers(grid)[0].fire('click', makeEvent());
    check(game.calls.length === 0, 'in peek mode a marker tap performs no ship move');
    check(game._selectedPeekIslands.length === 1
        && game._selectedPeekIslands[0].q === 3 && game._selectedPeekIslands[0].r === -1,
        'it selects that island for peeking instead');
    check(stored['delphi_peek_selection'] !== undefined,
        'and the selection is persisted the same way a board tap persists it');
}
{
    // The double-dispatch this guards against: without stopPropagation the
    // container handler resolves the same tap and toggles the island straight
    // back off, which reads to the player as the tap doing nothing at all.
    const { game, grid } = makeGame();
    game._peekIslandSet = new Set(['3,-1']);
    game._selectedPeekIslands = [];
    game._peekMaxPeeks = 2;
    game._showReachableOverlays([REACHABLE[0]]);
    const ev = makeEvent();
    markers(grid)[0].fire('click', ev);
    check(ev.stopped, 'the peek path stops propagation too');
}

// ============ 6. a hex that is NOT reachable still falls through =============
//     The marker only exists on legal destinations, so this is really a check
//     that routing through onHexClick did not swallow the existing behaviour.
{
    const { game, grid } = makeGame();
    game._moveShipReachable = new Map([['9,9', 1]]);   // marker's hex is not in it
    game._showReachableOverlays([REACHABLE[0]], 3);
    markers(grid)[0].fire('click', makeEvent());
    check(game.calls.length === 0, 'no action for a hex the server did not offer');
    check(game.shipDeselected, 'and the existing fall-through still runs');
}

// ============ 7. the pulse does not move the hit box =========================
{
    const { game, grid } = makeGame();
    game._showReachableOverlays(REACHABLE, 3);
    const m = markers(grid)[0];
    check(m.querySelector('.hex-reachable-pulse') !== null,
        'the animated ring is a child element, not the marker itself');

    const marker = cssRule('.hex-reachable-marker');
    const pulse = cssRule('.hex-reachable-pulse');
    check(marker !== null && pulse !== null, 'both rules exist in the stylesheet');
    check(pulse && /animation:\s*pulse-reachable/.test(pulse),
        'the pulse-reachable animation runs on the child');
    check(marker && !/animation:/.test(marker),
        'and NOT on the marker — transform: scale() moves hit testing, so an '
        + 'animated hit target shrinks to 85% for part of every cycle');
    check(marker && !/pointer-events:\s*none/.test(marker),
        'the marker no longer opts out of pointer events');
    check(marker && /cursor:\s*pointer/.test(marker),
        'and reads as tappable — on iOS WebKit, cursor: pointer is also what '
        + 'marks a bare div as click-worthy');
    check(pulse && /pointer-events:\s*none/.test(pulse),
        'the ring itself stays transparent to pointers so the marker gets the tap');
}

// ============ 8. the favor badge must not eat the tap ========================
{
    const { game, grid } = makeGame();
    game._moveShipReachable = new Map([['5,-2', 5]]);
    game._showReachableOverlays(REACHABLE, 3);
    const far = markers(grid)[2];
    check(far.has('hex-reachable-favor'), 'the beyond-base-range hex is still flagged');
    check(far.querySelector('.hex-favor-cost') !== null, 'and still shows its cost badge');
    const badge = cssRule('.hex-favor-cost');
    check(badge && /pointer-events:\s*none/.test(badge),
        'the badge stays pointer-events: none, or it swallows taps on the corner '
        + 'of every hex that costs favor');
}

// ============ 9. reduced motion still reaches the animation ==================
//     Both lists name selectors explicitly. Moving the animation without
//     moving the selectors would silently un-suppress it.
{
    for (const label of ['@media (prefers-reduced-motion)', 'body.motion-reduced-pref']) {
        const block = label.startsWith('@media')
            ? CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce) {',
                CSS.indexOf('HEX STATES') > 0 ? 0 : 0))
            : CSS;
        void block;
    }
    check(/body\.motion-reduced-pref \.hex-reachable-pulse/.test(CSS),
        'the BGA reduce-motion list targets .hex-reachable-pulse');
    check(!/body\.motion-reduced-pref \.hex-reachable-marker,/.test(CSS),
        'and no longer targets the marker, where there is no animation left to stop');
    const mq = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce) {',
        CSS.indexOf('--- Reduced Motion ---')));
    check(/\.hex-reachable-pulse/.test(mq.slice(0, mq.indexOf('}'))),
        'the OS-level reduced-motion list targets .hex-reachable-pulse too');
}

// ============ 10. teardown ===================================================
{
    const { game, grid } = makeGame();
    game._showReachableOverlays(REACHABLE, 3);
    const ms = markers(grid);
    game._clearReachableOverlays();
    check(ms.every((m) => m.removed), 'clearing removes every marker, listeners with them');
    check(game._reachableOverlays === null, 'and drops the array');
}

console.log((fail ? 'FAILED' : 'ok') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
