/**
 * Client tests for Apollo's free any-colour card play
 * (see docs/superpowers/specs/2026-07-27-apollo-movable-wild-blessing-design.md).
 *
 * Apollo no longer flags a card wild, so there is no marker to place or move.
 * The benefit is announced by a single status chip and delivered by the same
 * free-recolour gate the dice already use. These tests drive the REAL shipped
 * _updateApolloBlessingChip, assert the per-card marker machinery is really
 * gone, and pin the CSS contract the chip depends on.
 *
 * Run: node tests/test_apollo_blessing_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.css'), 'utf8');
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

function newChip() {
    const chip = { textContent: '', classes: new Set() };
    chip.classList = {
        add: (c) => chip.classes.add(c),
        remove: (c) => chip.classes.delete(c),
        contains: (c) => chip.classes.has(c),
    };
    return chip;
}
function makeGame(chip) {
    const game = new Function(`return { ${extractMethod('_updateApolloBlessingChip')} };`)();
    global._ = (s) => s;
    global.document = {
        getElementById: (id) => (id === 'delphi-apollo-blessing-chip' ? chip : null),
    };
    return game;
}

// ---------- visibility + wording ----------
{
    const chip = newChip();
    const game = makeGame(chip);

    // No Apollo: nothing announced at all.
    game._updateApolloBlessingChip(false, true);
    check(!chip.classList.contains('visible'), 'hidden when Apollo is not active');
    check(chip.textContent === '', 'no stale text left behind when hidden');

    // Apollo with the card play still available: promise the free colour.
    game._updateApolloBlessingChip(true, true);
    check(chip.classList.contains('visible'), 'shown while Apollo is active');
    check(/any colour/i.test(chip.textContent),
        'names the free any-colour card play, got: ' + chip.textContent);

    // Card play already spent: it must stop promising a card benefit that is no
    // longer available, while Apollo's dice are still wild.
    game._updateApolloBlessingChip(true, false);
    check(chip.classList.contains('visible'), 'still shown once the play is spent');
    check(!/any colour/i.test(chip.textContent),
        'stops promising the card colour once the play is spent, got: ' + chip.textContent);
    check(/dice/i.test(chip.textContent),
        'falls back to the dice benefit, got: ' + chip.textContent);

    // Apollo ending clears it again (next turn).
    game._updateApolloBlessingChip(false, false);
    check(!chip.classList.contains('visible'), 'hidden again when Apollo ends');
    check(chip.textContent === '', 'text cleared when Apollo ends');

    // A missing element must be a safe no-op: the chip is built during setup and
    // notifications can fire either side of that during replay.
    const g2 = makeGame(null);
    let threw = false;
    try { g2._updateApolloBlessingChip(true, true); } catch (e) { threw = true; }
    check(!threw, 'a missing chip element is a safe no-op');
}

// ---------- the per-card marker machinery is really gone ----------
{
    check(!/_addApolloBlessingBadge/.test(SRC), 'the per-card medallion helper is gone');
    check(!/notif_apolloBlessingMoved/.test(SRC), 'the blessing-move notification is gone');
    check(!/actMoveApolloBlessing/.test(SRC), 'the blessing-move action call is gone');
    check(!/apollo-blessing-badge/.test(CSS), 'the medallion CSS is gone');
    // The lock must stay gone too: any Oracle card is playable under Apollo.
    check(!/\.oracle-card-apollo-locked\s*\{/.test(CSS), 'the Apollo card lock stays deleted');
    // Apollo's draw must arrive as an ORDINARY card, not a wild one.
    const drawHandler = SRC.match(
        /notif_apolloWildCardPrivate: function\(args\) \{[\s\S]*?\n        \},/);
    check(!!drawHandler, 'the Apollo draw handler still exists');
    check(!!drawHandler && /addOracleCardToHand\(\s*[\s\S]*?,\s*false\s*,/.test(drawHandler[0]),
        "Apollo's drawn card is added to the hand as a regular card");
}

// ---------- CSS contract for the chip ----------
{
    const m = CSS.match(/#delphi-apollo-blessing-chip\s*\{([^}]*)\}/);
    check(!!m, 'the chip rule exists');
    // Hidden by default, so a missed toggle fails closed rather than announcing
    // a benefit that is not active.
    check(!!m && /display\s*:\s*none/.test(m[1]), 'the chip is hidden by default');
    const vis = CSS.match(/#delphi-apollo-blessing-chip\.visible\s*\{([^}]*)\}/);
    check(!!vis && /display\s*:\s*inline-flex/.test(vis[1]),
        'the .visible modifier reveals it inline in the action bar');
    // It must NOT be mounted inside the hand container: that element's children
    // drive the card overlap via :first-child / :nth-child, and the card
    // renderers append and prepend into it, so a chip there shifts the hand.
    check(SRC.includes('\'<div id="delphi-oracle-cards-area"></div>\''),
        'the hand container is rendered empty, so nothing disturbs the card overlap');
    // And the chip is mounted in the action bar instead.
    check(/apolloChip\.id = 'delphi-apollo-blessing-chip'/.test(SRC)
        && /insertBefore\(apolloChip, wrapper\.nextSibling\)/.test(SRC),
        'the chip is mounted as a sibling in the action bar');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
