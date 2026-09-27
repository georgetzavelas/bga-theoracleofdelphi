/**
 * Hovering the ship in a player panel pings that player's ship on the board.
 *
 *   - the ship gets .pp-ship-beacon (a lift) and a rings element inside it,
 *     so the rings move with the ship;
 *   - a ship already in view is not panned to; one out of view is, and the
 *     board goes back where it was when the pointer leaves (a peek);
 *   - a tap pings for SHIP_BEACON_TAP_MS, for touch;
 *   - pinging another ship clears the first.
 *
 * Run: node tests/test_panel_ship_beacon_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.css'), 'utf8');

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

function extract(name) {
    const s = SRC.indexOf('        ' + name + ': function');
    if (s < 0) throw new Error('method not found: ' + name);
    let i = SRC.indexOf('{', s), d = 0;
    for (; i < SRC.length; i++) {
        if (SRC[i] === '{') d++;
        else if (SRC[i] === '}') { d--; if (!d) break; }
    }
    return SRC.slice(s, i + 1);
}
const names = ['_bindPanelShipBeacon', '_showShipBeacon', '_hideShipBeacon', '_shipBeaconScrollBehavior'];

// ---- stand-in DOM and clock ------------------------------------------------------
let timers = [], now = 0;
global.setTimeout = (f, ms) => { timers.push({ f, at: now + ms }); return timers.length; };
global.clearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].f = null; };
function tick(ms) { now += ms; timers.forEach(t => { if (t.f && t.at <= now) { const f = t.f; t.f = null; f(); } }); }

function el(cls) {
    const e = {
        children: [], parentNode: null, dataset: {}, listeners: {}, classes: new Set(cls ? [cls] : []),
        classList: { add: (c) => e.classes.add(c), remove: (c) => e.classes.delete(c), contains: (c) => e.classes.has(c) },
        appendChild(c) { c.parentNode = e; e.children.push(c); return c; },
        removeChild(c) { e.children = e.children.filter(x => x !== c); c.parentNode = null; },
        addEventListener(t, f) { (e.listeners[t] = e.listeners[t] || []).push(f); },
        fire(t) { (e.listeners[t] || []).forEach(f => f({})); },
        set innerHTML(v) { e._html = v; }, get innerHTML() { return e._html; },
    };
    return e;
}
const shipA = el('delphi-ship'), shipB = el('delphi-ship');
const icon = el('delphi-pp-ship-icon');
const board = el(); board.scrollLeft = 100; board.scrollTop = 0; board.scrolls = [];
board.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300 });
board.scrollTo = (o) => { board.scrolls.push(o); board.scrollLeft = o.left; board.scrollTop = o.top; };
let shipARect = { left: 100, top: 100, right: 160, bottom: 140, width: 60, height: 40 };
shipA.getBoundingClientRect = () => shipARect;
shipB.getBoundingClientRect = () => ({ left: 50, top: 50, right: 110, bottom: 90, width: 60, height: 40 });

global.document = {
    body: { classList: { contains: () => false } },
    createElement: () => el(),
    getElementById: (id) => id === 'delphi-board-container' ? board : null,
};
global.window = { matchMedia: () => ({ matches: false }) };

const game = new Function('return { SHIP_BEACON_TAP_MS: 1800, ' + names.map(extract).join(',\n') + ' };')();
game.components = {
    ships: new Map([[7, shipA], [8, shipB]]),
    playerPanel: { getRoot: () => ({ querySelector: (q) => q === '.delphi-pp-ship-icon' ? icon : null }) },
};

// ---- in view: ping, no pan --------------------------------------------------------
game._bindPanelShipBeacon('7');
game._bindPanelShipBeacon('7');
check((icon.listeners.mouseenter || []).length === 1, 'the icon is bound once');
icon.fire('mouseenter');
check(shipA.classes.has('pp-ship-beacon'), 'hovering the panel ship lifts the ship on the board');
check(shipA.children.length === 1 && /<span><\/span>/.test(shipA.children[0].innerHTML),
    'with sonar rings inside the ship, so they move with it');
check(board.scrolls.length === 0, 'a ship in view is not panned to');
icon.fire('mouseleave');
check(!shipA.classes.has('pp-ship-beacon') && shipA.children.length === 0, 'leaving takes the ping away');
check(board.scrolls.length === 0, 'and pans nothing back');

// ---- out of view: pan there and back ---------------------------------------------
shipARect = { left: 600, top: 100, right: 660, bottom: 140, width: 60, height: 40 };
icon.fire('mouseenter');
check(board.scrolls.length === 1 && board.scrolls[0].left === 100 + 630 - 200,
    'a ship out of view is panned to the middle of the board, got ' + JSON.stringify(board.scrolls[0]));
check(board.scrolls[0].behavior === 'smooth', 'smoothly');
icon.fire('mouseleave');
check(board.scrolls.length === 2 && board.scrolls[1].left === 100 && board.scrolls[1].top === 0,
    'and back where the view was when the pointer leaves');

// ---- tap --------------------------------------------------------------------------
shipARect = { left: 100, top: 100, right: 160, bottom: 140, width: 60, height: 40 };
icon.fire('click');
check(shipA.classes.has('pp-ship-beacon'), 'a tap pings too');
tick(1000);
check(shipA.classes.has('pp-ship-beacon'), 'for a while');
tick(900);
check(!shipA.classes.has('pp-ship-beacon'), 'then lets go on its own');

// ---- one at a time ---------------------------------------------------------------
game._showShipBeacon(7);
game._showShipBeacon(8);
check(!shipA.classes.has('pp-ship-beacon') && shipB.classes.has('pp-ship-beacon'), 'pinging another ship clears the first');
game._showShipBeacon(8);
check(shipB.children.length === 1, 'pinging the same ship again adds no second set of rings');
game._hideShipBeacon();

// ---- reduced motion --------------------------------------------------------------
global.document.body.classList.contains = (c) => c === 'motion-reduced-pref';
check(game._shipBeaconScrollBehavior() === 'auto', 'reduced motion jumps instead of gliding');

// ---- CSS -------------------------------------------------------------------------
check(/\.delphi-ship\.pp-ship-beacon\s*\{[^}]*\bscale:\s*1\.2/.test(CSS),
    'the lift uses `scale`, so it stacks with the ship\'s own transform');
check(/\.delphi-ship\s*\{[^}]*transition:[^;]*left 0\.5s[^;]*scale 0\.2s/.test(CSS),
    'the ship eases into the lift without losing its move transition');
check(/\.pp-ship-beacon-rings span\s*\{[^}]*animation:\s*pp-ship-ping[^;]*infinite/.test(CSS)
    && /span:nth-child\(2\)\s*\{\s*animation-delay/.test(CSS), 'the rings ripple out in turn');
check(/body\.motion-reduced-pref \.pp-ship-beacon-rings span\s*\{\s*animation:\s*none/.test(CSS),
    'reduced motion: a steady ring');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
