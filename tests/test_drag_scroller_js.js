/**
 * Tests for DragScroller.js — panning the board sideways.
 *
 * The board sits in a container with overflow: hidden, so the browser gives
 * it no native horizontal scroll. Everything here is the substitute for that,
 * and almost all of it is deciding whether a given gesture belongs to the
 * board or to the page. Get that wrong and the failure is not a crash: the
 * page just stops scrolling under the player's finger, or the board slides
 * sideways when they meant to scroll down.
 *
 * The two decisions worth pinning, both of which carry comments in the source
 * describing the bug they fixed:
 *
 *   - The touch axis lock. On the first move past 8px the gesture commits to
 *     horizontal (pan the board, preventDefault) or vertical (let go entirely
 *     so the page scrolls natively), and stays committed for the rest of the
 *     gesture. Before it existed, preventDefault ran on every single-finger
 *     move and swallowed vertical page scrolling whenever the board happened
 *     to be under the finger. Ties favour vertical, because scrolling is the
 *     commoner intent.
 *
 *   - Wheel intent. Horizontal deltaX must strictly dominate deltaY to be
 *     consumed, because trackpads emit small sideways noise during a
 *     mostly-vertical two-finger scroll. Shift+wheel is honoured as the
 *     wheel-only-mouse equivalent. A plain vertical wheel is deliberately
 *     left alone so the page still scrolls.
 *
 * Also checked: touchmove and wheel must be registered with passive: false.
 * If either became passive, preventDefault would silently stop working and
 * both decisions above would quietly lose their effect.
 *
 * Run: node tests/test_drag_scroller_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(cond, msg) {
    if (cond) { pass++; } else { console.log('  FAIL: ' + msg); fail++; }
}
function close(got, want, msg) {
    ok(Math.abs(got - want) < 1e-9, msg + '  (got ' + got + ' want ' + want + ')');
}

// --- stand-in element that records its listeners ----------------------------
function makeElement(offsetLeft = 0) {
    const classes = new Set();
    return {
        offsetLeft,
        scrollLeft: 0,
        listeners: {},
        options: {},
        classList: {
            add: (c) => classes.add(c),
            remove: (c) => classes.delete(c),
            contains: (c) => classes.has(c),
        },
        addEventListener(type, handler, options) {
            (this.listeners[type] = this.listeners[type] || []).push(handler);
            this.options[type] = options;
        },
        /** Dispatch a synthetic event; returns whether preventDefault was called. */
        fire(type, event = {}) {
            let prevented = false;
            const ev = Object.assign({ preventDefault: () => { prevented = true; } }, event);
            (this.listeners[type] || []).forEach(h => h(ev));
            return prevented;
        },
        isDragging() { return classes.has('bx-is-dragging'); },
    };
}
/** A touch list shaped the way the handlers read it. */
function touches(...points) {
    return points.map(([pageX, pageY]) => ({ pageX, pageY }));
}

// --- load the module --------------------------------------------------------
let rafQueue = [];
const sandbox = {
    console: { info() {}, log() {} },
    Math, Set, JSON,
    window: { location: { host: 'test.local', hash: '' } },   // read at load time
    document: { getElementById: () => null },
    requestAnimationFrame: (cb) => { rafQueue.push(cb); },
    captured: null,
    define(_deps, factory) {
        // This module calls declare("bx.DragScroller", null, spec) — three
        // args, unlike the two-arg form the other modules use.
        const stubDeclare = (...args) => {
            const spec = args[args.length - 1];
            return function (...ctorArgs) {
                Object.assign(this, spec);
                if (typeof spec.constructor === 'function') spec.constructor.apply(this, ctorArgs);
            };
        };
        sandbox.captured = factory({}, stubDeclare);
    },
};
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'modules/BX/js/DragScroller.js'), 'utf8'), sandbox);
const DragScroller = sandbox.captured;
ok(typeof DragScroller === 'function', 'DragScroller loaded');

function newScroller(offsetLeft = 0, enabled = true) {
    const el = makeElement(offsetLeft);
    const scroller = new DragScroller(el, enabled);
    return { el, scroller };
}
function flushRaf() { const q = rafQueue; rafQueue = []; q.forEach(cb => cb()); }

// ============ listener registration ==========================================
{
    const { el } = newScroller();
    for (const type of ['mousedown', 'mouseup', 'mouseleave', 'mousemove',
        'touchstart', 'touchend', 'touchcancel', 'touchmove', 'wheel']) {
        ok((el.listeners[type] || []).length === 1, 'a ' + type + ' listener is attached');
    }
    // preventDefault is a no-op on a passive listener, so these two must not be.
    ok(el.options.touchmove && el.options.touchmove.passive === false,
        'touchmove is registered passive: false, or preventDefault would be ignored');
    ok(el.options.wheel && el.options.wheel.passive === false,
        'wheel is registered passive: false, for the same reason');
    ok(el.options.touchstart && el.options.touchstart.passive === true,
        'touchstart stays passive, since it never needs to preventDefault');
}

// ============ mouse drag =====================================================
{
    const { el } = newScroller();
    el.scrollLeft = 500;
    el.fire('mousedown', { pageX: 200 });
    const prevented = el.fire('mousemove', { pageX: 260 });
    // Dragging right by 60 pulls the content right, so scrollLeft DECREASES,
    // amplified by the 1.5 drag factor.
    close(el.scrollLeft, 500 - 60 * 1.5, 'a 60px drag right scrolls 90px left (1.5x factor)');
    ok(prevented, 'an active drag preventDefaults so the browser does not text-select');
    ok(el.isDragging(), 'the dragging class is set while panning');

    el.fire('mousemove', { pageX: 140 });
    close(el.scrollLeft, 500 + 60 * 1.5, 'dragging back past the start scrolls the other way');
}
{
    // Movement without a press does nothing.
    const { el } = newScroller();
    el.scrollLeft = 100;
    ok(!el.fire('mousemove', { pageX: 999 }), 'a move with no button held is not consumed');
    close(el.scrollLeft, 100, 'and does not scroll');
    ok(!el.isDragging(), 'nor does it look like a drag');
}
{
    // offsetLeft is subtracted, so a shifted container still tracks the cursor.
    const { el } = newScroller(37);
    el.scrollLeft = 0;
    el.fire('mousedown', { pageX: 137 });
    el.fire('mousemove', { pageX: 157 });
    close(el.scrollLeft, -20 * 1.5, 'the container offset cancels out of the delta');
}
{
    // Release ends the drag; the class clears on the next frame.
    const { el } = newScroller();
    el.fire('mousedown', { pageX: 100 });
    el.fire('mousemove', { pageX: 150 });
    ok(el.isDragging(), 'dragging');
    el.fire('mouseup');
    ok(el.isDragging(), 'the class survives mouseup itself, so a click handler can still see it');
    flushRaf();
    ok(!el.isDragging(), 'and clears on the next animation frame');

    const before = el.scrollLeft;
    el.fire('mousemove', { pageX: 400 });
    close(el.scrollLeft, before, 'moves after release no longer pan');
}
{
    // Leaving the element aborts immediately rather than on the next frame.
    const { el } = newScroller();
    el.fire('mousedown', { pageX: 100 });
    el.fire('mousemove', { pageX: 150 });
    el.fire('mouseleave');
    ok(!el.isDragging(), 'mouseleave clears the class synchronously');
    const before = el.scrollLeft;
    el.fire('mousemove', { pageX: 400 });
    close(el.scrollLeft, before, 'and stops the pan');
}
{
    // disable() suppresses panning; enable() restores it.
    const { el, scroller } = newScroller();
    scroller.disable();
    el.fire('mousedown', { pageX: 100 });
    ok(!el.fire('mousemove', { pageX: 200 }), 'a disabled scroller does not consume moves');
    close(el.scrollLeft, 0, 'and does not pan');
    scroller.enable();
    el.fire('mousedown', { pageX: 100 });
    el.fire('mousemove', { pageX: 200 });
    close(el.scrollLeft, -100 * 1.5, 'enable() brings panning back');
}

// ============ touch: the axis lock ===========================================
{
    // Under the 8px threshold nothing is decided and nothing happens.
    const { el } = newScroller();
    el.fire('touchstart', { touches: touches([100, 100]) });
    const prevented = el.fire('touchmove', { touches: touches([105, 104]) });
    close(el.scrollLeft, 0, 'a move inside the 8px threshold does not pan');
    ok(!prevented, 'and is not consumed, so the browser can still act on it');
    ok(!el.isDragging(), 'and does not look like a drag yet');
}
{
    // Clearly horizontal: pan the board and consume the gesture.
    const { el } = newScroller();
    el.scrollLeft = 300;
    el.fire('touchstart', { touches: touches([100, 100]) });
    const prevented = el.fire('touchmove', { touches: touches([130, 102]) });
    close(el.scrollLeft, 300 - 30 * 1.5, 'a horizontal swipe pans with the same 1.5 factor');
    ok(prevented, 'and is consumed so the page does not move as well');
    ok(el.isDragging(), 'and shows as a drag');
}
{
    // Clearly vertical: let go completely so the page scrolls natively.
    const { el } = newScroller();
    el.fire('touchstart', { touches: touches([100, 100]) });
    const prevented = el.fire('touchmove', { touches: touches([102, 130]) });
    close(el.scrollLeft, 0, 'a vertical swipe does not pan the board');
    ok(!prevented, 'and is NOT consumed — this is what lets the page scroll');
    ok(!el.isDragging(), 'and never enters drag mode');

    // The gesture is released, so continuing it stays hands-off even if the
    // finger then moves sideways.
    const after = el.fire('touchmove', { touches: touches([200, 130]) });
    close(el.scrollLeft, 0, 'the rest of a vertical gesture is ignored');
    ok(!after, 'including a later sideways move within the same gesture');
}
{
    // A tie favours vertical: scrolling is the more common intent.
    const { el } = newScroller();
    el.fire('touchstart', { touches: touches([100, 100]) });
    const prevented = el.fire('touchmove', { touches: touches([110, 110]) });
    close(el.scrollLeft, 0, 'an exactly diagonal swipe does not pan');
    ok(!prevented, 'ties go to vertical, so the page keeps scrolling');
}
{
    // Once locked horizontal, the lock holds for the whole gesture.
    const { el } = newScroller();
    el.fire('touchstart', { touches: touches([100, 100]) });
    el.fire('touchmove', { touches: touches([140, 100]) });      // locks 'h'
    const scrolledAfterFirst = el.scrollLeft;
    ok(scrolledAfterFirst !== 0, 'locked horizontal');
    const prevented = el.fire('touchmove', { touches: touches([150, 400]) });
    ok(prevented, 'a mostly-vertical move later in the gesture is still consumed');
    close(el.scrollLeft, -50 * 1.5, 'and still pans, tracking only the horizontal component');
}
{
    // The lock resets per gesture: a horizontal swipe then a vertical one.
    const { el } = newScroller();
    el.fire('touchstart', { touches: touches([100, 100]) });
    el.fire('touchmove', { touches: touches([140, 100]) });
    el.fire('touchend');
    flushRaf();
    const afterFirst = el.scrollLeft;
    el.fire('touchstart', { touches: touches([100, 100]) });
    const prevented = el.fire('touchmove', { touches: touches([100, 140]) });
    close(el.scrollLeft, afterFirst, 'a fresh gesture re-decides the axis');
    ok(!prevented, 'so a vertical swipe after a horizontal one still scrolls the page');
}

// ============ touch: multiple fingers ========================================
{
    // Two fingers down means pinch-zoom, which must pass through untouched.
    const { el } = newScroller();
    el.fire('touchstart', { touches: touches([100, 100], [200, 200]) });
    const prevented = el.fire('touchmove', { touches: touches([120, 100], [220, 200]) });
    close(el.scrollLeft, 0, 'a two-finger gesture does not pan the board');
    ok(!prevented, 'and is not consumed, so browser pinch-zoom works');
}
{
    // A second finger landing mid-drag also drops out.
    const { el } = newScroller();
    el.fire('touchstart', { touches: touches([100, 100]) });
    el.fire('touchmove', { touches: touches([140, 100]) });
    const locked = el.scrollLeft;
    const prevented = el.fire('touchmove', { touches: touches([180, 100], [300, 300]) });
    close(el.scrollLeft, locked, 'a second finger stops the pan mid-gesture');
    ok(!prevented, 'and hands the gesture back to the browser');
}
{
    // touchcancel clears immediately, like mouseleave.
    const { el } = newScroller();
    el.fire('touchstart', { touches: touches([100, 100]) });
    el.fire('touchmove', { touches: touches([140, 100]) });
    el.fire('touchcancel');
    ok(!el.isDragging(), 'touchcancel clears the dragging class synchronously');
    const before = el.scrollLeft;
    el.fire('touchmove', { touches: touches([200, 100]) });
    close(el.scrollLeft, before, 'and ends the pan');
}
{
    const { el } = newScroller();
    el.fire('touchstart', { touches: touches([100, 100]) });
    el.fire('touchmove', { touches: touches([140, 100]) });
    el.fire('touchend');
    ok(el.isDragging(), 'touchend defers the class removal like mouseup');
    flushRaf();
    ok(!el.isDragging(), 'clearing it on the next frame');
}

// ============ wheel ==========================================================
{
    // Unambiguous horizontal: consume it.
    const { el } = newScroller();
    el.scrollLeft = 100;
    const prevented = el.fire('wheel', { deltaX: 40, deltaY: 2, shiftKey: false });
    close(el.scrollLeft, 140, 'a horizontal wheel scrolls the board right');
    ok(prevented, 'and is consumed');
}
{
    // Plain vertical wheel is left entirely alone so the page scrolls.
    const { el } = newScroller();
    el.scrollLeft = 100;
    const prevented = el.fire('wheel', { deltaX: 0, deltaY: 50, shiftKey: false });
    close(el.scrollLeft, 100, 'a plain vertical wheel does not pan the board');
    ok(!prevented, 'and is not consumed, so the page scrolls normally');
}
{
    // Trackpad noise: a mostly-vertical two-finger scroll must not pan.
    const { el } = newScroller();
    el.scrollLeft = 100;
    const prevented = el.fire('wheel', { deltaX: 3, deltaY: 40, shiftKey: false });
    close(el.scrollLeft, 100, 'sideways trackpad noise during a vertical scroll is ignored');
    ok(!prevented, 'and the page keeps the gesture');
}
{
    // Equal magnitudes are not "unambiguous", so they are not consumed.
    const { el } = newScroller();
    el.scrollLeft = 100;
    const prevented = el.fire('wheel', { deltaX: 20, deltaY: 20, shiftKey: false });
    close(el.scrollLeft, 100, 'an exactly diagonal wheel is not treated as horizontal');
    ok(!prevented, 'because deltaX has to strictly dominate');
}
{
    // Shift+wheel is the wheel-only-mouse way to scroll sideways.
    const { el } = newScroller();
    el.scrollLeft = 100;
    const prevented = el.fire('wheel', { deltaX: 0, deltaY: 30, shiftKey: true });
    close(el.scrollLeft, 130, 'shift + vertical wheel scrolls horizontally');
    ok(prevented, 'and is consumed');
}
{
    // Horizontal dominance wins regardless of shift.
    const { el } = newScroller();
    el.scrollLeft = 100;
    el.fire('wheel', { deltaX: -40, deltaY: 5, shiftKey: true });
    close(el.scrollLeft, 60, 'a dominant deltaX is used even with shift held');
}
{
    // A zero wheel event changes nothing and is not consumed.
    const { el } = newScroller();
    el.scrollLeft = 100;
    const prevented = el.fire('wheel', { deltaX: 0, deltaY: 0, shiftKey: true });
    close(el.scrollLeft, 100, 'an empty wheel event does nothing');
    ok(!prevented, 'and is not consumed');
}
{
    // Disabled means the wheel is left to the browser entirely.
    const { el, scroller } = newScroller();
    scroller.disable();
    el.scrollLeft = 100;
    const prevented = el.fire('wheel', { deltaX: 40, deltaY: 0, shiftKey: false });
    close(el.scrollLeft, 100, 'a disabled scroller ignores the wheel');
    ok(!prevented, 'and does not consume it');
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
