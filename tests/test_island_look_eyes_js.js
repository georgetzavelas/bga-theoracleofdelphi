/**
 * Coloured look eyes: one eye per player who has looked at an unrevealed
 * island, iris in that player's colour, shown to every viewer.
 *
 * Drives the REAL shipped methods (extracted from theoracleofdelphi.js) over a
 * small fake DOM, then checks the getAllDatas payload and the CSS contract.
 *
 * Run: node tests/test_island_look_eyes_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.css'), 'utf8');
const PHP = fs.readFileSync(path.join(ROOT, 'modules', 'php', 'Game.php'), 'utf8');
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

// ---------- minimal DOM ----------
class FakeEl {
    constructor(tag) {
        this.tagName = tag;
        this.children = [];
        this.parent = null;
        this.dataset = {};
        this.classes = new Set();
        this.innerHTML = '';
        this.listeners = {};
        this.styleProps = {};
        const self = this;
        this.style = { setProperty: (k, v) => { self.styleProps[k] = v; } };
        this.classList = {
            add: (...c) => c.forEach(x => self.classes.add(x)),
            remove: (...c) => c.forEach(x => self.classes.delete(x)),
            contains: (c) => self.classes.has(c),
            toggle: (c, force) => {
                const on = force === undefined ? !self.classes.has(c) : !!force;
                if (on) self.classes.add(c); else self.classes.delete(c);
                return on;
            },
        };
    }
    set className(v) { this.classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
    get className() { return Array.from(this.classes).join(' '); }
    appendChild(child) {
        if (child.parent) child.remove();
        child.parent = this;
        this.children.push(child);
        return child;
    }
    remove() {
        if (!this.parent) return;
        const list = this.parent.children;
        list.splice(list.indexOf(this), 1);
        this.parent = null;
    }
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
    removeEventListener(t, fn) {
        this.listeners[t] = (this.listeners[t] || []).filter(f => f !== fn);
    }
    _matches(sel) {
        const m = sel.match(/^\.([\w-]+)(?:\[data-player-id="(\d+)"\])?$/);
        if (!m) throw new Error('unsupported selector ' + sel);
        if (!this.classes.has(m[1])) return false;
        return m[2] === undefined || this.dataset.playerId === m[2];
    }
    querySelectorAll(sel) {
        const out = [];
        const walk = (el) => el.children.forEach(c => { if (c._matches(sel)) out.push(c); walk(c); });
        walk(this);
        return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
global.document = {
    createElement: (t) => new FakeEl(t),
    getElementById: () => null,
};

const METHODS = [
    '_hexKey', '_shrineIdFromHex', '_gameColorForPlayer',
    '_addOtherIslandKnowledge', '_otherIslandKnowledgeForHex', '_clearOtherIslandKnowledgeForHex',
    '_addIslandLooker', '_addIslandLookerToShrine', '_clearIslandLookers',
    '_renderLookEyes', '_createLookEye', '_setLookEyeLooking',
    '_startOtherActiveLook', '_endOtherActiveLook',
    'notif_playerPeekedIslands', 'notif_playerPeekEnded',
    '_setupActivePeekAffordance', '_teardownActivePeekAffordance',
].map(extractMethod).join('\n');

const RED = 11, BLUE = 22, GREEN = 33, YELLOW = 44;
const HEX = { q: 3, r: -2 };          // shrine id 298
const OTHER = { q: -1, r: 4 };        // shrine id -96

function makeGame(viewerId) {
    const game = new Function(`return { PLAYER_BOARD_COLORS: ['red', 'yellow', 'green', 'blue'], ${METHODS} };`)();
    game.player_id = viewerId;
    game._playerGameColors = { [RED]: 'red', [BLUE]: 'blue', [GREEN]: 'green', [YELLOW]: 'yellow' };
    game._otherIslandKnowledge = new Map();
    game._otherActiveLooks = new Map();
    game._islandLookers = new Map();
    // Seats deliberately differ from the id order.
    game.gamedatas = { hexes: [], players: {
        [BLUE]: { player_no: '1' }, [RED]: { player_no: '2' },
        [GREEN]: { player_no: '3' }, [YELLOW]: { player_no: '4' },
    } };
    game._bindIslandTooltipForHex = () => {};
    game.bgaPerformAction = () => {};
    const shrines = new Map();
    [HEX, OTHER].forEach(h => shrines.set(h.q * 100 + h.r, new FakeEl('div')));
    game.components = { shrines };
    return game;
}
const shrineOf = (game, h) => game.components.shrines.get(h.q * 100 + h.r);
const eyesOn = (game, h) => shrineOf(game, h).querySelectorAll('.shrine-look-eye');
const colorsOn = (game, h) => eyesOn(game, h).map(e =>
    Array.from(e.classes).find(c => /^shrine-look-eye-(red|yellow|green|blue|neutral)$/.test(c)));

// ---------- one eye per looker, in their colour, for every viewer ----------
[RED, BLUE, 999 /* spectator */].forEach(viewer => {
    const game = makeGame(viewer);
    game.notif_playerPeekedIslands({ player_id: BLUE, hexes: [HEX] });
    game.notif_playerPeekedIslands({ player_id: RED, hexes: [HEX, OTHER] });
    check(JSON.stringify(colorsOn(game, HEX)) === '["shrine-look-eye-blue","shrine-look-eye-red"]',
        'viewer ' + viewer + ': a blue and a red eye on the island both looked at, in seat order');
    check(JSON.stringify(colorsOn(game, OTHER)) === '["shrine-look-eye-red"]',
        'viewer ' + viewer + ': only red on the island only red looked at');
    check(shrineOf(game, HEX).querySelectorAll('.shrine-look-eyes').length === 1,
        'viewer ' + viewer + ': a single eye row per island');
    check(eyesOn(game, HEX).every(e => /eye-iris/.test(e.innerHTML)),
        'viewer ' + viewer + ': each eye carries the SVG with a tintable iris');
});

// ---------- the looker sees their own eye too ----------
{
    const game = makeGame(RED);
    game.notif_playerPeekedIslands({ player_id: RED, hexes: [HEX] });
    check(eyesOn(game, HEX).length === 1 && eyesOn(game, HEX)[0].dataset.playerId === String(RED),
        'the looker gets their own coloured eye');
    check(!game._otherIslandKnowledgeForHex(HEX.q, HEX.r),
        'the looker is still not added to the "Looked at by" tooltip knowledge');
    check(game._otherActiveLooks.size === 0, 'no opponent live-look entry for the looker themselves');
    check(eyesOn(game, HEX)[0].classes.has('is-opening'), 'a fresh look opens its eye');
}

// ---------- repeat looks and reload ----------
{
    const game = makeGame(BLUE);
    game.notif_playerPeekedIslands({ player_id: GREEN, hexes: [HEX] });
    const first = eyesOn(game, HEX)[0];
    game._addIslandLooker(GREEN, HEX.q, HEX.r, true);   // e.g. Island Scout after a look
    check(eyesOn(game, HEX).length === 1, 'a second look by the same player adds no second eye');
    check(eyesOn(game, HEX)[0] === first, 'the existing eye element is kept, not rebuilt');

    const reload = makeGame(BLUE);
    [{ playerId: '33', q: '3', r: '-2' }, { playerId: '44', q: '3', r: '-2' }].forEach(row =>
        reload._addIslandLooker(row.playerId, row.q, row.r, false));
    check(JSON.stringify(colorsOn(reload, HEX)) === '["shrine-look-eye-green","shrine-look-eye-yellow"]',
        'reload payload rows (string ids) rebuild the same eyes');
    check(eyesOn(reload, HEX).every(e => !e.classes.has('is-opening')),
        'eyes restored on reload do not replay the opening animation');
}

// ---------- corner order follows seats, not look order ----------
{
    const game = makeGame(999);
    game.notif_playerPeekedIslands({ player_id: YELLOW, hexes: [HEX] });   // seat 4
    game.notif_playerPeekedIslands({ player_id: RED, hexes: [HEX] });      // seat 2
    const yellow = shrineOf(game, HEX).querySelector('.shrine-look-eye[data-player-id="44"]');
    game.notif_playerPeekedIslands({ player_id: BLUE, hexes: [HEX] });     // seat 1
    game.notif_playerPeekedIslands({ player_id: GREEN, hexes: [HEX] });    // seat 3
    check(JSON.stringify(colorsOn(game, HEX)) ===
        '["shrine-look-eye-blue","shrine-look-eye-red","shrine-look-eye-green","shrine-look-eye-yellow"]',
        'four eyes fill top-right, top-left, bottom-right, bottom-left in seat order');
    check(shrineOf(game, HEX).querySelector('.shrine-look-eye[data-player-id="44"]') === yellow,
        'reordering moves the existing eye element rather than rebuilding it');

    const reload = makeGame(999);
    [GREEN, YELLOW, BLUE, RED].forEach(pid => reload._addIslandLooker(pid, HEX.q, HEX.r, false));
    check(JSON.stringify(colorsOn(reload, HEX)) === JSON.stringify(colorsOn(game, HEX)),
        'a reload puts every eye back in the same corner');
}

// ---------- unknown colour falls back to a neutral eye ----------
{
    const game = makeGame(RED);
    game._addIslandLooker(555, HEX.q, HEX.r, false);
    check(JSON.stringify(colorsOn(game, HEX)) === '["shrine-look-eye-neutral"]',
        'a player with no board colour gets the neutral eye, not a broken class');
}

// ---------- live look pulses the looker's eye, then stops ----------
{
    const game = makeGame(RED);
    game.notif_playerPeekedIslands({ player_id: BLUE, hexes: [HEX] });
    const blue = shrineOf(game, HEX).querySelector('.shrine-look-eye[data-player-id="22"]');
    check(blue && blue.classes.has('is-looking'), 'an opponent looking right now has a pulsing eye');
    check(!shrineOf(game, HEX).querySelector('.shrine-peek-marker'),
        'no generic peek marker is injected any more');
    game.notif_playerPeekEnded({ player_id: BLUE });
    check(!blue.classes.has('is-looking'), 'the pulse stops when their look ends');
    check(eyesOn(game, HEX).length === 1, 'the eye itself stays after the look ends');
}

// ---------- reload mid-look (activeLook) ----------
{
    const game = makeGame(RED);
    game._addIslandLooker(BLUE, HEX.q, HEX.r, false);       // islandLookers
    game._startOtherActiveLook(BLUE, [HEX]);                 // activeLook
    check(eyesOn(game, HEX).length === 1, 'activeLook on reload reuses the eye islandLookers drew');
    check(eyesOn(game, HEX)[0].classes.has('is-looking'), 'and pulses it');
}

// ---------- own active peek: own eye pulses and is the click target ----------
{
    const game = makeGame(RED);
    game._peekedShrineIds = [HEX.q * 100 + HEX.r];
    game._setupActivePeekAffordance();
    const el = shrineOf(game, HEX);
    const mine = el.querySelector('.shrine-look-eye[data-player-id="11"]');
    check(!!mine && mine.classes.has('is-looking'),
        'own peek: own eye is ensured and pulses even before the public notif lands');
    check(el.classes.has('shrine-peek-clickable'), 'own peek: shrine is clickable to end the peek');
    game.notif_playerPeekedIslands({ player_id: RED, hexes: [HEX] });
    check(eyesOn(game, HEX).length === 1, 'the public notif arriving after does not duplicate it');
    game._teardownActivePeekAffordance();
    check(!mine.classes.has('is-looking'), 'teardown stops the pulse');
    check(!el.classes.has('shrine-peek-clickable'), 'teardown removes clickability');
    check(eyesOn(game, HEX).length === 1, 'the own eye stays after the peek');
}

// ---------- exploring the island clears its eyes ----------
{
    const game = makeGame(RED);
    game.notif_playerPeekedIslands({ player_id: BLUE, hexes: [HEX] });
    game.notif_playerPeekedIslands({ player_id: RED, hexes: [HEX, OTHER] });
    game._clearIslandLookers(HEX.q, HEX.r);
    check(!shrineOf(game, HEX).querySelector('.shrine-look-eyes'), 'the explored island loses its eye row');
    check(eyesOn(game, OTHER).length === 1, 'other islands keep theirs');
    check(!game._islandLookers.has(HEX.q * 100 + HEX.r), 'the lookers record is dropped');
}
{
    const m = SRC.match(/notif_islandRevealed: function[\s\S]*?\n        \},/);
    check(!!m && /this\._clearIslandLookers\(hexQ, hexR\)/.test(m[0]),
        'notif_islandRevealed clears the eyes');
}
{
    const m = SRC.match(/\(gamedatas\.islandLookers \|\| \[\]\)\.forEach[\s\S]{0,200}?_addIslandLooker\(row\.playerId, row\.q, row\.r, false\)/);
    check(!!m, 'setup restores the eyes from gamedatas.islandLookers without animation');
}

// ---------- server payload ----------
{
    const m = PHP.match(/\$result\['islandLookers'\] = self::getObjectListFromDB\(\s*"([\s\S]*?)"\s*\);/);
    check(!!m, 'getAllDatas returns islandLookers');
    const q = m ? m[1] : '';
    check(/h\.is_revealed = 0/.test(q), 'islandLookers covers only unrevealed islands');
    check(!/current_player_id/.test(q),
        'islandLookers is NOT filtered by viewer, so every seat and spectators see the same eyes');
    check(!/shrine|island_content|h\.color/i.test(q.replace(/player_island_knowledge/g, '')),
        'islandLookers stays coordinates-only (no island contents leak)');
    check(/ORDER BY[\s\S]*player_no/.test(q), 'islandLookers is ordered so eyes line up the same everywhere');
}

// ---------- CSS contract ----------
{
    ['red', 'yellow', 'green', 'blue'].forEach(c => {
        check(new RegExp('\\.shrine-look-eye-' + c + '\\s*\\{[^}]*--eye-iris:').test(CSS),
            'the ' + c + ' eye sets its iris colour');
    });
    check(!/shrine-look-eye-blink|--look-eye-blink-delay/.test(CSS + SRC),
        'idle eyes do not blink');
    const corner = (n) => {
        const m = CSS.match(new RegExp('\\.shrine-look-eye:nth-child\\(' + n + '\\) \\{ left: (-?[\\d.]+)px; top: (-?[\\d.]+)px; \\}'));
        return m ? { left: parseFloat(m[1]), top: parseFloat(m[2]) } : null;
    };
    const [tr, tl, br, bl] = [1, 2, 3, 4].map(corner);
    check(tl && tr && bl && br, 'all four corner slots are positioned');
    if (tl && tr && bl && br) {
        check(tr.left > tl.left && tr.top === tl.top, 'slot 1 is top-right, slot 2 top-left');
        check(br.left === tr.left && br.top > tr.top, 'slot 3 is bottom-right, below slot 1');
        check(bl.left === tl.left && bl.top === br.top, 'slot 4 is bottom-left');
        // Eye centres must be symmetric about the 60x52 shrine centre (30, 26).
        check(tl.left + 10 + tr.left + 10 === 60 && tl.top + 6.5 + bl.top + 6.5 === 52,
            'the corners are symmetric about the hex centre');
    }
    check(/\.shrine-look-eye \.eye-iris \{[^}]*fill: var\(--eye-iris\)/.test(CSS),
        'the iris is filled from the player colour variable');
    check(!/\.shrine-revealed[^{]*\.shrine-look-eyes \{[^}]*display: none/.test(CSS),
        'eyes are not hidden on revealed shrines (touch keeps peeked islands face up)');
    check(/\.shrine-endgame-revealed \.shrine-look-eyes \{\s*display: none/.test(CSS),
        'the end-game reveal keeps its own plain eye / red X instead');
    const rm = CSS.match(/@media \(prefers-reduced-motion: reduce\) \{[^@]*?\.shrine-look-eye \.eye-ball[^@]*?animation: none/);
    check(!!rm, 'reduced-motion turns the eye animations off');
    check(/body\.motion-reduced-pref \.shrine-look-eye \.eye-ball/.test(CSS),
        'the in-game reduced-motion preference turns them off too');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
