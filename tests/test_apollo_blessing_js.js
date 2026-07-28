/**
 * Client tests for Apollo's free any-colour card play
 * (see docs/superpowers/specs/2026-07-27-apollo-movable-wild-blessing-design.md).
 *
 * Apollo no longer flags a card wild, so there is no marker to place or move and
 * no status banner. The benefit is delivered by the same free-recolour gate the
 * dice already use, and announced on the action-bar card tooltip itself.
 *
 * Drives the REAL shipped _addOracleCardTooltip and asserts the marker/banner
 * machinery is really gone.
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

function makeGame() {
    const game = new Function(`return { ${extractMethod('_addOracleCardTooltip')} };`)();
    game.bound = [];
    game.addTooltipHtml = (id, html) => game.bound.push({ id, html });
    game.removeTooltip = () => {};
    global._ = (s) => s;
    global.dojo = { string: { substitute: (t, o) =>
        t.replace(/\$\{(\w+)\}/g, (m, k) => o[k]) } };
    return game;
}
function tipFor(opts) {
    const game = makeGame();
    const icon = { id: '' };
    game._addOracleCardTooltip(icon, opts.color, !!opts.isWild,
        opts.count || 1, !!opts.apollo);
    return game.bound[0].html;
}

// ---------- the card is named by its COLOUR, never "Wild Oracle Card" --------
{
    const plain = tipFor({ color: 'red' });
    check(/Red Oracle Card/.test(plain), 'a regular card is named by its colour: ' + plain);
    check(!/Wild Oracle Card/.test(plain), 'no "Wild Oracle Card" wording');

    // Even a card the server still flags wild must be named by its colour: being
    // wild is a property of the PLAY, not a different card.
    const wild = tipFor({ color: 'green', isWild: true });
    check(/Green Oracle Card/.test(wild), 'a wild-flagged card is still named by colour: ' + wild);
    check(!/Wild Oracle Card/.test(wild), 'a wild-flagged card does not lose its colour name');

    // The count suffix survives.
    const many = tipFor({ color: 'blue', count: 3 });
    check(/Blue Oracle Card/.test(many) && /3/.test(many),
        'the stack count is still shown: ' + many);
}

// ---------- the Apollo line appears only while Apollo is active --------------
{
    const off = tipFor({ color: 'red', apollo: false });
    check(!/oracle-card-tooltip-apollo/.test(off), 'no Apollo line when Apollo is inactive');
    check(!/will be wild/i.test(off), 'no wild promise when Apollo is inactive');

    const on = tipFor({ color: 'red', apollo: true });
    check(/oracle-card-tooltip-apollo/.test(on), 'the Apollo line is present under Apollo');
    check(/If selected will be wild/.test(on), 'the Apollo line states the promise: ' + on);
    check(/oracle-card-tooltip-apollo-icon/.test(on), 'the Apollo line carries the god icon');
    // The colour name must still lead.
    check(on.indexOf('Red Oracle Card') < on.indexOf('If selected will be wild'),
        'the colour name comes before the Apollo line');
}

// ---------- the marker and the banner are both gone -------------------------
{
    check(!/_addApolloBlessingBadge/.test(SRC), 'the per-card medallion helper is gone');
    check(!/notif_apolloBlessingMoved/.test(SRC), 'the blessing-move notification is gone');
    check(!/actMoveApolloBlessing/.test(SRC), 'the blessing-move action call is gone');
    check(!/apollo-blessing-badge/.test(CSS), 'the medallion CSS is gone');
    check(!/_updateApolloBlessingChip/.test(SRC), 'the action-bar status banner is gone');
    check(!/apollo-blessing-chip/.test(CSS), 'the banner CSS is gone');
    // The lock must stay gone: any Oracle card is playable under Apollo.
    check(!/\.oracle-card-apollo-locked\s*\{/.test(CSS), 'the Apollo card lock stays deleted');
    // Apollo's draw must arrive as an ORDINARY card.
    const draw = SRC.match(/notif_apolloWildCardPrivate: function\(args\) \{[\s\S]*?\n        \},/);
    check(!!draw && /addOracleCardToHand\(\s*[\s\S]*?,\s*false\s*,/.test(draw[0]),
        "Apollo's drawn card is added to the hand as a regular card");
}

// ---------- the ability description matches the rule ------------------------
{
    const desc = SRC.match(/case 'dice_wild': return _\('([^']*)'\)/);
    check(!!desc, 'the dice_wild description exists');
    const text = desc ? desc[1] : '';
    check(/also wild/.test(text), 'describes the played card as also wild: ' + text);
    check(!/any colour, free/.test(text), 'the old "any colour, free" wording is gone');
}

// ---------- CSS contract for the Apollo tooltip line ------------------------
{
    const line = CSS.match(/\.oracle-card-tooltip-apollo\s*\{([^}]*)\}/);
    check(!!line, 'the Apollo tooltip line rule exists');
    // BGA renders tooltips on a LIGHT background, so the line must stay dark to
    // match the card name above it. Gold was unreadable there.
    check(!!line && /color\s*:\s*#000/.test(line[1]),
        'the Apollo line is black, not gold');
    const icon = CSS.match(/\.oracle-card-tooltip-apollo-icon\s*\{([^}]*)\}/);
    check(!!icon && /img\/gods\/apollo\.png/.test(icon[1]),
        'the line uses the Apollo god art');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
