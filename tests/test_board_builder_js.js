/**
 * Smoke test for BoardBuilder.js landscape-bias helpers.
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

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail === 0 ? 0 : 1);
