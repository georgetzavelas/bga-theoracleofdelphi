/**
 * The trade-a-god-for-a-card button carries real art, in BOTH its states.
 *
 * #god-trade-btn used to draw its icon in CSS: a rotated square with two
 * borders, faking a chevron. That stand-in was replaced by the actual
 * illustration (god token, arrow, Oracle card), which means the button's icon
 * now lives in a background-image and is therefore breakable in a way a
 * ::after glyph was not.
 *
 * It broke immediately, and only rendering it caught it. The cancel state
 * (.god-trade-cancel, applied while trade mode is armed) tinted itself with
 * the `background` SHORTHAND. The shorthand resets every background property
 * it does not mention, so background-image went to none and arming trade mode
 * blanked the art out, leaving a plain pink card. Nothing in the JS or the
 * markup changes between the two states, so there was no other signal.
 *
 * That is the whole point of this file: a background-image icon is silently
 * erased by any later `background:` shorthand on the same element, and the
 * button has two states plus a hover. These assertions are cheap; finding it by
 * eye a second time would not be.
 *
 * Run: node tests/test_god_trade_button_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.css'), 'utf8');
const SRC = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.js'), 'utf8');

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

/**
 * Every rule whose selector mentions `needle`, as [selector, body] pairs.
 * Comments are stripped first: this stylesheet comments heavily above its
 * rules, and those blocks otherwise land in the captured selector text.
 */
function rulesFor(needle) {
    const stripped = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /(^|\n)([^{}]*)\{([^}]*)\}/g;
    const out = [];
    let m;
    while ((m = re.exec(stripped)) !== null) {
        if (m[2].includes(needle)) out.push([m[2].trim(), m[3]]);
    }
    return out;
}

const RULES = rulesFor('.action-god-trade');
check(RULES.length > 0, 'the button is styled at all');

// ---- the art is actually applied -------------------------------------------
{
    const base = RULES.find(([sel]) => /^\.action-god-trade\s*\{?$/.test(sel));
    check(!!base, 'there is a base .action-god-trade rule');
    const body = base ? base[1] : '';
    check(/background-image:\s*url\(['"]?img\/pieces\/trade-god-for-card\.png/.test(body),
        'it uses the trade-god-for-card artwork');
    check(/background-size:\s*contain/.test(body),
        'sized to contain, so the whole illustration fits rather than cropping '
        + 'the card off the bottom');
    check(/background-repeat:\s*no-repeat/.test(body), 'and does not tile');
    check(/background-color:/.test(body),
        'a fill colour is set too — the PNG has a transparent background, so '
        + 'without one the button would be a floating glyph with no card face');
}

// ---- the trap: no `background` shorthand on the ELEMENT itself --------------
// This is the regression. The shorthand resets background-image to none, so a
// tint written as `background: #f0d9d4` silently erases the art.
//
// Pseudo-element rules are exempt and must stay so: ::before draws the divider
// line beside the button with `background: rgba(...)`, and a shorthand there
// cannot touch the host element's background-image.
{
    const offenders = RULES.filter(([sel, body]) =>
        !/::(before|after)/.test(sel) && /(^|[;{]\s*)background\s*:/.test(body));
    check(offenders.length === 0,
        'no rule on .action-god-trade uses the `background` shorthand, which '
        + 'would reset background-image to none and blank the art'
        + (offenders.length ? ' (offending: ' + offenders.map(o => o[0]).join(', ') + ')' : ''));
}

// ---- both states still show it ---------------------------------------------
{
    const cancel = RULES.find(([sel]) => sel.includes('god-trade-cancel'));
    check(!!cancel, 'the armed/cancel state is styled');
    const body = cancel ? cancel[1] : '';
    check(/background-color:/.test(body),
        'trade mode re-tints with background-color, keeping the art');
    check(!/background-image:\s*none/.test(body),
        'and never blanks the image outright');
    check(/border-color:/.test(body),
        'the state still reads on the border, which is the cue that survives '
        + 'the art being identical in both states');
}

// ---- the CSS-drawn stand-in is gone ----------------------------------------
{
    const after = RULES.filter(([sel]) => sel.includes('::after'));
    check(after.length === 0,
        'the faked chevron ::after rules are gone — leaving them would stamp a '
        + 'second icon on top of the artwork');
}

// ---- the button is still a button ------------------------------------------
// Cheap guard that swapping the icon did not cost the accessible name or the
// keyboard path, both of which live in _renderGodTradeButton.
{
    const fn = SRC.slice(SRC.indexOf('_renderGodTradeButton: function'));
    const body = fn.slice(0, fn.indexOf('\n        },'));
    check(/setAttribute\(['"]role['"],\s*['"]button['"]\)/.test(body),
        'it still announces as a button');
    check(/setAttribute\(['"]tabindex['"]/.test(body), 'still focusable');
    check(/aria-label/.test(body),
        'still has an accessible name — the art conveys nothing to a screen '
        + 'reader, so this is the only thing that names the action');
    check(/keydown/.test(body) && /Enter/.test(body),
        'still activates from the keyboard');
    check(/actTradeGodForCard/.test(SRC), 'and the action it arms still exists');
}

console.log((fail ? 'FAILED' : 'ok') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
