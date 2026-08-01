/**
 * Smoke test for BoardBuilder.js landscape-bias helpers, plus the ported
 * artificial-shallows cap.
 *
 * This builder does not generate boards for real games (the server's
 * BoardGenerator.php does), but the shallows cap is mirrored here so the
 * reference implementation stays truthful. The last check reads the cap straight
 * out of the PHP so the two constants cannot silently drift apart.
 * Run: node tests/test_board_builder_js.js
 *
 * Loads BoardBuilder.js by stubbing Dojo's define() so the file's exported class
 * is captured in a regular Node.js context.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0;
let fail = 0;
function assertTrue(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); pass++; }
    else      { console.log('  FAIL: ' + msg); fail++; }
}

// Build a sandbox with stubbed Dojo
const sandbox = {
    console,
    capturedClass: null,
    define(_deps, factory) {
        // Stub declare(): just pass through the second argument as the class spec
        const stubDojo = {};
        const stubDeclare = (_parent, spec) => {
            // Build a constructable wrapper that runs the spec's constructor + carries methods
            return function(...args) {
                Object.assign(this, spec);
                if (typeof spec.constructor === 'function') {
                    spec.constructor.apply(this, args);
                }
            };
        };
        sandbox.capturedClass = factory(stubDojo, stubDeclare);
    },
};
vm.createContext(sandbox);
const filePath = path.join(__dirname, '..', 'modules', 'js', 'BoardBuilder.js');
vm.runInContext(fs.readFileSync(filePath, 'utf8'), sandbox);

const BoardBuilder = sandbox.capturedClass;
assertTrue(BoardBuilder !== null, 'BoardBuilder class loaded');

// Stub a minimal ClusterDefinitions so the constructor doesn't blow up
const stubDefs = {
    DIRECTION_LIST: [],
    getWorldHexes: () => [],
    getRotatedHexes: () => [],
    getCityClusters: () => [],
    getClustersBySize: () => [],
    getCluster: () => null,
};
const builder = new BoardBuilder(stubDefs);

// Test projectHexToPixel
const origin = builder.projectHexToPixel(0, 0);
assertTrue(origin.x === 0 && origin.y === 0, 'projectHexToPixel(0, 0) returns (0, 0)');

const right = builder.projectHexToPixel(1, 0);
assertTrue(right.x === 60 && right.y === 0, 'projectHexToPixel(1, 0) returns (60, 0)');

const down = builder.projectHexToPixel(0, 1);
assertTrue(Math.abs(down.x - 30) < 1e-9 && Math.abs(down.y - 51.75) < 1e-9,
           'projectHexToPixel(0, 1) returns (30, 51.75)');

// computePixelBoundsForHexes
const empty = builder.computePixelBoundsForHexes([]);
assertTrue(empty === null, 'computePixelBoundsForHexes([]) returns null');

const single = builder.computePixelBoundsForHexes([{q: 0, r: 0}]);
assertTrue(single.minX === 0 && single.maxX === 60 && single.minY === 0 && single.maxY === 69,
           'single hex at (0,0) yields bounds (0, 60, 0, 69)');

// scoreCandidate — verify ordering, not exact values (jitter)
// Stub getWorldHexes to return predictable hexes for the candidate
const candidateCluster = { id: 'test-1', hexes: [{dq: 0, dr: 0, type: 'water'}] };
builder.clusterDefs.getWorldHexes = (cluster, q, r, _rot) => [{q, r, type: 'water'}];

const perfectBounds = {minX: 0, maxX: 1500, minY: 0, maxY: 1000};  // ratio 1.5
const candidateInside = {q: 0, r: 0, rotation: 0};                 // stays near 1.5
const candidateBelow = {q: 0, r: 30, rotation: 0};                 // adds height

let scoreInside = 0, scoreBelow = 0;
// Average over many runs to wash out jitter
for (let i = 0; i < 50; i++) {
    scoreInside += builder.scoreCandidate(candidateInside, candidateCluster, perfectBounds);
    scoreBelow  += builder.scoreCandidate(candidateBelow,  candidateCluster, perfectBounds);
}
assertTrue(scoreInside > scoreBelow,
           'candidate keeping board landscape outscores candidate that grows height (avg of 50)');

// Edge case: height 0
const zeroHeight = {minX: 0, maxX: 1500, minY: 0, maxY: 0};
const degScore = builder.scoreCandidate(candidateInside, candidateCluster, zeroHeight);
assertTrue(Number.isFinite(degScore), 'scoreCandidate handles height=0 without NaN/Inf');

// Wiring: with bias on and a stack of >=2, candidates should be sorted by score
// We test this indirectly by confirming the function doesn't crash when bias is active.
builder.landscapeBias = true;
builder.occupiedHexes = new Map([['0,0', {q:0,r:0,type:'water'}], ['1,0', {q:1,r:0,type:'water'}]]);
builder.waterHexes = new Set(['0,0', '1,0']);
builder.clusterDefs.getWorldHexes = (_c, q, r, _rot) => [{q, r, type: 'water'}];
builder.clusterDefs.getRotatedHexes = (_c, _rot) => [{dq: 0, dr: 0, type: 'water'}];
builder.clusterDefs.DIRECTION_LIST = [
    {dq:1,dr:0},{dq:-1,dr:0},{dq:0,dr:1},{dq:0,dr:-1},{dq:1,dr:-1},{dq:-1,dr:1}
];

const stackOf2 = [{clusterIndex:0}, {clusterIndex:1}];
const cluster = { id:'test', hexes:[{dq:0,dr:0,type:'water'}] };
const placement = builder.findPlacementWithHistory(cluster, stackOf2);
assertTrue(placement !== undefined, 'findPlacementWithHistory returns a value when bias active');

// ---------------------------------------------------------------------------
// largestShallowsPatch — ported from HexUtils (PHP is authoritative).
// Geometry is hand-built here so each expected answer is obvious by inspection.
// ---------------------------------------------------------------------------
const REAL_DIRS = [
    { dq: 0, dr: -1 }, { dq: 1, dr: -1 }, { dq: 1, dr: 0 },
    { dq: 0, dr: 1 }, { dq: -1, dr: 1 }, { dq: -1, dr: 0 },
];
function patchOf(keys) {
    const host = new BoardBuilder({ ...stubDefs, DIRECTION_LIST: REAL_DIRS });
    host.occupiedHexes = new Map(keys.map(k => [k, true]));
    return host.largestShallowsPatch();
}

assertTrue(patchOf([]) === 0, 'empty board has no shallows patch');

// A single hex ringed by its six neighbours: one enclosed hole.
const ring = ['1,-1', '2,-1', '2,0', '1,1', '0,1', '0,0'];
assertTrue(patchOf(ring) === 1, 'a single walled-in hole measures 1');

// An open line encloses nothing.
assertTrue(patchOf(['0,0', '1,0', '2,0', '3,0']) === 0, 'an open line encloses nothing');

// Two holes side by side inside one wall form a single 2-hex patch. The wall is
// every neighbour of both holes, so neither can reach the ocean.
const twoHoles = ['1,0', '2,0'];
const wall = new Set();
for (const h of twoHoles) {
    const [q, r] = h.split(',').map(Number);
    for (const d of REAL_DIRS) wall.add((q + d.dq) + ',' + (r + d.dr));
}
for (const h of twoHoles) wall.delete(h);
assertTrue(patchOf([...wall]) === 2, 'two adjacent holes form one patch of 2');

// The cap must be read from the same place the server uses, so a change to one
// side cannot leave the other behind.
const phpSrc = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'php', 'BoardGenerator.php'), 'utf8');
const phpCap = phpSrc.match(/MAX_SHALLOWS_AREA\s*=\s*(\d+)/);
assertTrue(!!phpCap, 'found MAX_SHALLOWS_AREA in BoardGenerator.php');
assertTrue(phpCap && Number(phpCap[1]) === builder.MAX_SHALLOWS_AREA,
    'JS shallows cap (' + builder.MAX_SHALLOWS_AREA + ') matches PHP ('
    + (phpCap ? phpCap[1] : '?') + ')');

// Same drift risk for the aspect target. The server is authoritative, so a value
// that disagrees here would make this builder model a board the real game never
// produces.
const phpSpacious = phpSrc.match(/ASPECT_SPACIOUS\s*=\s*([\d.]+)/);
assertTrue(!!phpSpacious, 'found ASPECT_SPACIOUS in BoardGenerator.php');
assertTrue(phpSpacious && Number(phpSpacious[1]) === builder.ASPECT_SPACIOUS,
    'JS spacious (' + builder.ASPECT_SPACIOUS + ') matches PHP ('
    + (phpSpacious ? phpSpacious[1] : '?') + ')');
assertTrue(builder.TARGET_ASPECT_RATIO === builder.ASPECT_SPACIOUS,
    'the JS default target is spacious');
// Compact is a SELECTION policy on the server, not a scoring change, so this
// builder must not sprout a rival aspect preset for it.
assertTrue(builder.ASPECT_COMPACT === undefined,
    'the builder carries no compact aspect preset, since compact is a selection');
assertTrue(/generateMostCompact/.test(phpSrc),
    'the server implements compact as generateMostCompact()');
// And the constructor option must actually take.
const compactBuilder = new BoardBuilder(stubDefs, { targetAspectRatio: 1.0 });
assertTrue(compactBuilder.TARGET_ASPECT_RATIO === 1.0,
    'targetAspectRatio can be set via constructor options');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail === 0 ? 0 : 1);
