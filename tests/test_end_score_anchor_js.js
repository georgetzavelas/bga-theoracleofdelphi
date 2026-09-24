/**
 * The final-scoring "+N tasks" float needs an anchor it can find.
 *
 * notif_endScorePlayer passed getPlayerPanelElement(pid).id to BGA's
 * displayScoring, which looks its anchor up BY id. That element is the
 * framework's content div and carries no id, so the lookup of "" returned
 * null and the framework threw "Cannot read properties of null (reading
 * 'ownerDocument')" once per player at the end of every game.
 *
 * The handler held a live element the whole time; it was the round trip
 * through an empty id that lost it.
 *
 * Run: node tests/test_end_score_anchor_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const LINES = fs.readFileSync(
    path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8').split('\n');

function extractMethod(name) {
    const re = new RegExp('^        ' + name + ': function');
    const start = LINES.findIndex(l => re.test(l));
    if (start < 0) throw new Error('not found: ' + name);
    let i = start;
    while (!/^        \},\s*$/.test(LINES[i])) i++;
    return LINES.slice(start, i + 1).join('\n');
}

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

// A panel element exactly as the framework hands it over: present, id-less.
const panel = { id: '' };
const registry = [];        // elements findable by id, as document.getElementById
const doc = { getElementById: (id) => registry.find(el => el.id === id && id !== '') || null };

const game = new Function('document', `return {
${extractMethod('notif_endScorePlayer')}
};`)(doc);
game.gamedatas = { players: { 7: { color: 'ff0000' } } };
game.getPlayerPanelElement = () => panel;
registry.push(panel);

let anchor = null, threw = null;
// displayScoring as the framework behaves: resolve the anchor by id, and fail
// the way it does in the browser when that comes back null.
game.displayScoring = function(anchorId) {
    const el = doc.getElementById(anchorId);
    if (!el) { threw = "Cannot read properties of null (reading 'ownerDocument')"; return; }
    anchor = el;
};

game.notif_endScorePlayer({ args: { player_id: 7, tasks: 9 } });

check(threw === null, `displayScoring can resolve its anchor, got: ${threw}`);
check(anchor === panel, 'and it resolves to the player\'s own panel');
check(panel.id !== '', `the panel was given an id to be found by, got "${panel.id}"`);
check(/7/.test(panel.id), 'one that names the player, so each panel gets its own');

// A second call must not re-stamp or duplicate: the id is stable.
const first = panel.id;
game.notif_endScorePlayer({ args: { player_id: 7, tasks: 9 } });
check(panel.id === first, 'the id is assigned once and left alone');

// A panel that already has an id keeps it.
{
    const named = { id: 'player_board_8' };
    registry.push(named);
    game.getPlayerPanelElement = () => named;
    game.gamedatas.players[8] = { color: '00ff00' };
    anchor = null; threw = null;
    game.notif_endScorePlayer({ args: { player_id: 8, tasks: 3 } });
    check(named.id === 'player_board_8', 'an existing id is not overwritten');
    check(anchor === named && threw === null, 'and is used as the anchor');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
