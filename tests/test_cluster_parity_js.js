/**
 * Cross-language parity for the cluster definitions.
 *
 * ClusterDefinitions.php opens with "Direct port of ClusterDefinitions.js" —
 * two hand-maintained copies of the same board geometry. The server generates
 * the board from the PHP copy and the client draws it from the JS copy, so if
 * they drift the player is looking at a board that is not the one the server
 * believes in: a hex is water on screen and island in the DB, or a shrine sits
 * one hex over. Nothing else in the suite compares them, and a port like this
 * only drifts when someone edits one side.
 *
 * The two are driven rather than read: this runs the real methods on both
 * sides over every cluster, so a divergence in the rotation maths is caught as
 * well as a divergence in the data.
 *
 * Two deliberate normalisations, both formatting rather than behaviour:
 *   - PHP writes 'color' => null on shrine hexes where JS omits the key, so a
 *     missing value and null are treated as the same thing.
 *   - PHP's getWorldHexes carries explorationColor through and JS's drops it,
 *     so placed hexes are compared on the five keys both emit. The shrine
 *     colours themselves are still compared, at the definition level.
 *
 * Run: node tests/test_cluster_parity_js.js
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
    ok(g === w, g === w ? msg : msg + '\n     php: ' + w + '\n     js:  ' + g);
}

// --- the JS copy, loaded through the usual Dojo stubs -----------------------
const sandbox = {
    console,
    capturedClass: null,
    define(_deps, factory) {
        const stubDeclare = (_parent, spec) => function (...args) {
            Object.assign(this, spec);
            if (typeof spec.constructor === 'function') spec.constructor.apply(this, args);
        };
        sandbox.capturedClass = factory({}, stubDeclare);
    },
};
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'modules', 'js', 'ClusterDefinitions.js'), 'utf8'),
    sandbox);
const defs = new sandbox.capturedClass();
ok(typeof defs.getWorldHexes === 'function', 'JS ClusterDefinitions loaded');

// --- the PHP copy, via the dump script --------------------------------------
// Honour $PHP if set, else fall back through the usual install locations so
// this needs no configuration on a dev box or in CI.
function runDump() {
    const script = path.join(__dirname, 'dump_clusters.php');
    const candidates = [process.env.PHP, 'php', '/opt/homebrew/bin/php',
        '/usr/local/bin/php', '/usr/bin/php'].filter(Boolean);
    let lastErr;
    for (const bin of candidates) {
        try {
            return JSON.parse(execFileSync(bin, [script], { encoding: 'utf8' }));
        } catch (e) { lastErr = e; }
    }
    throw new Error('could not run dump_clusters.php with any of ['
        + candidates.join(', ') + ']: ' + lastErr.message);
}
const php = runDump();

// A silently empty dump would make every comparison below trivially true.
ok(php.ids.length === 18, 'PHP reported all 18 clusters, got ' + php.ids.length);

// --- which clusters exist ----------------------------------------------------
const jsIds = [3, 7, 9, 11]
    .flatMap(size => defs.getClustersBySize(size).map(c => c.id)).sort();
same(jsIds, php.ids, 'both sides define the same cluster ids');

// Ordered, not just set-equal: BoardGenerator picks from these lists by index
// under a seeded RNG, so a reordering changes which board a seed produces.
for (const [group, ids] of Object.entries(php.groups)) {
    const jsGroup = group === 'city' ? defs.getCityClusters()
        : group === 'island' ? defs.getIslandClusters()
            : defs.getClustersBySize(Number(group.replace('size', '')));
    same(jsGroup.map(c => c.id), ids, 'group "' + group + '" matches, in order');
}

// --- the definitions themselves ---------------------------------------------
function canonHex(h) {
    return {
        dq: h.dq, dr: h.dr,
        type: h.type ?? null,
        color: h.color ?? null,
        attribute: h.attribute ?? null,
        explorationColor: h.explorationColor ?? null,
    };
}
let hexCount = 0, shrineColors = 0;
for (const id of php.ids) {
    const jsC = defs.getCluster(id);
    if (!jsC) { ok(false, 'JS is missing cluster ' + id); continue; }
    const want = php.clusters[id];
    same({ id: jsC.id, size: jsC.size, color: jsC.color ?? null },
        { id: want.id, size: want.size, color: want.color },
        'cluster ' + id + ': id/size/colour match');
    same(jsC.hexes.map(canonHex), want.hexes,
        'cluster ' + id + ': hex layout matches hex-for-hex');
    hexCount += jsC.hexes.length;
    shrineColors += want.hexes.filter(h => h.explorationColor !== null).length;
}
ok(hexCount === 120, 'compared every hex across all clusters, got ' + hexCount);
ok(shrineColors === 12, 'the 12 shrine exploration colours were compared, got ' + shrineColors);

// --- the rotation maths ------------------------------------------------------
// Cube rotation over a small grid, including step counts outside 0-5 so the
// negative-modulo normalisation is exercised on both sides.
let rotBad = 0, rotFirst = '';
for (const [key, want] of Object.entries(php.rotate)) {
    const [dq, dr, steps] = key.split(',').map(Number);
    const got = defs.rotateHex(dq, dr, steps);
    if (got.dq !== want.dq || got.dr !== want.dr) {
        if (!rotBad) {
            rotFirst = ' first at (' + key + '): php ' + JSON.stringify(want)
                + ' vs js ' + JSON.stringify(got);
        }
        rotBad++;
    }
}
ok(rotBad === 0, 'rotateHex agrees across all ' + Object.keys(php.rotate).length
    + ' cases (' + rotBad + ' differ)' + rotFirst);

// --- placed clusters ---------------------------------------------------------
function canonWorld(h) {
    return {
        q: h.q, r: h.r,
        type: h.type ?? null,
        color: h.color ?? null,
        attribute: h.attribute ?? null,
    };
}
let worldBad = 0, worldFirst = '';
for (const [key, want] of Object.entries(php.world)) {
    const [id, aq, ar, rot] = key.split('|');
    const got = defs.getWorldHexes(defs.getCluster(id), Number(aq), Number(ar), Number(rot))
        .map(canonWorld);
    if (JSON.stringify(got) !== JSON.stringify(want)) {
        if (!worldBad) {
            worldFirst = '\n     first at ' + key + '\n     php: ' + JSON.stringify(want)
                + '\n     js:  ' + JSON.stringify(got);
        }
        worldBad++;
    }
}
ok(worldBad === 0, 'getWorldHexes agrees across all ' + Object.keys(php.world).length
    + ' placements (' + worldBad + ' differ)' + worldFirst);

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
