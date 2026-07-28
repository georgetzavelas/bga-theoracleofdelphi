/**
 * Client tests for Apollo's movable wild blessing
 * (see docs/superpowers/specs/2026-07-27-apollo-movable-wild-blessing-design.md).
 *
 * Extracts the REAL shipped badge helpers and notif handler out of
 * theoracleofdelphi.js and drives them against a minimal DOM, checking:
 *   - a badge is offered on locked colour stacks and never on the wild card,
 *   - clicking a badge sends actMoveApolloBlessing and does NOT also play the
 *     card (the badge lives inside the card, whose body is the play target),
 *   - teardown removes badges and their destination marker,
 *   - the move leaves exactly one wild card in hand, including a move within a
 *     single colour, where the stack decrement and the new wild are the same
 *     colour.
 *
 * Run: node tests/test_apollo_blessing_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const LINES = fs.readFileSync(
    path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8').split('\n');

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

const METHODS = ['_addApolloBlessingBadge', '_removeApolloBlessingBadges',
                 'notif_apolloBlessingMoved']
    .map(extractMethod).join('\n');

// ---------- minimal DOM ----------
// Enough of the element API for the helpers: class list, children, attributes,
// querySelector by the handful of selectors they actually use, and click
// dispatch with bubbling so the stopPropagation assertion is meaningful.
class El {
    constructor(cls = '') {
        this.classes = new Set(String(cls).split(' ').filter(Boolean));
        this.children = [];
        this.parentNode = null;
        this.dataset = {};
        this.style = {};
        this.title = '';
        this.listeners = {};
        this.classList = {
            add: (...c) => c.forEach(x => this.classes.add(x)),
            remove: (...c) => c.forEach(x => this.classes.delete(x)),
            contains: (c) => this.classes.has(c),
        };
    }
    get className() { return [...this.classes].join(' '); }
    set className(v) { this.classes = new Set(String(v).split(' ').filter(Boolean)); }
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
    insertBefore(c, ref) {
        c.parentNode = this;
        const i = ref ? this.children.indexOf(ref) : -1;
        if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
        return c;
    }
    removeChild(c) {
        const i = this.children.indexOf(c);
        if (i >= 0) this.children.splice(i, 1);
        c.parentNode = null;
        return c;
    }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
    removeEventListener(t, fn) {
        this.listeners[t] = (this.listeners[t] || []).filter(f => f !== fn);
    }
    /** Bubbles to ancestors unless a handler calls stopPropagation. */
    click() {
        let stopped = false;
        const ev = { stopPropagation: () => { stopped = true; } };
        let node = this;
        while (node) {
            (node.listeners['click'] || []).forEach(fn => fn(ev));
            if (stopped) return;
            node = node.parentNode;
        }
    }
    descendants() {
        return this.children.flatMap(c => [c, ...c.descendants()]);
    }
    matches(sel) {
        // Supports '.a', '.a:not(.b)' and '.a[data-card-id="N"]'.
        const not = sel.match(/:not\(\.([\w-]+)\)/);
        if (not && this.classes.has(not[1])) return false;
        const attr = sel.match(/\[data-card-id="(\d+)"\]/);
        if (attr && this.dataset.cardId !== attr[1]) return false;
        const cls = sel.replace(/:not\(\.[\w-]+\)/, '').replace(/\[.*?\]/, '')
            .split('.').filter(Boolean);
        return cls.every(c => this.classes.has(c));
    }
    querySelector(sel) { return this.descendants().find(d => d.matches(sel)) || null; }
    querySelectorAll(sel) { return this.descendants().filter(d => d.matches(sel)); }
}

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

/**
 * Faithful stand-ins for the three Components primitives the notif handler
 * uses. Mirrors Components.js: wild cards are standalone elements keyed by
 * cardId, regular cards are one counted element per colour.
 */
function makeComponents(area) {
    return {
        oracleWildCards: new Map(),
        oracleCards: new Map(),
        addOracleCardToHand(color, isWild, cardId) {
            if (isWild) {
                const el = new El('delphi-oracle-card oracle-' + color + ' oracle-card-wild');
                el.dataset.color = color;
                el.dataset.cardId = String(cardId);
                area.insertBefore(el, area.children[0]);
                this.oracleWildCards.set(cardId, { color, element: el });
                return;
            }
            const existing = this.oracleCards.get(color);
            if (existing) { existing.count++; return; }
            const el = new El('delphi-oracle-card oracle-' + color);
            el.dataset.color = color;
            area.appendChild(el);
            this.oracleCards.set(color, { count: 1, element: el });
        },
        removeWildOracleCardFromHand(cardId) {
            const e = this.oracleWildCards.get(cardId);
            if (!e) return null;
            e.element.remove();
            this.oracleWildCards.delete(cardId);
            return e.color;
        },
        revertOracleWildCardInHand(cardId) {
            const color = this.removeWildOracleCardFromHand(cardId);
            if (color) this.addOracleCardToHand(color, false);
        },
        removeOracleCardFromHand(color) {
            const e = this.oracleCards.get(color);
            if (!e || e.count <= 0) return false;
            e.count--;
            if (e.count <= 0) { e.element.remove(); this.oracleCards.delete(color); }
            return true;
        },
    };
}

function makeGame(area) {
    const game = new Function(`return { ${METHODS} };`)();
    game.actions = [];
    game.plays = [];
    game.flights = [];
    game.bgaPerformAction = (name, args) => game.actions.push({ name, args });
    game._flyCard = (opts) => game.flights.push(opts);
    game.components = makeComponents(area);
    // The extracted code calls the global _() for the badge title.
    global._ = (s) => s;
    global.document = {
        createElement: () => new El(),
        getElementById: (id) => (id === 'delphi-oracle-cards-area' ? area : null),
    };
    return game;
}

// ---------- badge offering + click isolation ----------
{
    const area = new El();
    const game = makeGame(area);

    // Hand under Apollo: a standalone wild red (card 11) plus a locked green
    // stack, exactly what _bindHandOracleCardSelectable would have produced.
    game.components.addOracleCardToHand('red', true, 11);
    game.components.addOracleCardToHand('green', false);
    const greenStack = game.components.oracleCards.get('green').element;
    greenStack.classList.add('oracle-card-apollo-locked');
    // The card body is the play target; if the badge leaks, this fires.
    greenStack.addEventListener('click', () => game.plays.push('green'));

    game._addApolloBlessingBadge(greenStack, 12);
    const badge = greenStack.querySelector('.apollo-blessing-badge');
    check(!!badge, 'a badge is added to the locked stack');
    check(greenStack.classList.contains('oracle-card-blessing-target'),
        'the stack is marked as a live destination so the lock dimming lifts');
    check(badge && badge.title.length > 0, 'the badge carries an explanatory title');

    // Idempotent: re-running setup must not stack duplicate badges.
    game._addApolloBlessingBadge(greenStack, 12);
    check(greenStack.querySelectorAll('.apollo-blessing-badge').length === 1,
        'adding twice yields one badge');

    badge.click();
    check(game.actions.length === 1 && game.actions[0].name === 'actMoveApolloBlessing',
        'badge click sends actMoveApolloBlessing');
    check(game.actions[0].args.card_id === 12, 'the destination card_id is sent');
    check(game.plays.length === 0,
        'badge click does NOT also play the card (stopPropagation)');

    // Wild card must never be offered as a destination.
    const wildEl = game.components.oracleWildCards.get(11).element;
    check(!wildEl.querySelector('.apollo-blessing-badge'),
        'the wild card itself gets no badge');

    game._removeApolloBlessingBadges();
    check(!greenStack.querySelector('.apollo-blessing-badge'), 'teardown removes the badge');
    check(!greenStack.classList.contains('oracle-card-blessing-target'),
        'teardown clears the destination marker');
    game.plays = [];
    check(game.plays.length === 0, 'no residual play after teardown');
}

// ---------- the move itself ----------
function wildIds(c) { return [...c.oracleWildCards.keys()]; }

{
    // Cross-colour: wild red 11 -> green 12.
    const area = new El();
    const game = makeGame(area);
    game.components.addOracleCardToHand('red', true, 11);
    game.components.addOracleCardToHand('green', false);
    game.components.addOracleCardToHand('green', false);   // two greens

    game.notif_apolloBlessingMoved({ from_card_id: 11, to_card_id: 12, to_color: 'green' });

    check(wildIds(game.components).join(',') === '12', 'the new card is the only wild');
    check(game.components.oracleCards.get('green').count === 1,
        'the destination stack lost one card to the blessing');
    check(game.components.oracleCards.get('red').count === 1,
        'the old wild merged back into its colour stack');
    check(game.flights.length === 1, 'the blessing animates across');
    check(area.querySelectorAll('.oracle-card-wild').length === 1,
        'exactly one wild element in the hand DOM');
}

{
    // Same-colour move: wild red 11 -> another red 12. The stack decrement and
    // the new wild share a colour, so a naive implementation double-counts.
    const area = new El();
    const game = makeGame(area);
    game.components.addOracleCardToHand('red', true, 11);
    game.components.addOracleCardToHand('red', false);

    game.notif_apolloBlessingMoved({ from_card_id: 11, to_card_id: 12, to_color: 'red' });

    check(wildIds(game.components).join(',') === '12', 'same-colour move leaves one wild');
    const red = game.components.oracleCards.get('red');
    check(red && red.count === 1,
        'the un-blessed red stays in the stack, got ' + (red ? red.count : 'none'));
    check(area.querySelectorAll('.oracle-card-wild').length === 1,
        'same-colour move leaves exactly one wild element');
}

{
    // Fast-forward: no animation, but the swap still lands.
    const area = new El();
    const game = makeGame(area);
    game.instantaneousMode = true;
    game.components.addOracleCardToHand('red', true, 11);
    game.components.addOracleCardToHand('blue', false);

    game.notif_apolloBlessingMoved({ from_card_id: 11, to_card_id: 12, to_color: 'blue' });
    check(game.flights.length === 0, 'no flight while fast-forwarding');
    check(wildIds(game.components).join(',') === '12', 'the swap still lands');
}

// ---------- CSS contract ----------
// This stub DOM has no layout, so it can never catch the two placement
// requirements that were found by measuring the real CSS in a browser. Both are
// easy to "tidy" away, so assert them on the stylesheet text directly.
{
    const css = fs.readFileSync(
        path.join(__dirname, '..', 'theoracleofdelphi.css'), 'utf8');
    const m = css.match(/\.apollo-blessing-badge\s*\{([^}]*)\}/);
    check(!!m, 'the .apollo-blessing-badge rule exists');
    const body = m ? m[1] : '';

    // Hand cards overlap by 98px and the first card wins the z-index, so every
    // later card shows only its bottom strip: a top-anchored badge is hidden
    // behind the card in front, and cannot escape that stacking context.
    check(/\bbottom\s*:/.test(body) && !/\btop\s*:/.test(body),
        'badge is bottom-anchored (a top-anchored badge is occluded by the card in front)');
    // .card-count-badge is overridden to bottom-right in the hand, for the same
    // visibility reason, so the medallion has to take the other corner.
    check(/\bleft\s*:/.test(body) && !/\bright\s*:/.test(body),
        'badge is left-anchored (bottom-right belongs to .card-count-badge)');
    // The locked parent sets pointer-events: none, which would swallow clicks.
    check(/pointer-events\s*:\s*auto/.test(body),
        'badge re-enables pointer events (its locked parent disables them)');

    // And the destination modifier must lift the lock dimming, since a parent's
    // opacity cannot be undone by a child.
    const t = css.match(/\.oracle-card-blessing-target\s*\{([^}]*)\}/);
    check(!!t && /opacity\s*:/.test(t[1]),
        'the blessing-target modifier lifts the lock opacity');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
