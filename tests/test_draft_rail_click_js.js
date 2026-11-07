/**
 * Picking a ship tile keeps the draft rail on screen.
 *
 * Player report: selecting a ship tile made the action bar drop the ships and
 * then show them again. _onDraftTileClick tore the whole rail down before
 * sending actDraftTile, and nothing replaced it until the server's state change
 * rebuilt it a round trip later. The rail now stays up, locked: no tile is
 * clickable and the picked tile's image is hidden for the pick-flight. A
 * refused pick rebuilds it pickable again.
 *
 * Extracts the real shipped methods so the assertions cover shipped behaviour.
 *
 * Run: node tests/test_draft_rail_click_js.js
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

let passed = 0, failed = 0;
function check(cond, msg) {
    if (cond) passed++; else { failed++; console.log('FAIL: ' + msg); }
}

// Minimal DOM: classList, listeners, querySelector by class, getElementById.
function makeEl(id, classes) {
    const cls = new Set(classes || []);
    const listeners = [];
    const el = {
        id, style: {}, dataset: {}, children: [], parentNode: null,
        classList: {
            add: c => cls.add(c), remove: c => cls.delete(c),
            contains: c => cls.has(c),
        },
        addEventListener: (t, h) => listeners.push(h),
        removeEventListener: (t, h) => { const i = listeners.indexOf(h); if (i >= 0) listeners.splice(i, 1); },
        listeners,
        appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
        removeChild(c) { el.children.splice(el.children.indexOf(c), 1); c.parentNode = null; },
        querySelector(sel) { return el.children.find(c => c.classList.contains(sel.replace(/^\./, ''))) || null; },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }),
    };
    return el;
}

function setup(rejectPick) {
    const body = makeEl('body');
    const rail = body.appendChild(makeEl('delphi-draft-rail', ['draft-rail-active']));
    const tiles = [1, 2].map(id => {
        const t = rail.appendChild(makeEl('draft-tile-' + id, ['draft-tile', 'draft-tile-pickable']));
        t.dataset.tileId = String(id);
        t.appendChild(makeEl('', ['draft-tile-img']));
        return t;
    });
    const pageTitle = body.appendChild(makeEl('page-title'));
    const slot = body.appendChild(makeEl('delphi-ship-tile-slot'));
    const doc = {
        getElementById: id => [rail, pageTitle, slot, ...tiles].find(e => e.id === id && e.parentNode) || null,
    };
    const game = new Function('document', `return {
${extractMember('^        _onDraftTileClick: function')}
${extractMember('^        _lockDraftRail: function')}
${extractMember('^        _teardownDraftRail: function')}
};`)(doc);

    const calls = { sent: [], rebuilt: 0, flights: 0 };
    game._shipTileImgUrl = id => 'tile' + id + '.png';
    game._runPickFlight = () => { calls.flights++; };
    game.removeTooltip = () => {};
    game._draftRailArgs = { pool: [1, 2], claims: {} };
    game._setupDraftRail = () => { calls.rebuilt++; };
    let reject;
    game.bgaPerformAction = (name, args) => {
        calls.sent.push([name, args]);
        return new Promise((res, rej) => { reject = rej; if (!rejectPick) res(); });
    };
    game._draftTileHandlers = tiles.map(t => {
        const handler = () => game._onDraftTileClick(t);
        t.addEventListener('click', handler);
        return { el: t, handler };
    });
    return { game, rail, tiles, calls, reject: () => reject(new Error('refused')) };
}

(async function () {
    {
        const { game, rail, tiles, calls } = setup(false);
        game._onDraftTileClick(tiles[0]);
        await Promise.resolve();
        check(rail.parentNode !== null, 'the rail stays on screen after a pick');
        check(calls.sent.length === 1 && calls.sent[0][1].tile_id === 1, 'the pick is sent once with the tile id');
        check(tiles.every(t => t.listeners.length === 0), 'no tile is clickable while the pick is in flight');
        check(tiles.every(t => !t.classList.contains('draft-tile-pickable')), 'no tile still looks pickable');
        check(!rail.classList.contains('draft-rail-active') && rail.classList.contains('draft-rail-locked'),
            'the rail is marked locked, not active');
        check(tiles[0].children[0].style.visibility === 'hidden', 'the picked tile image is hidden for the flight');
        check(tiles[1].children[0].style.visibility !== 'hidden', 'the other tiles stay visible');
        check(calls.flights === 1, 'the pick-flight still runs');
        check(calls.rebuilt === 0, 'an accepted pick waits for the state change to rebuild the rail');
    }

    {
        const r = setup(true);
        r.game._onDraftTileClick(r.tiles[1]);
        r.reject();
        await new Promise(res => setTimeout(res, 0));
        check(r.calls.rebuilt === 1, 'a refused pick rebuilds the rail so the player can pick again');
    }

    {
        // A refusal that arrives after the state change already rebuilt the
        // rail (no longer locked) must not rebuild it a second time.
        const r = setup(true);
        r.game._onDraftTileClick(r.tiles[0]);
        r.rail.classList.remove('draft-rail-locked');
        r.reject();
        await new Promise(res => setTimeout(res, 0));
        check(r.calls.rebuilt === 0, 'a late refusal leaves a rebuilt rail alone');
    }

    console.log(passed + ' passed, ' + failed + ' failed');
    process.exit(failed === 0 ? 0 : 1);
})();
