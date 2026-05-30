/**
 * Unit test for LogTokens.js (pure type+id -> inline log image HTML).
 * Run: node tests/test_log_tokens_js.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); pass++; }
    else      { console.log('  FAIL: ' + msg); fail++; }
}

const sandbox = { console, captured: null, define(_d, f) { sandbox.captured = f(); } };
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'modules', 'js', 'LogTokens.js'), 'utf8'),
    sandbox
);
const LT = sandbox.captured;
const r = function (p) { return 'TURL/' + p; }; // stub theme-img resolver

ok(LT !== null, 'LogTokens module loaded');

// path()
ok(LT.path('equipment', 3) === 'img/equipment/card-003.jpg', "path equipment 3 -> card-003.jpg");
ok(LT.path('equipment', '21') === 'img/equipment/card-021.jpg', "path equipment '21' -> card-021.jpg");
ok(LT.path('god', 'Hermes') === 'img/gods/hermes.png', "path god Hermes -> gods/hermes.png (lowercased)");
ok(LT.path('unknown', 1) === null, "path unknown type -> null");
ok(LT.path('equipment', '') === null, "path empty id -> null");

// html()
const h = LT.html('equipment', 3, 'Island Scout', 7, r);
ok(h.indexOf('class="log-tok"') >= 0, 'html has log-tok wrapper class');
ok(h.indexOf('id="logtok_7"') >= 0, 'html has unique id logtok_7');
ok(h.indexOf('data-tt="equipment:3"') >= 0, 'html has data-tt equipment:3');
ok(h.indexOf('log-tok-equipment') >= 0, 'html img has type class log-tok-equipment');
ok(h.indexOf('src="TURL/img/equipment/card-003.jpg"') >= 0, 'html img src resolved via resolver');
ok(h.indexOf('alt="Island Scout"') >= 0, 'html img has alt label');

const hg = LT.html('god', 'hermes', 'Hermes', 8, r);
ok(hg.indexOf('data-tt="god:hermes"') >= 0, 'god html data-tt god:hermes');
ok(hg.indexOf('src="TURL/img/gods/hermes.png"') >= 0, 'god html src gods/hermes.png');

// C2 simple-type paths
ok(LT.path('monster', 'cyclops') === 'img/monsters/cyclops-tile.png', "path monster -> {type}-tile.png");
ok(LT.path('injury', 'Pink') === 'img/injury/pink.jpg', "path injury -> lowercased color .jpg");
ok(LT.path('shiptile', 4) === 'img/ship-tiles/ship-4.jpg', "path shiptile -> ship-N.jpg");
ok(LT.path('favor', 1) === 'img/pieces/favor-token.jpg', "path favor -> favor-token.jpg (id ignored)");
ok(LT.path('titan', 1) === 'img/pieces/titan.jpg', "path titan -> titan.jpg (id ignored)");
ok(LT.path('dieface', 3) === 'img/pieces/die-face-3.jpg', "path dieface -> die-face-N.jpg");
ok(LT.path('offering', 'Yellow') === 'img/pieces/yellow-offering.png', "path offering -> {color}-offering.png");
ok(LT.path('statue', 'green') === 'img/pieces/green-statue.png', "path statue -> {color}-statue.png");
ok(LT.path('ship', 'red') === 'img/pieces/red-ship.png', "path ship -> {color}-ship.png");
ok(LT.path('shield', 'blue') === 'img/pieces/blue-shield.png', "path shield -> {color}-shield.png");
ok(LT.html('monster', 'hydra', 'Hydra', 9, r).indexOf('data-tt="monster:hydra"') >= 0, 'monster html data-tt');
ok(LT.html('favor', 1, 'favor', 9, r).indexOf('src="TURL/img/pieces/favor-token.jpg"') >= 0, 'favor html src');

// htmlSrc (composite ids, explicit src) for zeus tiles
var hz = LT.htmlSrc('zeustile', '5:shrine:phi', 'Zeus tile', 3, 'URL/img/zeus-tiles/shrines/red-player-phi.jpg');
ok(hz.indexOf('data-tt="zeustile:5:shrine:phi"') >= 0, 'htmlSrc keeps composite data-tt');
ok(hz.indexOf('log-tok-zeustile') >= 0, 'htmlSrc applies type class');
ok(hz.indexOf('src="URL/img/zeus-tiles/shrines/red-player-phi.jpg"') >= 0, 'htmlSrc uses explicit src');
ok(hz.indexOf('alt="Zeus tile"') >= 0, 'htmlSrc sets alt');

// unknown type -> null (caller falls back to raw value)
ok(LT.html('unknown', 1, 'x', 1, r) === null, 'html unknown type -> null');

// alt quote escaping
ok(LT.html('equipment', 1, 'A "B"', 1, r).indexOf('&quot;') >= 0, 'alt double-quotes escaped');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
