/**
 * Ending a turn with Oracle dice still unused must ask first.
 *
 * An unused die is lost outright: the turn ends, ConsultOracle re-rolls the
 * whole set, and there is no way back once the turn boundary has cleared the
 * undo slots. That is worth one question.
 *
 * Scoped to DICE deliberately. An unplayed Oracle card is NOT lost — it stays
 * in hand, and a wild one reverts to a normal card — so warning about cards
 * would be crying wolf and would train players to click through the dice case
 * too.
 *
 * Drives the REAL shipped onEndTurn, in the style of test_die_cancel_undo_js.
 *
 * Run: node tests/test_end_turn_confirm_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8');
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

// Minimal stand-in for the game object: identity translator, a substitute()
// that behaves like dojo's, and recorders for the two things onEndTurn can do.
function makeGame() {
    const game = new Function(
        '_', 'dojo',
        'return { ' + extractMethod('onEndTurn') + ' };'
    )(
        s => s,
        { string: { substitute: (t, o) => t.replace(/\$\{(\w+)\}/g, (_m, k) => o[k]) } }
    );
    game.performed = [];
    game.confirms = [];
    game.bgaPerformAction = (name, args) => game.performed.push({ name, args });
    game._confirmInActionBar = (title, label, onConfirm, color) =>
        game.confirms.push({ title, label, onConfirm, color });
    return game;
}

// ---- 0 unused dice: straight through, no question ---------------------------
{
    const g = makeGame();
    g.onEndTurn(0);
    check(g.confirms.length === 0, 'no dice unused: no confirmation');
    check(g.performed.length === 1 && g.performed[0].name === 'actEndTurn',
        'and the turn ends immediately');
}

// Called with nothing at all (a stale caller, or a path that forgets the arg)
// must not start confirming out of nowhere.
{
    const g = makeGame();
    g.onEndTurn();
    check(g.confirms.length === 0 && g.performed.length === 1,
        'called with no argument: still ends the turn, no confirmation');
}

// ---- 1 unused die: singular, and nothing dispatched until confirmed ---------
{
    const g = makeGame();
    g.onEndTurn(1);
    check(g.confirms.length === 1, 'one die unused: confirmation raised');
    check(g.performed.length === 0,
        'and NOTHING is dispatched before the player confirms');
    const c = g.confirms[0];
    check(/1 unused Oracle die\./.test(c.title),
        'singular wording for one die, got: ' + JSON.stringify(c.title));
    check(!/dice/.test(c.title), 'and not the plural noun');
    // Red is reserved for back-outs (Cancel, Undo, Restart turn). End Turn is
    // affirmative; see test_auto_defeat_button_color_js.
    check(c.color === undefined, 'the confirm carries no colour (End Turn is affirmative)');
    c.onConfirm();
    check(g.performed.length === 1 && g.performed[0].name === 'actEndTurn',
        'confirming ends the turn');
}

// ---- several unused dice: plural, with the count substituted ----------------
{
    const g = makeGame();
    g.onEndTurn(3);
    check(g.confirms.length === 1, 'three dice unused: confirmation raised');
    const t = g.confirms[0].title;
    check(/3 unused Oracle dice\./.test(t),
        'plural wording carrying the count, got: ' + JSON.stringify(t));
    check(!/\$\{n\}/.test(t), 'and the placeholder is actually substituted');
}

// ---- both End Turn buttons feed it the count -------------------------------
// The prominent (noActionsLeft) branch implies every die is used, so its count
// is 0 and it never confirms — but it is passed uniformly rather than assumed,
// so the two branches cannot drift.
{
    const at = SRC.indexOf("case 'PlayerActions':", SRC.indexOf('onUpdateActionButtons: function'));
    const end = SRC.indexOf("case 'NoInjuryBonus':", at);
    const hub = SRC.slice(at, end);
    const calls = (hub.match(/onEndTurn\(unusedDice, drawsCards\)/g) || []).length;
    check(calls === 2, 'both End Turn buttons pass count + draws-instead flag (found ' + calls + ')');
    check(!/onEndTurn\(\)/.test(hub), 'neither calls it bare');
    check(/is_used/.test(hub) && /parseInt/.test(hub),
        'the count is derived from args.dice is_used');
    check(/args\.endTurnDrawsCards/.test(hub),
        'and the draws-instead flag comes from the server, not guessed client-side');
}

// ---- after reaching Zeus, leftover dice are NOT wasted ---------------------
// Rulebook p.11: "After reaching Zeus, unused Oracle Dice and Special Actions
// of Gods should be used to 'Draw 1 Oracle Card' ... as Oracle Cards break the
// tie for first place." ConsultOracle does exactly that at the turn boundary,
// so warning that the dice will be lost would be the opposite of the truth.
{
    const g = makeGame();
    g.onEndTurn(3, true);
    check(g.confirms.length === 0,
        'dice unused but Zeus reached: no "they will be wasted" confirmation');
    check(g.performed.length === 1 && g.performed[0].name === 'actEndTurn',
        'and the turn ends straight away (the server draws the cards)');
}
{
    // The flag must not suppress the warning for a player who has NOT reached
    // Zeus — that is the whole population the confirmation exists for.
    const g = makeGame();
    g.onEndTurn(3, false);
    check(g.confirms.length === 1 && g.performed.length === 0,
        'not on Zeus: the confirmation still fires');
}

console.log(fail === 0
    ? 'ok: ' + pass + ' passed, 0 failed'
    : pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
