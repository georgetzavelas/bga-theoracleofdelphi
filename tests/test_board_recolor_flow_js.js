/**
 * Flow mode for the board wheel's recolour (player preference 104).
 *
 * Step tokens on the printed favour diamonds replace the classic target
 * chips: from the selected die they chain out one per step the player's
 * favour reaches, each with the price of the colour it leads to and a
 * chevron pointing the way; with Deep Hold a chain grows each way. Checks:
 *   - the preference exists, defaults to classic, and applies live;
 *   - flow mode is used for paid recolours only;
 *   - the chains and sockets for plain, Deep Hold and Thrifty Wheel cases;
 *   - each token's arrow and its price on the classic pill outside it;
 *   - the cord sits under the dice, tokens and targets above;
 *   - a click sends the recolour at once and dice made room for stay put;
 *     a refusal or a clear without a click puts them back.
 *
 * Run: node tests/test_board_recolor_flow_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.css'), 'utf8');
const PREFS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'gamepreferences.json'), 'utf8'));

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }
function extract(name) {
    const s = SRC.indexOf('        ' + name + ': ');
    if (s < 0) throw new Error('method not found: ' + name);
    let i = SRC.indexOf('{', s), d = 0;
    for (; i < SRC.length; i++) {
        if (SRC[i] === '{') d++;
        else if (SRC[i] === '}') { d--; if (!d) break; }
    }
    return SRC.slice(s, i + 1);
}

// Preference.
const p = PREFS['104'];
check(p && p.default === 1 && p.values['1'] && p.values['2'], 'preference 104 exists with classic as the default');
check(p && p.needReload === false, 'and applies without a reload');
check(/this\._boardRecolorFlow = \(this\.bga && this\.bga\.userPreferences\s*&& this\.bga\.userPreferences\.get\(104\)\) == 2;/.test(SRC),
    'setup reads preference 104');
check(/prefId == 104\) \{\s*this\._boardRecolorFlow = \(prefValue == 2\);[\s\S]{0,300}this\._setupRecolorArrows\(this\._lastRecolorArgs\)/.test(SRC),
    'a live change redraws a recolour already on offer');

// Routing: paid recolours only.
const arrows = extract('_setupRecolorArrows');
check(/if \(this\._boardRecolorFlow && !plan\.free\) \{\s*this\._setupRecolorFlow\(args, plan\);\s*return;/.test(arrows),
    'flow mode handles paid recolours; free ones keep the classic chips');

// Chains: run the real chain/socket block against _recolorTargets plans.
global._ = (s) => s;
const g = new Function('return {' + extract('_recolorTargets') + '}')();
g.WHEEL_ORDER = ['red', 'black', 'pink', 'blue', 'yellow', 'green'];
const flow = extract('_setupRecolorFlow');
const blockSrc = flow.slice(flow.indexOf('var cwReach = 0'), flow.indexOf('            // The way a step points'));
const chainsFor = (args) => {
    const plan = g._recolorTargets(args);
    return new Function('plan', 'n', 'cur', blockSrc + '; return { chain: chain, socket: socket };')(plan, 6, plan.currentIdx);
};
const fmt = (r) => Object.keys(r.chain).sort().map(b => b + ':' + (r.chain[b].dir > 0 ? '+' : '-') + r.chain[b].cost).join(' ')
    + ' | ' + Object.keys(r.socket).sort().join(',');
// Boundary i sits between WHEEL_ORDER[i] and [i+1]; red is index 0.
let r = chainsFor({ dieColor: 'red', playerFavor: 3 });
check(fmt(r) === '0:+1 1:+2 2:+3 | 3,4', 'plain, 3 favor: three steps clockwise, sockets after, none behind the die: ' + fmt(r));
r = chainsFor({ dieColor: 'red', playerFavor: 2, reverseRecolor: true });
check(fmt(r) === '0:+1 1:+2 4:-2 5:-1 | 2,3', 'Deep Hold, 2 favor: two steps each way, blue\'s steps empty: ' + fmt(r));
r = chainsFor({ dieColor: 'red', playerFavor: 2, reverseRecolor: true, recolorDiscount: true });
check(fmt(r) === '0:+0 1:+1 2:+2 4:-1 5:-0 | 3', 'Deep Hold + Thrifty Wheel: the first step each way is free: ' + fmt(r));
r = chainsFor({ dieColor: 'pink', playerFavor: 0 });
check(fmt(r) === ' | 0,2,3,4,5', 'no favor: five sockets clockwise from pink, nothing chained: ' + fmt(r));

// Token face: an arrow across the middle, the price outside on the classic pill.
check(/class="recolor-step-arrow" viewBox="-10 -10 20 20" style="transform: rotate\('\s*\+ \(a - 90\)/.test(flow),
    'each token carries an arrow across its middle, turned the way the step goes');
check(/label\.className = 'recolor-cost-label recolor-flow recolor-step-cost';/.test(flow)
    && /\(dx \/ len\) \* labelOffset/.test(flow), 'the price sits outside the token on the classic white pill');
check(/label\.id = 'delphi-recolor-cost-' \+ c\.to;/.test(flow), 'the pill is keyed to the colour it prices, for the action-bar ring\'s echo');
check(!/recolor-step-num|recolor-step-chev/.test(flow + CSS), 'no number inside the token or chevron beside it any more');

// The "Pay N Favor Tokens..." tooltip waits, on both styles.
check(/RECOLOR_TOOLTIP_DELAY: \d{3,}/.test(SRC), 'a recolour tooltip delay is defined');
check(/addTooltipHtml\(hit\.id, self\._recolorTooltipHtml\([^)]*\), self\.RECOLOR_TOOLTIP_DELAY\)/.test(flow), 'flow targets wait before the tooltip');
check(/addTooltipHtml\(arrow\.id, tipHtml, self\.RECOLOR_TOOLTIP_DELAY\)/.test(arrows)
    && /addTooltipHtml\(label\.id, tipHtml, self\.RECOLOR_TOOLTIP_DELAY\)/.test(arrows), 'classic chips and their prices wait too');

// Layering and markers.
check(/\.recolor-flow-cord \{[\s\S]{0,120}z-index: 4;/.test(CSS), 'the cord sits under the dice');
check(/#delphi-oracle-wheel \.recolor-step \{[\s\S]{0,200}z-index: 25;/.test(CSS), 'tokens sit above the dice');
check(/#delphi-oracle-wheel \.recolor-flow-target \{[\s\S]{0,200}z-index: 26;/.test(CSS), 'targets sit above the dice');
check(/\.recolor-flow-on \.delphi-die-mirror\.die-selected \{\s*outline: 3px dashed/.test(CSS), 'the selected die gets a dashed start frame');
check(/if \(isCard\) \{[\s\S]{0,200}recolor-flow-start/.test(flow), 'a card marks its colour\'s brazier instead');
check(/if \(!t\.available \|\| t\.stay\) return;\s*var c = centers\[t\.color\];/.test(flow),
    'no target on the die\'s own brazier, so its click-to-cancel still works');

// Commit and the dice that made room.
check(/committed = true;\s*var sent = self\.bgaPerformAction\(isCard \? 'actRecolorCard' : 'actRecolorDie'/.test(flow),
    'a click sends the recolour at once (no animation of its own)');
check(/if \(!committed\) unshift\(\);/.test(flow), 'after a click the dice that made room stay put');
check(/sent\.catch\(function\(\) \{ committed = false; unshift\(\); \}\)/.test(flow), 'a refused recolour puts them back');
const clear = extract('_clearRecolorArrows');
check(/this\._recolorFlowCleanup\(\)/.test(clear) && /\.recolor-flow'/.test(clear), 'clearing removes the overlay and restores unclicked dice');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
