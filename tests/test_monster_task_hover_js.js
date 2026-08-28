/**
 * Monster-task hover/pin highlight: the DOM wiring around MonsterTaskTargets.
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
vm.runInContext(fs.readFileSync(path.join(ROOT, 'modules', 'js', 'MonsterTaskTargets.js'), 'utf8'), modSandbox);
const MonsterTaskTargets = modSandbox.captured;

// --- stub DOM ---------------------------------------------------------------
let ALL = [];

function matches(el, sel) {
    return sel.split(/(?=[.#])/).filter(Boolean).every(function (tok) {
        if (tok[0] === '#') return el.attrs.id === tok.slice(1);
        return el.classList.contains(tok.slice(1));
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

const METHODS = ['_setupMonsterTaskHover', '_zeusTileIdOf', '_myMonsterTiles',
    '_liveBoardMonsters', '_showMonsterTaskTargets', '_clearMonsterTaskTargets',
    '_pinMonsterTask', '_unpinMonsterTask', '_showCreditedMonsterTile',
    '_clearCreditedMonsterTile'].map(extractMethod).join('\n');

// Ring palette comes off the real source so the test can't drift from it.
const RING_SRC = SRC.match(/MONSTER_TASK_RING: \{[\s\S]*?\},/)[0];

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

    const game = new Function('document', 'MonsterTaskTargets',
        `return { ${RING_SRC} ${METHODS} };`)(document_, MonsterTaskTargets);

    game._pinnedMonsterTaskTileId = null;
    game._monsterTaskShown = false;
    game._deliveryHighlightEnabled = opts.enabled === undefined ? true : opts.enabled;
    game.components = { zeusTiles: zeusTiles, monsters: monsters };

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
    game._setupMonsterTaskHover();
    const tile = zeusTiles.get(2);

    area.fire('click', { target: tile });
    check(game._pinnedMonsterTaskTileId === 2, 'clicking a monster tile pins it');
    check(tile.has('zeus-tile-task-pinned'), 'the pinned tile is marked as held');

    area.fire('mouseout', { target: tile });
    check(lit(monsters).length === 2,
        'the highlight survives mouseout while pinned — the whole reason the pin '
        + 'exists, since the board can be scrolled well below the tiles');

    area.fire('mouseover', { target: zeusTiles.get(1) });
    check(String(lit(monsters)) === String(['10', '11']),
        'hovering another tile does not quietly repaint over a pin');

    area.fire('click', { target: tile });
    check(game._pinnedMonsterTaskTileId === null && lit(monsters).length === 0,
        'clicking the pinned tile again releases it');
}

// ============ 6. the pin can always be dismissed =============================
{
    const { game, area, zeusTiles, monsters, document_ } = makeGame();
    game._setupMonsterTaskHover();
    area.fire('click', { target: zeusTiles.get(2) });

    document_.fire('click', { target: makeEl('somewhere-else') });
    check(game._pinnedMonsterTaskTileId === null && lit(monsters).length === 0,
        'clicking away releases the pin');

    area.fire('click', { target: zeusTiles.get(2) });
    document_.fire('keydown', { key: 'Escape' });
    check(game._pinnedMonsterTaskTileId === null, 'Escape releases the pin');
}

// A click that lands on a tile must not be cancelled by the document-level
// release handler running later in the same bubble.
{
    const { game, area, zeusTiles, document_ } = makeGame();
    game._setupMonsterTaskHover();
    const ev = { target: zeusTiles.get(2) };
    area.fire('click', ev);
    document_.fire('click', ev);
    check(game._pinnedMonsterTaskTileId === 2,
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
    game._setupMonsterTaskHover();

    area.fire('mouseover', { target: zeusTiles.get(2) });
    check(lit(monsters).length === 0 && !boardContainer.has('monster-task-focus'),
        'a completed tile neither lights nor dims the board — it is still in the '
        + 'DOM at opacity 0, so any reaction would appear to come from an empty '
        + 'slot, and a dim with nothing lit reads as a glitch');

    area.fire('click', { target: zeusTiles.get(3) });
    check(game._pinnedMonsterTaskTileId === null,
        'a discardable tile is left to discard mode, which owns the click');
}

// ============ 8. the pref gates it ===========================================
{
    const { game, area, zeusTiles, monsters } = makeGame({ enabled: false });
    game._setupMonsterTaskHover();
    area.fire('mouseover', { target: zeusTiles.get(2) });
    area.fire('click', { target: zeusTiles.get(2) });
    check(lit(monsters).length === 0 && game._pinnedMonsterTaskTileId === null,
        'with the highlight preference off, nothing hovers and nothing pins');
}

// ============ 9. reverse: a monster rings the tile it credits ================
{
    const { game, pieces, zeusTiles, monsters } = makeGame();
    game._setupMonsterTaskHover();

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
    game._setupMonsterTaskHover();
    pieces.fire('mouseover', { target: monsters.get('10') });   // hydra, tile already done
    check(!zeusTiles.get(2).has('zeus-tile-task-credited') && !zeusTiles.get(1).has('zeus-tile-task-credited'),
        'a monster that would credit nothing rings nothing');
}

// The two directions never draw at once.
{
    const { game, area, pieces, zeusTiles, monsters } = makeGame();
    game._setupMonsterTaskHover();
    area.fire('click', { target: zeusTiles.get(2) });
    pieces.fire('mouseover', { target: monsters.get('13') });
    check(!zeusTiles.get(1).has('zeus-tile-task-credited'),
        'the reverse highlight stays out of the way while a forward one is up');
}

// ============ 10. CSS: the parts that silently fail ==========================
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

    const completed = cssRule('.delphi-zeus-tile[data-completed="true"]');
    check(completed && /pointer-events:\s*none/.test(completed),
        'completed tiles stop answering hover');

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
