/**
 * Confirming a Look with fewer islands than you could have picked.
 *
 * PeekIslands phase 1 lets you select up to maxPeeks (2) face-down islands and
 * accepts any non-zero number, so "Confirm Look" with one island selected is
 * legal and irreversible — the shrines flip, and the peek is spent. Players who
 * meant to pick a second and forgot had no way back.
 *
 * ScoutIslands deliberately has no equivalent: its confirm requires exactly 2,
 * so it can never be under-selected.
 *
 * The confirmation reuses this game's house pattern, which is an action-bar
 * swap and NOT a popup. That rule was established the hard way: the instant-
 * equipment Pass confirmation shipped as a legacy confirmationDialog (b126687),
 * was modernised to this.bga.dialogs.confirmation (e7d5e4d), and was then
 * rewritten into the action bar because popups here are reserved for tutorials
 * (5d1ead7). This is the fourth confirm and the point at which the shared shape
 * is worth extracting, so _confirmInActionBar now backs both plain yes/no
 * confirmations. The fork (_enterExploreVsPeekConfirmMode) and the which-one
 * picker (_openAutoDefeatConfirm) are a different shape and stay as they are.
 *
 * What matters here beyond the wiring:
 *
 *   - Back must RESTORE, not abort. PeekIslands' ordinary Cancel dispatches
 *     actCancel and throws the whole peek away; answering "no" to a question
 *     about under-selecting must not do that. restoreServerGameState re-enters
 *     phase 1, where the selection is rebuilt from sessionStorage, so the one
 *     island the player picked is still selected.
 *   - The confirm reads the selection when it is CLICKED, not when it is armed.
 *     The board stays live while the question is up, so a player who takes the
 *     hint and picks the second island must have both submitted.
 *   - It must not fire when there is nothing more to pick. With a single
 *     face-down island on the board, one is the maximum and asking would be
 *     noise.
 *
 * Run: node tests/test_peek_confirm_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.js'), 'utf8');
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

const METHODS = ['_confirmInActionBar', '_confirmInstantActionPass',
    '_peekUnderSelected', '_submitPeekSelection'].map(extractMethod).join('\n');

function makeGame(opts) {
    opts = opts || {};
    const boardClasses = new Set(['peek-mode']);
    const board = {
        classList: {
            add: (c) => boardClasses.add(c),
            remove: (c) => boardClasses.delete(c),
            contains: (c) => boardClasses.has(c),
        },
    };
    const game = new Function('document', '_',
        `return { ${METHODS} };`)(
        { getElementById: (id) => (id === 'delphi-board-container' ? board : null) },
        (s) => s,
    );

    game.buttons = [];
    game.title = null;
    game.actions = [];
    game.restored = 0;
    game.statusBar = {
        removeActionButtons: () => { game.buttons = []; },
        setTitle: (t) => { game.title = t; },
        addActionButton: (label, fn, o) => {
            const b = { label, fn, opts: o || {} };
            game.buttons.push(b);
            return b;
        },
    };
    game.restoreServerGameState = () => { game.restored++; };
    game.bgaPerformAction = (a, args) => { game.actions.push({ a, args }); };

    game._selectedPeekIslands = opts.selected || [];
    game._peekMaxPeeks = opts.max === undefined ? 2 : opts.max;
    game._peekIslandSet = new Set(opts.available || ['1,1', '2,2', '3,3']);
    game._clearReachableOverlays = () => { game.overlaysCleared = true; };
    game._selectedOverlays = [{ remove() { game.checkRemoved = true; } }];

    game.board = board;
    game.press = (label) => {
        const b = game.buttons.find((x) => x.label === label);
        if (!b) throw new Error('no button labelled ' + label + ' (have: '
            + game.buttons.map((x) => x.label).join(', ') + ')');
        b.fn();
    };
    return game;
}

const HEX = (q, r) => ({ q: q, r: r });

// ============ 1. the shared helper's shape ==================================
{
    const g = makeGame();
    g.statusBar.addActionButton('stale', () => {});
    let confirmed = 0;
    g._confirmInActionBar('Are you sure?', 'Do it', () => { confirmed++; });

    check(g.buttons.length === 2,
        'the existing buttons are cleared and replaced, so the question cannot '
        + 'be answered by a button that belonged to the previous state');
    check(g.title === 'Are you sure?',
        'the question goes in the action-bar TITLE, matching the house pattern');
    check(g.buttons[0].label === 'Do it', 'the committing choice comes first');
    check(g.buttons[1].label === 'Back', 'with Back second');
    check(g.buttons[1].opts.color !== 'red',
        'Back is not red — red is this file\'s dismiss colour (_addCancelButton) '
        + 'and Back returns to a live selection rather than abandoning it');

    g.press('Do it');
    check(confirmed === 1, 'the confirm button runs the callback');
}
{
    const g = makeGame();
    g._confirmInActionBar('Q', 'Yes', () => { throw new Error('must not run'); });
    g.press('Back');
    check(g.restored === 1,
        'Back restores the server state rather than dispatching anything');
    check(g.actions.length === 0, 'and performs no action');
}

// ============ 2. the existing caller still works ============================
//     _confirmInstantActionPass has two live call sites (the offering and
//     statue hook states). Rewriting it as a wrapper must not change them.
{
    const g = makeGame();
    g._confirmInstantActionPass('actPassOffering');
    check(/only be used now/i.test(g.title || ''),
        'the instant-pass wording is unchanged');
    check(g.buttons.length === 2 && g.buttons[1].label === 'Back',
        'and it still offers exactly Confirm / Back');
    g.press(g.buttons[0].label);
    check(g.actions.length === 1 && g.actions[0].a === 'actPassOffering',
        'confirming still forfeits the card via the action it was given');
}

// ============ 3. when to ask ================================================
{
    const cases = [
        ['one of two picked, three islands available', [HEX(1, 1)], 2, ['1,1', '2,2', '3,3'], true],
        ['both picked', [HEX(1, 1), HEX(2, 2)], 2, ['1,1', '2,2', '3,3'], false],
        ['one picked, one available', [HEX(1, 1)], 2, ['1,1'], false],
        ['nothing picked', [], 2, ['1,1', '2,2'], false],
        ['max of one', [HEX(1, 1)], 1, ['1,1', '2,2'], false],
    ];
    for (const [label, selected, max, available, want] of cases) {
        const g = makeGame({ selected, max, available });
        check(g._peekUnderSelected() === want, 'asks? ' + label + ' -> ' + want);
    }
    check(true, '');
    // The one-available case is the interesting one: it is what stops the
    // question firing when a second pick was never possible.
}

// ============ 4. confirming reads the selection at CLICK time ===============
//     The board stays live while the question is on screen, so a player who
//     takes the hint and picks their second island must get both submitted.
{
    const g = makeGame({ selected: [HEX(1, 1)] });
    g._confirmInActionBar('Q', 'Look at 1 Island', () => g._submitPeekSelection());

    g._selectedPeekIslands.push(HEX(2, 2));   // picked while the question was up
    g.press('Look at 1 Island');

    check(g.actions.length === 1 && g.actions[0].a === 'actConfirmPeek',
        'confirming dispatches the peek');
    const sent = JSON.parse(g.actions[0].args.hexCoordsJson);
    check(sent.length === 2,
        'with BOTH islands — the selection is read when the button is pressed, '
        + 'not captured when the question was armed');
}

// ============ 5. the submit still does its teardown =========================
//     This block used to be inline in the button handler; extracting it must
//     not drop any of it, and each piece is load-bearing.
{
    const g = makeGame({ selected: [HEX(1, 1)] });
    g._submitPeekSelection();
    check(g.overlaysCleared === true,
        'pulsing overlays are cleared so the flipped shrines are visible');
    check(g.checkRemoved === true && g._selectedOverlays === null,
        'and so are the checkmarks');
    check(!g.board.classList.contains('peek-mode'),
        'peek-mode comes off the board container');
    check(g._peekEnteringViewing === true,
        'the entering-viewing flag is set, or the leave handler unflips the '
        + 'shrines the player just paid to see');
    check(g.actions.length === 1
        && g.actions[0].args.hexCoordsJson === JSON.stringify([HEX(1, 1)]),
        'and the selection is sent as JSON');
}
{
    const g = makeGame({ selected: [] });
    g._submitPeekSelection();
    check(g.actions.length === 0, 'an empty selection dispatches nothing');
}

// ============ 6. the call site is actually wired ============================
//     Everything above drives the helpers directly, which leaves the one place
//     that matters — the Confirm Look button in onUpdateActionButtons —
//     unproven. That branch lives inside a method far too large to extract, so
//     pin it at the source level instead. Without this, deleting the
//     confirmation entirely still passes every other assertion in this file.
{
    const at = SRC.indexOf("addActionButton(_('Confirm Look')");
    check(at > 0, 'the Confirm Look button still exists');
    const handler = SRC.slice(at, at + 1400);

    check(/_peekUnderSelected\(\)/.test(handler),
        'Confirm Look asks whether the selection is short before committing');
    check(/_confirmInActionBar\(/.test(handler),
        'and routes that through the shared action-bar confirm, not a dialog');
    check(/only selected one island to Look at/.test(handler),
        'with the agreed wording');
    check(/_submitPeekSelection\(\)/.test(handler),
        'both paths commit through the shared submit');
    check(!/hexCoordsJson/.test(handler),
        'the submit body is no longer inlined here — a second copy would drift '
        + 'from the one the confirmation calls');

    // The late-read property depends on _submitPeekSelection taking no
    // argument, so no caller can hand it a selection captured earlier.
    check(/_submitPeekSelection: function\(\)/.test(SRC),
        '_submitPeekSelection takes no argument, so a caller cannot pass it a '
        + 'stale snapshot of the selection');
}

console.log((fail ? 'FAILED' : 'ok') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
