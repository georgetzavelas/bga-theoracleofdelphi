/**
 * Offering-task hover highlight.
 *
 * A named offering tile reproduces the temple hover exactly, by asking the
 * delivery code the same question it asks: _relatedIslandsFor(temple hex,
 * 'temple', colour). Anything else and the two could disagree about where an
 * offering may be delivered.
 *
 * The "any" tile deliberately does NOT. Its eligible set is four of six
 * colours, offerings are seeded across six islands N per colour, so at four
 * players each colour sits on four of them. Fanning all four out is four
 * source rings, up to sixteen threads with their underlays, sixteen dots and
 * sixteen halos. It rings the eligible temples and stops; the delivery
 * highlight already fans out any one of them on hover.
 *
 * Run: node tests/test_offering_task_hover_js.js
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

const modSandbox = { console, captured: null, define(_d, f) { modSandbox.captured = f(); } };
vm.createContext(modSandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'modules', 'js', 'ZeusTaskTargets.js'), 'utf8'), modSandbox);
const ZeusTaskTargets = modSandbox.captured;
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
        style: { props: {}, setProperty(k, v) { el.style.props[k] = v; }, removeProperty(k) { delete el.style.props[k]; } },
        dataset: {}, attrs: {}, children: [], parent: null, listeners: {},
        classList: {
            add: function () { Array.prototype.forEach.call(arguments, c => classes.add(c)); },
            remove: function () { Array.prototype.forEach.call(arguments, c => classes.delete(c)); },
            contains: (c) => classes.has(c),
            toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); },
        },
        setAttribute(k, v) { if (k === 'class') { el.className = v; return; } el.attrs[k] = String(v); },
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

const METHODS = ['_setupTaskTileHover', '_zeusTileIdOf', '_showTaskTargets', '_clearTaskTargets',
    '_clearTaskFx', '_clearMonsterTaskTargets', '_pinTaskTile', '_unpinTaskTile',
    '_myOfferingTiles', '_templesByColor', '_showOfferingTaskTarget',
    '_drawTempleDelivery', '_drawEligibleTempleRings',
    '_ensureRelationFxLayer', '_drawRelationFx', '_relHexRing',
    '_myMonsterTiles', '_liveBoardMonsters', '_showMonsterTaskTargets', '_taskRingForMonster',
    '_showShrineTaskTarget', '_shrineTaskTargetFor', '_shrineLetterForTile',
    '_refreshShrineTileAffordance', '_showCreditedMonsterTile', '_showCreditedShrineTile',
    '_clearCreditedTaskTile'].map(extractMethod).join('\n');
const PROPS = [extractProp('TASK_RING_BY_DIE'), extractProp('MONSTER_TASK_DIE')].join('\n');

/** My offering tiles: the any tile, blue and pink. Six temples, one per colour. */
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
        { id: 1, color: 'white' }, { id: 2, color: 'blue' }, { id: 3, color: 'pink' },
    ];
    const zeusTiles = new Map();
    TILES.forEach(function (t) {
        const el = mk('delphi-zeus-tile zeus-offering', 'zeus_' + t.id);
        el.dataset.type = 'offering';
        el.dataset.color = t.color;
        el.dataset.completed = t.completed ? 'true' : 'false';
        area.appendChild(el);
        zeusTiles.set(t.id, el);
    });

    const TEMPLES = [
        { color: 'red', hexQ: '1', hexR: '1' }, { color: 'yellow', hexQ: '2', hexR: '2' },
        { color: 'green', hexQ: '3', hexR: '3' }, { color: 'blue', hexQ: '4', hexR: '4' },
        { color: 'pink', hexQ: '5', hexR: '5' }, { color: 'black', hexQ: '6', hexR: '6' },
    ];

    const document_ = {
        getElementById: (id) => byId[id] || null,
        querySelectorAll: (sel) => ALL.filter(el => !el.gone && matches(el, sel)),
        createElement: () => makeEl(),
        createElementNS: function () {
            const e = makeEl();
            const setAttr = e.setAttribute;
            e.setAttribute = function (k, v) { setAttr(k, v); if (k === 'id') byId[v] = e; };
            return e;
        },
        addEventListener(t, fn) { (document_.listeners[t] = document_.listeners[t] || []).push(fn); },
        listeners: {},
        fire(type, ev) { (document_.listeners[type] || []).forEach(fn => fn(ev)); },
    };

    const game = new Function('document', 'ZeusTaskTargets', 'ShrineTaskTargets',
        `return { ${PROPS} ${METHODS} };`)(document_, ZeusTaskTargets, ShrineTaskTargets);

    game._pinnedTaskTileId = null;
    game._taskHighlightShown = false;
    game._deliveryHighlightEnabled = true;
    game.components = { zeusTiles: zeusTiles, monsters: new Map(), shrines: new Map() };
    game.gamedatas = { temples: TEMPLES, zeusTiles: [], hexes: [] };
    game.player_id = 7;
    game.getPlayerGameColor = () => 'blue';
    game.shipPositions = { 7: { q: 0, r: 0 } };
    game._shrineIdFromHex = (q, r) => parseInt(q) * 100 + parseInt(r);
    game._findShrineZeusTileEl = () => null;
    game.getHexCenterPixel = (q, r) => ({ x: 50 + Number(q) * 60, y: 50 + Number(r) * 70 });

    // The one rule source both this and the temple hover must agree on.
    game.relCalls = [];
    game._relatedIslandsFor = (q, r, attr, color) => {
        game.relCalls.push({ q, r, attr, color });
        return opts.partners === undefined
            ? [{ q: 8, r: 8, color: color }, { q: 9, r: 9, color: color }]
            : opts.partners;
    };

    return { game, area, zeusTiles, byId };
}

const fx = (byId) => byId['delphi-task-fx'] || null;
const kidsOf = (byId) => (fx(byId) ? fx(byId).children : []);
const withClass = (byId, c) => kidsOf(byId).filter(k => k.classList.contains(c));

// ============ 1. a named tile IS the temple hover ============================
{
    const { game, zeusTiles, byId } = makeGame();
    game._showOfferingTaskTarget(zeusTiles.get(2));   // blue

    check(game.relCalls.length === 1, 'the delivery rule is consulted exactly once');
    const c = game.relCalls[0];
    check(c.q === 4 && c.r === 4 && c.attr === 'temple' && c.color === 'blue',
        "it is asked the temple hover's own question — the blue temple's hex, as a "
        + "temple, for blue — so the two can never disagree about where blue may go "
        + '(got ' + JSON.stringify(c) + ')');
    check(fx(byId).has('offering-task-named'), 'the overlay is marked as the named-tile case');
    check(withClass(byId, 'delphi-relation-thread').length > 0,
        'threads are drawn out to the islands still holding blue');
    check(zeusTiles.get(2).has('zeus-tile-task-active'), 'the tile is marked active');
    const namedHalo = withClass(byId, 'delphi-relation-halo')[0];
    check(namedHalo && namedHalo.attrs.stroke === '#007bff',
        'a NAMED tile keeps the delivery lines\' own colour — it stands for one '
        + 'colour, and that is the thing worth saying');
    check(!fx(byId).has('task-fx-white'), 'so it is not marked white-stroked');
    check(game._taskHighlightShown === true, 'and the shared pin state knows a highlight is up');
}

// A temple whose colour has nothing left on the board still rings.
{
    const { game, zeusTiles, byId } = makeGame({ partners: [] });
    game._showOfferingTaskTarget(zeusTiles.get(2));
    check(withClass(byId, 'delphi-relation-source').length === 1,
        'the temple is still ringed when no offering of that colour is left on the '
        + 'board — "the temple is there, there is nothing to bring" is an answer');
}

// ============ 2. the any tile rings temples and stops ========================
{
    const { game, zeusTiles, byId } = makeGame();
    game._showOfferingTaskTarget(zeusTiles.get(1));   // the "any" tile

    check(game.relCalls.length === 0,
        'the any tile never asks for offering islands — fanning four colours out '
        + 'is most of the board moving at once');
    check(withClass(byId, 'delphi-relation-thread').length === 0, 'so no threads are drawn');
    check(fx(byId).has('offering-task-any'), 'the overlay is marked as the any-tile case');

    const rings = withClass(byId, 'delphi-relation-halo');
    check(rings.length === 4,
        'one ring per still-eligible colour: six minus the two its siblings claim '
        + '(got ' + rings.length + ')');
    check(rings.every(r => r.attrs.stroke === '#ffffff'),
        'the any tile rings in white, matching the tile itself — it stands for no '
        + 'one colour, so picking four to paint would be arbitrary (got '
        + rings.map(r => r.attrs.stroke) + ')');
    check(fx(byId).has('task-fx-white'),
        'and the layer is marked white-stroked, so the rings get a dark shadow '
        + 'instead of the invisible white glow the coloured path applies inline');
    check(rings.every(r => !r.style.props.filter && !r.style.filter),
        'no inline glow is set, or it would outrank that CSS');

    // Which four they are is still the sibling-exclusion rule, colour or not.
    const at = (q, r) => rings.some(k => k.attrs.points
        && k.attrs.points.indexOf(String(50 + q * 60)) === 0);
    check(at(1) && at(2) && at(3) && at(6) && !at(4) && !at(5),
        'red, yellow, green and black are rung; blue and pink are not, because '
        + 'its two siblings have claimed them');
}

// A completed sibling still excludes its colour, matching the server.
{
    const { game, zeusTiles, byId } = makeGame({
        tiles: [{ id: 1, color: 'white' }, { id: 2, color: 'blue', completed: true }, { id: 3, color: 'pink' }],
    });
    game._showOfferingTaskTarget(zeusTiles.get(1));
    check(withClass(byId, 'delphi-relation-halo').length === 4,
        'a completed blue sibling still keeps blue off the any tile');
}

// ============ 3. a completed tile is silent =================================
{
    const { game, zeusTiles, byId } = makeGame({
        tiles: [{ id: 1, color: 'white' }, { id: 2, color: 'blue', completed: true }, { id: 3, color: 'pink' }],
    });
    game._showOfferingTaskTarget(zeusTiles.get(2));
    check(game._taskHighlightShown === false && kidsOf(byId).length === 0
        && game.relCalls.length === 0, 'a completed offering tile draws nothing');
}

// ============ 4. shared pin and mutual exclusion =============================
{
    const { game, area, zeusTiles, byId } = makeGame();
    game._setupTaskTileHover();

    area.fire('click', { target: zeusTiles.get(2) });
    check(game._pinnedTaskTileId === 2, 'clicking an offering tile pins it');
    area.fire('mouseout', { target: zeusTiles.get(2) });
    check(kidsOf(byId).length > 0, 'the highlight survives mouseout while pinned');

    area.fire('click', { target: zeusTiles.get(1) });
    check(game._pinnedTaskTileId === 1 && fx(byId).has('offering-task-any')
        && withClass(byId, 'delphi-relation-thread').length === 0,
        'moving the pin to the any tile replaces the drawing rather than adding to it');

    game._unpinTaskTile();
    check(game._pinnedTaskTileId === null && kidsOf(byId).length === 0, 'unpinning clears it');
}

// ============ 5. CSS ========================================================
{
    check(/\.zeus-offering:not\(\[data-completed="true"\]\)[^{]*\{[^}]*cursor:\s*pointer/.test(CSS)
        || /\.zeus-offering:not\(\[data-completed="true"\]\)[^{]*,[\s\S]{0,200}cursor:\s*pointer/.test(CSS),
        'an open offering tile shows a pointer');
    check(/#delphi-task-fx\.task-fx-white \.delphi-relation-thread-outline/.test(CSS),
        'the dark underlay is scoped to white-stroked drawing, not to the whole '
        + 'overlay — the offering highlight shares that overlay and keeps the '
        + "delivery lines' white underlay under its coloured threads");
    check(!/#delphi-task-fx \.delphi-relation-thread-outline\s*\{/.test(CSS),
        'and there is no layer-wide version left to catch it');
}

console.log((fail === 0 ? 'PASS' : 'FAIL') + ': offering task hover  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
