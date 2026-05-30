/**
 * Unit test for LogGlyphs.js (pure colour-token -> die-glyph HTML).
 * Run: node tests/test_log_glyphs_js.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); pass++; }
    else      { console.log('  FAIL: ' + msg); fail++; }
}

// Load LogGlyphs.js by stubbing dojo's define()
const sandbox = {
    console,
    captured: null,
    define(_deps, factory) { sandbox.captured = factory(); },
};
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'modules', 'js', 'LogGlyphs.js'), 'utf8'),
    sandbox
);
const LG = sandbox.captured;
const L = { red:'Red', yellow:'Yellow', green:'Green', blue:'Blue',
            pink:'Pink', black:'Black', wild:'Wild' };

ok(LG !== null, 'LogGlyphs module loaded');

// glyph() on a known token
const g = LG.glyph('green', L);
ok(g.indexOf('log-die') >= 0 && g.indexOf('die-color-green') >= 0,
   "glyph('green') has log-die + die-color-green classes");
ok(g.indexOf('aria-label="Green"') >= 0, "glyph('green') has aria-label Green");
ok(g.indexOf('title="Green"') >= 0, "glyph('green') has title Green");
ok(g.indexOf('role="img"') >= 0, "glyph('green') has role=img");

// Capitalised input normalises
ok(LG.glyph('Red', L).indexOf('die-color-red') >= 0,
   "glyph('Red') normalises to die-color-red");

// Unknown colour -> fallback unchanged
ok(LG.glyph('purple', L) === 'purple', "glyph('purple') falls back unchanged");

// Empty / null pass through
ok(LG.glyph('', L) === '', "glyph('') returns ''");
ok(LG.glyph(null, L) === null, "glyph(null) returns null");

// glyphList()
const list = LG.glyphList('green, red, green', L);
ok((list.match(/log-die/g) || []).length === 3, "glyphList builds 3 glyphs");
ok(list.indexOf('die-color-red') >= 0, 'glyphList includes red');

// Idempotency: glyph of an already-built glyph is unchanged
ok(LG.glyph(LG.glyph('green', L), L) === LG.glyph('green', L),
   'glyph() is idempotent on built HTML');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
