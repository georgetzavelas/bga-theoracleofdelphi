/**
 * Tests for HexGrid.js — the client's hex coordinate maths.
 *
 * Two halves.
 *
 * The first exercises HexGrid's own geometry: the axial/pixel conversions and
 * their round-trip, cube rounding, neighbours, distance, range, the BFS, and
 * the zoom clamp (which theoracleofdelphi.js relies on — its zoom readout is
 * capped at HexGrid's maxZoom, and would keep counting up past the real limit
 * if that clamp stopped biting).
 *
 * The second is the part worth having. This geometry is written out more than
 * once in the codebase:
 *
 *   hexDistance   HexGrid.js, BoardBuilder.js, HexUtils.php   (3 copies)
 *   hexToPixel    HexGrid.js, BoardRenderer.js                (2 copies)
 *   directions    HexGrid.js, HexPathfinder.php               (2 copies)
 *
 * and in each pair the copies are used for different things — BoardBuilder
 * places clusters with its hexDistance while the server validates with
 * HexUtils', BoardRenderer draws with its hexToPixel while HexGrid measures
 * with its own. Nothing compared them, which is exactly how the cluster-7-3
 * colour drifted. These checks drive every copy over the same inputs.
 *
 * HexGrid's constructor only touches `document` when handed a string id, so
 * passing plain objects keeps this DOM-free.
 *
 * Run: node tests/test_hex_grid_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
function ok(cond, msg) {
    if (cond) { pass++; } else { console.log('  FAIL: ' + msg); fail++; }
}
function same(got, want, msg) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    ok(g === w, g === w ? msg : msg + '  (got ' + g + ' want ' + w + ')');
}

// --- load a Dojo module, returning both the class and its raw spec ----------
function loadModule(relPath) {
    const sandbox = {
        console, Math, Map, Set, JSON, captured: null, spec: null,
        define(_deps, factory) {
            const stubDeclare = (_parent, spec) => {
                sandbox.spec = spec;
                return function (...args) {
                    Object.assign(this, spec);
                    if (typeof spec.constructor === 'function') spec.constructor.apply(this, args);
                };
            };
            sandbox.captured = factory({}, stubDeclare);
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8'), sandbox);
    return { Class: sandbox.captured, spec: sandbox.spec };
}

const HexGridMod = loadModule('modules/js/HexGrid.js');
const RendererMod = loadModule('modules/js/BoardRenderer.js');
const BuilderMod = loadModule('modules/js/BoardBuilder.js');
ok(typeof HexGridMod.spec.hexToPixel === 'function', 'HexGrid loaded');
ok(typeof RendererMod.spec.hexToPixel === 'function', 'BoardRenderer loaded');
ok(typeof BuilderMod.spec.hexDistance === 'function', 'BoardBuilder loaded');

// Plain objects as containers: no document, no DOM.
const grid = new HexGridMod.Class({ style: {} }, { style: {} }, { hexSize: 80 });

/** Every hex within `n` of the origin. */
function disc(n) {
    const out = [];
    for (let q = -n; q <= n; q++) {
        for (let r = Math.max(-n, -q - n); r <= Math.min(n, -q + n); r++) out.push({ q, r });
    }
    return out;
}

// ============ HexGrid's own geometry =========================================
// --- axial <-> pixel round-trip ---------------------------------------------
same(grid.hexToPixel(0, 0), { x: 0, y: 0 }, 'the origin hex sits at the pixel origin');

let roundTripBad = [];
for (const { q, r } of disc(12)) {
    const p = grid.hexToPixel(q, r);
    const back = grid.pixelToHex(p.x, p.y);
    if (back.q !== q || back.r !== r) roundTripBad.push(`${q},${r} -> ${back.q},${back.r}`);
}
ok(roundTripBad.length === 0,
    'pixelToHex inverts hexToPixel across the whole disc ('
    + roundTripBad.length + ' bad: ' + roundTripBad.slice(0, 3).join(' ') + ')');

// A point nudged well inside a hex still resolves to that hex.
let nudgeBad = 0;
for (const { q, r } of disc(6)) {
    const p = grid.hexToPixel(q, r);
    for (const [dx, dy] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) {
        const back = grid.pixelToHex(p.x + dx, p.y + dy);
        if (back.q !== q || back.r !== r) nudgeBad++;
    }
}
ok(nudgeBad === 0, 'a click a few pixels off centre still lands on the same hex (' + nudgeBad + ' missed)');

// --- cube rounding -----------------------------------------------------------
same(grid.hexRound(0.2, -0.1), { q: 0, r: 0 }, 'a near-origin fraction rounds to the origin');
let cubeBad = 0;
for (let i = 0; i < 200; i++) {
    const q = ((i * 37) % 101) / 10 - 5, r = ((i * 53) % 97) / 10 - 5;
    const rounded = grid.hexRound(q, r);
    // The defining property: the rounded triple is still a valid cube coord.
    if (!Number.isInteger(rounded.q) || !Number.isInteger(rounded.r)) cubeBad++;
    if (Math.abs(rounded.q - q) > 1 || Math.abs(rounded.r - r) > 1) cubeBad++;
}
ok(cubeBad === 0, 'rounding always yields integers within one step of the input (' + cubeBad + ' bad)');

// --- neighbours and distance -------------------------------------------------
ok(grid.getNeighbors(0, 0).length === 6, 'a hex has six neighbours');
const neighboursAtOne = grid.getNeighbors(3, -2)
    .every(n => grid.hexDistance(3, -2, n.q, n.r) === 1);
ok(neighboursAtOne, 'every neighbour is exactly one step away');
same(grid.getNeighbors(0, 0).map(n => `${n.q},${n.r}`),
    ['0,-1', '1,-1', '1,0', '0,1', '-1,1', '-1,0'],
    'neighbours come back in the documented NW/NE/E/SE/SW/W order');

ok(grid.hexDistance(0, 0, 0, 0) === 0, 'a hex is zero steps from itself');
ok(grid.hexDistance(0, 0, 3, 0) === 3, 'three steps east is distance three');
let symBad = 0;
for (const a of disc(4)) {
    for (const b of disc(4)) {
        if (grid.hexDistance(a.q, a.r, b.q, b.r) !== grid.hexDistance(b.q, b.r, a.q, a.r)) symBad++;
    }
}
ok(symBad === 0, 'distance is symmetric (' + symBad + ' asymmetric pairs)');

// --- range -------------------------------------------------------------------
for (const n of [0, 1, 2, 3, 5]) {
    const inRange = grid.getHexesInRange(0, 0, n);
    const expected = 3 * n * (n + 1) + 1;   // centred hexagonal number
    ok(inRange.length === expected,
        `range ${n} covers ${expected} hexes, got ${inRange.length}`);
    ok(inRange.every(h => grid.hexDistance(0, 0, h.q, h.r) <= n),
        `nothing in range ${n} is further than ${n} away`);
}
ok(grid.getHexesInRange(4, -7, 2).some(h => h.q === 4 && h.r === -7),
    'the range includes the centre hex itself');

// --- zoom clamp --------------------------------------------------------------
grid.setZoom(1.0);
ok(grid.currentZoom === 1, 'zoom sets to a value inside the range');
grid.setZoom(99);
ok(grid.currentZoom === grid.maxZoom, 'zoom clamps at maxZoom (the readout cap depends on this)');
grid.setZoom(-5);
ok(grid.currentZoom === grid.minZoom, 'and at minZoom');
grid.setZoom(1.45); grid.zoomIn();
ok(grid.currentZoom === grid.maxZoom, 'zooming in past the top clamps rather than overshooting');
grid.setZoom(0.55); grid.zoomOut();
ok(grid.currentZoom === grid.minZoom, 'and zooming out past the bottom');
grid.zoomFit();
ok(grid.currentZoom === 1, 'zoomFit returns to 1');

// --- the BFS -----------------------------------------------------------------
const openWater = () => true;
let res = grid.getReachableHexes(0, 0, 2, openWater);
ok(res.distances.get('0,0') === 0, 'the start hex is recorded at distance 0');
ok(res.distances.size === 3 * 2 * (2 + 1) + 1,
    'an unobstructed 2-step search reaches the whole radius-2 disc, got ' + res.distances.size);
let distBad = 0;
for (const [key, d] of res.distances) {
    const [q, r] = key.split(',').map(Number);
    if (d !== grid.hexDistance(0, 0, q, r)) distBad++;
}
ok(distBad === 0, 'every BFS distance equals the true hex distance (' + distBad + ' wrong)');

// A wall of impassable hexes blocks the search.
const wall = new Set(['1,0', '0,1', '-1,1', '-1,0', '0,-1', '1,-1']);
res = grid.getReachableHexes(0, 0, 5, (q, r) => !wall.has(`${q},${r}`));
ok(res.distances.size === 1, 'a ring of blocked hexes traps the search on its start hex');

// Paths reconstruct back to the start.
res = grid.getReachableHexes(0, 0, 4, openWater);
const pathTo = grid.reconstructPath(res.parents, 2, 0);
ok(pathTo.length === 3, 'the path to a hex 2 away has 3 entries including both ends');
same(pathTo[0], { q: 0, r: 0 }, 'the path starts at the start hex');
same(pathTo[pathTo.length - 1], { q: 2, r: 0 }, 'and ends at the target');
let stepBad = 0;
for (let i = 1; i < pathTo.length; i++) {
    if (grid.hexDistance(pathTo[i - 1].q, pathTo[i - 1].r, pathTo[i].q, pathTo[i].r) !== 1) stepBad++;
}
ok(stepBad === 0, 'each path step moves exactly one hex');
same(grid.reconstructPath(res.parents, 99, 99), [], 'an unreachable target has no path');

// ============ the duplicated copies agree ====================================
// --- hexDistance: HexGrid vs BoardBuilder vs HexUtils.php --------------------
// Resolve the interpreter ONCE, then let any script error surface as itself —
// retrying the same failing code against the next binary just reports a
// confusing "no php found" for what is really a broken query.
const PHP_BIN = (() => {
    const candidates = [process.env.PHP, 'php', '/opt/homebrew/bin/php',
        '/usr/local/bin/php', '/usr/bin/php'].filter(Boolean);
    for (const bin of candidates) {
        try {
            execFileSync(bin, ['-r', 'echo 1;'], { encoding: 'utf8', stdio: 'pipe' });
            return bin;
        } catch (e) { /* try the next one */ }
    }
    throw new Error('no php found; set PHP=/path/to/php');
})();

function runPhp(code) {
    return JSON.parse(execFileSync(PHP_BIN, ['-r', code], { encoding: 'utf8' }));
}

const pairs = [];
for (const a of disc(4)) for (const b of disc(4)) pairs.push([a.q, a.r, b.q, b.r]);

// HexUtils sits in the global namespace; HexPathfinder below is namespaced.
const phpDistances = runPhp(
    'require_once "' + path.join(__dirname, '..', 'modules/php/HexUtils.php') + '";'
    + '$out = []; $pairs = json_decode(\'' + JSON.stringify(pairs) + '\', true);'
    + 'foreach ($pairs as $p) { $out[] = \\HexUtils::hexDistance($p[0], $p[1], $p[2], $p[3]); }'
    + 'echo json_encode($out);');

const builderThis = Object.assign({}, BuilderMod.spec);
let gridVsBuilder = 0, gridVsPhp = 0;
pairs.forEach((p, i) => {
    const g = grid.hexDistance(p[0], p[1], p[2], p[3]);
    if (g !== builderThis.hexDistance(p[0], p[1], p[2], p[3])) gridVsBuilder++;
    if (g !== phpDistances[i]) gridVsPhp++;
});
ok(phpDistances.length === pairs.length, 'PHP returned a distance for every pair');
ok(gridVsBuilder === 0,
    'HexGrid and BoardBuilder agree on hexDistance over ' + pairs.length
    + ' pairs (' + gridVsBuilder + ' differ)');
ok(gridVsPhp === 0,
    'HexGrid and HexUtils.php agree on hexDistance over ' + pairs.length
    + ' pairs (' + gridVsPhp + ' differ)');

// --- hexToPixel: HexGrid vs BoardRenderer ------------------------------------
// The two are written differently — HexGrid derives from a hex "size", the
// renderer multiplies out stored pixel dimensions — but they are the same
// formula whenever the dimensions hold the pointy-top ratio the constructor
// enforces (width = sqrt(3) * size, height = 2 * size). Feed both those exact
// dimensions and they must land on identical pixels.
// The dimensions go on LAST: the spec carries its own hexWidth/hexHeight
// defaults (60/69) and would otherwise overwrite them.
const rendererThis = Object.assign({}, RendererMod.spec, {
    hexWidth: grid.hexWidth,
    hexHeight: grid.hexHeight,
});

let pixelBad = [];
for (const { q, r } of disc(10)) {
    const a = grid.hexToPixel(q, r);
    const b = rendererThis.hexToPixel(q, r);
    if (Math.abs(a.x - b.x) > 1e-9 || Math.abs(a.y - b.y) > 1e-9) {
        pixelBad.push(`${q},${r}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    }
}
ok(pixelBad.length === 0,
    'HexGrid and BoardRenderer place hexes identically given the same dimensions ('
    + pixelBad.length + ' differ: ' + pixelBad.slice(0, 2).join('; ') + ')');

let invBad = 0;
for (const { q, r } of disc(8)) {
    const p = rendererThis.hexToPixel(q, r);
    const back = rendererThis.pixelToHex(p.x, p.y);
    if (back.q !== q || back.r !== r) invBad++;
}
ok(invBad === 0, "BoardRenderer's own pixelToHex inverts its hexToPixel (" + invBad + ' bad)');

// --- directions: HexGrid vs HexPathfinder.php --------------------------------
// The server walks the board with its own copy of the six axial directions.
// If the two orders or vectors ever diverge, client highlighting and server
// legality quietly describe different boards.
const phpDirs = runPhp(
    'require_once "' + path.join(__dirname, '..', 'modules/php/HexPathfinder.php') + '";'
    + '$c = (new ReflectionClass("Bga\\\\Games\\\\theoracleofdelphi\\\\HexPathfinder"))'
    + '->getConstants(); echo json_encode($c["DIRECTIONS"]);');
same(grid.directions.map(d => [d.q, d.r]), phpDirs,
    'HexGrid and HexPathfinder.php use the same six directions, in the same order');

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
