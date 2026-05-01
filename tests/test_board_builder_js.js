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

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail === 0 ? 0 : 1);
