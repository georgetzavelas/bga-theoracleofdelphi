/**
 * Delivery lines always flow toward where the cargo goes.
 *
 * The dashes animate from a path's first point to its last
 * (delphi-relation-flow), so the path's order IS the flow direction.
 * Offerings go to temples and statues go to pedestals, whichever end the
 * player hovers:
 *
 *   hover an offering  -> threads start at the offering, end at the temple
 *   hover a temple     -> threads start at each offering, end at the temple
 *   hover a city       -> threads start at the city, end at the pedestal
 *   hover a pedestal   -> threads start at each city, end at the pedestal
 *
 * The offering Zeus-tile hover reuses the temple drawing, so it flows inward
 * too. Ship-to-cargo-destination lines already run toward the destination
 * and must not change.
 *
 * Run: node tests/test_relation_flow_direction_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8');
const LINES = SRC.split('\n');

function extractMethod(name) {
    const re = new RegExp('^        ' + name + ': function');
    const start = LINES.findIndex(l => re.test(l));
    if (start < 0) throw new Error('not found: ' + name);
    let i = start;
    while (!/^        \},\s*$/.test(LINES[i])) i++;
    return LINES.slice(start, i + 1).join('\n');
}

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

function makeEl() {
    const el = {
        attrs: {}, children: [], style: {},
        setAttribute(k, v) { el.attrs[k] = String(v); },
        getAttribute(k) { return el.attrs[k]; },
        appendChild(c) { el.children.push(c); return c; },
        removeChild(c) { el.children.splice(el.children.indexOf(c), 1); return c; },
    };
    Object.defineProperty(el, 'firstChild', { get: () => el.children[0] || null });
    return el;
}

function world() {
    const byId = { 'delphi-hex-grid': makeEl() };
    const document_ = {
        getElementById: (id) => byId[id] || null,
        createElementNS: () => {
            const e = makeEl();
            const set = e.setAttribute;
            e.setAttribute = (k, v) => { set(k, v); if (k === 'id') byId[v] = e; };
            return e;
        },
    };
    const methods = ['_showRelatedIslands', '_clearRelatedIslands', '_ensureRelationFxLayer',
        '_drawRelationFx', '_relHexRing', '_drawTempleDelivery'].map(extractMethod).join('\n');
    const game = new Function('document', `return { ${methods} };`)(document_);
    game.byId = byId;
    game._deliveryHighlightEnabled = true;
    game.TASK_RING_BY_DIE = {};
    game._isActionTargetHex = () => false;
    // Hex (q, r) sits at pixel (q*100, r*100), so endpoints read back as hexes.
    game.getHexCenterPixel = (q, r) => ({ x: Number(q) * 100, y: Number(r) * 100 });
    game.attrs = {};
    game._getIslandAttribute = (q, r) => game.attrs[q + ',' + r] || null;
    game.partners = [];
    game._relatedIslandsFor = () => game.partners;
    return game;
}

// [startHex, endHex] of every coloured thread drawn into a layer.
function threads(game, layerId) {
    const layer = game.byId[layerId || 'delphi-relation-fx'];
    if (!layer) return [];
    return layer.children
        .filter(c => c.attrs.class === 'delphi-relation-thread')
        .map(c => {
            const n = c.attrs.d.match(/-?\d+(\.\d+)?/g).map(Number);
            const hex = (x, y) => (x / 100) + ',' + (y / 100);
            return [hex(n[0], n[1]), hex(n[n.length - 2], n[n.length - 1])];
        });
}

const allEndAt = (ts, key) => ts.length > 0 && ts.every(t => t[1] === key);
const allStartAt = (ts, key) => ts.length > 0 && ts.every(t => t[0] === key);

// ---- hovering an offering: offering -> temple -------------------------------
{
    const g = world();
    g.attrs['1,1'] = 'offering';
    g.partners = [{ q: 5, r: 5, color: 'red' }];
    g._showRelatedIslands(1, 1, 'red');
    const ts = threads(g);
    check(allStartAt(ts, '1,1') && allEndAt(ts, '5,5'),
        `offering hover flows offering -> temple, got ${JSON.stringify(ts)}`);
}

// ---- hovering a temple: each offering -> temple -----------------------------
{
    const g = world();
    g.attrs['5,5'] = 'temple';
    g.partners = [{ q: 1, r: 1, color: 'red' }, { q: 2, r: 2, color: 'red' }];
    g._showRelatedIslands(5, 5, 'red');
    const ts = threads(g);
    check(ts.length === 2 && allEndAt(ts, '5,5'),
        `temple hover flows toward the temple, got ${JSON.stringify(ts)}`);
    check(ts.some(t => t[0] === '1,1') && ts.some(t => t[0] === '2,2'),
        'each temple-hover thread starts at its offering');
}

// ---- hovering a city: city -> pedestal ---------------------------------------
{
    const g = world();
    g.attrs['3,3'] = 'city';
    g.partners = [{ q: 7, r: 7, color: 'blue' }];
    g._showRelatedIslands(3, 3, 'blue');
    const ts = threads(g);
    check(allStartAt(ts, '3,3') && allEndAt(ts, '7,7'),
        `city hover flows statue -> pedestal, got ${JSON.stringify(ts)}`);
}

// ---- hovering a pedestal island: each city -> pedestal -----------------------
{
    const g = world();
    g.attrs['7,7'] = 'statue';
    g.partners = [{ q: 3, r: 3, color: 'blue' }, { q: 4, r: 4, color: 'green' }];
    g._showRelatedIslands(7, 7, null);
    const ts = threads(g);
    check(ts.length === 2 && allEndAt(ts, '7,7'),
        `pedestal hover flows toward the pedestal, got ${JSON.stringify(ts)}`);
}

// ---- offering Zeus tile reuses the temple drawing: also toward the temple ----
{
    const g = world();
    g.partners = [{ q: 1, r: 1, color: 'pink' }];
    g._drawTempleDelivery('pink', { pink: { q: 5, r: 5 } });
    const ts = threads(g, 'delphi-task-fx');
    check(allStartAt(ts, '1,1') && allEndAt(ts, '5,5'),
        `offering-tile hover flows offering -> temple, got ${JSON.stringify(ts)}`);
}

// ---- ship cargo lines (no option) keep flowing ship -> destination -----------
{
    const g = world();
    g._drawRelationFx(0, 0, [{ q: 5, r: 5, color: 'red' }]);
    const ts = threads(g);
    check(allStartAt(ts, '0,0') && allEndAt(ts, '5,5'),
        `default direction is unchanged (ship -> destination), got ${JSON.stringify(ts)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
