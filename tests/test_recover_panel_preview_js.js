/**
 * Each Recover pick shows on the player's panel as it is made.
 *
 * Reported: after a Titan attack (which is what usually puts a player into
 * Recover) the panel did not update after each injury discarded. The hand
 * lost each card on click, but the panel waited for all three picks and the
 * server's injuriesRecovered.
 *
 * The preview must not change the stored injuries: injuriesRecovered
 * subtracts the same colours from them and would subtract twice.
 *
 * Run: node tests/test_recover_panel_preview_js.js
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
const g = new Function('return {' + ['_previewRecoverOnPanel', 'notif_injuriesRecovered'].map(extract).join(',\n') + '}')();
const shown = [];
g.player_id = 7;
g.gamedatas = { panelState: { 7: { injuries: [{ color: 'red', n: 3 }, { color: 'blue', n: 2 }, { color: 'black', n: 1 }], equipment: [] } } };
g.components = { playerPanel: { updateInjuries: (pid, inj) => shown.push(inj.map(x => x.color + x.n).join(' ')) } };
g._playerHasPainTolerance = () => false;
g._recoverInjuryCards = [
    { card_id: 1, color: 'red' }, { card_id: 2, color: 'red' }, { card_id: 3, color: 'red' },
    { card_id: 4, color: 'blue' }, { card_id: 5, color: 'blue' }, { card_id: 6, color: 'black' },
];
g._recoverPicks = [];

g._recoverPicks.push(1); g._previewRecoverOnPanel();
check(shown.pop() === 'red2 blue2 black1', 'the first pick shows at once');
g._recoverPicks.push(6); g._previewRecoverOnPanel();
check(shown.pop() === 'red2 blue2', 'the second too, dropping a colour that runs out');
g._recoverPicks.push(2); g._previewRecoverOnPanel();
check(shown.pop() === 'red1 blue2', 'and the third');
check(JSON.stringify(g.gamedatas.panelState[7].injuries) === JSON.stringify([{ color: 'red', n: 3 }, { color: 'blue', n: 2 }, { color: 'black', n: 1 }]),
    'the stored injuries are untouched by the preview');

g.notif_injuriesRecovered({ player_id: 7, colors: ['red', 'black', 'red'] });
check(shown.pop() === 'red1 blue2', 'the server\'s confirmation lands on the count already shown, not one lower');

check(/this\._recoverPicks\.push\(nextId\);\s*this\._updateRecoverTitle\(\);\s*this\._previewRecoverOnPanel\(\);/.test(SRC),
    'every Recover pick previews on the panel');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
