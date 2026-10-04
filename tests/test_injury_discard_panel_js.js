/**
 * Discarding injuries updates the player panel at once.
 *
 * Reported: discarded injury cards did not update the panel in real time. The
 * handlers awaited the discarding player's card flight to the deck before
 * touching the panel, so the panel lagged the flight and, if the flight threw,
 * never updated until a reload. Now the panel updates first and the flight is
 * decoration: an error in it is caught, and the hand still loses the cards.
 *
 * Drives the real handlers with a manual promise for the flight.
 *
 * Run: node tests/test_injury_discard_panel_js.js
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
const names = ['notif_injuriesDiscarded', 'notif_injuriesDiscardedByChoice', 'notif_heroAutoDiscarded',
    '_discardInjuriesOfColor', '_removePanelInjuriesOfColor'];

function makeGame(flight) {
    const g = new Function('return {' + names.map(extract).join(',\n') + '}')();
    g.player_id = 7;
    g.gamedatas = { panelState: {
        7: { injuries: [{ color: 'red', n: 2 }, { color: 'blue', n: 1 }], equipment: [] },
        8: { injuries: [{ color: 'red', n: 1 }], equipment: [] },
    } };
    g.log = [];
    g.components = {
        playerPanel: { updateInjuries: (pid, inj) => g.log.push(['panel', pid, inj.map(x => x.color).join(',')]) },
        removeAllInjuryCardsOfColor: (c) => g.log.push(['hand', c]),
    };
    g._playerHasPainTolerance = () => false;
    g._animateInjuryCardToDeck = () => { g.log.push(['fly']); return flight; };
    return g;
}

(async () => {
    // Own discard: the panel moves before the flight lands.
    let land;
    let g = makeGame(new Promise((r) => { land = r; }));
    const done = g.notif_injuriesDiscarded({ player_id: 7, color: 'red' });
    await Promise.resolve();
    check(JSON.stringify(g.log[0]) === JSON.stringify(['panel', 7, 'blue']),
        'the panel drops the colour at once, before the flight, got ' + JSON.stringify(g.log));
    check(!g.log.some(e => e[0] === 'hand'), 'the hand cards wait for the flight');
    land(); await done;
    check(g.log.some(e => e[0] === 'hand' && e[1] === 'red'), 'and leave the hand when it lands');

    // A flight that throws still updates the panel and clears the hand.
    g = makeGame(Promise.reject(new Error('flight failed')));
    await g.notif_injuriesDiscardedByChoice({ player_id: 7, color: 'red' });
    check(g.log.some(e => e[0] === 'panel' && e[2] === 'blue'), 'a failed flight still updates the panel (Omega discard)');
    check(g.log.some(e => e[0] === 'hand' && e[1] === 'red'), 'and still clears the hand');

    // An opponent's discard: panel only, no flight.
    g = makeGame(Promise.resolve());
    await g.notif_injuriesDiscarded({ player_id: 8, color: 'red' });
    check(JSON.stringify(g.log) === JSON.stringify([['panel', 8, '']]), 'an opponent\'s discard just updates their panel');

    // Hero acquire goes the same way; a Titan-source auto-discard does not.
    g = makeGame(Promise.resolve());
    await g.notif_heroAutoDiscarded({ player_id: 7, color: 'blue', source: 'acquire' });
    check(g.log[0][0] === 'panel' && g.log[0][2] === 'red', 'a Hero\'s discard on acquire updates the panel first');

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
