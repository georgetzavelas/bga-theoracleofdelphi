/**
 * Monster-task hover/pin highlight: the DOM wiring around ZeusTaskTargets.
 *
 * The rules themselves are pinned by test_monster_task_targets_js.js. What is
 * checked here is everything the rules cannot see:
 *
 *   - The tile data comes off the live DOM, including the 'white' sentinel
 *     createZeusTiles stamps on the "any" tile. Read that as a literal colour
 *     and the wildcard silently matches nothing.
 *   - Completed tiles are inert. They stay in the DOM at opacity 0, so without
 *     the pointer-events guard the board lights up from an empty-looking slot.
 *   - Discard mode is left alone. It is modal, owns the click, and a pin left
 *     standing through it can never be dismissed.
 *   - A pin outlives mouseout (the reason it exists: scrolling down to the
 *     board, and touch clients, which have no hover at all).
 *   - The lift wins over the inline z-index updateMonsterStack writes. Without
 *     !important a matching monster stays buried under its stack, which is the
 *     exact case the highlight is for.
 *   - The glow survives reduce-motion. It is declared on the rule, not only in
 *     the keyframes, so `animation: none` dims the pulse instead of erasing
 *     the highlight.
 *
 * Run: node tests/test_monster_task_hover_js.js
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

/** Body of the first CSS rule whose selector list contains `selector`. */
function cssRule(selector) {
    const re = new RegExp('(^|\\n)([^{}]*' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^{}]*)\\{([^}]*)\\}');
    const m = CSS.match(re);
    return m ? m[3] : null;
}

// --- the real rules module, loaded the way the browser loads it --------------
const modSandbox = { console, captured: null, define(_d, f) { modSandbox.captured = f(); } };
vm.createContext(modSandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'modules', 'js', 'ZeusTaskTargets.js'), 'utf8'), modSandbox);
const ZeusTaskTargets = modSandbox.captured;
modSandbox.captured = null;
vm.runInContext(fs.readFileSync(path.join(ROOT, 'modules', 'js', 'ShrineTaskTargets.js'), 'utf8'), modSandbox);
const ShrineTaskTargets = modSandbox.captured;

// --- stub DOM ---------------------------------------------------------------
let ALL = [];

// Supports the subset of CSS the production code uses: '#id', '.class',
// concatenations of those, and comma-separated selector lists (real closest()
// takes a list, and the shared tile handler passes one).
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
        },
        appendChild(c) { c.parent = el; el.children.push(c); return c; },
        addEventListener(t, fn) { (el.listeners[t] = el.listeners[t] || []).push(fn); },
        fire(type, ev) { (el.listeners[type] || []).forEach((fn) => fn(ev)); },
        closest(sel) {
            let n = el;
            while (n) { if (matches(n, sel)) return n; n = n.parent; }
            return null;
        },
        has(c) { return classes.has(c); },
    };
    Object.defineProperty(el, 'className', {
        get: () => Array.from(classes).join(' '),
        set: (v) => { classes.clear(); String(v).split(' ').filter(Boolean).forEach((c) => classes.add(c)); },
    });
    Object.defineProperty(el, 'id', {
        get: () => el.attrs.id || '', set: (v) => { el.attrs.id = v; },
    });
    if (className) el.className = className;
    if (id) el.id = id;
    ALL.push(el);
    return el;
}

const METHODS = ['_setupTaskTileHover', '_taskTileFromEvent', '_onTaskTileOver', '_onTaskTileOut', '_onTaskTileClick',
    '_taskPipFor', '_taskPipIsSpent', '_markTaskTile', '_bindTaskPipHover', '_zeusTileIdOf', '_myMonsterTiles',
    '_liveBoardMonsters', '_showMonsterTaskTargets', '_clearMonsterTaskTargets',
    '_pinTaskTile', '_unpinTaskTile', '_showTaskTargets', '_clearTaskTargets',
    '_showCreditedMonsterTile', '_clearCreditedTaskTile', '_taskRingForMonster',
    // The shrine half shares the handlers, so it has to be real here too or
    // the dispatch and the shared clear go untested.
    '_showShrineTaskTarget', '_clearTaskFx', '_shrineTaskTargetFor',
    '_shrineLetterForTile', '_refreshShrineTileAffordance', '_showCreditedShrineTile']
    .map(extractMethod).join('\n');

/** A plain object-literal property (not a function) lifted from the source. */
function extractProp(name) {
    const m = SRC.match(new RegExp('^        ' + name + ': \\{[\\s\\S]*?^        \\},', 'm'));
    if (!m) throw new Error('property not found: ' + name);
    return m[0];
}
// Palettes come off the real source so the test can't drift from them.
const PROPS = [extractProp('TASK_RING_BY_DIE'), extractProp('MONSTER_TASK_DIE')].join('\n');

/**
 * A board mid-game. Tiles: the "any" tile, a hydra tile, a siren tile.
 * Monsters: two hydras, one siren, one gorgon, one minotaur.
 */
function makeGame(opts) {
    opts = opts || {};
    ALL = [];

    const byId = {};
    const mk = (cls, id) => { const e = makeEl(cls, id); if (id) byId[id] = e; return e; };

    const boardContainer = mk('', 'delphi-board-container');
    const pieces = mk('', 'delphi-board-pieces');
    boardContainer.appendChild(pieces);
    const area = mk('', 'delphi-zeus-tiles-area');

    const zeusTiles = new Map();
    (opts.tiles || [
        { id: 1, color: 'white' },              // the "any" tile
        { id: 2, color: 'hydra' },
        { id: 3, color: 'siren' },
    ]).forEach(function (t) {
        const el = mk('delphi-zeus-tile zeus-monster', 'zeus_' + t.id);
        el.dataset.type = 'monster';
        el.dataset.color = t.color;
        el.dataset.completed = t.completed ? 'true' : 'false';
        if (t.discardable) el.classList.add('zeus-tile-discardable');
        area.appendChild(el);
        zeusTiles.set(t.id, el);
    });

    const monsters = new Map();
    [[10, 'hydra'], [11, 'hydra'], [12, 'siren'], [13, 'gorgon'], [14, 'minotaur']]
        .forEach(function (m) {
            const el = mk('delphi-monster monster-' + m[1], 'monster_' + m[0]);
            el.dataset.type = m[1];
            pieces.appendChild(el);
            monsters.set(String(m[0]), el);
        });

    const document_ = {
        getElementById: (id) => byId[id] || null,
        querySelectorAll: (sel) => {
            const wanted = sel.split(',').map(s => s.trim());
            return ALL.filter(el => wanted.some(w => matches(el, w)));
        },
        addEventListener(t, fn) { (document_.listeners[t] = document_.listeners[t] || []).push(fn); },
        listeners: {},
        fire(type, ev) { (document_.listeners[type] || []).forEach(fn => fn(ev)); },
    };

    const game = new Function('document', 'ZeusTaskTargets',
        'ShrineTaskTargets',
        `return { ${PROPS} ${METHODS} };`)(document_, ZeusTaskTargets, ShrineTaskTargets);

    game._pinnedTaskTileId = null;
    game._taskHighlightShown = false;
    game._deliveryHighlightEnabled = opts.enabled === undefined ? true : opts.enabled;
    game.components = { zeusTiles: zeusTiles, monsters: monsters, shrines: new Map() };
    // No shrine tiles in this fixture, so the shrine half stays inert; these
    // only exist so the shared dispatch can run without throwing.
    game.gamedatas = { zeusTiles: [], hexes: [] };
    game.getPlayerGameColor = () => 'blue';
    game.shipPositions = {};
    game._shrineIdFromHex = (q, r) => parseInt(q) * 100 + parseInt(r);
    game._findShrineZeusTileEl = () => null;
    game._drawRelationFx = () => {};

    return { game, area, pieces, boardContainer, zeusTiles, monsters, document_ };
}

const lit = (monsters) => Array.from(monsters.entries())
    .filter(([, el]) => el.has('monster-task-match')).map(([id]) => id).sort();

// ============ 1. tiles are read off the live DOM =============================
{
    const { game } = makeGame();
    const tiles = game._myMonsterTiles();
    check(tiles.length === 3, 'all three monster tiles are picked up (got ' + tiles.length + ')');
    const wild = tiles.find(t => t.id === 1);
    check(wild && wild.color === null,
        "the 'white' sentinel createZeusTiles stamps on the any-tile is read back as null, "
        + 'not as a monster type that can never match');
    check(tiles.find(t => t.id === 2).color === 'hydra', 'a named tile keeps its monster type');
    check(tiles.every(t => t.done === false), 'open tiles are not marked done');
}

// ============ 2. a named tile lights only its own type =======================
{
    const { game, zeusTiles, monsters, boardContainer } = makeGame();
    game._showMonsterTaskTargets(zeusTiles.get(2));
    check(String(lit(monsters)) === String(['10', '11']),
        'the hydra tile lights both hydras and nothing else (got ' + lit(monsters) + ')');
    check(boardContainer.has('monster-task-focus'),
        'the board container carries the focus class, which is what dims the rest');
    check(zeusTiles.get(2).has('zeus-tile-task-active'), 'the hovered tile is marked active');
    check(monsters.get('10').style.props['--task-ring'] === '#EE73B6',
        'each match is stamped with its own die colour (hydra = pink)');
}

// ============ 3. the any-tile lights what its siblings do not claim ==========
{
    const { game, zeusTiles, monsters } = makeGame();
    game._showMonsterTaskTargets(zeusTiles.get(1));
    check(String(lit(monsters)) === String(['13', '14']),
        'the any-tile lights the gorgon and minotaur, never the hydra or siren its '
        + 'siblings have claimed (got ' + lit(monsters) + ')');
}

// ============ 4. clearing puts the board back ================================
{
    const { game, zeusTiles, monsters, boardContainer } = makeGame();
    game._showMonsterTaskTargets(zeusTiles.get(2));
    game._clearMonsterTaskTargets();
    check(lit(monsters).length === 0, 'no monster is left lit');
    check(!boardContainer.has('monster-task-focus'), 'the board is no longer dimmed');
    check(monsters.get('10').style.props['--task-ring'] === undefined,
        'the inline ring colour is removed, not left behind for the next hover');
    check(!zeusTiles.get(2).has('zeus-tile-task-active'), 'the tile is no longer marked active');
}

// ============ 5. a pin outlives the mouse ====================================
{
    const { game, area, zeusTiles, monsters } = makeGame();
    game._setupTaskTileHover();
    const tile = zeusTiles.get(2);

    area.fire('click', { target: tile });
    check(game._pinnedTaskTileId === 2, 'clicking a monster tile pins it');
    check(tile.has('zeus-tile-task-pinned'), 'the pinned tile is marked as held');

    area.fire('mouseout', { target: tile });
    check(lit(monsters).length === 2,
        'the highlight survives mouseout while pinned — the whole reason the pin '
        + 'exists, since the board can be scrolled well below the tiles');

    area.fire('mouseover', { target: zeusTiles.get(1) });
    check(String(lit(monsters)) === String(['10', '11']),
        'hovering another tile does not quietly repaint over a pin');

    area.fire('click', { target: tile });
    check(game._pinnedTaskTileId === null && lit(monsters).length === 0,
        'clicking the pinned tile again releases it');
}

// ============ 6. the pin can always be dismissed =============================
{
    const { game, area, zeusTiles, monsters, document_ } = makeGame();
    game._setupTaskTileHover();
    area.fire('click', { target: zeusTiles.get(2) });

    document_.fire('click', { target: makeEl('somewhere-else') });
    check(game._pinnedTaskTileId === null && lit(monsters).length === 0,
        'clicking away releases the pin');

    area.fire('click', { target: zeusTiles.get(2) });
    document_.fire('keydown', { key: 'Escape' });
    check(game._pinnedTaskTileId === null, 'Escape releases the pin');
}

// A click that lands on a tile must not be cancelled by the document-level
// release handler running later in the same bubble.
{
    const { game, area, zeusTiles, document_ } = makeGame();
    game._setupTaskTileHover();
    const ev = { target: zeusTiles.get(2) };
    area.fire('click', ev);
    document_.fire('click', ev);
    check(game._pinnedTaskTileId === 2,
        'the document release handler does not cancel the very click that pinned');
}

// ============ 7. inert tiles stay inert ======================================
{
    const { game, area, monsters, zeusTiles, boardContainer } = makeGame({
        tiles: [
            { id: 1, color: 'white' },
            { id: 2, color: 'hydra', completed: true },
            { id: 3, color: 'siren', discardable: true },
        ],
    });
    game._setupTaskTileHover();

    area.fire('mouseover', { target: zeusTiles.get(2) });
    check(lit(monsters).length === 0 && !boardContainer.has('monster-task-focus'),
        'a completed tile neither lights nor dims the board — it is still in the '
        + 'DOM at opacity 0, so any reaction would appear to come from an empty '
        + 'slot, and a dim with nothing lit reads as a glitch');

    area.fire('click', { target: zeusTiles.get(3) });
    check(game._pinnedTaskTileId === null,
        'a discardable tile is left to discard mode, which owns the click');
}

// ============ 8. the pref gates it ===========================================
{
    const { game, area, zeusTiles, monsters } = makeGame({ enabled: false });
    game._setupTaskTileHover();
    area.fire('mouseover', { target: zeusTiles.get(2) });
    area.fire('click', { target: zeusTiles.get(2) });
    check(lit(monsters).length === 0 && game._pinnedTaskTileId === null,
        'with the highlight preference off, nothing hovers and nothing pins');
}

// ============ 9. reverse: a monster rings the tile it credits ================
{
    const { game, pieces, zeusTiles, monsters } = makeGame();
    game._setupTaskTileHover();

    pieces.fire('mouseover', { target: monsters.get('10') });   // hydra
    check(zeusTiles.get(2).has('zeus-tile-task-credited'),
        'hovering a hydra rings the hydra tile');
    check(zeusTiles.get(2).style.props['--task-ring'] === '#EE73B6',
        'the ring takes the monster\'s die colour');

    pieces.fire('mouseout', { target: monsters.get('10') });
    pieces.fire('mouseover', { target: monsters.get('13') });   // gorgon
    check(zeusTiles.get(1).has('zeus-tile-task-credited') && !zeusTiles.get(2).has('zeus-tile-task-credited'),
        'a gorgon credits the any-tile, and the previous ring is cleared first');
}

// A type nothing can credit rings nothing.
{
    const { game, pieces, zeusTiles, monsters } = makeGame({
        tiles: [
            { id: 1, color: 'white', completed: true },
            { id: 2, color: 'hydra', completed: true },
            { id: 3, color: 'siren' },
        ],
    });
    game._setupTaskTileHover();
    pieces.fire('mouseover', { target: monsters.get('10') });   // hydra, tile already done
    check(!zeusTiles.get(2).has('zeus-tile-task-credited') && !zeusTiles.get(1).has('zeus-tile-task-credited'),
        'a monster that would credit nothing rings nothing');
}

// The two directions never draw at once.
{
    const { game, area, pieces, zeusTiles, monsters } = makeGame();
    game._setupTaskTileHover();
    area.fire('click', { target: zeusTiles.get(2) });
    pieces.fire('mouseover', { target: monsters.get('13') });
    check(!zeusTiles.get(1).has('zeus-tile-task-credited'),
        'the reverse highlight stays out of the way while a forward one is up');
}

// ============ 10. a dying monster is not a target ============================
// Components.removeMonster keeps the chip in the monsters Map and in the DOM
// for 400ms while its lift-and-fade plays. Anything reading the Map naively
// sees a monster that is already dead.
{
    const { game, zeusTiles, monsters } = makeGame();
    monsters.get('10').classList.add('monster-removing');

    const live = game._liveBoardMonsters().map(m => m.id).sort();
    check(String(live) === String(['11', '12', '13', '14']),
        'a monster mid-removal is not a live monster (got ' + live + ')');

    game._showMonsterTaskTargets(zeusTiles.get(2));
    check(String(lit(monsters)) === String(['11']),
        'hovering the hydra tile during a hydra\'s death animation lights only '
        + 'the surviving hydra (got ' + lit(monsters) + ')');
}

// The same in the other direction.
{
    const { game, pieces, zeusTiles, monsters } = makeGame();
    game._setupTaskTileHover();
    monsters.get('10').classList.add('monster-removing');
    pieces.fire('mouseover', { target: monsters.get('10') });
    check(!zeusTiles.get(2).has('zeus-tile-task-credited'),
        'hovering a monster that is already dying credits nothing');
}

// ============ 10b. my panel's pillars stand in for my tiles =================
/**
 * My panel (player 7) carries one pillar per tile; an opponent's panel (8) is
 * there to prove ancestry is checked. The stub elements get just enough
 * querySelector for the one lookup _taskPipFor makes.
 */
function withPanel(made, opts) {
    opts = opts || {};
    const { game } = made;
    const byPid = {};
    const pip = (row, tileId, done) => {
        const el = makeEl('delphi-pp-task-pip' + (done ? ' done' : ''));
        el.dataset.tileId = String(tileId);
        row.appendChild(el);
        return el;
    };
    const rowFor = (pid) => {
        const root = makeEl('player-panel');
        const row = makeEl('delphi-pp-tasks', 'pp-tasks-' + pid);
        root.appendChild(row);
        row.querySelector = (sel) => {
            const m = /data-tile-id="([^"]+)"/.exec(sel);
            return row.children.filter(c => m && c.dataset.tileId === m[1])[0] || null;
        };
        byPid[pid] = { root, row };
        return row;
    };
    const mine = rowFor(7);
    const pips = { 1: pip(mine, 1), 2: pip(mine, 2), 3: pip(mine, 3, opts.doneSiren) };
    const theirs = pip(rowFor(8), 2);

    // Route the new ids through the fixture's getElementById.
    const origGet = made.document_.getElementById;
    made.document_.getElementById = (id) => {
        const m = /^pp-tasks-(\d+)$/.exec(id);
        return m && byPid[m[1]] ? byPid[m[1]].row : origGet(id);
    };
    game.player_id = 7;
    let repaints = 0;
    game.components.playerPanel = {
        getRoot: (pid) => byPid[pid] ? byPid[pid].root : null,
        updateTask: () => { repaints++; },
    };
    return { pips, theirs, root: byPid[7].root, otherRoot: byPid[8].root };
}

{
    const made = makeGame();
    const { game, zeusTiles, monsters, document_ } = made;
    const { pips, root } = withPanel(made);
    game._setupTaskTileHover();
    game._bindTaskPipHover(7);

    root.fire('mouseover', { target: pips[2] });
    check(String(lit(monsters)) === String(['10', '11']),
        'hovering my hydra pillar lights the same hydras its tile does (got ' + lit(monsters) + ')');
    check(pips[2].has('zeus-tile-task-active') && zeusTiles.get(2).has('zeus-tile-task-active'),
        'the pillar and its tile both show the hover');

    root.fire('mouseout', { target: pips[2] });
    check(lit(monsters).length === 0 && !pips[2].has('zeus-tile-task-active'),
        'leaving the pillar clears the board and the pillar');

    const ev = { target: pips[2] };
    root.fire('click', ev);
    document_.fire('click', ev);
    check(game._pinnedTaskTileId === 2 && pips[2].has('zeus-tile-task-pinned'),
        'clicking a pillar pins its tile, and the release handler does not cancel it');

    document_.fire('click', { target: makeEl('somewhere-else') });
    check(game._pinnedTaskTileId === null && !pips[2].has('zeus-tile-task-pinned'),
        'clicking away releases a pillar pin and unmarks the pillar');
}

{
    const made = makeGame();
    const { game, pieces, monsters } = made;
    const { pips } = withPanel(made);
    game._setupTaskTileHover();
    pieces.fire('mouseover', { target: monsters.get('12') });
    check(pips[3].has('zeus-tile-task-credited') && pips[3].style.props['--task-ring'],
        'hovering a siren rings the siren pillar as well as its tile, in its die colour');
    pieces.fire('mouseout', { target: monsters.get('12') });
    check(!pips[3].has('zeus-tile-task-credited') && !pips[3].style.props['--task-ring'],
        'and the reverse ring clears off the pillar too');
}

{
    const made = makeGame();
    const { game, monsters } = made;
    const { pips, theirs, root, otherRoot } = withPanel(made, { doneSiren: true });
    game._setupTaskTileHover();
    game._bindTaskPipHover(7);
    game._bindTaskPipHover(8);
    check(!otherRoot.listeners.mouseover, 'an opponent\'s panel gets no pillar handlers');
    root.fire('mouseover', { target: theirs });
    check(lit(monsters).length === 0, 'an opponent\'s pillar never lights my board');
    root.fire('mouseover', { target: pips[3] });
    check(lit(monsters).length === 0, 'a done pillar is spent and lights nothing');

    made.zeusTiles.get(2).classList.add('zeus-tile-discardable');
    root.fire('mouseover', { target: pips[2] });
    check(lit(monsters).length === 0, 'discard mode leaves the pillars alone too');
}

{
    const made = makeGame();
    const { game } = made;
    const { pips, root } = withPanel(made);
    game._setupTaskTileHover();
    game._bindTaskPipHover(7);
    root.fire('click', { target: pips[2] });
    pips[2].classList.remove('zeus-tile-task-active', 'zeus-tile-task-pinned'); // what a repaint does
    game.components.playerPanel.updateTask(7, 'monster', []);
    check(pips[2].has('zeus-tile-task-pinned'),
        'a column repaint under a pin marks the pinned pillar again');
}

// A finished task's pillar does nothing, whichever side learns first.
{
    // The Zeus tile is completed but the pillar has not repainted yet.
    const made = makeGame({ tiles: [
        { id: 1, color: 'white' }, { id: 2, color: 'hydra', completed: true }, { id: 3, color: 'siren' },
    ] });
    const { game, monsters } = made;
    const { pips, root } = withPanel(made);
    game._setupTaskTileHover();
    game._bindTaskPipHover(7);
    root.fire('mouseover', { target: pips[2] });
    check(lit(monsters).length === 0 && !pips[2].has('zeus-tile-task-active'),
        'a pillar whose Zeus tile is completed lights nothing, even before the pillar shows done');
    root.fire('click', { target: pips[2] });
    check(game._pinnedTaskTileId === null, 'and clicking it pins nothing');
}

{
    // The kill marks the pillar done; the tile waits for the equipment pick.
    const made = makeGame();
    const { game, pieces, monsters } = made;
    const { pips } = withPanel(made, { doneSiren: true });
    game._setupTaskTileHover();
    pieces.fire('mouseover', { target: monsters.get('12') });
    check(!pips[3].has('zeus-tile-task-credited'),
        'the reverse ring never lands on a done pillar');
}

{
    const made = makeGame();
    const { game, monsters } = made;
    const { pips, root } = withPanel(made);
    game._setupTaskTileHover();
    game._bindTaskPipHover(7);
    root.fire('click', { target: pips[2] });
    pips[2].classList.remove('zeus-tile-task-active', 'zeus-tile-task-pinned');
    pips[2].classList.add('done');   // the kill's repaint
    game.components.playerPanel.updateTask(7, 'monster', []);
    check(game._pinnedTaskTileId === null && lit(monsters).length === 0,
        'a repaint that finishes the pinned task releases the pin and clears the board');
    check(!pips[2].has('zeus-tile-task-pinned'), 'and does not mark the done pillar');
}

// ============ 11. CSS: the parts that silently fail ==========================
{
    const match = cssRule('.delphi-monster.monster-task-match');
    check(match && /z-index:\s*200\s*!important/.test(match),
        'the lift beats the inline z-index updateMonsterStack writes — without '
        + '!important the needed monster stays buried in its stack');
    check(match && /--stack-y/.test(match),
        'the lift is relative to --stack-y, so it composes with stack position '
        + 'instead of yanking every chip to the same spot');
    check(match && /filter:/.test(match) && /animation:/.test(match),
        'the glow is declared on the rule as well as animated, so reduce-motion '
        + 'can stop the pulse without erasing the highlight');

    check(/\.monster-task-match:not\(\.monster-removing\)/.test(CSS),
        'the highlight rule excludes a dying chip. It carries an id selector and '
        + 'so outranks .monster-removing: without this it replaces the removal '
        + 'animation with its own glow, and the defeated monster hangs on the '
        + 'board lit and lifted until it pops out of existence 400ms later');

    const completed = cssRule('.delphi-zeus-tile[data-completed="true"]');
    check(completed && /pointer-events:\s*none/.test(completed),
        'completed tiles stop answering hover');

    // A chip already carrying the highlight when it is defeated keeps the class
    // for the 400ms the removal runs. `animation: none !important` aimed at the
    // highlight would land on the removal animation instead and freeze the
    // corpse on the board, so both gates have to spare a dying chip.
    check((CSS.match(/\.monster-task-match:not\(\.monster-removing\)/g) || []).length === 3,
        'all three rules that name .monster-task-match spare a dying chip: the '
        + 'highlight itself and both reduce-motion gates');

    const reduced = CSS.match(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none !important;/);
    check(reduced && /\.delphi-monster\.monster-task-match/.test(reduced[0]),
        'the OS reduce-motion gate lists the new pulse');
    const prefGate = CSS.match(/body\.motion-reduced-pref[\s\S]*?animation: none !important;\n\}/);
    check(prefGate && /\.delphi-monster\.monster-task-match/.test(prefGate[0]),
        'the in-game reduce-motion preference lists it too — the two lists are '
        + 'independent gates and have to stay in sync');
}

console.log((fail === 0 ? 'PASS' : 'FAIL') + ': monster task hover  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
