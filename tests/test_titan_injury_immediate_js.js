/**
 * Titan injuries show in the local player's hand as soon as they are drawn.
 *
 * Player feedback: the injury card update after a Titan attack was "slow and
 * not immediate". The private notif used to add the card hidden, and it only
 * appeared once _maybeCloseTitanPopup had held the popup for 4s and flown the
 * card in from the deck (~5s in all, every round). The popup still holds as a
 * summary of the whole table, but the hand no longer waits for it.
 *
 * Extracts the real shipped methods so the assertions cover shipped behaviour.
 *
 * Run: node tests/test_titan_injury_immediate_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const LINES = fs.readFileSync(
    path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8').split('\n');

function extractMember(startRe) {
    const re = new RegExp(startRe);
    const start = LINES.findIndex(l => re.test(l));
    if (start < 0) throw new Error('not found: ' + startRe);
    let i = start;
    while (!/^        \},\s*$/.test(LINES[i])) {
        i++;
        if (i > start + 400) throw new Error('runaway: ' + startRe);
    }
    return LINES.slice(start, i + 1).join('\n');
}

let selfCellColors = [];
const fakeDocument = {
    querySelectorAll: (sel) => (sel === '.titan-popup-cell--pending' ? [] : []),
    querySelector: (sel) => {
        if (sel.indexOf('titan-popup-cell[data-player-id="7"]') === -1) return null;
        return {
            classList: { contains: (c) => c === 'titan-popup-cell--injured' },
            querySelectorAll: () => selfCellColors.map(c => ({ dataset: { color: c } })),
        };
    },
};

const game = new Function('document', `return {
${extractMember('^        notif_titanInjuryPrivate: function')}
${extractMember('^        _maybeCloseTitanPopup: async function')}
};`)(fakeDocument);

let added = [];
let hiddenAdds = 0;
let flights = 0;
let closed = 0;
game.player_id = 7;
game.components = { injuryCards: new Map(), addInjuryCard: (c) => added.push(c) };
game._addDrawnCardHidden = function (kind, map, color, addFn) { hiddenAdds++; addFn(); };
game._flyDeckCardToPanel = function () { flights++; return Promise.resolve(); };
game._flyTitanInjuriesFromDialog = function () { flights++; return Promise.resolve(); };
game._holdFor = () => Promise.resolve();
game._closeTitanPopup = function () { closed++; this._titanPopupClosed = true; };

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

(async () => {

// ---- the private draw adds the card visibly, right away -------------------
game.notif_titanInjuryPrivate({ color: 'red' });
check(added.length === 1 && added[0] === 'red', `red card added to hand, got ${JSON.stringify(added)}`);
check(hiddenAdds === 0, 'titan injury must not be held hidden until the popup closes');

// ---- closing the popup does not fly the cards in a second time ------------
selfCellColors = ['red'];
game._titanPopupClosed = false;
await game._maybeCloseTitanPopup();
check(closed === 1, 'popup still closes after the hold');
check(flights === 0, `no deck flight after the popup (card is already shown), got ${flights}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
})();
