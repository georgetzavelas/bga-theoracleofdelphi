/**
 * An unusable god ability says why it is unusable.
 *
 * PlayerActions computes a precise reason for every god ability it turns down
 * — "No cargo space available", "Ship must be adjacent to a city", "You
 * already have enough statues for your remaining tasks", "No available statue
 * colour matches a remaining task" — and ships it in the state args as
 * `reason`. The client threw it away: _updateGodAbilityIcons read `usable`, added
 * .god-ability-unavailable, bound the ordinary god tooltip, and never looked at
 * `reason` at all.
 *
 * So a greyed-out Hermes gave no clue. That is how the Reinforced Hull capacity
 * bug reached a player as "why won't Hermes work?" rather than as "Hermes says
 * I have no cargo space, but my panel shows a free slot" — which names the bug
 * outright, since the panel and the gate disagreed.
 *
 * Same shape as the refused-offering work: the rules were right, the UI simply
 * never said why.
 *
 * The second bug in here is subtler and was found while reading the two render
 * paths side by side. _updateGodAbilityIcons has a fast path for when the god list
 * is unchanged, which clones each icon to swap the click handler. The clone
 * carries the old classes, and the fast path only ever REMOVED
 * .god-ability-unavailable:
 *
 *     if (usable) fresh.classList.remove('god-ability-unavailable');
 *
 * A god that was usable and became unusable therefore kept looking enabled,
 * while quietly having no click handler bound — a live-looking icon that
 * silently does nothing. The class has to be toggled both ways.
 *
 * Run: node tests/test_god_ability_reason_js.js
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

// _escHtml is extracted rather than stubbed, so the escaping assertion below
// exercises the real thing.
const METHODS = ['_godAbilityTooltipHtml', '_buildGodTooltipHtml', '_escHtml']
    .map(extractMethod).join('\n');

function makeGame() {
    const game = new Function('_', `return { ${METHODS} };`)((s) => s);
    game.components = {
        GOD_INFO: {
            hermes: { ability: 'grab_any_statue' },
            ares: { ability: 'auto_defeat_monster', prerequisite: 'Top row' },
        },
    };
    game.getGodAbilityDescription = (a) => 'does ' + a;
    return game;
}

const NO_SPACE = 'No cargo space available';

// ============ 1. an unusable ability explains itself =========================
{
    const g = makeGame();
    const html = g._godAbilityTooltipHtml(
        { god_name: 'hermes', usable: false, reason: NO_SPACE });

    check(html.indexOf(NO_SPACE) >= 0,
        'the server\'s reason appears in the tooltip — this is the whole point, '
        + 'and its absence is how a capacity bug reached a player as "why '
        + 'won\'t Hermes work?"');
    check(/Hermes/.test(html),
        'the ordinary god tooltip is still there, not replaced by the reason');
    check(/does grab_any_statue/.test(html),
        'including the ability description');
}

// ============ 2. a usable ability is unchanged ===============================
{
    const g = makeGame();
    const usable = g._godAbilityTooltipHtml({ god_name: 'hermes', usable: true });
    const plain = g._buildGodTooltipHtml('hermes');
    check(usable === plain,
        'a usable god\'s tooltip is byte-identical to the plain one — nothing '
        + 'is added when there is nothing to explain');
}
{
    // usable is optional in the args; absent means usable (the client reads
    // `g.usable !== false` everywhere else).
    const g = makeGame();
    check(g._godAbilityTooltipHtml({ god_name: 'ares' }) === g._buildGodTooltipHtml('ares'),
        'an ability with no usable flag is treated as usable');
}

// ============ 3. degenerate input ============================================
{
    const g = makeGame();
    const noReason = g._godAbilityTooltipHtml({ god_name: 'hermes', usable: false });
    check(noReason === g._buildGodTooltipHtml('hermes'),
        'unusable with no reason given falls back to the plain tooltip rather '
        + 'than rendering an empty explanation box');
    check(noReason.indexOf('undefined') < 0, 'and never prints "undefined"');
}
{
    const g = makeGame();
    const html = g._godAbilityTooltipHtml(
        { god_name: 'hermes', usable: false, reason: '<img src=x onerror=alert(1)>' });
    check(html.indexOf('<img') < 0,
        'the reason is escaped — it is server text, but it lands in innerHTML '
        + 'and every other tooltip in this file escapes what it interpolates');
}

// ============ 4. both render paths use it ====================================
//     _updateGodAbilityIcons has two: a fast path for an unchanged god list and a
//     full rebuild. Wiring only one leaves the reason missing exactly half the
//     time, depending on whether the previous render had the same gods.
{
    const fn = SRC.slice(SRC.indexOf('_updateGodAbilityIcons: function'));
    const body = fn.slice(0, fn.indexOf('\n        },'));

    const uses = (body.match(/_godAbilityTooltipHtml\(/g) || []).length;
    check(uses === 2,
        'both the fast path and the full rebuild bind the reason-aware tooltip '
        + '(found ' + uses + ')');
    check(!/addTooltipHtml\([^)]*_buildGodTooltipHtml\(g\.god_name\)/.test(body),
        'and neither still binds the plain builder, which would silently drop '
        + 'the reason on that path');
}

// ============ 5. the fast path toggles the class BOTH ways ===================
//     The clone keeps the previous render's classes, so removing on usable
//     without adding on unusable leaves a god that just became unusable looking
//     enabled — and it has no click handler, so it does nothing when pressed.
{
    const fn = SRC.slice(SRC.indexOf('_updateGodAbilityIcons: function'));
    const body = fn.slice(0, fn.indexOf('\n        },'));
    const fast = body.slice(0, body.indexOf('Full rebuild'));

    check(/classList\.toggle\('god-ability-unavailable'/.test(fast)
        || (/classList\.add\('god-ability-unavailable'\)/.test(fast)
            && /classList\.remove\('god-ability-unavailable'\)/.test(fast)),
        'the fast path both adds and removes the unavailable class, so a god '
        + 'that just became unusable actually greys out instead of looking '
        + 'live with no handler attached');
}

console.log((fail ? 'FAILED' : 'ok') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
