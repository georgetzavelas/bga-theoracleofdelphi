/**
 * Verifies the real shipped setLoader() repairs a NaN log-history percentage
 * (which BGA renders as "(%NaN%)" and, because NaN comparisons are always
 * false, never lets its "progress >= 100" completion test pass) while leaving
 * genuine 0..100 progress untouched.
 *
 * Run: node tests/test_setloader_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const LINES = fs.readFileSync(
    path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8').split('\n');

function extractMethod(name) {
    const re = new RegExp('^        ' + name + ': function');
    let start = LINES.findIndex(l => re.test(l));
    if (start < 0) throw new Error('method not found: ' + name);
    let i = start;
    while (!/^        \},\s*$/.test(LINES[i])) i++;
    return LINES.slice(start, i + 1).join('\n');
}

const game = new Function(`return { ${extractMethod('setLoader')} };`)();
// Stand in for the dojo super call: record what the framework would receive.
let received = null;
game.inherited = function (args, newArgs) { received = newArgs; return newArgs; };

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

// The reported bug: NaN log progress.
game.setLoader(100, NaN);
check(received[1] === 100, `NaN log progress repaired, got ${received[1]}`);
check(isFinite(received[1]), 'repaired value is finite (so >= 100 can pass)');

// Other non-finite shapes BGA could hand us.
[undefined, null, 'abc', Infinity, -Infinity].forEach(v => {
    game.setLoader(50, v);
    check(received[1] === 100, `log progress ${String(v)} repaired, got ${received[1]}`);
});

// Real progress must pass straight through, so the bar still animates.
[0, 1, 37, 99, 100].forEach(v => {
    game.setLoader(v, v);
    check(received[0] === v && received[1] === v, `real progress ${v} passed through unchanged`);
});

// 0 must NOT be treated as missing (it is a legitimate "just started").
game.setLoader(0, 0);
check(received[1] === 0, 'log progress 0 is preserved, not forced to 100');

// A NaN image progress is the same stuck-overlay failure, so repair it too.
game.setLoader(NaN, 42);
check(received[0] === 100 && received[1] === 42, 'NaN image progress repaired without touching log progress');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
