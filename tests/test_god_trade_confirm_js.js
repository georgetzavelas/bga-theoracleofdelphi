/**
 * Trading a god for an Oracle Card asks first.
 *
 * The trade (rulebook p.8) returns any top-row god to the BOTTOM of the God
 * Track in exchange for one Oracle Card. It is irreversible and it costs a god
 * you spent the game climbing, and until now it committed on a single click:
 * arm trade mode, click a portrait, done. The portraits sit side by side in a
 * narrow strip, so the wrong one is one pixel away.
 *
 * The confirmation goes on the GOD PICK, not on the trade button. Clicking the
 * button only arms a mode — nothing is spent, and clicking it again cancels —
 * so confirming there would ask "do you want to enter a mode?" and protect
 * nothing. The pick is both the irreversible act and the only point at which
 * the question can name which god is about to go.
 *
 * Uses the house pattern, _confirmInActionBar: the question in the action-bar
 * title, a committing button, and Back. Not a popup — see that helper for why
 * that rule exists and how it was learned.
 *
 * Trade mode is exited BEFORE the question is shown. Otherwise the gods keep
 * pulsing as pick targets behind a question naming one specific god, and
 * clicking another would commit a trade the title does not describe.
 *
 * Run: node tests/test_god_trade_confirm_js.js
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

const METHODS = ['_confirmGodTrade', '_confirmInActionBar'].map(extractMethod).join('\n');

function makeGame() {
    const game = new Function('dojo', '_',
        `return { ${METHODS} };`)(
        { string: { substitute: (t, o) => t.replace(/\$\{(\w+)\}/g, (_m, k) => o[k]) } },
        (s) => s,
    );
    game.buttons = [];
    game.title = null;
    game.actions = [];
    game.restored = 0;
    game.exited = 0;
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
    game._exitGodTradeMode = () => { game.exited++; };
    game.press = (label) => {
        const b = game.buttons.find((x) => x.label === label);
        if (!b) throw new Error('no button ' + label + ' (have: '
            + game.buttons.map((x) => x.label).join(', ') + ')');
        b.fn();
    };
    return game;
}

// ============ 1. the question names the god and the cost ====================
{
    const g = makeGame();
    g._confirmGodTrade('hermes');

    check(/Hermes/.test(g.title || ''),
        'the question names the god being traded — the whole reason this sits '
        + 'on the pick rather than on the trade button');
    check(/bottom of the track/i.test(g.title || ''),
        'and names the COST, not just the card: the god goes to the bottom of '
        + 'the God Track, which is the part worth pausing over');
    check(/Oracle Card/i.test(g.title || ''), 'while still saying what is gained');
    check(g.actions.length === 0, 'nothing is dispatched merely by asking');
}
{
    // Capitalisation is derived, not hardcoded per god.
    const g = makeGame();
    g._confirmGodTrade('aphrodite');
    check(/Aphrodite/.test(g.title || ''), 'any god name is capitalised for display');
}

// ============ 2. trade mode is dropped before asking ========================
{
    const g = makeGame();
    g._confirmGodTrade('ares');
    check(g.exited === 1,
        'trade mode is exited before the question appears — leaving the gods '
        + 'pulsing as pick targets behind a question about one specific god '
        + 'would let a second click commit a trade the title does not describe');
}

// ============ 3. yes commits that god ========================================
{
    const g = makeGame();
    g._confirmGodTrade('hermes');
    g.press(g.buttons[0].label);

    check(g.actions.length === 1 && g.actions[0].a === 'actTradeGodForCard',
        'confirming dispatches the trade');
    check(g.actions[0].args.godName === 'hermes',
        'with the god that was picked, in the raw form the server expects — '
        + 'not the capitalised display label');
    check(g.restored === 0, 'and does not also restore the state');
}

// ============ 4. Back commits nothing =======================================
{
    const g = makeGame();
    g._confirmGodTrade('hermes');
    g.press('Back');

    check(g.actions.length === 0,
        'backing out trades nothing — the god stays on the top row');
    check(g.restored === 1,
        'and restores the server state, which re-renders PlayerActions with the '
        + 'trade button available again');
}

// ============ 5. it is the house pattern, not a popup =======================
{
    const g = makeGame();
    g._confirmGodTrade('hermes');
    check(g.buttons.length === 2, 'exactly two buttons: commit and Back');
    check(g.buttons[1].label === 'Back', 'Back is second');
    check(g.buttons[1].opts.color !== 'red',
        'Back is not red — red is the dismiss colour for abandoning an action');
    check(/Hermes/.test(g.buttons[0].label),
        'the committing button names the god too, so the choice is unambiguous '
        + 'even if the title scrolls out of view on a narrow screen');
}

// ============ 6. the interceptor routes through it ==========================
//     The commit path is a capture-phase listener inside _enterGodTradeMode,
//     which cannot be extracted. Pin it at the source instead: without this,
//     deleting the confirmation and dispatching directly still passes
//     everything above.
{
    const fn = SRC.slice(SRC.indexOf('_enterGodTradeMode: function'));
    const body = fn.slice(0, fn.indexOf('\n        },'));

    check(/_confirmGodTrade\(/.test(body),
        'the god-pick interceptor routes through the confirmation');
    check(!/bgaPerformAction\(['"]actTradeGodForCard/.test(body),
        'and no longer dispatches the trade directly — a second commit path '
        + 'would bypass the question entirely');
    check(/stopPropagation\(\)/.test(body),
        'while still stopping the click reaching the icon\'s normal '
        + 'actUseGodAbility handler');
}
{
    // Exactly one place dispatches the trade.
    const sites = (SRC.match(/bgaPerformAction\(['"]actTradeGodForCard/g) || []).length;
    check(sites === 1, 'exactly one dispatch site for actTradeGodForCard (found '
        + sites + ')');
}

console.log((fail ? 'FAILED' : 'ok') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
