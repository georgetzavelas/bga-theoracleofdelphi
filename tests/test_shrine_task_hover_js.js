/**
 * Shrine-task hover/pin highlight: the DOM wiring around ShrineTaskTargets.
 *
 * The lookup itself is pinned by test_shrine_task_targets_js.js. What is
 * checked here is everything around it:
 *
 *   - The tile's Greek letter is not in the DOM (createZeusTiles stamps type,
 *     colour and completed, never the letter), so it has to come off
 *     gamedatas.zeusTiles by id. Get that wrong and every shrine tile silently
 *     locates nothing.
 *   - Discovered and peeked are told apart on the overlay, because they are
 *     different actions: build vs explore. A peeked island is NOT buildable.
 *   - The highlight owns its own SVG layer. Sharing the delivery lines' layer
 *     would let a board hover wipe a pinned highlight.
 *   - A tile whose island nobody has found does not pretend to be hoverable.
 *     Early game that is every shrine tile.
 *   - The two kinds of task highlight are mutually exclusive.
 *
 * Run: node tests/test_shrine_task_hover_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
    const m = SRC.match(new RegExp('^        ' + name + ': \\{[\\s\\S]*?^        \\},', 'm'));
    if (!m) throw new Error('property not found: ' + name);
    return m[0];
}

// --- the real rules modules ---------------------------------------------------
const modSandbox = { console, captured: null, define(_d, f) { modSandbox.captured = f(); } };
vm.createContext(modSandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'modules', 'js', 'MonsterTaskTargets.js'), 'utf8'), modSandbox);
const MonsterTaskTargets = modSandbox.captured;
modSandbox.captured = null;
vm.runInContext(fs.readFileSync(path.join(ROOT, 'modules', 'js', 'ShrineTaskTargets.js'), 'utf8'), modSandbox);
const ShrineTaskTargets = modSandbox.captured;

// --- stub DOM ---------------------------------------------------------------
let ALL = [];

function matches(el, sel) {
    return String(sel).split(',').some(function (part) {
        part = part.trim();
        if (!part) return false;
        return part.split(/(?=[.#])/).filter(Boolean).every(function (tok) {
            if (tok[0] === '#') return el.attrs.id === tok.slice(1);
            return el.classList.contains(tok.slice(1));
        });
    });
}

function makeEl(className, id) {
    const classes = new Set();
    const el = {
        style: {
            props: {},
            setProperty(k, v) { el.style.props[k] = v; },
            removeProperty(k) { delete el.style.props[k]; },
        },
        dataset: {}, attrs: {}, children: [], parent: null, listeners: {},
        classList: {
            add: function () { Array.prototype.forEach.call(arguments, c => classes.add(c)); },
            remove: function () { Array.prototype.forEach.call(arguments, c => classes.delete(c)); },
            contains: (c) => classes.has(c),
            toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); },
        },
        setAttribute(k, v) {
            if (k === 'class') { el.className = v; return; }
            el.attrs[k] = String(v);
            if (k === 'id') el.attrs.id = String(v);
        },
        appendChild(c) { c.parent = el; el.children.push(c); return c; },
        removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); return c; },
        addEventListener(t, fn) { (el.listeners[t] = el.listeners[t] || []).push(fn); },
        fire(type, ev) { (el.listeners[type] || []).forEach((fn) => fn(ev)); },
        closest(sel) { let n = el; while (n) { if (matches(n, sel)) return n; n = n.parent; } return null; },
        querySelector(sel) { return el.children.find(c => matches(c, sel)) || null; },
        remove() { if (el.parent) el.parent.removeChild(el); el.gone = true; },
        has(c) { return classes.has(c); },
    };
    Object.defineProperty(el, 'firstChild', { get: () => el.children[0] || null });
    Object.defineProperty(el, 'className', {
        get: () => Array.from(classes).join(' '),
        set: (v) => { classes.clear(); String(v).split(' ').filter(Boolean).forEach(c => classes.add(c)); },
    });
    Object.defineProperty(el, 'id', { get: () => el.attrs.id || '', set: (v) => { el.attrs.id = v; } });
    if (className) el.className = className;
    if (id) el.id = id;
    ALL.push(el);
    return el;
}

const METHODS = ['_setupTaskTileHover', '_zeusTileIdOf', '_myMonsterTiles',
    '_liveBoardMonsters', '_showMonsterTaskTargets', '_clearMonsterTaskTargets',
    '_pinTaskTile', '_unpinTaskTile', '_showTaskTargets', '_clearTaskTargets',
    '_showCreditedMonsterTile', '_clearCreditedTaskTile', '_taskRingForMonster',
    '_showShrineTaskTarget', '_clearShrineTaskTarget', '_shrineTaskTargetFor',
    '_shrineLetterForTile', '_refreshShrineTileAffordance', '_showCreditedShrineTile',
    // Real, not stubbed: the layer isolation and its state class are the design.
    '_ensureRelationFxLayer', '_drawRelationFx', '_relHexRing']
    .map(extractMethod).join('\n');
const PROPS = [extractProp('TASK_RING_BY_DIE'), extractProp('MONSTER_TASK_DIE')].join('\n');

/**
 * I am the blue player: omega, phi, sigma. My omega island was explored by
 * someone else, I peeked my phi island, and nobody has touched my sigma one.
 */
function makeGame(opts) {
    opts = opts || {};
    ALL = [];
    const byId = {};
    const mk = (cls, id) => { const e = makeEl(cls, id); if (id) byId[id] = e; return e; };

    const boardContainer = mk('', 'delphi-board-container');
    const pieces = mk('', 'delphi-board-pieces');
    boardContainer.appendChild(pieces);
    mk('', 'delphi-hex-grid');
    const area = mk('', 'delphi-zeus-tiles-area');

    const TILES = opts.tiles || [
        { id: 1, letter: 'omega' }, { id: 2, letter: 'phi' }, { id: 3, letter: 'sigma' },
    ];
    const zeusTiles = new Map();
    TILES.forEach(function (t) {
        const el = mk('delphi-zeus-tile zeus-shrine', 'zeus_' + t.id);
        el.dataset.type = 'shrine';
        el.dataset.color = 'white';
        el.dataset.completed = t.completed ? 'true' : 'false';
        area.appendChild(el);
        zeusTiles.set(t.id, el);
    });

    const HEXES = opts.hexes || [
        { q: 1, r: 1, color: 'red',   isRevealed: '1', shrineGameColor: 'blue',  shrineLetter: 'omega' },
        { q: 2, r: 2, color: 'green', isRevealed: '0', shrineGameColor: 'blue',  shrineLetter: 'phi'   },
        { q: 3, r: 3, color: 'blue',  isRevealed: '0', shrineGameColor: null,    shrineLetter: null    },
        { q: 4, r: 4, color: 'pink',  isRevealed: '1', shrineGameColor: 'green', shrineLetter: 'sigma' },
    ];

    const shrineId = (q, r) => parseInt(q) * 100 + parseInt(r);
    const shrines = new Map();
    HEXES.forEach(function (h) {
        const el = mk('delphi-shrine', 'shrine_' + shrineId(h.q, h.r));
        el.dataset.shrineId = String(shrineId(h.q, h.r));
        pieces.appendChild(el);
        shrines.set(shrineId(h.q, h.r), el);
    });

    const document_ = {
        getElementById: (id) => byId[id] || null,
        querySelectorAll: (sel) => ALL.filter(el => !el.gone && matches(el, sel)),
        createElement: () => makeEl(),
        createElementNS: () => makeEl(),
        addEventListener(t, fn) { (document_.listeners[t] = document_.listeners[t] || []).push(fn); },
        listeners: {},
        fire(type, ev) { (document_.listeners[type] || []).forEach(fn => fn(ev)); },
    };
    // _ensureRelationFxLayer looks the layer up by id after creating it.
    const origCreateNS = document_.createElementNS;
    document_.createElementNS = function () {
        const e = origCreateNS();
        const setAttr = e.setAttribute;
        e.setAttribute = function (k, v) { setAttr(k, v); if (k === 'id') byId[v] = e; };
        return e;
    };

    const game = new Function('document', 'MonsterTaskTargets', 'ShrineTaskTargets',
        `return { ${PROPS} ${METHODS} };`)(document_, MonsterTaskTargets, ShrineTaskTargets);

    game._pinnedTaskTileId = null;
    game._taskHighlightShown = false;
    game._deliveryHighlightEnabled = opts.enabled === undefined ? true : opts.enabled;
    game.components = { zeusTiles: zeusTiles, monsters: new Map(), shrines: shrines };
    game.gamedatas = {
        hexes: HEXES,
        zeusTiles: TILES.map(t => ({ id: t.id, taskType: 'shrine', taskLetter: t.letter, playerId: 7 })),
    };
    game.player_id = 7;
    game.getPlayerGameColor = () => opts.myColor || 'blue';
    game.shipPositions = opts.noShip ? {} : { 7: { q: 0, r: 0 } };
    game._shrineIdFromHex = shrineId;
    game._findShrineZeusTileEl = (letter) => {
        const t = TILES.find(x => x.letter === letter);
        return t ? zeusTiles.get(t.id) : null;
    };
    game.getHexCenterPixel = (q, r) => ({ x: 50 + Number(q) * 60, y: 50 + Number(r) * 70 });

    return { game, area, pieces, zeusTiles, shrines, document_, byId, shrineId };
}

const fxLayer = (byId) => byId['delphi-shrine-fx'] || null;
const badges = () => ALL.filter(el => !el.gone && el.classList.contains('shrine-task-die-badge'));

// ============ 1. the letter comes off gamedatas, not the DOM =================
{
    const { game, zeusTiles } = makeGame();
    check(zeusTiles.get(1).dataset.letter === undefined,
        'createZeusTiles does not stamp the Greek letter, so the DOM cannot answer this');
    check(game._shrineLetterForTile(zeusTiles.get(1)) === 'omega',
        'the letter is resolved from gamedatas.zeusTiles by tile id');
}

// ============ 2. discovered vs peeked are told apart ========================
{
    const { game, zeusTiles, byId } = makeGame();
    game._showShrineTaskTarget(zeusTiles.get(1));
    check(fxLayer(byId) !== null, 'the highlight draws into its own #delphi-shrine-fx layer, '
        + 'not the delivery lines\' shared one that a board hover wipes');
    check(fxLayer(byId).has('shrine-task-discovered'),
        'an island someone else explored is marked discovered — sail there and Build');
    check(zeusTiles.get(1).has('zeus-tile-task-active'), 'the hovered tile is marked active');

    game._showShrineTaskTarget(zeusTiles.get(2));
    check(fxLayer(byId).has('shrine-task-peeked') && !fxLayer(byId).has('shrine-task-discovered'),
        'an island only I have peeked is marked peeked, and the previous state class '
        + 'is gone — it is not buildable, so it must not look like the one that is');
}

// ============ 3. an unfound island points at nothing =========================
{
    const { game, zeusTiles, byId } = makeGame();
    game._showShrineTaskTarget(zeusTiles.get(3));
    check(!zeusTiles.get(3).has('zeus-tile-task-active') && game._taskHighlightShown === false,
        'a shrine task nobody has found draws nothing at all');
    check(fxLayer(byId) === null || fxLayer(byId).children.length === 0,
        'and leaves no empty overlay behind');
}

// A completed tile stays quiet even though its island is right there.
{
    const { game, zeusTiles } = makeGame({
        tiles: [{ id: 1, letter: 'omega', completed: true }, { id: 2, letter: 'phi' }, { id: 3, letter: 'sigma' }],
    });
    game._showShrineTaskTarget(zeusTiles.get(1));
    check(game._taskHighlightShown === false, 'a completed shrine task points at nothing');
}

// ============ 4. the die badge ==============================================
{
    const { game, zeusTiles, shrines, shrineId } = makeGame();
    game._showShrineTaskTarget(zeusTiles.get(1));
    const b = badges();
    check(b.length === 1, 'exactly one die badge (got ' + b.length + ')');
    check(b[0].classList.contains('die-color-red'),
        "the badge shows the island's exploration colour, which is the die you need there");
    check(b[0].parent === shrines.get(shrineId(1, 1)),
        'the badge hangs off the island, not the tile');

    game._clearShrineTaskTarget();
    check(badges().length === 0, 'clearing removes the badge');
}

// Peeked islands need the same die to explore, so they get a badge too.
{
    const { game, zeusTiles } = makeGame();
    game._showShrineTaskTarget(zeusTiles.get(2));
    check(badges().length === 1 && badges()[0].classList.contains('die-color-green'),
        'a peeked island shows its die too — exploring it needs the same colour');
}

// ============ 5. the arc starts at my ship ==================================
{
    const { game, zeusTiles, byId } = makeGame();
    game._showShrineTaskTarget(zeusTiles.get(1));
    check(fxLayer(byId).children.length > 1,
        'a source ring plus at least one thread and halo are drawn');
}
{
    const { game, zeusTiles, byId } = makeGame({ noShip: true });
    game._showShrineTaskTarget(zeusTiles.get(1));
    check(fxLayer(byId) !== null && zeusTiles.get(1).has('zeus-tile-task-active'),
        'with no ship position (spectator, or pre-placement) the island is still '
        + 'ringed rather than the whole highlight dropping');
}

// ============ 6. the affordance ============================================
{
    const { game, zeusTiles } = makeGame();
    game._refreshShrineTileAffordance();
    check(zeusTiles.get(1).has('zeus-tile-locatable'), 'the discovered tile invites a hover');
    check(zeusTiles.get(2).has('zeus-tile-locatable'), 'so does the peeked one');
    check(!zeusTiles.get(3).has('zeus-tile-locatable'),
        'the tile nobody has found does not — early game that is every shrine tile, '
        + 'and a hover that answers with nothing reads as broken');

    // It has to let go again, not just accumulate.
    game.gamedatas.hexes[0].shrineGameColor = null;
    game.gamedatas.hexes[0].shrineLetter = null;
    game._refreshShrineTileAffordance();
    check(!zeusTiles.get(1).has('zeus-tile-locatable'), 'and it clears when the answer changes');
}

// ============ 7. pinning, shared with the monster highlight =================
{
    const { game, area, zeusTiles, byId } = makeGame();
    game._setupTaskTileHover();

    area.fire('click', { target: zeusTiles.get(1) });
    check(game._pinnedTaskTileId === 1, 'clicking a locatable shrine tile pins it');
    area.fire('mouseout', { target: zeusTiles.get(1) });
    check(fxLayer(byId).children.length > 0, 'the highlight survives mouseout while pinned');

    area.fire('click', { target: zeusTiles.get(2) });
    check(game._pinnedTaskTileId === 2 && fxLayer(byId).has('shrine-task-peeked'),
        'clicking another tile moves the pin to it');

    game._unpinTaskTile();
    check(game._pinnedTaskTileId === null && fxLayer(byId).children.length === 0
        && badges().length === 0, 'unpinning clears the overlay and the badge');
}

// A shrine tile nothing can locate does not pin.
{
    const { game, area, zeusTiles } = makeGame();
    game._setupTaskTileHover();
    area.fire('click', { target: zeusTiles.get(3) });
    check(game._pinnedTaskTileId === null, 'a tile with nothing to show does not pin');
}

// ============ 8. reverse: hovering the island ===============================
{
    const { game, pieces, zeusTiles, shrines, shrineId } = makeGame();
    game._setupTaskTileHover();

    pieces.fire('mouseover', { target: shrines.get(shrineId(1, 1)) });
    check(zeusTiles.get(1).has('zeus-tile-task-credited'),
        'hovering my omega island rings the omega tile');
    check(zeusTiles.get(1).style.props['--task-ring'] === '#dc3545',
        "the ring takes the island's exploration colour (red)");

    pieces.fire('mouseout', { target: shrines.get(shrineId(1, 1)) });
    check(!zeusTiles.get(1).has('zeus-tile-task-credited'), 'and lets go on mouseout');

    pieces.fire('mouseover', { target: shrines.get(shrineId(4, 4)) });
    check(!zeusTiles.get(3).has('zeus-tile-task-credited'),
        "a green player's sigma island is not my sigma island and rings nothing");

    pieces.fire('mouseover', { target: shrines.get(shrineId(3, 3)) });
    check(!zeusTiles.get(3).has('zeus-tile-task-credited'),
        'an island I know nothing about rings nothing');
}

// ============ 9. the two highlights do not overlap ==========================
{
    const { game, area, zeusTiles, byId } = makeGame();
    game._setupTaskTileHover();
    area.fire('click', { target: zeusTiles.get(1) });
    check(fxLayer(byId).children.length > 0, 'shrine highlight is up');
    // A monster tile's show routes through the shared clear.
    game._clearTaskTargets();
    check(fxLayer(byId).children.length === 0,
        'the shared clear reaches the shrine overlay, so switching to a monster '
        + 'tile cannot leave a stale arc across the board');
}

// ============ 10. CSS ======================================================
{
    check(/#delphi-shrine-fx\.shrine-task-peeked[\s\S]{0,200}stroke-dasharray/.test(CSS),
        'the peeked halo is dashed — it is known but not buildable, and must not '
        + 'read the same as the one you can act on');
    check(/\.delphi-relation-fx-layer\s*\{/.test(CSS),
        'the second overlay inherits the first one\'s geometry by class, or it '
        + 'would sit at the page origin instead of over the board');
    check(/\.delphi-shrine \.shrine-task-die-badge[\s\S]{0,400}pointer-events:\s*none/.test(CSS),
        'the die badge never swallows a click meant for the island');
    check(/\.zeus-shrine\.zeus-tile-locatable[\s\S]{0,120}cursor:\s*pointer/.test(CSS),
        'only a locatable shrine tile shows a pointer');
}

console.log((fail === 0 ? 'PASS' : 'FAIL') + ': shrine task hover  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
