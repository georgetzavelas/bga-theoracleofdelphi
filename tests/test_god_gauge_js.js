/**
 * The god badge in the player panel says, at a glance, which gods can take a
 * bonus step when an opponent consults the Oracle.
 *
 * GodAdvancement::isOracleConsultEligible is the rule: the god must already
 * be on the track and not yet at the top. "A consultation advances a god, it
 * never starts one." So the badge reads three ways:
 *
 *   row 0     off the track: a black disc, no number
 *   row 1-5   eligible:      a white disc with the row
 *   row 6     topped:        gold, as before
 *
 * A number on the badge therefore means exactly "this god can take the
 * bonus", and the two states that cannot are each visibly something else.
 *
 * Run: node tests/test_god_gauge_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const COMPONENTS = fs.readFileSync(path.join(ROOT, 'modules/js/Components.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.css'), 'utf8');

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

function extractMethod(src, name) {
    const start = src.indexOf(name + ': function');
    if (start < 0) throw new Error('method not found: ' + name);
    let i = src.indexOf('{', start);
    let depth = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(start, i + 1);
}

const panel = new Function('document', 'return { '
    + extractMethod(COMPONENTS, '_renderGodTrack') + ', '
    + extractMethod(COMPONENTS, '_clampGodStep') + ', '
    + extractMethod(COMPONENTS, 'updateGodStep')
    + ' };');

// ---- the render --------------------------------------------------------------
{
    const p = panel(null);
    const badgeText = (html) => (html.match(/<div class="delphi-pp-god-row">([^<]*)<\/div>/) || [])[1];
    const gaugeClass = (html) => (html.match(/<div class="(delphi-pp-god-gauge[^"]*)"/) || [])[1];

    const off = p._renderGodTrack(7, 'apollo', 0);
    check(/\boff-track\b/.test(gaugeClass(off)),
        `row 0 marks the gauge off-track, got "${gaugeClass(off)}"`);
    check(badgeText(off) === '',
        `and shows no number, got "${badgeText(off)}"`);

    [1, 3, 5].forEach(function(row) {
        const html = p._renderGodTrack(7, 'apollo', row);
        check(!/\boff-track\b/.test(gaugeClass(html)) && !/\btopped\b/.test(gaugeClass(html)),
            `row ${row} is neither off-track nor topped`);
        check(badgeText(html) === String(row),
            `and shows its row, got "${badgeText(html)}"`);
    });

    const top = p._renderGodTrack(7, 'apollo', 6);
    check(/\btopped\b/.test(gaugeClass(top)) && !/\boff-track\b/.test(gaugeClass(top)),
        'row 6 is topped and not off-track');
}

// ---- the live update agrees with the render ---------------------------------
// The two drifting apart is how a god would read eligible on reload and not
// after a live step, or the reverse.
{
    function makeGauge() {
        const cls = new Set(['delphi-pp-god-gauge']);
        const badge = { textContent: '' };
        const pips = Array.from({ length: 6 }, () => ({ classList: { toggle() {} } }));
        return {
            badge,
            classList: {
                toggle(c, on) { if (on) cls.add(c); else cls.delete(c); },
                contains(c) { return cls.has(c); },
            },
            querySelector: (sel) => (sel === '.delphi-pp-god-row' ? badge : null),
            querySelectorAll: () => pips,
        };
    }
    const g = makeGauge();
    const p = panel({ getElementById: () => g });

    p.updateGodStep(7, 'apollo', 3);
    check(!g.classList.contains('off-track') && String(g.badge.textContent) === '3',
        'stepping onto the track clears off-track and shows the row');

    p.updateGodStep(7, 'apollo', 0);
    check(g.classList.contains('off-track'),
        'dropping back to row 0 (after a special action) marks it off-track again');
    check(String(g.badge.textContent) === '',
        `and clears the number, got "${g.badge.textContent}"`);

    p.updateGodStep(7, 'apollo', 6);
    check(g.classList.contains('topped') && !g.classList.contains('off-track'),
        'reaching the top is topped, not off-track');
}

// ---- the CSS ---------------------------------------------------------------
{
    const rule = (CSS.match(/\.delphi-pp-god-row\s*\{([^}]*)\}/) || [])[1] || '';
    const px = (prop) => parseFloat((rule.match(new RegExp(prop + ':\\s*([\\d.]+)px')) || [])[1]);
    check(px('height') === 18 && px('min-width') === 18,
        `the badge is 18px, 1.5x the old 12px, got ${px('height')}px`);
    check(px('font-size') === 12, `with the font scaled with it, got ${px('font-size')}px`);
    // The content box is the height less two 1px borders; a line-height of the
    // full height puts the digit a pixel low.
    check(px('line-height') === 16, `line-height matches the content box, got ${px('line-height')}px`);
    // The pip meter sits to the right of the token. Pushing the badge further
    // right than the old 3px overhang would start covering its pips.
    check(px('right') === 3 || /right:\s*-3px/.test(rule),
        'the rightward overhang is unchanged, so the badge covers no more of the meter');

    const off = (CSS.match(
        /\.delphi-pp-god-gauge\.off-track\s+\.delphi-pp-god-row\s*\{([^}]*)\}/) || [])[1] || '';
    check(/background:\s*#000/.test(off), 'an off-track badge is a black disc');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
