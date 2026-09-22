/**
 * The favor-token stack, top right of every player board, says how many
 * tokens it holds.
 *
 * It is a pile of chips with a count badge and nothing else; the number is
 * legible but the pile does not say what it is counting. A text tooltip does.
 *
 * Two shapes matter here:
 *
 *   - one for one. "1 Favor tokens" is the kind of thing that makes an
 *     interface feel machine-written, and BGA's _() cannot express plurals,
 *     so the two forms are separate translatable strings;
 *   - the live board and the replicas SHARE the id delphi-favor-tokens-area,
 *     because a replica is a clone of the board markup. A document-wide
 *     lookup therefore depends on the live board coming first in document
 *     order. The live setter scopes itself to #delphi-game-container, which
 *     the replicas sit outside of, so it cannot tag a replica's pile.
 *
 * Run: node tests/test_favor_tooltip_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const GAME_LINES = fs.readFileSync(
    path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8').split('\n');
const COMP_LINES = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'js', 'Components.js'), 'utf8').split('\n');

function extract(lines, name) {
    const re = new RegExp('^        ' + name + ': function');
    const start = lines.findIndex(l => re.test(l));
    if (start < 0) throw new Error('not found: ' + name);
    let i = start;
    while (!/^        \},\s*$/.test(lines[i])) {
        i++;
        if (i > start + 400) throw new Error('runaway extracting ' + name);
    }
    return lines.slice(start, i + 1).join('\n');
}
const gameMethod = (n) => extract(GAME_LINES, n);
const compMethod = (n) => extract(COMP_LINES, n);

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

// ---- the wording ----------------------------------------------------------
{
    const g = new Function('dojo', '_', `return {
${gameMethod('_buildFavorTooltipText')}
};`)({ string: { substitute: (s, o) => s.replace(/\$\{(\w+)\}/g, (m, k) => o[k]) } },
     (s) => s);

    check(g._buildFavorTooltipText(3) === '3 Favor tokens',
        `three reads naturally, got "${g._buildFavorTooltipText(3)}"`);
    check(g._buildFavorTooltipText(1) === '1 Favor token',
        `one is singular, got "${g._buildFavorTooltipText(1)}"`);
    check(g._buildFavorTooltipText(0) === '0 Favor tokens',
        `an empty pile still says so, got "${g._buildFavorTooltipText(0)}"`);
    // Whatever arrives from a panelState payload must not reach the player.
    check(g._buildFavorTooltipText(undefined) === '0 Favor tokens',
        'a missing count reads as none rather than as "undefined"');
    check(g._buildFavorTooltipText('4') === '4 Favor tokens',
        'a numeric string counts, since panelState sends strings');

    // Both forms have to be separate _() calls or only one is translatable.
    const src = gameMethod('_buildFavorTooltipText');
    check((src.match(/_\(/g) || []).length >= 2,
        'singular and plural are separate translatable strings');
}

// ---- the router ----------------------------------------------------------
{
    const router = gameMethod('_logTokTooltipHtml');
    check(/favorstack/.test(router), 'the data-tt router knows the favorstack type');
    // 'favor' is already taken by the log token for a favor chip, which is
    // deliberately tooltip-less. Reusing it would hang a token count off every
    // favor mentioned in the game log.
    check(!/if \(type === 'favor'\)/.test(router),
        'and does NOT claim the log token\'s own "favor" type');
}

// ---- the live board tags its own pile, never a replica's -----------------
{
    function makeEl(id) {
        return {
            id: id || '', dataset: {}, style: {}, textContent: '',
            classList: { _s: new Set(), add(c) { this._s.add(c); },
                         remove(c) { this._s.delete(c); },
                         contains(c) { return this._s.has(c); } },
            setAttribute(k, v) { if (k === 'data-tt') this.dataset.tt = v; },
        };
    }
    const liveBadge = makeEl(), liveStack = makeEl();
    const oppBadge = makeEl(), oppStack = makeEl();
    const attached = [], removed = [];

    // Document order puts the live board first, exactly as the page does —
    // so an UNSCOPED selector would also "work" here. The scoped container is
    // what makes it work for the right reason.
    const doc = {
        querySelector(sel) {
            if (sel.indexOf('#delphi-game-container') !== 0) {
                // Unscoped: first match in document order.
                return /favor-count-badge/.test(sel) ? liveBadge : liveStack;
            }
            return /favor-count-badge/.test(sel) ? liveBadge : liveStack;
        },
        _scopedCalls: [],
    };
    const realQS = doc.querySelector.bind(doc);
    doc.querySelector = (sel) => { doc._scopedCalls.push(sel); return realQS(sel); };

    const comp = new Function('document', `return {
        favorTokenCount: 0,
        game: null,
${compMethod('setFavorTokenCount')}
${compMethod('_syncCardTooltip')}
${compMethod('_dropCardTooltip')}
};`)(doc);
    comp.game = {
        attachLogTooltips() { attached.push({ id: liveStack.id, tt: liveStack.dataset.tt }); },
        removeTooltip(id) { removed.push(id); },
    };

    comp.setFavorTokenCount(3);
    check(String(liveBadge.textContent) === '3', 'the badge still tracks the count');
    check(liveStack.id === 'delphi-favor-stack',
        `the live pile gets a stable id, got "${liveStack.id}"`);
    check(liveStack.dataset.tt === 'favorstack:3',
        `and a data-tt carrying the count, got "${liveStack.dataset.tt}"`);
    check(attached.length === 1, 'and the binder is asked to run');

    check(doc._scopedCalls.every(s => s.indexOf('#delphi-game-container') === 0),
        'every lookup is scoped to the game container, so a replica sharing '
        + 'the same id cannot be tagged instead: ' + JSON.stringify(doc._scopedCalls));

    // Spending favor rebinds, or the tooltip keeps the count it was born with.
    comp.setFavorTokenCount(1);
    check(liveStack.dataset.tt === 'favorstack:1',
        `spending down updates the data-tt, got "${liveStack.dataset.tt}"`);
    check(removed.indexOf('delphi-favor-stack') !== -1,
        'dropping the stale binding first');
    check(attached.length === 2, 'and rebinding at the new count');

    void oppBadge; void oppStack;
}

// ---- the replica tags its own, under a per-board id ----------------------
{
    const src = GAME_LINES.join('\n');
    check(/dataset\.tt = 'favorstack:'/.test(src),
        'the opponent replica writes a favorstack data-tt');
    const idLine = GAME_LINES.find(l => /'-favor'/.test(l));
    check(!!idLine && /oppb-/.test(idLine),
        `under a per-board id, since every replica clones the same markup, got: ${
            (idLine || '').trim()}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
