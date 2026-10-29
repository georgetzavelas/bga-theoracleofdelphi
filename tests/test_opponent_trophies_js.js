/**
 * An opponent's defeated monsters show as trophies on their board replica.
 *
 * Player report: the opponent beat a monster, the top-right panel showed it,
 * but their board below the game did not. The replica is cloned from the live
 * board's markup, so it has the three .defeated-monster-slot cells, but
 * _populateOpponentBoard never filled them, and notif_monsterDefeated never
 * recorded the defeat in gamedatas.monsters, which is where a replica has to
 * read it from.
 *
 * Extracts the real shipped methods so the assertions cover shipped behaviour.
 *
 * Run: node tests/test_opponent_trophies_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const LINES = fs.readFileSync(
    path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8').split('\n');

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

// --- stub DOM: an area with the template's three trophy slots --------------
function makeEl(cls) {
    const el = { className: cls || '', dataset: {}, style: {}, children: [] };
    el.appendChild = (c) => { el.children.push(c); return c; };
    return el;
}
function makeArea() {
    const slots = [0, 1, 2].map((i) => { const s = makeEl('defeated-monster-slot'); s.dataset.index = String(i); return s; });
    return {
        slots,
        querySelectorAll: (sel) => (sel === '.defeated-monster-slot' ? slots : []),
    };
}
const fakeDocument = { createElement: () => makeEl() };

const game = new Function('document', 'themeImg', 'requestAnimationFrame', `return {
${extractMethod('_populateOpponentTrophies')}
${extractMethod('notif_monsterDefeated')}
};`)(fakeDocument, (p) => p, () => {});

const OPP = 22;
game.player_id = 7;

// ---- replica fills one slot per monster this opponent defeated -------------
{
    game.gamedatas = { monsters: [
        { id: '1', monsterType: 'hydra', color: 'red', isDefeated: '1', defeatedBy: String(OPP) },
        { id: '2', monsterType: 'cyclops', color: 'blue', isDefeated: '1', defeatedBy: '7' },
        { id: '3', monsterType: 'siren', color: 'green', isDefeated: '0', defeatedBy: null },
        { id: '4', monsterType: 'gorgon', color: 'pink', isDefeated: '1', defeatedBy: String(OPP) },
    ] };
    const area = makeArea();
    game._populateOpponentTrophies(OPP, area);
    const filled = area.slots.filter((s) => s.children.length);
    check(filled.length === 2, `two trophies for the opponent, got ${filled.length}`);
    check(area.slots[0].children[0] && /monster-hydra/.test(area.slots[0].children[0].className),
        'first trophy fills slot 0 with the hydra art class');
    check(area.slots[1].children[0] && /monster-gorgon/.test(area.slots[1].children[0].className),
        'second trophy fills slot 1');
    check(!area.slots[2].children.length, 'slot 2 stays empty');
    check(area.slots[0].children[0] && /delphi-defeated-monster/.test(area.slots[0].children[0].className),
        'trophy reuses the live board\'s .delphi-defeated-monster class');
}

// ---- gamedatas.monsters may arrive keyed by id rather than as an array -----
{
    game.gamedatas = { monsters: {
        5: { id: '5', monsterType: 'chimera', color: 'yellow', isDefeated: '1', defeatedBy: String(OPP) },
    } };
    const area = makeArea();
    game._populateOpponentTrophies(OPP, area);
    check(area.slots[0].children.length === 1, 'object-shaped monsters list still renders');
}

// ---- the defeat notif records it and refreshes the opponent's replica ------
(async () => {
    game.gamedatas = {
        hexes: [],
        monsters: [{ id: '9', monsterType: 'minotaur', color: 'black', isDefeated: '0', defeatedBy: null }],
        panelState: { [OPP]: { tasks: { monsters: [] } } },
    };
    const refreshed = [];
    game._refreshOpponentBoard = (pid) => refreshed.push(parseInt(pid, 10));
    game._completeTaskPip = () => {};
    game._bindIslandTooltipForHex = () => {};
    game.components = {
        monsters: new Map(),
        removeMonster: () => {},
        getNextEmptyDefeatedMonsterSlot: () => null,
    };
    await game.notif_monsterDefeated({
        player_id: OPP, monster_id: 9, monster_type: 'minotaur', monster_color: 'black',
    });
    const m = game.gamedatas.monsters[0];
    check(parseInt(m.isDefeated, 10) === 1, 'defeat is recorded in gamedatas.monsters');
    check(parseInt(m.defeatedBy, 10) === OPP, 'with the defeating player');
    check(refreshed.indexOf(OPP) !== -1, 'the opponent\'s replica is refreshed');

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
})();
