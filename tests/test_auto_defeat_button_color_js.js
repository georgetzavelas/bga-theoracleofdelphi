/**
 * Ares' two-monster confirm: the Defeat buttons must not be red.
 *
 * Red is this file's DISMISS colour — _addCancelButton is the only other
 * caller that passes it. The auto-defeat confirm passed it too, so a
 * two_monster lair rendered as three identical red buttons:
 *
 *     [Defeat Cyclops]  [Defeat Hydra]  [Cancel]
 *
 * two of which commit and one of which aborts. That dialog exists only
 * because a player clicked the wrong sprite on a shared hex, so making the
 * commit indistinguishable from the escape hatch defeated its whole purpose.
 *
 * Behavioural rather than a source grep on purpose. The fix left a comment
 * behind that contains both "red" and "color", so str_contains-style linting
 * would now pass on the comment alone no matter what the call does. This
 * drives the real _openAutoDefeatConfirm body against a recording statusBar
 * and asserts on the options object that actually reaches addActionButton.
 *
 * Asserted together, because the property that matters is RELATIVE: the
 * commit buttons and the cancel button must not look the same. A future
 * change that recoloured everything to one shade would satisfy "not red"
 * while restoring the original bug.
 *
 * Run: node tests/test_auto_defeat_button_color_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8');
const LINES = SRC.split('\n');

/** Game module methods are indented 8 spaces. */
function extractMethod(name) {
    const re = new RegExp('^        ' + name + ': (async )?function');
    const start = LINES.findIndex(l => re.test(l));
    if (start < 0) throw new Error('method not found: ' + name);
    let i = start;
    while (!/^        \},\s*$/.test(LINES[i])) {
        i++;
        if (i > start + 400) throw new Error('runaway extracting ' + name);
    }
    return LINES.slice(start, i + 1).join('\n');
}

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

// Both real bodies, in one object literal so the trailing `},` of each method
// lands where the parser expects it. _addCancelButton is included rather than
// stubbed because it IS the comparison case: a stub could disagree with the
// real one about the dismiss colour and hide the very collision under test.
const METHODS = ['_openAutoDefeatConfirm', '_addCancelButton']
    .map(extractMethod).join('\n');

/** Build a game-module stand-in whose statusBar records every button. */
function makeHarness() {
    const buttons = [];
    const self = new Function('_', `return { ${METHODS} };`)(s => s);
    Object.assign(self, {
        statusBar: {
            removeActionButtons: () => { buttons.length = 0; },
            setTitle: (t) => { self._title = t; },
            addActionButton: (label, handler, opts) => {
                const classes = [];
                const btn = {
                    label, handler, opts, icons: [], classes,
                    // Real enough that _addCancelButton's `if (btn.classList)`
                    // guard takes its true branch; a bare object would skip it.
                    classList: { add: (c) => classes.push(c) },
                };
                buttons.push(btn);
                return btn;
            },
        },
        _autoDefeatMonstersByHex: {},
        bgaPerformAction: (name, args) => { self._performed.push({ name, args }); },
        _prependActionIconToButton: (btn, icon) => { btn.icons.push(icon); },
        restoreServerGameState: () => { self._restored = true; },
        _performed: [],
        _restored: false,
        _buttons: buttons,
    });
    return self;
}

// ---- two monsters on one lair (the reported case) ---------------------------
const h = makeHarness();
const MONSTERS = [
    { id: 41, type: 'cyclops' },
    { id: 42, type: 'hydra' },
];
h._openAutoDefeatConfirm(MONSTERS);

const defeatBtns = h._buttons.filter(b => /Defeat (Cyclops|Hydra)/.test(b.label));
const cancelBtns = h._buttons.filter(b => b.label === 'Cancel');

check(defeatBtns.length === 2, 'one Defeat button per monster (got ' + defeatBtns.length + ')');
check(cancelBtns.length === 1, 'exactly one Cancel button');

/** A button is "red" if it asked for red; no opts means BGA's default. */
function colorOf(btn) { return (btn.opts && btn.opts.color) || null; }

defeatBtns.forEach(b => {
    check(colorOf(b) !== 'red', b.label + ' must not use the dismiss colour red');
});

// The relative property: commit and abort must differ. This is what actually
// broke, and it stays broken if someone flattens everything to one colour.
const cancelColor = colorOf(cancelBtns[0]);
check(cancelColor === 'red', 'Cancel still uses red (the established dismiss colour)');
defeatBtns.forEach(b => {
    check(colorOf(b) !== cancelColor,
        b.label + ' must be visually distinct from Cancel (both "' + cancelColor + '")');
});

// The portrait icon is what disambiguates the two monsters now that colour
// does not, so it is load-bearing rather than decorative. Guard it.
check(defeatBtns.some(b => b.icons.includes('monster-cyclops')), 'cyclops portrait icon attached');
check(defeatBtns.some(b => b.icons.includes('monster-hydra')), 'hydra portrait icon attached');

// Clicking a Defeat button still dispatches that monster's id, not the other's.
defeatBtns.find(b => /Cyclops/.test(b.label)).handler();
check(h._performed.length === 1
    && h._performed[0].name === 'actDefeatMonster'
    && h._performed[0].args.monster_id === 41,
    'Defeat Cyclops dispatches monster_id 41');

// Cancel routes back to the server state rather than committing anything.
cancelBtns[0].handler();
check(h._restored === true, 'Cancel restores the server game state');
check(h._performed.length === 1, 'Cancel dispatches no action');

// ---- red is still reserved for dismissal file-wide --------------------------
// Guards the premise the fix rests on. If red starts appearing on affirmative
// buttons elsewhere, "red means back out" stops being true and the reasoning
// above needs revisiting rather than silently rotting.
const stripped = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const redSites = stripped.split('\n').filter(l => /color:\s*'red'/.test(l)).length;
check(redSites === 2, 'red used on exactly 2 buttons, both dismissals (got ' + redSites + ')');

console.log((fail ? 'FAILED' : 'OK') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
