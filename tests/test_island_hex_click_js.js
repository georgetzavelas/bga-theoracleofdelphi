/**
 * Clicking anywhere on an island runs its offered action.
 *
 * Reported from a live game (player "Nob Leader", 2026-09-20). His ship sat
 * next to his own revealed shrine island at (3,3). Every time he picked the
 * yellow die the server returned buildableShrines: [{hex_q:3, hex_r:3}], the
 * board lit the hex, and clicking it did nothing. Nine attempts over thirteen
 * minutes, a browser refresh among them, and no actBuildShrine ever reached
 * the server.
 *
 * The affordance is a 54x54 circle (border-radius: 50%) centred on a 60x69
 * hex. Under it sits .delphi-shrine, 60x52 and pointer-events: auto. Probing
 * the stack with elementFromPoint: inside 27px of centre the overlay wins,
 * outside the circle the shrine face wins. The shrine has no click handler
 * during SelectAction, so those clicks bubbled to the board container, were
 * resolved by pixel, and reached onHexClick -- which routed fight-monster and
 * peek-island by hex but had no route for build-shrine or explore. They fell
 * through to clearRangeOverlays() and died silently.
 *
 * A revealed island makes the miss likely rather than rare: the 30% gold wash
 * reads clearly over the plain face-down cloud tile you click when exploring,
 * and nearly vanishes over the shrine artwork underneath it.
 *
 * What the tests pin, and why each one is here:
 *
 *   - onHexClick dispatches actBuildShrine for a buildable hex, so the whole
 *     island is the target rather than the disc at its centre. This is the fix.
 *   - Explorable hexes route the same way, through _handleExplorableHexClick
 *     so the explore-vs-peek confirm still appears for an unpeeked island.
 *   - Artemis's free explore carries its own map. The ability spends no die,
 *     so there is no look to offer instead and no confirm to raise; keeping
 *     it separate stops the SelectAction confirm reaching the god ability.
 *   - Monsters keep priority. A monster on an explorable hex is the reason
 *     the fightable check runs first.
 *   - The overlay click stops propagating. Without that the container's
 *     delegated handler resolves the same click by pixel and onHexClick
 *     dispatches the action a second time.
 *   - Both maps are reset on every args refresh, like the fightable maps
 *     beside them, so a spent die cannot leave a live target behind.
 *
 * Run: node tests/test_island_hex_click_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.js'), 'utf8');
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

// --- stub DOM ---------------------------------------------------------------
function makeEl() {
    const classes = new Set();
    const el = {
        style: {}, dataset: {}, children: [], listeners: {}, id: '',
        classList: {
            add: (c) => classes.add(c),
            remove: (c) => classes.delete(c),
            contains: (c) => classes.has(c),
        },
        appendChild(c) { el.children.push(c); return c; },
        addEventListener(t, fn) { (el.listeners[t] = el.listeners[t] || []).push(fn); },
        remove() { el.removed = true; },
        fire(type, ev) { (el.listeners[type] || []).forEach((fn) => fn(ev)); },
    };
    Object.defineProperty(el, 'className', {
        get: () => Array.from(classes).join(' '),
        set: (v) => { classes.clear(); String(v).split(' ').filter(Boolean).forEach((c) => classes.add(c)); },
    });
    return el;
}

function makeEvent() {
    return {
        stopped: false,
        stopPropagation() { this.stopped = true; },
    };
}

const METHODS = ['onHexClick', '_handleExplorableHexClick',
    '_enterPeekWithPreselectedHex', '_highlightValidHexes']
    .map(extractMethod).join('\n');

function makeGame() {
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
    game.addTooltipHtml = () => {};
    game.getHexCenterPixel = (q, r) => ({ x: 100 + Number(q) * 60, y: 100 + Number(r) * 69 });
    game.clearRangeOverlays = () => { game.rangeCleared = true; };
    game.components = { deselectShips: () => { game.shipDeselected = true; } };
    game._enterExploreVsPeekConfirmMode = (q, r, color) => {
        game.confirmed = { q: q, r: r, color: color };
    };

    return { game, grid };
}

// ============ 1. a click anywhere on the island builds the shrine ===========
{
    const { game } = makeGame();
    game._buildableShrineHexKeys = new Set(['3,3']);

    game.onHexClick(3, 3, 'island', 'yellow');

    check(game.calls.length === 1 && game.calls[0].action === 'actBuildShrine',
        'a click on a buildable shrine hex dispatches actBuildShrine — the gold '
        + 'disc is no longer the only hit target on the island');
    check(game.calls[0] && game.calls[0].args.hexQ === 3 && game.calls[0].args.hexR === 3,
        'with the coordinates of the hex that was clicked');
    check(!game.shipDeselected,
        'and returns before the silent fall-through that swallowed the click');
}

// ============ 2. a hex with no offer still falls through =====================
{
    const { game } = makeGame();
    game._buildableShrineHexKeys = new Set(['3,3']);

    game.onHexClick(4, 3, 'island', 'yellow');

    check(game.calls.length === 0, 'a hex the server did not offer dispatches nothing');
    check(game.shipDeselected, 'and keeps the existing deselect fall-through');
}

// ============ 3. explorable islands route the same way ======================
{
    const { game } = makeGame();
    game._explorableHexColorByKey = { '5,5': 'blue' };

    game.onHexClick(5, 5, 'island', 'blue');

    check(game.calls.length === 1 && game.calls[0].action === 'actExploreIsland',
        'a click on an explorable island dispatches actExploreIsland');
    check(game.calls[0] && game.calls[0].args.hexQ === 5 && game.calls[0].args.hexR === 5,
        'with the clicked coordinates');
}

// ============ 4. an unpeeked island still asks first ========================
{
    const { game } = makeGame();
    game._explorableHexColorByKey = { '5,5': 'blue' };
    game._peekableHexKeys = new Set(['5,5']);

    game.onHexClick(5, 5, 'island', 'blue');

    check(game.calls.length === 0 && game.confirmed && game.confirmed.q === 5,
        'routing goes through _handleExplorableHexClick, so an island that can '
        + 'still be looked at raises the explore-vs-peek confirm instead');
    check(game.confirmed && game.confirmed.color === 'blue',
        'and carries the exploration colour into the confirm');
}

// ============ 5. Artemis explores from anywhere on the island too ===========
{
    const { game } = makeGame();
    game._freeExploreHexKeys = new Set(['5,5']);
    game._peekableHexKeys = new Set(['5,5']);

    game.onHexClick(5, 5, 'island', 'blue');

    check(game.calls.length === 1 && game.calls[0].action === 'actExploreIsland',
        'the god-ability free explore dispatches actExploreIsland from its own '
        + 'map, so Artemis is not the one ability still gated on the disc');
    check(game.calls[0] && game.calls[0].args.hexQ === 5 && game.calls[0].args.hexR === 5,
        'with the clicked coordinates');
    check(!game.confirmed,
        'and never raises the explore-vs-peek confirm — the ability is free, '
        + 'there is no die to spend on a look instead');
}

// ============ 6. monsters keep priority =====================================
{
    const { game } = makeGame();
    game._fightableMonstersByHex = { '5,5': 42 };
    game._explorableHexColorByKey = { '5,5': 'blue' };

    game.onHexClick(5, 5, 'island', 'blue');

    check(game.calls.length === 1 && game.calls[0].action === 'actFightMonster',
        'a fightable monster on the hex still wins the click');
}

// ============ 7. the overlay click does not double-dispatch =================
{
    const { game, grid } = makeGame();
    game._buildableShrineHexKeys = new Set(['3,3']);
    game._highlightValidHexes(
        [{ q: 3, r: 3 }],
        'hex-action-target',
        (q, r) => game.bgaPerformAction('actBuildShrine', { hexQ: q, hexR: r }),
        { label: 'Build Shrine', iconClass: 'action-build-shrine' }
    );

    const overlay = grid.children.find((c) => c.classList.contains('hex-action-target'));
    check(!!overlay, 'the overlay is still rendered on the hex');

    const ev = makeEvent();
    overlay.fire('click', ev);

    check(ev.stopped,
        'the overlay click stops propagating — otherwise the board container '
        + 'resolves the same click by pixel and onHexClick fires the action twice');
    check(game.calls.length === 1, 'so exactly one action is dispatched');
}

// ============ 8. the hex maps have the same lifecycle as the rest ===========
{
    check(/this\._buildableShrineHexKeys = null;/.test(SRC),
        'onUpdateActionButtons resets _buildableShrineHexKeys on every args '
        + 'refresh, beside the fightable maps — a spent die must not leave a '
        + 'live build target on the board');
    check(/args\.buildableShrines/.test(SRC) && /_buildableShrineHexKeys = new Set/.test(SRC),
        'and the SelectAction branch fills it from args.buildableShrines');
    check(/this\._freeExploreHexKeys = null;/.test(SRC),
        'the god-ability map is reset on the same refresh, so the ability '
        + 'cannot stay clickable after it resolves');
    check(/_freeExploreHexKeys = new Set/.test(SRC),
        'and the free_explore_island branch fills it from args.validHexes');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
