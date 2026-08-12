/**
 * The action-bar note that explains a refused offering.
 *
 * A real game had a player spend ten minutes recolouring a die seven times —
 * 2 Favor each, every one undone — trying to load a yellow offering sitting
 * beside their ship. No die colour would ever have worked: they were carrying a
 * blue offering, which had no Zeus tile of its own and so had already reserved
 * their only any-colour tile. The rules were right; the UI simply never said
 * why, and offered no affordance to explain.
 *
 * Drives the REAL _showOfferingLoadHint against a stub #generalactions, because
 * the things most likely to break are behavioural: not showing it to
 * non-active players, not leaving a stale note behind on the next args refresh,
 * and picking the right wording for the two different refusals.
 *
 * Run: node tests/test_offering_load_hint_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.js'), 'utf8');
const LINES = SRC.split('\n');

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

// --- stub DOM: just enough #generalactions to append/query/remove ---------
function makeBar() {
    const children = [];
    const bar = {
        children,
        appendChild: (el) => { el._parent = bar; children.push(el); return el; },
        querySelector: (sel) => {
            const cls = sel.replace(/^\./, '');
            return children.find(c => c._classes.has(cls)) || null;
        },
    };
    return bar;
}
function makeSpan() {
    const classes = new Set();
    const el = {
        _classes: classes,
        textContent: '',
        set className(v) { classes.clear(); String(v).split(' ').filter(Boolean).forEach(c => classes.add(c)); },
        get className() { return Array.from(classes).join(' '); },
        remove() { if (el._parent) { const i = el._parent.children.indexOf(el); if (i >= 0) el._parent.children.splice(i, 1); } },
    };
    return el;
}

function makeGame(opts) {
    opts = opts || {};
    const bar = makeBar();
    const game = new Function('document', 'dojo', '_',
        `return { ${extractMethod('_showOfferingLoadHint')} };`)(
        { getElementById: (id) => (id === 'generalactions' ? (opts.noBar ? null : bar) : null),
          createElement: () => makeSpan() },
        { string: { substitute: (t, o) => t.replace(/\$\{(\w+)\}/g, (_m, k) => o[k]) } },
        (s) => s,   // identity translator
    );
    game.isCurrentPlayerActive = () => opts.active !== false;
    return { game, bar, note: () => bar.children.find(c => c._classes.has('delphi-offering-load-hint')) };
}

const RESERVED = { reason: 'reserved', usefulColors: ['green', 'pink'] };
const USED = { reason: 'colorUsed', usefulColors: ['black'] };

// --- 1. the reported case ------------------------------------------------
{
    const h = makeGame();
    h.game._showOfferingLoadHint(RESERVED);
    const n = h.note();
    check(!!n, 'a note is shown when the server sends a hint');
    check(n._classes.has('delphi-status-message'),
          'it reuses the existing .delphi-status-message pattern rather than a new style');
    check(/any-colour/.test(n.textContent),
          'the reserved wording names the any-colour tile as the cause');
    check(/Green/.test(n.textContent) && /Pink/.test(n.textContent),
          'and lists the colours that would work (got: "' + n.textContent + '")');
    check(!/\$\{colors\}/.test(n.textContent), 'the placeholder is substituted');
}

// --- 2. the other refusal gets different wording -------------------------
{
    const h = makeGame();
    h.game._showOfferingLoadHint(USED);
    const t = h.note().textContent;
    check(/already spoken for/.test(t), 'colorUsed gets its own wording');
    check(!/any-colour/.test(t),
          'and does NOT blame the any-colour tile, which is not the cause here');
    check(/Black/.test(t), 'it still lists what would work');
}

// --- 3. no hint, no note ------------------------------------------------
{
    const h = makeGame();
    h.game._showOfferingLoadHint(null);
    check(!h.note(), 'no note when the server sends nothing');
}

// --- 4. stale notes are cleared -----------------------------------------
//     #generalactions is rebuilt by BGA between states, but a same-state args
//     refresh reuses it — so the method must clear its own previous node or the
//     player accumulates contradictory advice.
{
    const h = makeGame();
    h.game._showOfferingLoadHint(RESERVED);
    h.game._showOfferingLoadHint(RESERVED);
    const notes = h.bar.children.filter(c => c._classes.has('delphi-offering-load-hint'));
    check(notes.length === 1, 'repeated calls leave exactly one note (got ' + notes.length + ')');

    h.game._showOfferingLoadHint(null);
    check(!h.note(), 'and a later null clears the previous note');
}

// --- 5. active player only ----------------------------------------------
//     The facts are public (Zeus tiles and cargo both are), but a note phrased
//     as "your cargo" is nonsense on an opponent's screen.
{
    const h = makeGame({ active: false });
    h.game._showOfferingLoadHint(RESERVED);
    check(!h.note(), 'nothing is shown to a non-active player');
}

// --- 6. degenerate input doesn't produce a broken sentence ---------------
{
    const h = makeGame();
    h.game._showOfferingLoadHint({ reason: 'reserved', usefulColors: [] });
    check(!h.note(), 'an empty colour list shows nothing rather than a dangling sentence');
}
{
    const h = makeGame({ noBar: true });
    h.game._showOfferingLoadHint(RESERVED);   // must not throw
    check(true, 'a missing action bar is handled without throwing');
}

// --- 7. the server only sends the hint when it is meaningful -------------
//     Cross-checked against the PHP so the client's "no gating needed here"
//     comment cannot quietly become false.
{
    const php = fs.readFileSync(path.join(ROOT, 'modules', 'php', 'States', 'SelectAction.php'), 'utf8');
    const body = php.slice(php.indexOf('private function offeringLoadHint'));
    const end = body.indexOf('\n    }');
    const hint = body.slice(0, end);
    check(/playerStillNeedsCargoOfType/.test(hint),
          'server: silent once the player needs no more offerings');
    check(/reachableOfferings/.test(hint),
          'server: silent unless one is actually in reach — this is what keeps it '
          + 'from firing on every die');
    check(/wouldCompleteZeusTileForType/.test(hint),
          'server: silent when the colour IS loadable');
    check(/empty\(\$useful\)/.test(hint),
          'server: silent when nothing at all is loadable, since naming an empty '
          + 'list would read as a bug');
    check(/offeringLoadHint' => \$canLoad/.test(php),
          'server: gated on $canLoad, so a full hold is not misreported as a '
          + 'colour problem');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
