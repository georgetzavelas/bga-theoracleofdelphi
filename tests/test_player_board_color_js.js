/**
 * Each player's board frame wears that player's colour.
 *
 * There is one piece of markup, _playerAreaTemplate(), and it renders three
 * times over: once as the live board for whoever is sitting here, and once per
 * opponent as a read-only scaled replica. Every copy carries the same
 * #delphi-player-board id — a duplicated id, deliberately, because the live
 * board precedes the replicas in the DOM so getElementById keeps hitting it
 * while replicas are reached by scoped querySelector inside
 * .delphi-opp-board[data-pid=...].
 *
 * That shared markup is exactly why the colour cannot live in the template: it
 * has to be stamped per copy, from the player that copy belongs to. Get that
 * wrong in the obvious way and every board on screen wears the LOCAL player's
 * colour, which looks right to whoever is testing it and wrong to everyone
 * else at the table.
 *
 * The colour name is not re-derived here. The hex-to-name mapping
 * ('dc3545' -> red, ...) already exists in six places in this codebase, and a
 * seventh copy is how the Reinforced Hull capacity bug happened: two copies of
 * one calculation drifted by a single argument and Hermes stopped working.
 * The live board reads getPlayerGameColor and replicas read
 * _gameColorForPlayer, both of which already existed.
 *
 * Run: node tests/test_player_board_color_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.css'), 'utf8');
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

// The four seats gameinfos.inc.php declares: dc3545, ffc107, 28a745, 007bff.
const COLORS = ['red', 'yellow', 'green', 'blue'];

// --- stub DOM: a root containing one #delphi-player-board -------------------
function makeRoot() {
    const classes = new Set();
    const frame = {
        classList: {
            add: (c) => classes.add(c),
            remove: (c) => classes.delete(c),
            contains: (c) => classes.has(c),
        },
        _classes: classes,
    };
    return {
        frame,
        querySelector: (sel) => (sel === '#delphi-player-board' ? frame : null),
    };
}
function makeEmptyRoot() {
    return { querySelector: () => null };
}

const METHODS = ['_applyPlayerBoardColor'].map(extractMethod).join('\n');

// PLAYER_BOARD_COLORS is a plain property, not a method, so it is read from
// source rather than copied — the test then asserts the SHIPPED list.
const SHIPPED_COLORS = (() => {
    const m = SRC.match(/PLAYER_BOARD_COLORS:\s*\[([^\]]*)\]/);
    if (!m) throw new Error('PLAYER_BOARD_COLORS not found');
    return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
})();

function makeGame() {
    const g = new Function('document', `return { ${METHODS} };`)(
        { getElementById: () => null });
    g.PLAYER_BOARD_COLORS = SHIPPED_COLORS;
    return g;
}

const applied = (root) => Array.from(root.frame._classes)
    .filter((c) => c.indexOf('player-board-') === 0);

// ============ 0. the shipped colour list ====================================
{
    check(SHIPPED_COLORS.length === COLORS.length
        && COLORS.every((c) => SHIPPED_COLORS.indexOf(c) >= 0),
        'PLAYER_BOARD_COLORS covers exactly the four seats gameinfos declares '
        + '(got: ' + SHIPPED_COLORS.join(', ') + ')');
}

// ============ 1. the right class per colour =================================
{
    for (const color of COLORS) {
        const g = makeGame();
        const root = makeRoot();
        g._applyPlayerBoardColor(root, color);
        check(root.frame.classList.contains('player-board-' + color),
            color + ' board gets .player-board-' + color);
        check(applied(root).length === 1, 'and exactly one colour class');
    }
}

// ============ 2. unknown / missing colour falls back cleanly ================
//     Spectators have no player colour (getPlayerGameColor's own fallback is
//     'red', but _gameColorForPlayer returns null), and a future fifth seat
//     would arrive as an unmapped name. Either way the base rule's generic
//     board must show rather than a blank frame.
{
    for (const bad of [null, undefined, '', 'purple', 'RED ']) {
        const g = makeGame();
        const root = makeRoot();
        g._applyPlayerBoardColor(root, bad);
        check(applied(root).length === 0,
            'no colour class for ' + JSON.stringify(bad)
            + ', so the generic board shows through');
    }
}

// ============ 3. re-stamping replaces, never stacks =========================
//     _refreshOpponentBoard rebuilds a replica's markup and re-populates it on
//     every change. If the stamp accumulated, a board would end up with two
//     colour classes and the winner would be whichever the stylesheet declares
//     last — the same board for everyone, decided by CSS source order.
{
    const g = makeGame();
    const root = makeRoot();
    g._applyPlayerBoardColor(root, 'red');
    g._applyPlayerBoardColor(root, 'blue');
    check(applied(root).length === 1, 'only one colour class survives a re-stamp');
    check(root.frame.classList.contains('player-board-blue'), 'and it is the new one');
}

// ============ 4. degenerate roots ===========================================
{
    const g = makeGame();
    let threw = false;
    try {
        g._applyPlayerBoardColor(makeEmptyRoot(), 'red');
        g._applyPlayerBoardColor(null, 'red');
    } catch (e) { threw = true; }
    check(!threw,
        'a root with no board frame, or no root at all, is survivable — the '
        + 'live area is hidden entirely for a spectator');
}

// ============ 5. every render path stamps it ================================
//     Three copies of the template exist. Wiring only the live board is the
//     failure that looks correct to whoever tests it and wrong to everyone
//     else at the table.
{
    const liveOk = /_applyPlayerBoardColor\(\s*document,\s*this\.getPlayerGameColor\(/.test(SRC)
        || /_applyPlayerBoardColor\([^)]*getPlayerGameColor\(/.test(SRC);
    check(liveOk,
        'the live board is stamped from getPlayerGameColor — the existing '
        + 'helper, not a seventh copy of the hex-to-name map');

    const populate = extractMethod('_populateOpponentBoard');
    check(/_applyPlayerBoardColor\(/.test(populate),
        'opponent replicas are stamped in _populateOpponentBoard, which BOTH '
        + 'replica paths funnel through (renderOpponentBoards on first build '
        + 'and _refreshOpponentBoard on every change)');
    // Assert the ARGUMENT, not merely that _gameColorForPlayer appears
    // somewhere in the method: it was already used further down for shrine
    // letters, so a loose check here passed even when the stamp was swapped to
    // the local player's colour — the exact bug this section exists to catch.
    check(/_applyPlayerBoardColor\(\s*area,\s*this\._gameColorForPlayer\(pid\)\s*\)/.test(populate),
        'the stamp is fed that opponent\'s own colour, not the viewer\'s — the '
        + 'whole point of stamping per copy');
    check(!/_applyPlayerBoardColor\([^)]*getPlayerGameColor/.test(populate),
        'and never the local player\'s colour, which would paint every board '
        + 'on screen the same and look correct only to whoever tested it');
}

// ============ 6. the stylesheet backs it ====================================
{
    const rules = {};
    const re = /(^|\n)([^{}]*)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(CSS)) !== null) {
        if (m[2].includes('player-board-')) rules[m[2].trim()] = m[3];
    }
    for (const color of COLORS) {
        const sel = Object.keys(rules).find((s) => s.includes('player-board-' + color));
        check(!!sel, 'a rule exists for ' + color);
        check(sel && sel.includes('#delphi-player-board'),
            color + ' rule is id-qualified — a bare class (10) would lose the '
            + 'cascade to the existing #delphi-player-board rule (100) and the '
            + 'generic board would win silently');
        check(sel && new RegExp('url\\([\'"]?img/boards/' + color + '-player-board')
            .test(rules[sel]), color + ' rule points at that colour\'s artwork');
    }
    // The generic board stays as the base, so an unmapped colour degrades to
    // today's behaviour instead of an empty frame.
    check(/#delphi-player-board\s*\{[^}]*img\/boards\/player-board\.jpg/.test(CSS),
        'the generic board remains the base rule and therefore the fallback');
}

console.log((fail ? 'FAILED' : 'ok') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
