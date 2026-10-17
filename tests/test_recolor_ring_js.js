/**
 * The action-bar recolour ring.
 *
 * After a die or oracle card is selected, "Recolor Die" / "Recolor Card" in
 * the action bar opens the board wheel in miniature under it. Checks:
 *   - the board chips and the ring read one price list (_recolorTargets),
 *     with the clockwise, Deep Hold, Thrifty Wheel and free rules intact;
 *   - the button appears only when a colour is on offer, named for the source;
 *   - the cutout is the board's flow mode in miniature: step tokens with
 *     arrows and price pills, braziers as targets, cord, ghost, hop;
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
const g = new Function('return {' + ['_recolorTargets', '_addRecolorRingButton', '_closeRecolorRing', '_recolorRingLabel', '_recolorChains']
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
check(bar({ dieColor: 'red', apolloNeedsRecolor: true }).join() === 'Choose color', 'an Apollo wild die gets Choose color');
check(bar({ dieColor: 'red', demigodWild: true, isOracleCard: true }).join() === 'Choose color', 'a Demigod wild card gets Choose color');
check(bar({ dieColor: 'red', playerFavor: 4, usingBonusAction: true }).length === 0, 'no button for a bonus action');

// The board chips and the ring read the same price list.
const arrows = extract('_setupRecolorArrows');
check(/this\._recolorTargets\(args\)/.test(arrows), 'board chips price through _recolorTargets');
check(!/baseCost|Math\.min\(step/.test(arrows), 'board chips keep no cost arithmetic of their own');

// Board in miniature: the cutout carries the board's step tokens.
const open = extract('_openRecolorRing');
const artSrc = SRC.slice(SRC.indexOf('        RECOLOR_ART: {'), SRC.indexOf('        _recolorArtUrl:'));
const ART = new Function('return {' + artSrc + '}')().RECOLOR_ART;
check(g.WHEEL_ORDER.every(c => Array.isArray(ART.braziers[c])), 'a brazier position for every colour');
check(ART.diamonds.length === 6, 'a diamond between every pair of braziers');
check(/this\._recolorRingArtSvg\(/.test(open) && /this\._recolorArtUrl\(\)/.test(extract('_recolorRingArtSvg')),
    'the art comes from the player\'s own board (shared art helper)');
check(/this\._wheelArtUrl\(this\._gameColorForPlayer\(/.test(extract('_recolorArtUrl')),
    'and it is the small wheel cutout for the player\'s colour, not the full board');
check(/'<image href="' \+ artUrl \+ '" x="' \+ \(-G\.art\) \+ '" y="' \+ \(-G\.art\) \+ '"'/.test(extract('_recolorRingArtSvg')),
    'the cutout fills exactly the ring\'s window');
check(/var chains = this\._recolorChains\(plan\);/.test(open),
    'tokens and sockets come from the same helper as the board, free recolours included');
check(/\(plan\.free \? '' : '<g class="rr-pill"/.test(open), 'a free recolour shows no price pills');
check(/this\._recolorChains\(plan\)/.test(extract('_setupRecolorFlow')), 'and the board uses it too');
check(/class="rr-arrow-over"/.test(open) && /class="rr-pill"/.test(open) && /class="rr-socket"/.test(open),
    'each token has the board\'s centred arrow and price pill; sockets past the reach');
check(!/rr-fill|rr-fly|rr-flow|rr-route|rr-stop|rr-diamond/.test(open), 'no colour track, flow dashes, fly-out or outer arrow');
// The braziers are the targets: the die's own only in free mode.
check(/if \(t\.stay && !t\.available\) return;/.test(open), 'every other brazier is a target (out-of-reach ones explain why)');
check(/class="rr-hit" cx="' \+ b\.x/.test(open), 'the hit area is the brazier itself');
check(/class="rr-cord"/.test(open) && /cord\.setAttribute\('points'/.test(open), 'hover draws the cord through the tokens');
check(/ghost\.classList\.add\('rr-ghost-on'\)/.test(open) && /if \(!isCard && !t\.stay\)/.test(open),
    'hover puts a ghost die on the target (not for a card, which has no die)');
check(/class="rr-start"/.test(open) && /rr-start-frame/.test(open) && /rr-start-ring/.test(open),
    'the start is marked by shape: a framed die, or a card marker in a dashed ring');
check(/tokens\[bi\]\.addEventListener\('mouseenter', function\(\) \{ hover\(t\); \}\);/.test(open)
    && /x\.color === c\.to/.test(open), 'a token stands in for the brazier its arrow points to');
// The hop.
check(/traveller\.animate\(frames/.test(open) && /tk\.classList\.add\('rr-spent'\)/.test(open),
    'the commit hops the piece and spends each token');
check(/if \(!tk \|\| plan\.free \|\| tk\.classList\.contains\('rr-token-free'\)\) return;/.test(open),
    'a free step (Thrifty Wheel, or any step of a free recolour) is spent without a -1');
check(/if \(reduce \|\| !r\.hops \|\| typeof traveller\.animate !== 'function'\) \{ send\(\); return; \}/.test(open),
    'reduced motion, a keep, or no animation support sends at once');
check(/return t\.ccw \? \{ dir: -1, hops: n - t\.step \} : \{ dir: 1, hops: t\.step \};/.test(open) && !/plan\.free \? \(n - t\.step\)/.test(open),
    'hops run clockwise, free ones included; only Deep Hold runs back');
// The helpers only the old track used are gone; the button label helper is not.
check(!/_ringColorAngle|_ringSectorPath|_ringArcPath|_ringPoint/.test(SRC), 'the old track helpers are removed');
check(/        _recolorRingLabel: function/.test(SRC), 'the button label helper is still there');

// Mobile: a touch tap arms (preview + Confirm) instead of paying; a second
// tap on the same colour, or Confirm, pays. Mouse clicks still pay at once.
check(/if \(lastPointer === 'touch' && armed !== t\) \{[\s\S]{0,200}armed = t;/.test(open), 'a first touch tap arms the colour');
check(/lastPointer = e\.pointerType \|\| 'mouse';/.test(open), 'the pointer type is read from the tap itself');
check(/\.rr-confirm'\)\.addEventListener\('click'[\s\S]{0,120}if \(armed\) commit\(armed\);/.test(open), 'Confirm pays for the armed colour');
check(/if \(armed\) return;/.test(open), 'an armed preview survives the pointer leaving');
check(/var sc = Math\.min\(1, \(vw - 32\) \/ w\);/.test(extract('_mountRecolorPopover'))
    && /this\._mountRecolorPopover\(ring, btn, \[clearEchoes\]\)/.test(open),
    'the ring scales to fit with a 16px margin each side (shared popover helper)');
const CSS3 = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.css'), 'utf8');
check(/transform: scale\(var\(--rr-scale, 1\)\);/.test(CSS3) && /to   \{ opacity: 1; transform: scale\(var\(--rr-scale, 1\)\); \}/.test(CSS3),
    'the open animation keeps the fit scale');

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
