/**
 * Loaded task pillars: a pillar with cargo aboard for it (data-claimed) hovers
 * exactly like that cargo on the ship, drawing the delivery lines from my ship,
 * and stops answering as its Zeus tile so the two highlights never stack.
 *
 *   - My loaded statue and offering pillars resolve to {type, color, me}.
 *   - Open, done and opponent pillars do not.
 *   - A loaded offering pillar no longer resolves as its Zeus tile; an open
 *     one still does.
 *   - The document-level cargo hover draws for it and clears after it.
 *
 * Run: node tests/test_loaded_pillar_hover_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.css'), 'utf8');
const LINES = SRC.split('\n');

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

function extractMethod(name) {
    const re = new RegExp('^        ' + name + ': (async )?function');
    const start = LINES.findIndex(l => re.test(l));
    if (start < 0) throw new Error('method not found: ' + name);
    let i = start;
    while (!/^        \},\s*$/.test(LINES[i])) {
        i++;
        if (i > start + 400) throw new Error('runaway extracting ' + name);
    }
    return LINES.slice(start, i + 1).join('\n');
}

// --- stub DOM: '#id', '.class', concatenations, comma lists -----------------
function matches(el, sel) {
    return String(sel).split(',').some(function (part) {
        part = part.trim();
        if (!part) return false;
        return part.split(/(?=[.#])/).filter(Boolean).every(function (tok) {
            if (tok[0] === '#') return el.id === tok.slice(1);
            return el.classes.has(tok.slice(1));
        });
    });
}
function makeEl(cls, id, parent) {
    const el = {
        id: id || '', classes: new Set(String(cls || '').split(' ').filter(Boolean)),
        dataset: {}, parent: parent || null,
        classList: { contains: (c) => el.classes.has(c) },
        closest(sel) { let n = el; while (n) { if (matches(n, sel)) return n; n = n.parent; } return null; },
    };
    return el;
}

// My panel (7): an offering column with a loaded, an open and a done pillar,
// and a statue column with a loaded pillar. Player 8's panel has a loaded one.
function panel(pid) {
    const row = makeEl('delphi-pp-tasks', 'pp-tasks-' + pid);
    const col = (task) => { const c = makeEl('delphi-pp-task', '', row); c.dataset.task = task; return c; };
    const pip = (c, tileId, opts) => {
        const p = makeEl('delphi-pp-task-pip color' + (opts.done ? ' done' : ''), '', c);
        p.dataset.tileId = String(tileId);
        if (opts.claimed) p.dataset.claimed = opts.claimed;
        // A child, as the real pillar's glyph and piece spans are.
        p.child = makeEl('delphi-pp-task-piece', '', p);
        return p;
    };
    const off = col('offering'), sta = col('statue');
    return {
        loadedOffering: pip(off, pid * 10 + 1, { claimed: 'pink' }),
        openOffering: pip(off, pid * 10 + 2, {}),
        doneOffering: pip(off, pid * 10 + 3, { done: true }),
        loadedStatue: pip(sta, pid * 10 + 4, { claimed: 'green' }),
    };
}
const mine = panel(7), theirs = panel(8);

const zeus = {};
[71, 72].forEach(function (id) {
    const el = makeEl('delphi-zeus-tile zeus-offering', 'zeus_' + id);
    el.dataset.type = 'offering';
    el.dataset.completed = 'false';
    zeus['zeus_' + id] = el;
});

const listeners = {};
const document_ = {
    getElementById: (id) => zeus[id] || null,
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
};

const game = new Function('document',
    'return {' + ['_cargoFromEvent', '_setupCargoHover', '_taskTileFromEvent', '_taskPipIsSpent']
        .map(extractMethod).join('\n') + '};')(document_);
game.player_id = 7;

const at = (el) => ({ target: el.child || el });

// ============ 1. which pillars answer as cargo ==============================
{
    const o = game._cargoFromEvent(at(mine.loadedOffering));
    check(o && o.type === 'offering' && o.color === 'pink' && o.playerId === 7,
        'my loaded offering pillar is its pink offering, from my ship: ' + JSON.stringify(o));
    const s = game._cargoFromEvent(at(mine.loadedStatue));
    check(s && s.type === 'statue' && s.color === 'green' && s.playerId === 7,
        'my loaded statue pillar is its green statue: ' + JSON.stringify(s));
    check(game._cargoFromEvent(at(mine.openOffering)) === null, 'an open pillar carries nothing');
    check(game._cargoFromEvent(at(mine.doneOffering)) === null, 'a done pillar carries nothing');
    check(game._cargoFromEvent(at(theirs.loadedOffering)) === null,
        'an opponent\'s loaded pillar draws nothing: the lines are from my ship');
}

// ============ 2. loaded pillars stop answering as their Zeus tile ===========
{
    check(game._taskTileFromEvent(at(mine.loadedOffering)) === null,
        'a loaded offering pillar no longer runs the Zeus tile hover');
    check(game._taskTileFromEvent(at(mine.openOffering)) === zeus.zeus_72,
        'an open offering pillar still does');
}

// ============ 3. the document-level cargo hover draws for it ================
{
    const drawn = [];
    let cleared = 0;
    game._deliveryHighlightEnabled = true;
    game._showCargoDestinations = (type, color, pid) => drawn.push([type, color, pid]);
    game._clearRelatedIslands = () => { cleared++; };
    game._setupCargoHover();
    listeners.mouseover.forEach(fn => fn(at(mine.loadedStatue)));
    check(drawn.length === 1 && String(drawn[0]) === 'statue,green,7',
        'hovering the pillar draws that statue\'s deliveries: ' + JSON.stringify(drawn));
    listeners.mouseout.forEach(fn => fn(at(mine.loadedStatue)));
    check(cleared === 1, 'and leaving it clears them');
}

// ============ 4. CSS: no click affordance on a loaded pillar ================
check(/\.delphi-pp-task\[data-task="offering"\] \.delphi-pp-task-pip\[data-tile-id\]:not\(\.done\):not\(\[data-claimed\]\) \{|\.delphi-pp-task\[data-task="offering"\] \.delphi-pp-task-pip\[data-tile-id\]:not\(\.done\):not\(\[data-claimed\]\),/.test(CSS),
    'the pointer cursor skips a loaded offering pillar, which has nothing to click');

console.log((fail === 0 ? 'PASS' : 'FAIL') + ': loaded pillar hover  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
