/**
 * The ship sails the water route hex by hex instead of sliding straight to
 * its destination across islands.
 *
 * The server sends the route on shipMoved as `path` ([q, r] steps, start and
 * target inclusive). notif_shipMoved walks the ship through each intermediate
 * hex, then the ordinary moveShip to the target (with its shared-hex offset)
 * is the final leg.
 *
 * Extracts the real shipped methods so the assertions cover shipped behaviour.
 *
 * Run: node tests/test_ship_sail_path_js.js
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

const SRC = `return {
SHIP_HOP_MS: 0,
${extractMember('^        notif_shipMoved: async function')}
${extractMember('^        _sailShipAlongPath: async function')}
};`;

let passed = 0, failed = 0;
function check(cond, msg) {
    if (cond) passed++; else { failed++; console.log('FAIL: ' + msg); }
}

function makeGame(opts) {
    const game = new Function(SRC)();
    const moves = [];
    const el = { style: { transition: '' } };
    game.player_id = 7;
    game.instantaneousMode = !!opts.instant;
    game.shipPositions = { 7: { q: 0, r: 0 }, 8: { q: 0, r: 0 } };
    game.getHexCenterPixel = (q, r) => ({ x: q * 100, y: r * 100 });
    game.getShipPixelPosition = (pid, q, r) => ({ x: q * 100 + 1, y: r * 100 + 1 });
    game.repositionAllShipsOnHex = () => {};
    game.components = {
        ships: new Map([[7, el], [8, el]]),
        moveShip: (pid, x, y, animate) => moves.push({ pid, x, y, animate, transition: el.style.transition }),
    };
    return { game, moves, el };
}

(async function () {
    // An island at (1,0): the route goes (0,0) -> (1,-1) -> (2,-1) -> (2,0).
    const route = [[0, 0], [1, -1], [2, -1], [2, 0]];

    {
        const { game, moves, el } = makeGame({});
        await game.notif_shipMoved({ player_id: 7, q: 2, r: 0, path: route });
        check(moves.length === 3, 'own ship: one move per leg (2 intermediates + target), got ' + moves.length);
        check(moves[0].x === 100 && moves[0].y === -100, 'own ship: first leg goes to the first water hex, not the target');
        check(moves[1].x === 200 && moves[1].y === -100, 'own ship: second leg goes to the next water hex');
        check(moves[2].x === 201 && moves[2].y === 1, 'own ship: final leg lands on the target with its shared-hex offset');
        check(/ease-in/.test(moves[0].transition) && !/ease-in-out/.test(moves[0].transition),
            'own ship: the first leg eases in');
        check(/linear/.test(moves[1].transition), 'own ship: middle legs run at constant speed');
        check(/ease-out/.test(moves[2].transition), 'own ship: the final leg eases out');
        check(el.style.transition === '', 'own ship: the stylesheet transition is restored after docking');
        check(game.shipPositions[7].q === 2 && game.shipPositions[7].r === 0, 'own ship: stored position is the target');
    }

    {
        // A one-hex move still lands on the target, as a single leg.
        const { game, moves } = makeGame({});
        await game.notif_shipMoved({ player_id: 7, q: 1, r: 0, path: [[0, 0], [1, 0]] });
        check(moves.length === 1 && moves[0].x === 101, 'one-hex move: a single leg to the target');
        check(/ease-in-out/.test(moves[0].transition), 'one-hex move: eases in and out');
    }

    // Straight-move fallbacks: exactly one moveShip, straight to the target.
    const fallbacks = [
        ['no path (Poseidon teleport, an old log entry)', {}, { player_id: 7, q: 2, r: 0 }],
        ['path that does not start where the ship is', {}, { player_id: 7, q: 2, r: 0, path: [[5, 5], [2, 0]] }],
        ['path that does not end at the target', {}, { player_id: 7, q: 2, r: 0, path: [[0, 0], [1, 0]] }],
        ['BGA fast-forwarding', { instant: true }, { player_id: 7, q: 2, r: 0, path: route }],
        ["an opponent's ship (always jumps)", {}, { player_id: 8, q: 2, r: 0, path: route }],
    ];
    for (const [label, opts, args] of fallbacks) {
        const { game, moves, el } = makeGame(opts);
        await game.notif_shipMoved(args);
        check(moves.length === 1 && moves[0].x === 201 && moves[0].y === 1,
            label + ': one straight move to the target, got ' + JSON.stringify(moves));
        check(el.style.transition === '', label + ': no inline transition left behind');
    }

    console.log(passed + ' passed, ' + failed + ' failed');
    process.exit(failed === 0 ? 0 : 1);
})();
