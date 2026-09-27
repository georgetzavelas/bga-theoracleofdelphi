/**
 * Player-panel summary tooltips: injuries, oracle hand, favor and shield.
 *
 *   - injuries and oracle hand: a picture of each colour's card held, with
 *     its count, and the total (injuries against the limit);
 *   - favor: the token, the count, where more come from, what they buy;
 *   - shield: the player's shield, its strength, and what that means in a
 *     fight, with the numbers from CombatRules (strength 9 - shield, win on
 *     roll >= strength on a 0-9 die).
 *
 * The panel binds them on container ids that survive repaints, and rebinds
 * whenever the group changes, removing the old one first.
 *
 * Run: node tests/test_panel_tooltips_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GAME = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.js'), 'utf8');
const COMP = fs.readFileSync(path.join(ROOT, 'modules/js/Components.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.css'), 'utf8');
const RULES = fs.readFileSync(path.join(ROOT, 'modules/php/CombatRules.php'), 'utf8');

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

function extract(src, indent, name) {
    const s = src.indexOf(indent + name + ': function');
    if (s < 0) throw new Error('method not found: ' + name);
    let i = src.indexOf('{', s), d = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') d++;
        else if (src[i] === '}') { d--; if (!d) break; }
    }
    return src.slice(s, i + 1);
}

const gameNames = ['_panelCardRowHtml', '_buildPanelInjuryTooltipHtml', '_buildPanelOracleTooltipHtml',
    '_buildPanelFavorTooltipHtml', '_buildPanelShieldTooltipHtml'];
const dojo = { string: { substitute: (t, o) => t.replace(/\$\{(\w+)\}/g, (_, k) => o[k]) } };
const game = new Function('_', 'themeImg', 'dojo', 'return {' + gameNames.map(n => extract(GAME, '        ', n)).join(',\n') + '}')(
    (s) => s, (p) => p, dojo);

// ---- injuries --------------------------------------------------------------------
let h = game._buildPanelInjuryTooltipHtml([{ color: 'red', n: 2 }, { color: 'blue', n: 1 }], 6);
check(/Injuries: 3\/6/.test(h), 'the injury tooltip has the total against the limit');
check(/img\/injury\/red\.jpg[^]*×2/.test(h) && /img\/injury\/blue\.jpg[^]*×1/.test(h),
    'a picture of each injury card held, with its count');
check(!/img\/injury\/green/.test(h), 'and none for a colour not held');
check(/Injuries: 0\/8/.test(game._buildPanelInjuryTooltipHtml([], 8)) && /No injuries/.test(game._buildPanelInjuryTooltipHtml([], 8)),
    'with no injuries it says so, out of eight with Pain Tolerance');

// ---- oracle hand -----------------------------------------------------------------
h = game._buildPanelOracleTooltipHtml([{ color: 'green' }, { color: 'green' }, { color: 'pink' }]);
check(/Oracle cards: 3/.test(h) && /img\/oracle\/green\.jpg[^]*×2/.test(h) && /img\/oracle\/pink\.jpg[^]*×1/.test(h),
    'the oracle tooltip has each card held, its count, and the total');
check(/No Oracle cards/.test(game._buildPanelOracleTooltipHtml([])), 'an empty hand says so');
const order = ['red', 'yellow', 'green', 'blue', 'pink', 'black'];
h = game._buildPanelOracleTooltipHtml([{ color: 'black' }, { color: 'red' }]);
check(h.indexOf('red.jpg') < h.indexOf('black.jpg'), 'cards are listed in the game\'s colour order');

// ---- favor -----------------------------------------------------------------------
h = game._buildPanelFavorTooltipHtml('4');
check(/img\/pieces\/favor-token\.jpg/.test(h) && /Favor tokens: 4/.test(h), 'the favor tooltip shows the token and the count');
check(/Get more/.test(h) && /\+2/.test(h) && /offering: \+3/.test(h) && /\+4/.test(h), 'with where more come from');
check(/Spend them to/.test(h) && /die/.test(h) && /ship/.test(h) && /monster/.test(h), 'and what they buy');
check(/Favor tokens: 0/.test(game._buildPanelFavorTooltipHtml(undefined)), 'a missing count reads as none');

// ---- shield ----------------------------------------------------------------------
check(/BASE_STRENGTH = 9/.test(RULES) && /\$roll >= \$strength/.test(RULES), 'the combat rules are still 9 - shield, roll >= strength');
h = game._buildPanelShieldTooltipHtml(3, 'blue');
check(/img\/pieces\/blue-shield\.png/.test(h) && /Shield strength: 3/.test(h), 'the shield tooltip shows the player\'s shield and its strength');
check(/strength 6: roll 6 or more/.test(h) && /40% chance/.test(h), 'shield 3: monsters at 6, a 40% chance');
h = game._buildPanelShieldTooltipHtml(0, 'red');
check(/strength 9: roll 9 or more/.test(h) && /10% chance/.test(h), 'no shield: only a 9 wins, 10%');
check(/roll of 0/.test(h) && /pay 1 Favor/.test(h), 'and it explains the injury on a 0 and paying Favor to keep going');

// ---- binding ---------------------------------------------------------------------
{
    const names = ['_syncPanelTooltip', '_syncStatTooltip', '_updateStatValue'];
    const panel = new Function('return {' + names.map(n => extract(COMP, '            ', n)).join(',\n') + '}')();
    const bound = {}, removed = [];
    global.window = { gameui: Object.assign({}, game, {
        addTooltipHtml(id, html) { bound[id] = html; },
        removeTooltip(id) { removed.push(id); delete bound[id]; },
    }) };
    const els = {
        'pp-shield-7': { getAttribute: (a) => a === 'data-color' ? 'green' : null },
        'pp-favor-7': {},
    };
    global.document = {
        getElementById: (id) => els[id] || null,
        querySelector: () => ({ textContent: '' }),
    };
    panel._updateStatValue('favor', 7, 5);
    check(/Favor tokens: 5/.test(bound['pp-favor-7'] || ''), 'a favor change rebinds its tooltip');
    panel._updateStatValue('shield', 7, 2);
    check(/green-shield\.png/.test(bound['pp-shield-7'] || '') && /Shield strength: 2/.test(bound['pp-shield-7']),
        'a shield change rebinds its tooltip, in the chip\'s colour');
    check(removed.indexOf('pp-favor-7') !== -1, 'the old tooltip is removed before the new one is bound');
    panel._syncPanelTooltip('pp-missing-7', '_buildPanelFavorTooltipHtml', [1]);
    check(!('pp-missing-7' in bound), 'nothing is bound to an element that is not there');
    delete global.window;
}
check(/_syncPanelTooltip\('pp-injury-bar-' \+ playerId, '_buildPanelInjuryTooltipHtml'/.test(COMP),
    'updateInjuries binds the injury tooltip');
check((COMP.match(/_syncPanelTooltip\('pp-oracle-hand-' \+ playerId, '_buildPanelOracleTooltipHtml'/g) || []).length === 2,
    'renderActionsRow and updateOracleHand bind the oracle tooltip');
check(/\.pp-tip-cards-injury \.pp-tip-card-img\s*\{[^}]*width:\s*60px;\s*height:\s*40px/.test(CSS)
    && /\.pp-tip-cards-oracle \.pp-tip-card-img\s*\{[^}]*width:\s*36px;\s*height:\s*54px/.test(CSS),
    'injury cards show landscape, oracle cards portrait');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
