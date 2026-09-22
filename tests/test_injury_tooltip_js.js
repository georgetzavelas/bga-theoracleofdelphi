/**
 * The current player's injury cards carry the same tooltip an opponent's do.
 *
 * The opponent replicas set data-tt="injury:<colour>:<n>" on each card and
 * attachLogTooltips binds it; the live board's own cards, built by
 * Components.addInjuryCard, carried neither an id nor a data-tt, so hovering
 * your own injuries showed nothing.
 *
 * Three properties, and the middle one is the one that bites:
 *
 *   - a live card is given the id and data-tt the shared binder needs;
 *   - the tooltip FOLLOWS THE COUNT. The element is created once and its badge
 *     is mutated thereafter, so a tooltip built at create time and never
 *     rebuilt would go on claiming the count the pile had when the first card
 *     landed;
 *   - a removed card drops its binding, or BGA keeps a tooltip pointing at a
 *     detached node and the map grows on every discard/redraw.
 *
 * The count is optional in the data-tt, because the game log writes
 * "injury:<colour>" with no pile behind it.
 *
 * Exercises the real shipped Components methods and the real tooltip builder
 * against a stand-in DOM.
 *
 * Run: node tests/test_injury_tooltip_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const GAME_LINES = fs.readFileSync(
    path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8').split('\n');
const COMP_SRC = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'js', 'Components.js'), 'utf8');
const COMP_LINES = COMP_SRC.split('\n');

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
function makeEl(tag) {
    return {
        tagName: tag, id: '', className: '', innerHTML: '',
        dataset: {}, _attrs: {}, children: [],
        classList: {
            _s: new Set(),
            add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
            contains(c) { return this._s.has(c); },
        },
        style: {},
        textContent: '',
        setAttribute(k, v) {
            this._attrs[k] = v;
            if (k === 'data-tt') this.dataset.tt = v;
        },
        getAttribute(k) { return k === 'data-tt' ? this.dataset.tt : this._attrs[k]; },
        removeAttribute(k) { delete this._attrs[k]; },
        appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
        remove() {
            if (!this.parentNode) return;
            const i = this.parentNode.children.indexOf(this);
            if (i >= 0) this.parentNode.children.splice(i, 1);
            this.parentNode = null;
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
    const area = makeEl('div');
    area.id = 'delphi-injury-cards-area';
    const attached = [];       // ids attachLogTooltips would have bound
    const removed = [];        // ids handed to removeTooltip
    const game = {
        attachLogTooltips() {
            // The real one binds every [data-tt] it has not marked yet.
            area.children.forEach(function(el) {
                if (el.classList.contains('tt-done')) return;
                el.classList.add('tt-done');
                attached.push({ id: el.id, tt: el.dataset.tt });
            });
        },
        removeTooltip(id) { removed.push(id); },
    };
    const comp = new Function('document', `return {
        injuryCards: new Map(),
        game: null,
${compMethod('addInjuryCard')}
${compMethod('removeInjuryCard')}
${compMethod('removeAllInjuryCardsOfColor')}
${compMethod('clearAllInjuryCards')}
${compMethod('_dropInjuryTooltip')}
${compMethod('_syncInjuryTooltip')}
};`)({ getElementById: (id) => (id === 'delphi-injury-cards-area' ? area : null),
       createElement: makeEl });
    comp.game = game;
    return { comp, area, attached, removed,
             card: (c) => area.children.find(e => (e.dataset.tt || '').indexOf('injury:' + c) === 0) };
}

// ---- a live card gets what the shared binder needs ------------------------
{
    const w = makeWorld();
    w.comp.addInjuryCard('red');
    const el = w.area.children[0];
    check(!!el, 'a card is created');
    check(el.id === 'delphi-inj-red',
        `it carries a stable per-colour id, got "${el.id}"`);
    check(el.dataset.tt === 'injury:red:1',
        `and a data-tt naming the colour and the count, got "${el.dataset.tt}"`);
    check(w.attached.length === 1 && w.attached[0].id === 'delphi-inj-red',
        'and the binder is asked to run, so the tooltip exists without waiting '
        + 'for the next log line');
}

// ---- THE regression guard: the tooltip follows the count ------------------
// A second red injury does not create an element, it bumps the badge on the
// one already there. That element is marked .tt-done, so nothing would rebuild
// its tooltip and it would keep claiming a pile of 1.
{
    const w = makeWorld();
    w.comp.addInjuryCard('red');
    w.comp.addInjuryCard('red');
    const el = w.card('red');
    check(el.dataset.tt === 'injury:red:2',
        `a second card of the same colour updates the data-tt, got "${el.dataset.tt}"`);
    // The binder only looks at elements without the done marker, so an entry
    // here proves the marker was cleared before it ran.
    check(w.attached.filter(a => a.tt === 'injury:red:2').length === 1,
        'the marker is cleared and the card rebound at the new count');
    check(el.classList.contains('tt-done'),
        'and the binder marks it again, so a later pass does not redo the work');
    check(w.removed.indexOf('delphi-inj-red') !== -1,
        'the stale binding is dropped first, rather than left to accumulate');
    check(String(el.querySelector('.card-count-badge').textContent) === '2',
        'and the badge itself still tracks the count, so this is not vacuous');

    w.comp.removeInjuryCard('red');
    check(w.card('red').dataset.tt === 'injury:red:1',
        `discarding one counts back down, got "${w.card('red').dataset.tt}"`);
}

// ---- removal drops the binding -------------------------------------------
{
    const w = makeWorld();
    w.comp.addInjuryCard('blue');
    w.removed.length = 0;
    w.comp.removeInjuryCard('blue');
    check(w.area.children.length === 0, 'the last card of a colour is removed');
    check(w.removed.indexOf('delphi-inj-blue') !== -1,
        'and its tooltip binding goes with it, so BGA is not left pointing at '
        + 'a detached node');
}
{
    const w = makeWorld();
    w.comp.addInjuryCard('green');
    w.comp.addInjuryCard('green');
    w.removed.length = 0;
    w.comp.removeAllInjuryCardsOfColor('green');
    check(w.area.children.length === 0, 'clearing a colour removes the card');
    check(w.removed.indexOf('delphi-inj-green') !== -1, 'and unbinds it');
}
{
    const w = makeWorld();
    ['red', 'blue'].forEach(c => w.comp.addInjuryCard(c));
    w.removed.length = 0;
    w.comp.clearAllInjuryCards();
    check(w.comp.injuryCards.size === 0, 'clearing all empties the map');
    check(w.removed.indexOf('delphi-inj-red') !== -1
       && w.removed.indexOf('delphi-inj-blue') !== -1,
        'and unbinds every colour it held');
}

// ---- the tooltip itself ---------------------------------------------------
{
    const tt = new Function('themeImg', '_', `return {
${gameMethod('_buildInjuryTooltipHtml')}
${gameMethod('_buildCardTooltipHtml')}
${gameMethod('_escHtml')}
};`)((p) => p, (s) => s);

    const withCount = tt._buildInjuryTooltipHtml('red:3');
    check(/Red injury/.test(withCount), 'the tooltip names the colour');
    check(/img\/injury\/red\.jpg/.test(withCount), 'and shows that colour\'s art');
    check(/3/.test(withCount), `and carries the count, got: ${withCount}`);
    check(/delphi-equipment-tooltip-subtitle/.test(withCount),
        'in the subtitle slot the shared card tooltip already provides');

    // The game log writes "injury:<colour>" with no pile behind it, so a bare
    // colour has to keep working and must not invent a count.
    const bare = tt._buildInjuryTooltipHtml('red');
    check(/Red injury/.test(bare), 'a bare colour still builds a tooltip');
    check(!/delphi-equipment-tooltip-subtitle/.test(bare),
        `and shows no count line, got: ${bare}`);
    const zero = tt._buildInjuryTooltipHtml('red:0');
    check(!/delphi-equipment-tooltip-subtitle/.test(zero),
        'nor does a count of zero, which is a pile that is not there');
}

// ---- the live board and the replicas agree on the string ------------------
// The data-tt is the ONLY thing tying the two to one tooltip builder. If the
// replica writes a shape the live board does not, the two drift apart in a way
// no test of either alone would catch.
{
    const replica = GAME_LINES.find(l => /dataset\.tt = 'injury:'/.test(l));
    check(!!replica, 'the opponent replica still sets an injury data-tt');
    check(/injury:' \+ row\.color \+ ':' \+ n/.test(replica || ''),
        `and writes colour:count like the live board, got: ${(replica || '').trim()}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
