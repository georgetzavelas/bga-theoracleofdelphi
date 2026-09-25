/**
 * Selecting a die or oracle card previews the ship's move targets, so the
 * common case, moving, needs no click on the ship.
 *
 * SelectAction now carries movePreview, built by MoveShip::moveTargets, the
 * same calculation MoveShip itself offers. Clicking a preview marker stores
 * the hex and sends actMoveShip; on entering MoveShip the stored hex is
 * confirmed with actConfirmMove. Chaining the two existing actions means the
 * server's move logic is untouched, and if the second step ever fails the
 * player simply lands on the ordinary MoveShip screen.
 *
 * What has to hold:
 *
 *   - Every preview marker means "move here". A hex whose click already does
 *     something else in SelectAction (fight, build, explore, look) gets no
 *     marker, and neither does the ship's own hex.
 *   - The preview is torn down when SelectAction is LEFT, not in
 *     onUpdateActionButtons: by the time MoveShip's buttons update, MoveShip
 *     has already drawn its own markers in the same shared overlay list.
 *   - A stored hex is only ever confirmed in the MoveShip it was meant for.
 *   - An opponent's ship standing on a target does not swallow the click;
 *     your own ship keeps its old "click to move" shortcut.
 *   - AUTO_MOVE_PREVIEW = false turns all of it off.
 *
 * Run: node tests/test_move_preview_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8');
const LINES = SRC.split('\n');

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

function world(opts) {
    opts = opts || {};
    const game = new Function('setTimeout', `return {
        AUTO_MOVE_PREVIEW: ${opts.off ? 'false' : 'true'},
${extractMethod('_showMovePreview')}
${extractMethod('_clearMovePreview')}
${extractMethod('_takePendingMove')}
};`)((fn) => fn());                     // run deferred work at once
    game.player_id = 1;
    game.shipPositions = { 1: { q: 0, r: 0 }, 2: { q: 2, r: 0 } };
    game.shown = null;
    game.cleared = 0;
    game._showReachableOverlays = (list, base) => { game.shown = { list, base }; };
    game._clearReachableOverlays = () => { game.cleared++; game.shown = null; };
    game.sent = [];
    game.bgaPerformAction = (a, args) => { game.sent.push([a, args]); };
    return game;
}
const preview = {
    baseRange: 3, maxRange: 5,
    reachableHexes: [
        { q: 0, r: 0, distance: 0 },           // the ship's own hex
        { q: 1, r: 0, distance: 1 },           // plain move
        { q: 2, r: 0, distance: 2 },           // an opponent's ship is here
        { q: 3, r: 0, distance: 3 },           // a monster is here
        { q: 4, r: 0, distance: 4 },           // favor-extended
    ],
};

// ---- the preview draws only hexes that mean "move here" -------------------
{
    const g = world();
    g._fightableMonstersByHex = { '3,0': 99 };
    g._showMovePreview(preview);
    const keys = (g.shown ? g.shown.list : []).map((h) => h.q + ',' + h.r);
    check(keys.indexOf('1,0') !== -1 && keys.indexOf('4,0') !== -1,
        `plain and favor-extended targets are shown, got ${JSON.stringify(keys)}`);
    check(keys.indexOf('0,0') === -1, 'the ship\'s own hex is not a target');
    check(keys.indexOf('3,0') === -1,
        'a hex that fights on click gets no move marker, or the marker would lie');
    check(g.shown && g.shown.base === 3,
        'the base range goes through, so the favor-cost badges match MoveShip');
    check(g._movePreviewTargets && g._movePreviewTargets.has('2,0'),
        'a hex under an opponent\'s ship is still a target');
}
{
    const g = world();
    g._buildableShrineHexKeys = new Set(['1,0']);
    g._explorableHexColorByKey = { '4,0': 'red' };
    g._peekableHexKeys = new Set(['2,0']);
    g._showMovePreview(preview);
    const keys = (g.shown ? g.shown.list : []).map((h) => h.q + ',' + h.r);
    check(keys.length === 1 && keys[0] === '3,0',
        `build, explore and look hexes are all left to their own action, got ${JSON.stringify(keys)}`);
}

// ---- off switch, and nothing to show ----------------------------------------
{
    const g = world({ off: true });
    g._showMovePreview(preview);
    check(g.shown === null && !g._movePreviewTargets, 'AUTO_MOVE_PREVIEW = false shows nothing');
}
{
    const g = world();
    g._showMovePreview(undefined);
    check(g.shown === null && !g._movePreviewTargets,
        'no movePreview in the args (Apollo still owes a colour) shows nothing');
}

// ---- teardown only touches overlays the preview owns ------------------------
{
    const g = world();
    g._clearMovePreview();
    check(g.cleared === 0,
        'with no preview up, clearing leaves the overlay list alone, so MoveShip\'s '
        + 'own markers survive its onUpdateActionButtons teardown');
    g._showMovePreview(preview);
    g._clearMovePreview();
    check(g.cleared === 1 && !g._movePreviewTargets, 'with a preview up, it is removed');
}

// ---- the stored hex is confirmed in MoveShip, once ---------------------------
{
    const g = world();
    g._pendingMoveTarget = { q: 4, r: 0 };
    g._moveShipReachable = new Map([['4,0', 4], ['1,0', 1]]);
    g._takePendingMove();
    check(g.sent.length === 1 && g.sent[0][0] === 'actConfirmMove'
          && g.sent[0][1].q === 4 && g.sent[0][1].r === 0,
        `MoveShip confirms the chosen hex, sent ${JSON.stringify(g.sent)}`);
    check(g._pendingMoveTarget === null, 'and forgets it');
    g._takePendingMove();
    check(g.sent.length === 1, 'so a second entry cannot send it again');
}
{
    // The server's answer is the authority. If MoveShip does not offer the
    // hex after all, confirm nothing and leave the player on the normal screen.
    const g = world();
    g._pendingMoveTarget = { q: 9, r: 9 };
    g._moveShipReachable = new Map([['1,0', 1]]);
    g._takePendingMove();
    check(g.sent.length === 0 && g._pendingMoveTarget === null,
        'a stored hex MoveShip does not offer is dropped, not forced');
}

// ---- the wiring --------------------------------------------------------------
{
    const click = extractMethod('onHexClick');
    const iPreview = click.indexOf('_movePreviewTargets');
    const iPeek = click.indexOf('_peekableHexKeys');
    const iMove = click.indexOf('_moveShipReachable');
    check(iPreview > iPeek && iPreview < iMove,
        'onHexClick checks the preview after fight/build/explore/look and before MoveShip');
    check(/_pendingMoveTarget\s*=/.test(click) && /actMoveShip/.test(click),
        'a preview click stores the hex and sends actMoveShip');

    const ship = extractMethod('onShipClick');
    check(/_movePreviewTargets[\s\S]{0,80}player_id|player_id[\s\S]{0,80}_movePreviewTargets/.test(ship),
        'onShipClick routes an opponent\'s ship on a target, and only an opponent\'s');

    const leave = SRC.slice(SRC.indexOf('        onLeavingState: function'));
    const leaveSel = leave.slice(leave.indexOf("case 'SelectAction':"), leave.indexOf("case 'MoveShip':"));
    check(/_clearMovePreview\(\)/.test(leaveSel), 'leaving SelectAction clears the preview');

    const enter = SRC.slice(SRC.indexOf('        onEnteringState: function'));
    const enterMove = enter.slice(enter.indexOf("case 'MoveShip':"), enter.indexOf("case 'MoveShip':") + 1400);
    check(/_takePendingMove\(\)/.test(enterMove), 'entering MoveShip takes the stored hex');
    check(/_pendingMoveTarget\s*=\s*null/.test(enter.slice(0, 1600)),
        'entering any other state drops a stored hex, so it cannot fire later');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
