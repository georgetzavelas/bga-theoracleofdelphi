/**
 * A ship standing on an action-target hex does not swallow the click.
 *
 * Reported on move 246: beri used Poseidon's teleport and could not choose the
 * hex holding Poely 74's ship. The server offers every water hex
 * (UseGodAbility::getTeleportTargets), shared ones included. But the target
 * overlays live in #delphi-hex-grid and ships in #delphi-board-pieces above
 * it, so the ship caught the click, and its handler stopped propagation. The
 * overlay underneath never heard it.
 *
 * onShipClick already forwarded a click on another ship's hex for ordinary
 * movement. It now does the same for the action-target overlays, which is
 * the path Poseidon's teleport and every other _highlightValidHexes target
 * uses.
 *
 * The overlays have since moved into the pieces layer, above the ships, so a
 * click normally lands on the overlay itself. The hand-off stays as the path
 * for anything that still puts a ship on top.
 *
 * Run: node tests/test_ship_over_target_js.js
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

function overlay(q, r, connected) {
    return {
        dataset: { q: String(q), r: String(r) },
        isConnected: connected !== false,
        clicks: 0,
        click() { this.clicks++; },
    };
}

function world(overlays) {
    const game = new Function(`return {
${extractMethod('onShipClick')}
${extractMethod('_hexActionTargetAt')}
};`)();
    game.player_id = 1;
    game.shipPositions = { 1: { q: 0, r: 0 }, 2: { q: 3, r: -1 } };
    game._hexActionTargetOverlays = overlays;
    game.isCurrentPlayerActive = () => true;
    game.hexClicks = [];
    game.onHexClick = (q, r) => game.hexClicks.push([q, r]);
    game.gamedatas = { gamestate: { name: 'UseGodAbility', args: {} } };
    return game;
}

// ---- the reported case -------------------------------------------------------
{
    const onOpponent = overlay(3, -1);
    const elsewhere = overlay(5, 2);
    const g = world([elsewhere, onOpponent]);
    g.onShipClick(2);                       // Poely 74's ship, on a target hex
    check(onOpponent.clicks === 1,
        'clicking an opponent\'s ship on a teleport target picks that hex');
    check(elsewhere.clicks === 0, 'and only that hex');
}

// ---- no target under the ship: leave the ship to its own handling ----------
{
    const elsewhere = overlay(5, 2);
    const g = world([elsewhere]);
    g.onShipClick(2);
    check(elsewhere.clicks === 0,
        'a ship on a hex with no target does not trigger a target somewhere else');
}

// ---- a cleared overlay is not a target ----------------------------------------
// The overlay list can outlive its DOM nodes between a clear and the next
// highlight; a detached node must not be clicked.
{
    const stale = overlay(3, -1, false);
    const g = world([stale]);
    g.onShipClick(2);
    check(stale.clicks === 0, 'a detached overlay is ignored');
}

// ---- no overlays at all ---------------------------------------------------------
{
    const g = world(undefined);
    let threw = null;
    try { g.onShipClick(2); } catch (e) { threw = e.message; }
    check(threw === null, `no overlays: no throw, got ${threw}`);
}

// ---- the helper matches by hex ---------------------------------------------------
{
    const a = overlay(3, -1);
    const g = world([a]);
    check(g._hexActionTargetAt({ q: 3, r: -1 }) === a, 'finds the overlay on a hex');
    check(g._hexActionTargetAt({ q: 3, r: 0 }) === null, 'and nothing on another');
    check(g._hexActionTargetAt(null) === null, 'and nothing for no position');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
