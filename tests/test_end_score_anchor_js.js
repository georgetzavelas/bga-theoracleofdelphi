/**
 * The final-scoring "+N tasks" float needs an anchor it can find, and must
 * never throw when it cannot.
 *
 * displayScoring looks its anchor up BY id and throws inside the framework
 * when that lookup returns null — "Cannot read properties of null (reading
 * 'ownerDocument')" in Chrome, "null is not an object (evaluating
 * 'n.ownerDocument')" in Safari. notif_endScorePlayer handed it the id of the
 * element getPlayerPanelElement returns, which is the framework's content div
 * and carries no id, so the lookup of "" failed for every player.
 *
 * Giving that div an id was not enough on its own: an id on a node that is
 * not in the document resolves to nothing too. So the handler resolves an
 * anchor it has CHECKED is findable: the panel element, given an id, only if
 * it is connected; otherwise nothing, and the float (decoration) is skipped.
 *
 * The panel comes from the framework's panel API and nowhere else. BGA's code
 * check refuses direct access to the panel containers by id, and matches the
 * id pattern even in a comment.
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

function world() {
    const inDoc = [];                    // elements findable by id
    const doc = { getElementById: (id) => (id && inDoc.find(el => el.id === id)) || null };
    const game = new Function('document', `return {
${extractMethod('notif_endScorePlayer')}
${extractMethod('_endScoreAnchorId')}
};`)(doc);
    game.gamedatas = { players: { 7: { color: 'ff0000' } } };
    const calls = [];
    // As the framework behaves: resolve by id, and fail in the browser's way.
    game.displayScoring = function(anchorId) {
        const el = doc.getElementById(anchorId);
        if (!el) throw new TypeError("Cannot read properties of null (reading 'ownerDocument')");
        calls.push(el);
    };
    return { game, inDoc, calls };
}
function run(w) {
    try { w.game.notif_endScorePlayer({ args: { player_id: 7, tasks: 9 } }); return null; }
    catch (e) { return e.message; }
}

// ---- the framework's recommended panel API is preferred --------------------
{
    const w = world();
    const panel = { id: '', isConnected: true };
    w.inDoc.push(panel);
    let asked = null;
    w.game.bga = { playerPanels: { getElement: (pid) => { asked = pid; return panel; } } };
    w.game.getPlayerPanelElement = () => { throw new Error('legacy API used'); };
    check(run(w) === null, 'no throw through bga.playerPanels.getElement');
    check(asked === 7 && w.calls[0] === panel, 'and the float anchors on that panel');
}

// ---- the content div is the fallback, given an id ---------------------------
{
    const w = world();
    const panel = { id: '', isConnected: true };
    w.inDoc.push(panel);
    w.game.getPlayerPanelElement = () => panel;
    check(run(w) === null, `the id-less content div no longer throws`);
    check(w.calls[0] === panel, 'the float anchors on it');
    check(/7/.test(panel.id), `once given a per-player id, got "${panel.id}"`);
}

// ---- THE regression guard: a detached panel must not throw -----------------
// This is what the first fix missed. The node exists as a reference, but not
// in the document, so no id on it can ever be found.
{
    const w = world();
    const detached = { id: '', isConnected: false };
    w.game.getPlayerPanelElement = () => detached;
    check(run(w) === null, 'a detached panel does not throw');
    check(w.calls.length === 0, 'the float is simply skipped');
}
{
    // Even carrying an id: an id on a detached node resolves to nothing.
    const w = world();
    w.game.getPlayerPanelElement = () => ({ id: 'something', isConnected: false });
    check(run(w) === null && w.calls.length === 0,
        'a detached panel with an id is skipped too, not trusted');
}

// ---- no panel at all ---------------------------------------------------------
{
    const w = world();
    w.game.getPlayerPanelElement = () => null;
    check(run(w) === null && w.calls.length === 0, 'no panel: no throw, no float');
}

// ---- BGA's code check -------------------------------------------------------------
// It refuses direct access to the panel containers, and matches the id
// pattern anywhere in the file, comments included.
{
    const whole = LINES.join('\n');
    check(whole.indexOf('player_board' + '_') === -1,
        'the file never names the framework panel container id');
}

// ---- displayScoring only ever gets an id that resolves -----------------------
{
    const src = extractMethod('notif_endScorePlayer');
    check(!/displayScoring\(panel\.id/.test(src),
        'the handler no longer passes a raw panel.id straight through');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
