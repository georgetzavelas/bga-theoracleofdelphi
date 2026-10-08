/**
 * The action-bar recolour ring.
 *
 * After a die or oracle card is selected, "Recolor Die" / "Recolor Card" in
 * the action bar opens the board wheel in miniature under it. Checks:
 *   - the board chips and the ring read one price list (_recolorTargets),
 *     with the clockwise, Deep Hold, Thrifty Wheel and free rules intact;
 *   - the button appears only when a colour is on offer, named for the source;
 *   - the colours sit where they do on the board wheel, pointer on the current;
 *   - the centre shows a card for a card and a die for a die;
 *   - the art window maps every brazier and diamond, lights the diamonds a
 *     route passes (Thrifty Wheel's first one free), and the hop spends them;
 *   - the ring is wired into SelectAction and torn down with the buttons.
 *
 * Run: node tests/test_recolor_ring_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8');

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

global._ = (s) => s;
const g = new Function('return {' + ['_recolorTargets', '_addRecolorRingButton', '_closeRecolorRing', '_ringColorAngle']
    .map(extract).join(',\n') + '}')();
g.WHEEL_ORDER = ['red', 'black', 'pink', 'blue', 'yellow', 'green'];

const costs = (args) => {
    const p = g._recolorTargets(args);
    return p && p.targets.map(t => t.color + ':' + (t.available ? t.cost : 'x')).join(' ');
};

// Plain: one favour per clockwise step, unaffordable steps marked, no paid "keep".
check(costs({ dieColor: 'red', playerFavor: 3 })
    === 'black:1 pink:2 blue:3 yellow:x green:x red:x',
    'clockwise costs from red with 3 favour, got ' + costs({ dieColor: 'red', playerFavor: 3 }));
// Deep Hold: the shorter way round, clockwise on the tie.
const deep = g._recolorTargets({ dieColor: 'blue', playerFavor: 9, reverseRecolor: true });
check(deep.targets.map(t => t.cost).join(',') === '1,2,3,2,1,0', 'Deep Hold pays the shorter way');
check(deep.targets.map(t => t.ccw).join(',') === 'false,false,false,true,true,false',
    'Deep Hold goes counter-clockwise only when it is strictly shorter');
// Thrifty Wheel: one off, never below zero.
check(costs({ dieColor: 'red', playerFavor: 0, recolorDiscount: true })
    === 'black:0 pink:x blue:x yellow:x green:x red:x', 'Thrifty Wheel makes one step free');
// Free (Apollo / Demigod): every colour, including keeping the current one.
check(costs({ dieColor: 'pink', playerFavor: 0, apolloNeedsRecolor: true })
    === 'blue:0 yellow:0 green:0 red:0 black:0 pink:0', 'Apollo offers every colour free');
check(g._recolorTargets({ dieColor: 'pink', demigodWild: true }).targets[5].stay, 'the sixth target is keep');
// Nothing on offer.
check(g._recolorTargets({ dieColor: 'red', playerFavor: 5, usingBonusAction: true }) === null, 'no recolour of a bonus action');
check(g._recolorTargets({ dieColor: 'red', playerFavor: 5, alreadyRecolored: true }) === null, 'no second paid recolour');
check(g._recolorTargets({ dieColor: 'red', apolloNeedsRecolor: true, alreadyRecolored: true }) !== null,
    'a free recolour is still offered after a paid one');

// The button: named for the source, absent when nothing is affordable.
function bar(args) {
    const made = [];
    g.statusBar = { addActionButton: (label) => {
        const b = { label, classList: { add() {} }, setAttribute() {} };
        made.push(b); return b;
    } };
    g._addRecolorRingButton(args);
    return made.map(b => b.label);
}
check(bar({ dieColor: 'red', playerFavor: 1 }).join() === 'Recolor Die', 'a die gets Recolor Die');
check(bar({ dieColor: 'red', playerFavor: 1, isOracleCard: true }).join() === 'Recolor Card', 'a card gets Recolor Card');
check(bar({ dieColor: 'red', playerFavor: 0 }).length === 0, 'no button with nothing affordable');
check(bar({ dieColor: 'red', playerFavor: 4, usingBonusAction: true }).length === 0, 'no button for a bonus action');

// The board chips and the ring read the same price list.
const arrows = extract('_setupRecolorArrows');
check(/this\._recolorTargets\(args\)/.test(arrows), 'board chips price through _recolorTargets');
check(!/baseCost|Math\.min\(step/.test(arrows), 'board chips keep no cost arithmetic of their own');

// Board layout: red at 9 o'clock, then clockwise every 60 degrees.
const angles = g.WHEEL_ORDER.map(c => c + ':' + g._ringColorAngle(c)).join(' ');
check(angles === 'red:270 black:330 pink:30 blue:90 yellow:150 green:210', 'ring angles match the board, got ' + angles);
const open = extract('_openRecolorRing');
check(/angle: self\._ringColorAngle\(t\.color\)/.test(open), 'each band sits at its board angle');
check(/var start = this\._ringColorAngle\(current\)/.test(open) && /rotate\(' \+ start \+ 'deg\)/.test(open),
    'the pointer starts on the current colour');
check(/rotate\(' \+ \(start \+ r\.dir \* r\.hops \* step\) \+ 'deg\)/.test(open), 'and travels from there');

// Board art: every colour has a brazier, every boundary a diamond.
const artSrc = SRC.slice(SRC.indexOf('        RECOLOR_ART: {'), SRC.indexOf('        _recolorArtUrl:'));
const ART = new Function('return {' + artSrc + '}')().RECOLOR_ART;
check(g.WHEEL_ORDER.every(c => Array.isArray(ART.braziers[c])), 'a brazier position for every colour');
check(ART.diamonds.length === 6, 'a diamond between every pair of braziers');
check(/this\._recolorArtUrl\(\)/.test(open), 'the art comes from the player\'s own board');
check(/if \(plan\.discount && j === 0\) \{ d\.classList\.add\('rr-lit-free'\)/.test(open),
    'Thrifty Wheel lights the first diamond as free');
check(/if \(plan\.free\) return;/.test(open), 'a free recolour lights no diamonds');
check(/traveller\.animate\(frames/.test(open) && /d\.classList\.add\('rr-spent'\)/.test(open),
    'the commit hops the piece and spends each diamond');
check(/if \(reduce \|\| !r\.hops \|\| typeof traveller\.animate !== 'function'\) \{ send\(\); return; \}/.test(open),
    'reduced motion, a keep, or no animation support sends at once');
check(/var back = plan\.free \? \(n - t\.step\) < t\.step : t\.ccw;/.test(open),
    'paid hops follow the price direction, free hops the shorter way');

// No hover flicker: a fixed hit band from the art's edge takes the pointer,
// and the fill that grows on hover takes none.
check(/class="rr-hit" d="'\s*\+ self\._ringSectorPath\(G\.art, G\.outer/.test(open), 'the hit band runs from the art edge to the bezel edge');
check(/\.rr-sector \.rr-fill \{\s*pointer-events: none;/.test(fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.css'), 'utf8')),
    'the growing fill never takes the pointer');
check(/class="rr-brazier" clip-path="url\(#rr-art-clip\)"/.test(open), 'the brazier ring is clipped to the window');

// Centre piece: card art for a card, die face for a die.
check(/isCard \? 'rr-card' : 'rr-die'/.test(open), 'the ring is marked card or die');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.css'), 'utf8');
check(/\.rr-card \.rr-piece-red\s*\{ background-image: url\('img\/oracle\/red\.jpg'\)/.test(CSS), 'a card shows the oracle card');
check(/\.rr-die \.rr-piece-red\s*\{ background-image: url\('img\/oracle-dice\/die-face-red\.png'\)/.test(CSS), 'a die shows the die face');
check(/actRecolorCard' : 'actRecolorDie'/.test(open), 'the ring sends the same actions as the board');

// Lifecycle: both SelectAction branches add the button; refresh and leave close it.
const sel = SRC.slice(SRC.indexOf("                    case 'SelectAction':"));
const selBody = sel.slice(0, sel.indexOf("                    case 'PeekIslands':"));
check((selBody.match(/this\._addRecolorRingButton\(args\)/g) || []).length === 2,
    'SelectAction adds the button in the Apollo branch and the normal one');
const upd = extract('onUpdateActionButtons');
check(/this\._clearRecolorArrows\(\);\s*\/\/[^\n]*\n\s*this\._closeRecolorRing\(\);/.test(upd), 'a button refresh closes the ring');
check(/onLeavingState: function\( stateName \)\s*\{[\s\S]{0,200}this\._closeRecolorRing\(\)/.test(SRC), 'leaving a state closes the ring');

// Close runs every cleanup once, even if one throws.
let ran = 0;
g._recolorRing = { cleanup: [() => ran++, () => { throw new Error('gone'); }, () => ran++] };
g._closeRecolorRing(); g._closeRecolorRing();
check(ran === 2 && g._recolorRing === null, 'close runs each cleanup once and survives a throw');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
