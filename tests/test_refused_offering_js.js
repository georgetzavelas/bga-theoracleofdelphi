/**
 * Tapping an offering you cannot load tells you why.
 *
 * A real game had a player spend ten minutes recolouring a die seven times, 2
 * Favor each and every one undone, trying to load a yellow offering sitting
 * beside their ship. No die colour would ever have worked: they carried a blue
 * offering which had no Zeus tile of its own and had therefore already claimed
 * their only any-colour tile. The rules were right and nothing said why.
 *
 * The reason nothing could say why is structural. Every gate in
 * getLoadableOfferings fails by OMISSION: the offering is left out of the
 * loadable list, so it never gets .cargo-selectable, and because a
 * non-selectable board piece is pointer-events: none the tap does not even
 * reach a handler. From the player's seat a legal refusal and a broken game
 * look identical, which is what the reports actually say.
 *
 * An earlier attempt put this in the action bar as a passive note and was
 * reverted for reading out of place (d66ad86). This is the same information
 * moved to the moment it is asked for: the refused offering becomes tappable
 * and answers.
 *
 * What these tests pin, and why each is here:
 *
 *   - Refused offerings become real pointer targets. Without the class the tap
 *     never arrives, which is the whole bug.
 *   - They must NOT look loadable. The gold pulse means "you can have this";
 *     borrowing it to mean "you cannot" would be worse than silence.
 *   - Tapping performs no action. It is an explanation, not a move.
 *   - Wording per reason, because the five gates have five different truths and
 *     one shared sentence would be wrong four times.
 *   - The "only X can be loaded" clause is dropped when nothing is loadable.
 *     Naming an empty list reads as a bug, which is the trap the reverted
 *     version explicitly avoided.
 *   - No remedy is ever offered, because there isn't one. Delivering the
 *     reserving cargo closes the wildcard tile recording its colour rather than
 *     freeing it, so the refused colour stays refused forever.
 *   - Teardown, since a stale handler on a now-loadable offering would swallow
 *     a real load.
 *
 * Run: node tests/test_refused_offering_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.css'), 'utf8');
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

// --- stub DOM ---------------------------------------------------------------
function makeOffering(id, color) {
    const classes = new Set(['delphi-offering', 'offering-' + color]);
    const el = {
        id: 'offering_' + id,
        dataset: { color: color },
        listeners: {},
        classList: {
            add: (c) => classes.add(c),
            remove: (c) => classes.delete(c),
            contains: (c) => classes.has(c),
        },
        addEventListener(t, fn) { (el.listeners[t] = el.listeners[t] || []).push(fn); },
        removeEventListener(t, fn) {
            el.listeners[t] = (el.listeners[t] || []).filter((f) => f !== fn);
        },
        fire(t, ev) { (el.listeners[t] || []).forEach((fn) => fn(ev)); },
    };
    return el;
}
function makeEvent() {
    return { stopped: false, stopPropagation() { this.stopped = true; } };
}

const METHODS = ['_setupRefusedOfferingHandlers', '_teardownRefusedOfferingHandlers',
    '_refusedOfferingMessage'].map(extractMethod).join('\n');

function makeGame(opts) {
    opts = opts || {};
    const board = {};
    [12, 15, 20].forEach((id) => { board[id] = makeOffering(id, opts.color || 'black'); });

    const game = new Function('document', 'dojo', '_',
        `return { ${METHODS} };`)(
        { getElementById: (id) => {
            const m = /^offering_(\d+)$/.exec(id);
            return m ? (board[m[1]] || null) : null;
        } },
        { string: { substitute: (t, o) => t.replace(/\$\{(\w+)\}/g, (_m, k) => o[k]) } },
        (s) => s,
    );

    game.messages = [];
    game.actions = [];
    game.showMessage = (m, kind) => { game.messages.push({ m, kind }); };
    game.bgaPerformAction = (a, args) => { game.actions.push({ a, args }); };
    game.isCurrentPlayerActive = () => (opts.active !== false);

    return { game, board };
}

const REFUSED = (over) => Object.assign({
    ids: [12, 15], reason: 'reserved', usefulColors: ['yellow', 'green'],
}, over || {});

// ============ 1. the offering becomes a real pointer target ==================
{
    const { game, board } = makeGame();
    game._setupRefusedOfferingHandlers(REFUSED(), 'black');

    check(board[12].classList.contains('cargo-refused')
        && board[15].classList.contains('cargo-refused'),
        'every refused offering in reach is marked, which is what re-enables '
        + 'pointer events on a board piece that is otherwise inert');
    check(!board[20].classList.contains('cargo-refused'),
        'offerings not named by the server are left alone');
    check((board[12].listeners.click || []).length === 1,
        'and carries exactly one click handler');
}

// ============ 2. it must not masquerade as loadable =========================
{
    const { game, board } = makeGame();
    game._setupRefusedOfferingHandlers(REFUSED(), 'black');
    check(!board[12].classList.contains('cargo-selectable'),
        'a refused offering never gets .cargo-selectable — the gold pulse means '
        + '"you can load this", and borrowing it to mean the opposite would be '
        + 'worse than the current silence');

    // The stylesheet has to grant pointer-events and a pointer cursor without
    // the outline/animation that .cargo-selectable carries. The styling is
    // spread over more than one rule (the pointer-events one needs id-level
    // specificity), so assert against all of them together rather than
    // whichever happens to appear first.
    const rulesFor = (cls) => {
        const re = /(^|\n)([^{}]*)\{([^}]*)\}/g;
        let m, out = [];
        while ((m = re.exec(CSS)) !== null) {
            if (m[2].includes(cls) && !m[2].includes('::before')) out.push(m[3]);
        }
        return out.length ? out.join('\n') : null;
    };
    const refused = rulesFor('.cargo-refused');
    check(refused !== null, 'the .cargo-refused rules exist');
    check(refused && /cursor:\s*pointer/.test(refused),
        'it sets cursor: pointer — the affordance, and also what tells iOS '
        + 'WebKit the piece is worth synthesizing a click for');
    check(refused && !/animation:/.test(refused) && !/outline:/.test(refused),
        'and adds no pulse or outline, so it stays visually inert');
    check(/#delphi-board-pieces > \.delphi-offering\.cargo-refused/.test(CSS),
        'pointer-events is re-enabled at the same specificity as the blanket '
        + '#delphi-board-pieces rule, or the cascade would ignore it');
}

// ============ 3. tapping explains and does nothing else =====================
{
    const { game, board } = makeGame();
    game._setupRefusedOfferingHandlers(REFUSED(), 'black');
    const ev = makeEvent();
    board[12].fire('click', ev);

    check(game.actions.length === 0,
        'tapping performs no game action — it is an explanation, not a move');
    check(game.messages.length === 1 && game.messages[0].kind === 'error',
        'it shows exactly one message, as an error so it reads as a refusal');
    check(ev.stopped,
        'and stops propagating so the board click handler does not also treat '
        + 'it as a hex tap');
}

// ============ 4. wording per reason =========================================
//     Five gates, five different truths. One shared sentence would be wrong
//     four times out of five.
{
    const cases = [
        ['reserved',  /any-colour/i],
        ['colorUsed', /another/i],
        ['colorHeld', /already carrying/i],
        ['covered',   /already cover/i],
        ['noTasks',   /no offering tasks/i],
    ];
    const seen = new Set();
    for (const [reason, shape] of cases) {
        const { game } = makeGame();
        const msg = game._refusedOfferingMessage(
            { reason, usefulColors: ['yellow', 'green'] }, 'black');
        check(typeof msg === 'string' && msg.length > 0, reason + ' produces a message');
        check(shape.test(msg), reason + ' is worded for that specific refusal (got: ' + msg + ')');
        seen.add(msg);
    }
    check(seen.size === cases.length, 'all five reasons word differently');
}
{
    // An unknown reason must not produce "undefined" on screen.
    const { game } = makeGame();
    const msg = game._refusedOfferingMessage(
        { reason: 'somethingNew', usefulColors: [] }, 'black');
    check(msg === null || /^[^u]|^undefined$(?!)/.test(String(msg)),
        'an unrecognised reason yields null rather than a broken sentence');
    check(msg === null, 'specifically null, so the caller can stay silent');
}

// ============ 5. never name an empty list ===================================
{
    const { game } = makeGame();
    const withColors = game._refusedOfferingMessage(
        { reason: 'reserved', usefulColors: ['yellow', 'green'] }, 'black');
    const without = game._refusedOfferingMessage(
        { reason: 'reserved', usefulColors: [] }, 'black');

    check(/yellow/i.test(withColors) && /green/i.test(withColors),
        'with colours available the message names them — "not this one" is '
        + 'exactly what the per-colour gate could never answer');
    check(!/only/i.test(without),
        'with none available the "only X can be loaded" clause is dropped, since '
        + 'naming an empty list reads as a bug');
    check(without && without.length > 0,
        'but it still says something, because the player just tapped');
}

// ============ 6. no false remedy ============================================
//     Delivering the reserving cargo closes the wildcard tile recording its
//     colour rather than freeing it, so the refused colour is refused forever.
//     An earlier draft of this message said "deliver it first", which promised
//     a change that never arrives.
{
    const { game } = makeGame();
    for (const reason of ['reserved', 'colorUsed']) {
        const msg = game._refusedOfferingMessage(
            { reason, usefulColors: ['yellow'] }, 'black');
        check(!/\bdeliver/i.test(msg),
            reason + ' does not suggest delivering as a way out — there is none');
        check(!/\bundo/i.test(msg),
            reason + ' does not suggest Undo either: picking the next die '
            + 'overwrites the snapshot, so it is never the exit here');
    }
}

// ============ 7. teardown ===================================================
{
    const { game, board } = makeGame();
    game._setupRefusedOfferingHandlers(REFUSED(), 'black');
    game._teardownRefusedOfferingHandlers();

    check(!board[12].classList.contains('cargo-refused'), 'teardown clears the class');
    board[12].fire('click', makeEvent());
    check(game.messages.length === 0, 'and the handler, so a now-loadable offering '
        + 'is not left with a stale refusal that swallows a real load');
}
{
    // Re-arming replaces rather than stacks.
    const { game, board } = makeGame();
    game._setupRefusedOfferingHandlers(REFUSED(), 'black');
    game._setupRefusedOfferingHandlers(REFUSED(), 'black');
    board[12].fire('click', makeEvent());
    check(game.messages.length === 1,
        'setting up twice does not double the handler');
}

// ============ 8. degenerate input ===========================================
{
    const { game } = makeGame();
    game._setupRefusedOfferingHandlers(null, 'black');
    game._setupRefusedOfferingHandlers({ ids: [], reason: 'reserved', usefulColors: [] }, 'black');
    game._setupRefusedOfferingHandlers({ ids: [999], reason: 'reserved', usefulColors: [] }, 'black');
    check(true, 'null args, empty ids and a missing element are all survivable');
}
{
    const { game, board } = makeGame({ active: false });
    game._setupRefusedOfferingHandlers(REFUSED(), 'black');
    check(!board[12].classList.contains('cargo-refused'),
        'nothing is armed for a non-active player — the wording addresses "you"');
}

console.log((fail ? 'FAILED' : 'ok') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
