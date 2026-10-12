/**
 * Player panel dice tooltip: hovering a player's dice row shows their Oracle
 * wheel (from their own board art) with the dice placed as their board places
 * them: unused on their colour's brazier, clustered; used in the centre
 * pyramid in spend order; a selected die framed. Checks:
 *   - title, "not rolled" and the count line;
 *   - placement against the board's own cluster and pyramid maths;
 *   - the fallback slot centres match the .oracle-slot CSS;
 *   - it is a BGA tooltip, rebuilt whenever the dice or the selection change;
 *   - the wheel art is a small cutout cached once per board, not the full
 *     1689x1039 board JPG re-fetched and re-decoded on every hover, with the
 *     full art as the fallback when the canvas can't be read.
 *
 * Run: node tests/test_panel_dice_tooltip_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8');
const COMP = fs.readFileSync(path.join(__dirname, '..', 'modules', 'js', 'Components.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.css'), 'utf8');

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }
function extractFrom(src, name) {
    const s = src.indexOf('        ' + name + ': ');
    if (s < 0) throw new Error('not found: ' + name);
    let i = src.indexOf('{', s), d = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') d++;
        else if (src[i] === '}') { d--; if (!d) break; }
    }
    return src.slice(s, i + 1);
}

global._ = (s) => s;
global.dojo = { string: { substitute: (t, o) => t.replace(/\$\{(\w+)\}/g, (m, k) => o[k]) } };
global.document = { getElementById: () => null };   // no board to read: the fallback path
const themeImg = (p) => p;
const g = new Function('themeImg', 'return {' + ['RECOLOR_ART', 'DICE_TIP_SLOTS', '_buildPanelDiceTooltipHtml', '_gameColorForPlayer', '_escHtml',
    '_diceTipBoardArt', '_warmDiceTipArt', '_cutDiceTipArt']
    .map(n => extractFrom(SRC, n)).join(',\n') + ', DICE_TIP_ART: 104, PLAYER_BOARD_COLORS: ["red","yellow","green","blue"] }')(themeImg);
// The board's own placement maths, from Components.
const comps = new Function('return {' + ['_clusterPositions', '_pyramidPositions'].map(n => extractFrom(COMP, n)).join(',\n')
    + ', DIE_SIZE: 50, CLUSTER_GAP: 4, WHEEL_CENTER: { cx: 173, cy: 146 } }')();
comps.dice = new Map();
comps._spentDiceByPlayer = new Map([['1', [2, 0]]]);
g.components = comps;
g.player_id = 1;
g._playerGameColors = { 1: 'red', 2: 'yellow' };
g.gamedatas = { players: { 1: { name: 'G' }, 2: { name: 'Eve <b>' } } };

// Title, empty state, count lines.
check(/Your oracle dice/.test(g._buildPanelDiceTooltipHtml(1, [])) && /Not rolled yet/.test(g._buildPanelDiceTooltipHtml(1, [])),
    'no dice yet: title and "Not rolled yet"');
const eve = g._buildPanelDiceTooltipHtml(2, [{ idx: 0, color: 'green', spent: 1 }, { idx: 1, color: 'red', spent: 1 }, { idx: 2, color: 'blue', spent: 1 }]);
check(/Eve &lt;b&gt;'s oracle dice/.test(eve), 'an opponent\'s name, escaped');
check(/All 3 used/.test(eve), 'all used');
check(/img\/boards\/yellow-player-board\.jpg/.test(eve), 'drawn on that player\'s own board art');
const mid = g._buildPanelDiceTooltipHtml(1, [{ idx: 0, color: 'red', spent: 1 }, { idx: 1, color: 'pink', spent: 0 }, { idx: 2, color: 'blue', spent: 1 }]);
check(/1 to use, 2 used/.test(mid), 'the count line');
comps.dice.set('1_1', { classList: { contains: (c) => c === 'die-selected' } });
const sel = g._buildPanelDiceTooltipHtml(1, [{ idx: 0, color: 'red', spent: 1 }, { idx: 1, color: 'pink', spent: 0 }, { idx: 2, color: 'blue', spent: 1 }]);
check(/Using one, 0 more to use, 2 used/.test(sel) && /pp-tip-dice-sel/.test(sel), 'a selected die is framed and counted');
comps.dice = new Map();

// Placement: three dice drawn; used ones on the pyramid in spend order (2 then 0).
const A = new Function('return {' + extractFrom(SRC, 'RECOLOR_ART') + '}')().RECOLOR_ART;
const k = 104 / A.radius, f = A.imageW / 900;
const at = (p) => [+(((72 + p.x) * f - A.center.x) * k).toFixed(2), +(((138 + p.y) * f - A.center.y) * k).toFixed(2)];
const pos = [...mid.matchAll(/translate\(([-\d.]+) ([-\d.]+)\)">(?:<rect class="pp-tip-dice-sel"[^>]*>)?<rect class="pp-tip-dice-die[^"]*"[^>]*><image href="img\/oracle-dice\/die-face-(\w+)/g)]
    .map(m => m[3] + '@' + m[1] + ',' + m[2]);
check(pos.length === 3, 'one die drawn per die, got ' + pos.length);
const pyr = comps._pyramidPositions(2);
check(pos.includes('blue@' + at(pyr[0]).join(',')) && pos.includes('red@' + at(pyr[1]).join(',')),
    'used dice fill the pyramid in spend order: ' + pos.join(' '));
const pink = comps._clusterPositions(1, g.DICE_TIP_SLOTS.pink)[0];
check(pos.includes('pink@' + at(pink).join(',')), 'an unused die sits on its brazier');
const two = g._buildPanelDiceTooltipHtml(1, [{ idx: 0, color: 'pink', spent: 0 }, { idx: 1, color: 'pink', spent: 0 }, { idx: 2, color: 'black', spent: 0 }]);
const cl = comps._clusterPositions(2, g.DICE_TIP_SLOTS.pink).map(p => 'translate(' + at(p).join(' ') + ')');
check(cl.every(t => two.includes(t)), 'two of a colour cluster as the board clusters them');

// Fallback slot centres match the .oracle-slot CSS (left/top + half of a 56px slot).
const cssSlot = (c) => {
    const m = new RegExp('\\.oracle-slot\\[data-color="' + c + '"\\] \\{ top: (\\d+)px; left: (\\d+)px; \\}').exec(CSS);
    return m && { cx: +m[2] + 28, cy: +m[1] + 28 };
};
check(['red', 'black', 'pink', 'blue', 'yellow', 'green'].every(c => {
    const a = cssSlot(c), b = g.DICE_TIP_SLOTS[c];
    return a && b && a.cx === b.cx && a.cy === b.cy;
}), 'fallback slot centres match the CSS');
check(/var live = !!\(wheel && wheel\.offsetParent\);/.test(extractFrom(SRC, '_buildPanelDiceTooltipHtml')),
    'a hidden wheel (offsets all 0) is never read');

// Wiring: a BGA tooltip on the dice row, rebuilt on every change.
check(/updateDice: function\(playerId, dice\) \{[\s\S]{0,200}this\._syncPanelTooltip\('pp-dice-' \+ playerId, '_buildPanelDiceTooltipHtml', \[playerId, dice\]\);/.test(COMP),
    'rebuilt whenever the panel dice change');
check(/renderActionsRow: function[\s\S]*?this\._syncPanelTooltip\('pp-dice-' \+ playerId, '_buildPanelDiceTooltipHtml'/.test(COMP),
    'and when the row is first drawn');
check(/notif_dieSelected: async function[\s\S]{0,700}this\._refreshPanelDiceTooltip\(pid\);/.test(SRC)
    && /notif_dieCancelled: async function[\s\S]{0,400}this\._refreshPanelDiceTooltip\(pid\);/.test(SRC),
    'and when a die is selected or let go');

// ---- cached cutout ----------------------------------------------------------
// A cached cutout replaces the full board art: no 384 KB JPG per hover.
{
    const R = 104;
    g._diceTipArtCache = { 'img/boards/yellow-player-board.jpg': 'data:image/jpeg;base64,CUT' };
    const tip = g._buildPanelDiceTooltipHtml(2, [{ idx: 0, color: 'green', spent: 0 }]);
    check(tip.includes('href="data:image/jpeg;base64,CUT"'), 'a cached cutout is used when ready');
    check(!/yellow-player-board\.jpg/.test(tip), 'and the full board art is not referenced');
    check(new RegExp('<image href="data:image/jpeg;base64,CUT" x="-' + R + '" y="-' + R + '" width="' + 2 * R + '" height="' + 2 * R + '"').test(tip),
        'the cutout fills exactly the wheel circle');
    const other = g._buildPanelDiceTooltipHtml(1, [{ idx: 0, color: 'green', spent: 0 }]);
    check(/img\/boards\/red-player-board\.jpg/.test(other), 'a board with no cutout yet falls back to the full art');
    g._diceTipArtCache = null;
}

// The cut takes the wheel's square in art pixels and scales it to the canvas.
{
    const A = g.RECOLOR_ART;
    let drawn = null, size = null;
    global.document = {
        getElementById: () => null,
        createElement: () => ({
            set width(v) { size = v; }, set height(v) {},
            getContext: () => ({ drawImage: (...a) => { drawn = a; } }),
            toDataURL: (type) => 'data:' + type + ';base64,OK',
        }),
    };
    const out = g._cutDiceTipArt({ fake: 1 });
    check(out === 'data:image/jpeg;base64,OK', 'the cut returns a JPEG data URL');
    check(drawn && drawn[1] === A.center.x - A.radius && drawn[2] === A.center.y - A.radius
        && drawn[3] === 2 * A.radius && drawn[4] === 2 * A.radius,
        'it reads the wheel square from the board art: ' + JSON.stringify(drawn && drawn.slice(1)));
    check(size >= 2 * 104 * 2, 'the canvas is at least 2x the tooltip size, so it stays sharp on high-DPI screens');

    // A cross-origin image without CORS taints the canvas: toDataURL throws.
    global.document.createElement = () => ({
        set width(v) {}, set height(v) {},
        getContext: () => ({ drawImage() {} }),
        toDataURL: () => { throw new Error('SecurityError'); },
    });
    check(g._cutDiceTipArt({ fake: 1 }) === null, 'a tainted canvas gives null, so the tooltip keeps the full art');
    global.document = { getElementById: () => null };
}

// Warming: one load per distinct board, the full image kept alive, and the
// tooltips rebuilt once the cutout is ready.
{
    const loads = [];
    global.Image = function() { loads.push(this); };
    global.document = {
        getElementById: () => null,
        createElement: () => ({
            set width(v) {}, set height(v) {},
            getContext: () => ({ drawImage() {} }),
            toDataURL: () => 'data:image/jpeg;base64,W',
        }),
    };
    const w = Object.create(g);
    w._playerGameColors = { 1: 'red', 2: 'yellow', 3: 'red' };
    w.gamedatas = { players: { 1: {}, 2: {}, 3: {} } };
    w._diceTipArtCache = null; w._diceTipArtImgs = null;
    const refreshed = [];
    w._refreshPanelDiceTooltip = (pid) => refreshed.push(pid);
    w._warmDiceTipArt();
    check(loads.length === 2, 'one image load per distinct board, got ' + loads.length);
    check(Object.keys(w._diceTipArtImgs).length === 2, 'the full images are kept alive (fallback stays in memory)');
    loads[0].onload();
    check(w._diceTipArtCache[loads[0].src] === 'data:image/jpeg;base64,W', 'a loaded board is cut and cached');
    check(refreshed.length === 3, 'every player\'s tooltip is rebuilt so it picks up the cutout');
    w._warmDiceTipArt();
    check(loads.length === 2, 'warming again does not reload');
    delete global.Image;
    global.document = { getElementById: () => null };
}
check(/this\._preloadGameImages\(\);\s*this\._warmDiceTipArt\(\);/.test(SRC), 'the cutouts are warmed at setup');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
