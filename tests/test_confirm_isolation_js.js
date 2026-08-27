/**
 * While a confirmation is up, the only buttons on screen are its two.
 *
 * _confirmInActionBar calls statusBar.removeActionButtons(), which clears
 * everything inside #generalactions — and stops there. The action-source strip
 * (#delphi-action-sources) is a SIBLING of #generalactions, not a child, so it
 * survived untouched: the player's dice, their oracle-card chips, every
 * top-row god portrait and the trade button all stayed on screen beside the
 * question.
 *
 * That is not merely visual noise. Those icons carry live handlers. During
 * "Return Hermes to the bottom of the track and draw 1 Oracle Card?" the god
 * portraits are back in normal mode with their actUseGodAbility handlers
 * bound, so a player could click a god and use its ability instead of
 * answering — an exit from the confirmation that is neither of its buttons and
 * commits something else entirely. Same for the dice.
 *
 * Fixed in the shared helper rather than per caller, so all four confirmations
 * behave alike: the instant-equipment Pass, the explore-vs-peek fork is
 * separate, the under-selected Look, and the god trade.
 *
 * The strip is revealed again in onUpdateActionButtons, unconditionally,
 * alongside the other "drop on every render, re-add in the state that wants
 * it" resets already at the top of that method. Every exit from a confirmation
 * goes through a re-render — the commit changes state, and Back is
 * restoreServerGameState — so there is no path that leaves it hidden.
 *
 * Run: node tests/test_confirm_isolation_js.js
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

const METHODS = ['_confirmInActionBar', '_setActionSourcesHidden'].map(extractMethod).join('\n');

function makeGame() {
    const classes = new Set();
    const sources = {
        classList: {
            add: (c) => classes.add(c),
            remove: (c) => classes.delete(c),
            toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); },
            contains: (c) => classes.has(c),
        },
    };
    const game = new Function('document', '_',
        `return { ${METHODS} };`)(
        { getElementById: (id) => (id === 'delphi-action-sources' ? sources : null) },
        (s) => s,
    );
    game.buttons = [];
    game.statusBar = {
        removeActionButtons: () => { game.buttons = []; },
        setTitle: (t) => { game.title = t; },
        addActionButton: (label, fn, o) => {
            game.buttons.push({ label, fn, opts: o || {} });
            return {};
        },
    };
    game.restoreServerGameState = () => { game.restored = true; };
    game.sources = sources;
    return game;
}

const HIDDEN = 'confirm-isolated';

// ============ 1. the strip goes away while asking ===========================
{
    const g = makeGame();
    check(!g.sources.classList.contains(HIDDEN), 'precondition: strip visible');

    g._confirmInActionBar('Sure?', 'Yes', () => {});
    check(g.sources.classList.contains(HIDDEN),
        'the action-source strip is hidden for the duration of the question — '
        + 'removeActionButtons cannot reach it, because it is a sibling of '
        + '#generalactions rather than a child');
    check(g.buttons.length === 2,
        'leaving exactly the two buttons the decision needs');
}

// ============ 2. it comes back ==============================================
{
    const g = makeGame();
    g._confirmInActionBar('Sure?', 'Yes', () => {});
    g._setActionSourcesHidden(false);
    check(!g.sources.classList.contains(HIDDEN), 'and is restored when told to');
}
{
    // Missing element must not throw: the strip is only mounted once BGA's
    // action bar exists, and confirmations can be armed before a re-render.
    const game = new Function('document', '_', `return { ${METHODS} };`)(
        { getElementById: () => null }, (s) => s);
    let threw = false;
    try { game._setActionSourcesHidden(true); } catch (e) { threw = true; }
    check(!threw, 'a missing strip is survivable rather than fatal');
}

// ============ 3. every render reveals it ====================================
//     This is what guarantees no path leaves it hidden. Both exits from a
//     confirmation re-render: the commit changes state, and Back is
//     restoreServerGameState.
{
    const fn = SRC.slice(SRC.indexOf('onUpdateActionButtons: function'));
    const head = fn.slice(0, fn.indexOf("switch ( stateName )"));
    check(/_setActionSourcesHidden\(false\)/.test(head),
        'onUpdateActionButtons reveals the strip unconditionally at the top, '
        + 'with the other per-render resets — so a confirmation cannot strand '
        + 'it hidden');
}

// ============ 4. the CSS actually hides it ==================================
{
    const rule = (() => {
        const re = /(^|\n)([^{}]*)\{([^}]*)\}/g;
        let m;
        while ((m = re.exec(CSS)) !== null) {
            if (m[2].includes(HIDDEN)) return m[3];
        }
        return null;
    })();
    check(rule !== null, 'there is a .' + HIDDEN + ' rule');
    check(rule && /display:\s*none/.test(rule),
        'and it hides outright rather than just dimming — a visible-but-'
        + 'inert icon still reads as a button you are allowed to press');
}

// ============ 5. all callers inherit it =====================================
//     The fix lives in the shared helper, so every confirmation gets it. If a
//     caller ever hand-rolled the swap instead, it would silently lose this.
{
    // Three call sites today: the instant-equipment Pass, the under-selected
    // Look, and the god-for-a-card trade. (The definition itself reads
    // `_confirmInActionBar: function(`, so it is not counted here.)
    const callers = (SRC.match(/_confirmInActionBar\(/g) || []).length;
    check(callers === 3,
        'all three yes/no confirmations still route through the helper, so all '
        + 'three inherit the isolation (found ' + callers + ')');

    for (const fnName of ['_confirmInstantActionPass', '_confirmGodTrade']) {
        const body = extractMethod(fnName);
        check(/_confirmInActionBar\(/.test(body),
            fnName + ' goes through the shared helper rather than driving the '
            + 'status bar itself');
        check(!/statusBar\.removeActionButtons\(\)/.test(body),
            fnName + ' does not hand-roll the swap, which would skip the '
            + 'isolation');
    }
}

console.log((fail ? 'FAILED' : 'ok') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
