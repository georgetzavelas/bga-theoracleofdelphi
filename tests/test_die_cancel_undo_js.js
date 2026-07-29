/**
 * Clicking the locked-in die again must back out the SAME way as the button on
 * screen.
 *
 * SelectAction offers Cancel for a bare die selection, but swaps it for
 * "Undo recolor" once a recolor has been paid for, because cancelling keeps the
 * new colour AND the spent favor. The click-the-die-again affordance is bound in
 * onEnteringState (once per transition) while a recolor stays in SelectAction and
 * only refreshes the args, so a bind-time decision is always one step behind:
 * the player clicked the die after recolouring and the log read
 * "cancels die selection" instead of "takes back their last action", silently
 * stranding the favor.
 *
 * Drives the REAL shipped _setupCancelDieClickHandler and
 * _teardownCancelDieClickHandler.
 *
 * Run: node tests/test_die_cancel_undo_js.js
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

function makeGame() {
    const METHODS = ['_setupCancelDieClickHandler', '_teardownCancelDieClickHandler']
        .map(extractMethod).join('\n');
    const game = new Function(`return { ${METHODS} };`)();
    game.player_id = 7;
    game.actions = [];
    game.bgaPerformAction = (name, args) => game.actions.push(name);
    // One stand-in die element, keyed the way components.dice is.
    const die = { listeners: [] };
    die.addEventListener = (t, fn) => die.listeners.push(fn);
    die.removeEventListener = (t, fn) => {
        die.listeners = die.listeners.filter(f => f !== fn);
    };
    die.click = () => die.listeners.slice().forEach(fn =>
        fn({ stopPropagation: () => {} }));
    game.components = { dice: new Map([['7_2', die]]) };
    game.die = die;
    return game;
}

// ---------- bare die selection: click cancels ----------
{
    const game = makeGame();
    game._selectActionUndoAvailable = false;
    game._setupCancelDieClickHandler(2);
    game.die.click();
    check(game.actions.join(',') === 'actCancelDieSelection',
        'a bare die selection cancels on click, got: ' + game.actions.join(','));
}

// ---------- after a recolor: the SAME click must undo ----------
{
    const game = makeGame();
    // Bound BEFORE the recolor, exactly as onEnteringState does.
    game._setupCancelDieClickHandler(2);
    // The recolor happens later and only refreshes the args; this is the flag
    // onUpdateActionButtons records alongside suppressing the Cancel button.
    game._selectActionUndoAvailable = true;
    game.die.click();
    check(game.actions.join(',') === 'actUndo',
        'after a recolor the die click undoes rather than cancels, got: '
        + game.actions.join(','));
    check(!game.actions.includes('actCancelDieSelection'),
        'it must never cancel after a recolor (that strands the spent favor)');
}

// ---------- teardown fails closed ----------
{
    const game = makeGame();
    game._selectActionUndoAvailable = true;
    game._teardownCancelDieClickHandler();
    check(game._selectActionUndoAvailable === false,
        'teardown clears the flag so the next selection cannot inherit "undo"');

    // And a re-bind after teardown starts from cancel again.
    game._setupCancelDieClickHandler(2);
    game.die.click();
    check(game.actions.join(',') === 'actCancelDieSelection',
        'a fresh selection cancels again, got: ' + game.actions.join(','));
}

// ---------- only one handler stays bound ----------
{
    const game = makeGame();
    game._setupCancelDieClickHandler(2);
    game._setupCancelDieClickHandler(2);
    game.die.click();
    check(game.actions.length === 1,
        're-binding replaces rather than stacks handlers, got '
        + game.actions.length + ' dispatches');
}

// ---------- the button and the die click read the SAME flag ----------
{
    // If these ever diverge the bug is back, so pin the pairing in source.
    check(/this\._selectActionUndoAvailable = !!\(args && args\.undoAvailable\);/.test(SRC),
        'the flag is recorded from the same args.undoAvailable the button uses');
    const suppress = SRC.indexOf('this._selectActionUndoAvailable = !!(args && args.undoAvailable);');
    const cancelBtn = SRC.indexOf('if (!(args && args.undoAvailable)) {', suppress);
    check(cancelBtn > suppress && cancelBtn - suppress < 400,
        'it sits next to the Cancel-button suppression it must stay in step with');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
