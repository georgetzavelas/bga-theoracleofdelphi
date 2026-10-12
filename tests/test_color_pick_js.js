/**
 * Pick-any-colour choices in the flow style: the wild Oracle card's colour
 * and the Bonus Action's. Both go through _openColorPick: every brazier on
 * the board wheel is a target (no chips on the diamonds), and the action bar
 * gets a Choose color button opening the ring in pick mode, plus Cancel.
 *
 * Run: node tests/test_color_pick_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.css'), 'utf8');

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }
function extract(name) {
    const s = SRC.indexOf('        ' + name + ': ');
    if (s < 0) throw new Error('not found: ' + name);
    let i = SRC.indexOf('{', s), d = 0;
    for (; i < SRC.length; i++) {
        if (SRC[i] === '{') d++;
        else if (SRC[i] === '}') { d--; if (!d) break; }
    }
    return SRC.slice(s, i + 1);
}

// Drive _openColorPick with a stub status bar and record what it builds.
global._ = (s) => s;
const g = new Function('return {' + ['_openColorPick', '_recolorRingLabel'].map(extract).join(',\n') + '}')();
const log = [];
let pickBtn = null;
g._clearRecolorArrows = () => log.push('clear');
g._closeRecolorRing = () => log.push('close');
g._setupColorPickTargets = (o) => log.push('board:' + o.piece);
g._openColorPickRing = (btn, o) => log.push('ring:' + o.piece);
g.statusBar = {
    removeActionButtons: () => log.push('remove'),
    setTitle: (t) => log.push('title:' + t),
    addActionButton: (label, h) => {
        pickBtn = { label, h, classList: { add() {} }, setAttribute() {} };
        return pickBtn;
    },
};
let cancel = null;
g._addCancelButton = (h) => { cancel = h; };
let cancelled = false;
g._openColorPick({ piece: 'card', title: 'Wild Oracle Card: choose any colour', onPick() {}, onCancel() { cancelled = true; } });
check(log.includes('board:card'), 'the board gets brazier targets');
check(pickBtn && pickBtn.label === 'Choose color', 'the action bar gets a Choose color button');
pickBtn.h();
check(log.includes('ring:card'), 'which opens the ring in pick mode');
cancel();
check(cancelled && log.lastIndexOf('close') > log.indexOf('ring:card'), 'Cancel closes the ring and runs the picker\'s cancel');

// The two pickers.
const bonus = extract('_openBonusActionPicker');
check(/this\._openColorPick\(\{\s*piece: 'die'/.test(bonus) && /actUseBonusAction/.test(bonus) && /actCancelBonusAction/.test(bonus),
    'Bonus Action: a die, sends actUseBonusAction, Cancel refunds via actCancelBonusAction');
const wild = extract('_openWildOracleCardPicker');
check(/this\._openColorPick\(\{\s*piece: 'card'/.test(wild) && /actPlayWildOracleCard', \{ card_id: cardId, chosen_color: c \}/.test(wild),
    'Wild Oracle card: a card, sends actPlayWildOracleCard with the card id');
check(/_highlightPickingWildCards\(\)/.test(wild), 'and still highlights the card being picked for');

// Board: braziers, no chips.
const targets = extract('_setupColorPickTargets');
check(/this\.WHEEL_ORDER\.forEach/.test(targets) && /recolor-flow recolor-flow-target/.test(targets), 'every brazier is a target');
check(!/recolor-arrow-free|BETWEEN_POSITIONS/.test(targets), 'nothing on the diamonds');
check(!/_setupWildCardChips|recolor-arrow-free/.test(SRC), 'the old chip pickers are gone');
check(!/^\.recolor-arrow/m.test(CSS), 'and so is their CSS');

// Ring in pick mode: braziers as targets, the piece previews the colour.
const ring = extract('_openColorPickRing');
check(/rr-pick/.test(ring) && /rr-piece-wild/.test(ring), 'the ring opens on a wild piece');
check(/showPreview\(color\)/.test(ring) && /classList\.add\('rr-hot'\)/.test(ring), 'hovering a brazier rings it and previews its colour');
check(/lastPointer === 'touch' && armed !== color/.test(ring), 'touch arms first, as in the recolour ring');
check(/this\._mountRecolorPopover\(ring, btn/.test(ring) && /this\._recolorRingArtSvg\(\[\]\)/.test(ring),
    'it shares the recolour ring\'s art and popover plumbing');
check(/\.rr-card \.rr-piece-wild \{ background-image: url\('img\/oracle\/card-back\.jpg'\)/.test(CSS)
    && /\.rr-die \.rr-piece-wild\s+\{ background-image: url\('img\/oracle-dice\/die-face-wild\.png'\)/.test(CSS),
    'a wild card shows the card back, a wild die its wild face');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
