/**
 * The oracle-card tooltip from the action bar is the one every oracle card
 * shows — your own hand, and an opponent's.
 *
 * The action bar built its HTML inline inside _addOracleCardTooltip, so
 * nothing else could reach it: hovering a card in your own hand, or in an
 * opponent's replica, showed nothing at all. The HTML now lives in
 * _buildOracleCardTooltipHtml and the other two reach it through
 * data-tt="oraclecard:<colour>:<count>[:wild]", the same route the injury
 * cards use.
 *
 * What has to hold:
 *
 *   - one builder, so the three cannot drift apart;
 *   - the tooltip FOLLOWS THE COUNT, because a second card of one colour
 *     bumps a badge on an element that is already marked .tt-done;
 *   - a removed card drops its binding;
 *   - a wild card in your own hand still reads as wild;
 *   - the Apollo line stays out of the data-tt route. It describes the play
 *     you are about to make from the action bar, and a data-tt tooltip is
 *     built once at attach, so it would go stale as Apollo toggles.
 *
 * Run: node tests/test_oracle_tooltip_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const GAME_SRC = fs.readFileSync(
    path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8');
const GAME_LINES = GAME_SRC.split('\n');
const COMP_LINES = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'js', 'Components.js'), 'utf8').split('\n');

function extract(lines, name) {
    const re = new RegExp('^        ' + name + ': function');
    const start = lines.findIndex(l => re.test(l));
    if (start < 0) throw new Error('not found: ' + name);
    let i = start;
    while (!/^        \},\s*$/.test(lines[i])) {
        i++;
        if (i > start + 400) throw new Error('runaway extracting ' + name);
    }
    return lines.slice(start, i + 1).join('\n');
}
const gameMethod = (n) => extract(GAME_LINES, n);
const compMethod = (n) => extract(COMP_LINES, n);

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

// --- stand-in DOM ----------------------------------------------------------
function makeEl() {
    return {
        id: '', className: '', dataset: {}, _attrs: {}, children: [],
        classList: {
            _s: new Set(),
            add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
            contains(c) { return this._s.has(c); },
        },
        style: {}, textContent: '',
        setAttribute(k, v) { this._attrs[k] = v; if (k === 'data-tt') this.dataset.tt = v; },
        getAttribute(k) { return k === 'data-tt' ? this.dataset.tt : this._attrs[k]; },
        appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
        insertBefore(c) { this.children.unshift(c); c.parentNode = this; return c; },
        get firstChild() { return this.children[0] || null; },
        remove() {
            if (this.parentNode) this.parentNode.removeChild(this);
        },
        removeChild(c) {
            const i = this.children.indexOf(c);
            if (i >= 0) this.children.splice(i, 1);
            c.parentNode = null;
            return c;
        },
        querySelector(sel) {
            if (sel === '.card-count-badge') {
                return this.children.find(c => c.className === 'card-count-badge') || null;
            }
            return null;
        },
    };
}

function makeWorld() {
    const area = makeEl();
    area.id = 'delphi-oracle-cards-area';
    const attached = [], removed = [];
    const comp = new Function('document', `return {
        oracleCards: new Map(),
        oracleWildCards: new Map(),
        game: null,
${compMethod('addOracleCardToHand')}
${compMethod('removeOracleCardFromHand')}
${compMethod('removeWildOracleCardFromHand')}
${compMethod('_syncCardTooltip')}
${compMethod('_dropCardTooltip')}
${compMethod('_syncOracleHandTooltip')}
${compMethod('_dropOracleHandTooltip')}
${compMethod('_oracleHandTooltipId')}
${compMethod('_oracleWildTooltipId')}
};`)({ getElementById: (id) => (id === 'delphi-oracle-cards-area' ? area : null),
       createElement: makeEl });
    comp.game = {
        attachLogTooltips() {
            area.children.forEach(function(el) {
                if (el.classList.contains('tt-done')) return;
                el.classList.add('tt-done');
                attached.push({ id: el.id, tt: el.dataset.tt });
            });
        },
        removeTooltip(id) { removed.push(id); },
    };
    return { comp, area, attached, removed,
             stack: (c) => area.children.find(e => e.id === 'delphi-oracle-hand-' + c) };
}

// ---- a hand card gets what the shared binder needs ------------------------
{
    const w = makeWorld();
    w.comp.addOracleCardToHand('red', false);
    const el = w.stack('red');
    check(!!el, 'a colour stack is created with a stable id');
    check(el.dataset.tt === 'oraclecard:red:1',
        `and a data-tt naming the colour and the count, got "${el.dataset.tt}"`);
    check(w.attached.some(a => a.id === 'delphi-oracle-hand-red'),
        'and the binder is asked to run');
}

// ---- THE regression guard: the tooltip follows the count ------------------
{
    const w = makeWorld();
    w.comp.addOracleCardToHand('red', false);
    w.comp.addOracleCardToHand('red', false);
    const el = w.stack('red');
    check(el.dataset.tt === 'oraclecard:red:2',
        `a second card of the colour updates the data-tt, got "${el.dataset.tt}"`);
    check(w.attached.filter(a => a.tt === 'oraclecard:red:2').length === 1,
        'the marker is cleared and the card rebound at the new count');
    check(w.removed.indexOf('delphi-oracle-hand-red') !== -1,
        'and the stale binding dropped first');
    check(String(el.querySelector('.card-count-badge').textContent) === '2',
        'the badge tracks the count too, so this is not vacuous');

    w.comp.removeOracleCardFromHand('red');
    check(w.stack('red').dataset.tt === 'oraclecard:red:1',
        `playing one counts back down, got "${w.stack('red').dataset.tt}"`);
}

// ---- removal drops the binding -------------------------------------------
{
    const w = makeWorld();
    w.comp.addOracleCardToHand('blue', false);
    w.removed.length = 0;
    w.comp.removeOracleCardFromHand('blue');
    check(w.area.children.length === 0, 'the last card of a colour is removed');
    check(w.removed.indexOf('delphi-oracle-hand-blue') !== -1, 'and unbound');
}

// ---- a wild card reads as wild -------------------------------------------
// Wilds are standalone elements, never merged into a colour stack, so they
// carry their own id and their own marker in the data-tt.
{
    const w = makeWorld();
    w.comp.addOracleCardToHand('green', true, 77);
    const el = w.area.children[0];
    check(el.id === 'delphi-oracle-wild-77',
        `a wild card is keyed by card id, not colour, got "${el.id}"`);
    check(el.dataset.tt === 'oraclecard:green:1:wild',
        `and says so in its data-tt, got "${el.dataset.tt}"`);
    w.removed.length = 0;
    w.comp.removeWildOracleCardFromHand(77);
    check(w.removed.indexOf('delphi-oracle-wild-77') !== -1,
        'and unbinds when it is played');
}

// ---- one builder for all three -------------------------------------------
{
    const tt = new Function('dojo', '_', `return {
${gameMethod('_buildOracleCardTooltipHtml')}
};`)({ string: { substitute: (s, o) => s.replace(/\$\{(\w+)\}/g, (m, k) => o[k]) } },
     (s) => s);

    const one = tt._buildOracleCardTooltipHtml('red', false, 1, false);
    check(/Red Oracle Card/.test(one), 'the tooltip names the colour');
    check(/oracle-card-tooltip-art oracle-red/.test(one), 'and shows that colour\'s art');
    check(!/×/.test(one), 'a single card shows no count');

    const many = tt._buildOracleCardTooltipHtml('red', false, 3, false);
    check(/× 3/.test(many), `holding three shows the count, got: ${many}`);

    const wild = tt._buildOracleCardTooltipHtml('green', true, 1, false);
    check(/oracle-card-wild/.test(wild), 'a wild card carries the wild art class');
    check(/Green Oracle Card/.test(wild),
        'and still names its colour, because wild is a property of the play');

    check(/oracle-card-tooltip-apollo/.test(
            tt._buildOracleCardTooltipHtml('red', false, 1, true)),
        'the Apollo line appears when the action bar asks for it');
    check(!/oracle-card-tooltip-apollo/.test(many),
        'and only then');
}

// The action bar must still go through the shared builder rather than keeping
// a copy of the markup — a copy is how the three drift apart.
{
    const binder = gameMethod('_addOracleCardTooltip');
    check(/_buildOracleCardTooltipHtml/.test(binder),
        'the action-bar binder calls the shared builder');
    check(!/oracle-card-tooltip-label/.test(binder),
        'and holds no markup of its own');

    // The data-tt route reaches the same builder, with no Apollo line: that
    // tooltip is built once at attach and would go stale as Apollo toggles.
    const router = gameMethod('_logTokTooltipHtml');
    check(/oraclecard/.test(router), 'the data-tt router knows the oraclecard type');

    const replica = GAME_LINES.find(l => /dataset\.tt = 'oraclecard:'/.test(l));
    check(!!replica, 'the opponent replica writes an oraclecard data-tt');
    check(/:' \+ n/.test(replica || ''),
        `carrying the count like the live hand, got: ${(replica || '').trim()}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
