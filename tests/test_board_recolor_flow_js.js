/**
 * The board wheel's recolour (flow style; the classic chips and their
 * preference are gone).
 *
 * Step tokens on the printed favour diamonds replace the classic target
 * chips: from the selected die they chain out one per step the player's
 * favour reaches, each with the price of the colour it leads to and a
 * chevron pointing the way; with Deep Hold a chain grows each way. Checks:
 *   - there is no style preference: the flow board is the only one;
 *   - flow mode handles paid recolours, and every free recolour (as the
 *     action-bar ring does) whichever style is chosen;
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

// No style preference any more: the flow board is the only board recolour.
check(!PREFS['104'], 'the board recolour style preference is gone');
check(!/_boardRecolorFlow|_lastRecolorArgs|prefId == 104/.test(SRC), 'and nothing reads it');

const arrows = extract('_setupRecolorArrows');
const flow = extract('_setupRecolorFlow');
check(/this\._setupRecolorFlow\(args, plan\);\s*\},?\s*$/.test(arrows) && !/recolor-arrow-|_addCcwHelpMarker/.test(arrows),
    'every board recolour, paid or free, uses the flow board; the classic chips are gone');
// Free (Apollo / Demigod) on the board works like the action-bar ring.
check(/var chains = this\._recolorChains\(plan\);/.test(flow), 'a free recolour shows tokens with arrows too');
check(/if \(plan\.free\) \{ wheel\.appendChild\(el\); steps\[bi\] = el; return; \}/.test(flow), 'but no price pills');
check(/if \(!t\.available \|\| \(t\.stay && !plan\.free\)\) return;/.test(flow), 'the die\'s own brazier is a target only when free (to keep)');
check(/recolor-flow-keep/.test(flow), 'with a tick on it');
check(/return t\.ccw \? \{ dir: -1, hops: n - t\.step \} : \{ dir: 1, hops: t\.step \};/.test(flow) && !/plan\.free \? \(n - t\.step\)/.test(flow),
    'free routes run clockwise, the way the wheel turns');
check(/clearRoute\(\);\s*selMirror = findSelMirror\(\);/.test(flow), 'each hover wipes the last route first');

// Chains: run the real chain/socket block against _recolorTargets plans.
global._ = (s) => s;
const g = new Function('return {' + extract('_recolorTargets') + '}')();
g.WHEEL_ORDER = ['red', 'black', 'pink', 'blue', 'yellow', 'green'];
const helper = new Function('return {' + extract('_recolorChains') + '}')();
helper.WHEEL_ORDER = g.WHEEL_ORDER;
const chainsFor = (args) => helper._recolorChains(g._recolorTargets(args));
const fmt = (r) => Object.keys(r.chain).sort().map(b => b + ':' + (r.chain[b].dir > 0 ? '+' : '-') + r.chain[b].cost).join(' ')
    + ' | ' + Object.keys(r.socket).sort().join(',');
// Boundary i sits between WHEEL_ORDER[i] and [i+1]; red is index 0.
let r = chainsFor({ dieColor: 'red', playerFavor: 3 });
check(fmt(r) === '0:+1 1:+2 2:+3 | 3,4', 'plain, 3 favor: three steps clockwise, sockets after, none behind the die: ' + fmt(r));
r = chainsFor({ dieColor: 'red', playerFavor: 2, reverseRecolor: true });
check(fmt(r) === '0:+1 1:+2 4:-2 5:-1 | 2,3', 'Deep Hold, 2 favor: two steps each way, blue\'s steps empty: ' + fmt(r));
r = chainsFor({ dieColor: 'red', playerFavor: 2, reverseRecolor: true, recolorDiscount: true });
check(fmt(r) === '0:+0 1:+1 2:+2 4:-1 5:-0 | 3', 'Deep Hold + Thrifty Wheel: the first step each way is free: ' + fmt(r));
r = chainsFor({ dieColor: 'yellow', demigodWild: true });
check(fmt(r) === '0:+0 1:+0 2:+0 4:+0 5:+0 | ', 'free: every step clockwise from yellow, nothing back, no sockets: ' + fmt(r));
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

// A token and its pill stand in for the brazier their arrow points to.
check(/\[steps\[bi\], labels\[bi\]\]\.forEach\(function\(el\) \{[\s\S]{0,300}el\.addEventListener\('mouseenter', function\(\) \{ show\(t\); \}\);[\s\S]{0,240}pick\(t\)/.test(flow),
    'hovering or clicking a token (or its pill) acts on the brazier it points to');
check(/x\.color === chain\[bi\]\.to/.test(flow), 'the brazier is the colour the step leads to');
check(/hits\[t\.color\]\.classList\.add\('recolor-flow-target-hot'\)/.test(flow)
    && /\.recolor-flow-target\.recolor-flow-target-hot/.test(CSS), 'and that brazier lights as if hovered');

// Layering and markers.
check(/\.recolor-flow-cord \{[\s\S]{0,120}z-index: 4;/.test(CSS), 'the cord sits under the dice');
check(/#delphi-oracle-wheel \.recolor-step \{[\s\S]{0,200}z-index: 25;/.test(CSS), 'tokens sit above the dice');
check(/#delphi-oracle-wheel \.recolor-flow-target \{[\s\S]{0,200}z-index: 26;/.test(CSS), 'targets sit above the dice');
check(/\.recolor-flow-on \.delphi-die-mirror\.die-selected \{\s*outline: 3px dashed/.test(CSS), 'the selected die gets a dashed start frame');
check(/if \(isCard\) \{[\s\S]{0,200}recolor-flow-start/.test(flow), 'a card marks its colour\'s brazier instead');
check(/if \(!t\.available \|\| \(t\.stay && !plan\.free\)\) return;\s*var c = centers\[t\.color\];/.test(flow),
    'no target on the die\'s own brazier, so its click-to-cancel still works');

// Commit and the dice that made room.
check(/committed = true;\s*var sent = self\.bgaPerformAction\(isCard \? 'actRecolorCard' : 'actRecolorDie'/.test(flow),
    'a click sends the recolour at once (no animation of its own)');
check(/if \(!committed\) unshift\(\);/.test(flow), 'after a click the dice that made room stay put');
check(/selMirror = findSelMirror\(\);/.test(flow) && /dieMirrors\.get\(self\.player_id \+ '_' \+ parseInt\(args\.dieIndex\)\)/.test(flow),
    'the selected die is found at hover time by its index, so a reload that marks it selected late still makes room');
check(!/var selMirror = isCard \? null : wheel\.querySelector/.test(flow), 'not captured once at setup');
check(/sent\.catch\(function\(\) \{ committed = false; unshift\(\); \}\)/.test(flow), 'a refused recolour puts them back');
const clear = extract('_clearRecolorArrows');
check(/this\._recolorFlowCleanup\(\)/.test(clear) && /\.recolor-flow'/.test(clear), 'clearing removes the overlay and restores unclicked dice');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
