/**
 * Unit test for DeliveryRelations.js (pure related-island computation for the
 * delivery-locations hover highlight).
 * Run: node tests/test_delivery_relations_js.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(cond, msg) {
    if (cond) { pass++; }
    else { console.log('  FAIL: ' + msg); fail++; }
}
// order-insensitive compare of [{q,r,color}]
function sameSet(a, b, msg) {
    var norm = function (l) {
        return l.map(function (e) { return e.q + ',' + e.r + ',' + e.color; }).sort().join('|');
    };
    ok(norm(a) === norm(b), msg + '  (got ' + norm(a) + ' want ' + norm(b) + ')');
}

const sandbox = { console, captured: null, define(_d, f) { sandbox.captured = f(); } };
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'modules', 'js', 'DeliveryRelations.js'), 'utf8'),
    sandbox
);
const DR = sandbox.captured;
ok(DR && typeof DR.relatedIslands === 'function', 'DeliveryRelations module loaded');

// --- Board fixture ---
//  offering island (1,1) -> blue ;  offering island (1,3) -> green
//  temples: blue (5,0), red (5,2), green (5,4)
//  city (0,5) holds available red + blue statues
//  statue island A (3,2) accepts [red,blue] ; B (3,4) accepts [green,yellow]
const ctxBase = {
    offeringsOnBoard: [{ q: 1, r: 1, color: 'blue' }, { q: 1, r: 3, color: 'green' }],
    temples: [{ q: 5, r: 0, color: 'blue' }, { q: 5, r: 2, color: 'red' }, { q: 5, r: 4, color: 'green' }],
    statueIslands: [{ q: 3, r: 2, colors: ['red', 'blue'] }, { q: 3, r: 4, colors: ['green', 'yellow'] }],
    citiesStatues: [{ q: 0, r: 5, color: 'red' }, { q: 0, r: 5, color: 'blue' }]
};
function ctx(attribute) { return Object.assign({ attribute: attribute }, ctxBase); }

// 1. offering island -> its color's temple
sameSet(DR.relatedIslands({ q: 1, r: 1 }, ctx('offering')),
    [{ q: 5, r: 0, color: 'blue' }], 'offering(blue) -> blue temple');

// 2. temple -> islands still holding that color
sameSet(DR.relatedIslands({ q: 5, r: 0 }, ctx('temple')),
    [{ q: 1, r: 1, color: 'blue' }], 'blue temple -> blue offering island');

// 3. temple with no matching offerings on board -> none
sameSet(DR.relatedIslands({ q: 5, r: 2 }, ctx('temple')),
    [], 'red temple -> none (no red offerings on board)');

// 4. city -> statue islands accepting its statue colors (multi-color, same partner)
sameSet(DR.relatedIslands({ q: 0, r: 5 }, ctx('city')),
    [{ q: 3, r: 2, color: 'red' }, { q: 3, r: 2, color: 'blue' }],
    'city(red,blue) -> statue island A twice (red + blue)');

// 5. statue island -> cities holding statues it accepts
sameSet(DR.relatedIslands({ q: 3, r: 2 }, ctx('statue')),
    [{ q: 0, r: 5, color: 'red' }, { q: 0, r: 5, color: 'blue' }],
    'statue island A(red,blue) -> city (red + blue)');

// 6. statue island whose accepted colors are absent in any city -> none
sameSet(DR.relatedIslands({ q: 3, r: 4 }, ctx('statue')),
    [], 'statue island B(green,yellow) -> none');

// 7. depleted: offering island whose tokens are gone -> none
sameSet(DR.relatedIslands({ q: 1, r: 1 },
    Object.assign(ctx('offering'), { offeringsOnBoard: [] })),
    [], 'depleted offering island -> none');

// 8. multi-color offering island lights each color's temple
sameSet(DR.relatedIslands({ q: 1, r: 1 },
    Object.assign(ctx('offering'), {
        offeringsOnBoard: [{ q: 1, r: 1, color: 'blue' }, { q: 1, r: 1, color: 'red' }]
    })),
    [{ q: 5, r: 0, color: 'blue' }, { q: 5, r: 2, color: 'red' }],
    'offering island with blue+red -> blue and red temples');

// 9. string coords (DB shape) are coerced
sameSet(DR.relatedIslands({ q: '1', r: '1' },
    Object.assign(ctx('offering'), {
        offeringsOnBoard: [{ q: '1', r: '1', color: 'blue' }],
        temples: [{ q: '5', r: '0', color: 'blue' }]
    })),
    [{ q: 5, r: 0, color: 'blue' }], 'string coords coerced to numbers');

// 10. non-participating attribute -> none
sameSet(DR.relatedIslands({ q: 1, r: 1 }, ctx('monster')),
    [], 'monster hex -> none');

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
