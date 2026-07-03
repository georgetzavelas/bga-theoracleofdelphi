/**
 *------
 * BGA framework: © Gregory Isabelli <gisabelli@boardgamearena.com> & Emmanuel Colin <ecolin@boardgamearena.com>
 * earth implementation : © Guillaume Benny bennygui@gmail.com
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 */

var isDebug = window.location.host == 'studio.boardgamearena.com' || window.location.hash.indexOf('debug') > -1;
var debug = isDebug ? console.info.bind(window.console) : function () { };

define([
    "dojo",
    "dojo/_base/declare",
],
    function (dojo, declare) {
        return declare("bx.DragScroller", null, {
            constructor(idOrElement, enabled = true) {
                this.element = idOrElement;
                if (typeof this.element == "string") {
                    this.element = document.getElementById(idOrElement);
                }
                this.enabled = enabled;
                this.mustDrag = false;

                this.attachToElement();
            },

            enable() {
                this.enabled = true;
            },

            disable() {
                this.enabled = false;
            },

            attachToElement() {
                let startX = 0;
                let scrollLeft = 0;
                // Touch gesture axis lock: null until the first move clears
                // the threshold, then 'h' (pan the board) or 'v' (release
                // the gesture so the page scrolls natively). Reset per touch.
                let startPageX = 0;
                let startPageY = 0;
                let dragAxis = null;

                this.element.addEventListener('mousedown', (e) => {
                    this.mustDrag = true;
                    startX = e.pageX - this.element.offsetLeft;
                    scrollLeft = this.element.scrollLeft;
                });
                this.element.addEventListener('mouseleave', () => {
                    this.mustDrag = false;
                    this.element.classList.remove('bx-is-dragging');
                });
                this.element.addEventListener('mouseup', () => {
                    this.mustDrag = false;
                    requestAnimationFrame(() => {
                        this.element.classList.remove('bx-is-dragging');
                    })
                });
                this.element.addEventListener('mousemove', (e) => {
                    if (!this.mustDrag || !this.enabled) {
                        return;
                    }
                    e.preventDefault();
                    this.element.classList.add('bx-is-dragging');
                    const x = e.pageX - this.element.offsetLeft;
                    const walk = (x - startX) * 1.5;
                    this.element.scrollLeft = scrollLeft - walk;
                });

                // Touch parity. Single-finger pan mirrors the mouse drag;
                // any second finger drops out of drag mode so browser
                // pinch-zoom passes through. passive: false on touchmove
                // is required for preventDefault to suppress the page
                // scroll on iOS Safari.
                this.element.addEventListener('touchstart', (e) => {
                    if (e.touches.length !== 1) {
                        this.mustDrag = false;
                        return;
                    }
                    this.mustDrag = true;
                    dragAxis = null;
                    startX = e.touches[0].pageX - this.element.offsetLeft;
                    startPageX = e.touches[0].pageX;
                    startPageY = e.touches[0].pageY;
                    scrollLeft = this.element.scrollLeft;
                }, { passive: true });
                this.element.addEventListener('touchend', () => {
                    this.mustDrag = false;
                    requestAnimationFrame(() => {
                        this.element.classList.remove('bx-is-dragging');
                    });
                });
                this.element.addEventListener('touchcancel', () => {
                    this.mustDrag = false;
                    this.element.classList.remove('bx-is-dragging');
                });
                this.element.addEventListener('touchmove', (e) => {
                    if (!this.mustDrag || !this.enabled || e.touches.length !== 1) {
                        return;
                    }
                    // Lock the gesture to an axis on the first move past an
                    // 8px threshold. Horizontal → pan the board (and
                    // preventDefault so the page doesn't move too). Vertical →
                    // release drag for this gesture so the browser scrolls the
                    // page natively (honouring touch-action: pan-y). Without
                    // this, preventDefault ran on every single-finger move and
                    // swallowed vertical page scrolling whenever the board sat
                    // under the finger. Ties favour vertical (scrolling is the
                    // more common intent).
                    if (dragAxis === null) {
                        const dx = Math.abs(e.touches[0].pageX - startPageX);
                        const dy = Math.abs(e.touches[0].pageY - startPageY);
                        if (dx < 8 && dy < 8) {
                            return;
                        }
                        dragAxis = dx > dy ? 'h' : 'v';
                        if (dragAxis === 'v') {
                            this.mustDrag = false;
                            return;
                        }
                    }
                    e.preventDefault();
                    this.element.classList.add('bx-is-dragging');
                    const x = e.touches[0].pageX - this.element.offsetLeft;
                    const walk = (x - startX) * 1.5;
                    this.element.scrollLeft = scrollLeft - walk;
                }, { passive: false });

                // Desktop horizontal-scroll affordances. The board uses
                // overflow: hidden so the browser has no native horizontal
                // scroll path; the click-drag handler above is the only
                // way to pan otherwise. Two patterns are now also honoured:
                //   • Trackpad two-finger horizontal swipe (event.deltaX
                //     non-zero) — Mac users expect this to scroll any
                //     horizontally-scrollable region natively.
                //   • Shift + mouse-wheel (event.shiftKey && deltaY) —
                //     conventional desktop pattern for horizontally
                //     scrolling content with a wheel-only mouse.
                // Plain vertical wheel (no shift) is intentionally left
                // alone so wheeling down inside the board still scrolls
                // the page like the user expects. passive: false so we
                // can preventDefault on the cases we consume.
                this.element.addEventListener('wheel', (e) => {
                    if (!this.enabled) return;
                    let dx = 0;
                    const absX = Math.abs(e.deltaX);
                    const absY = Math.abs(e.deltaY);
                    // Trackpads emit small horizontal noise even during
                    // mostly-vertical gestures, so requiring deltaX to
                    // strictly dominate deltaY keeps a "scroll down with
                    // two fingers" from panning the board sideways. We
                    // only consume the wheel when horizontal intent is
                    // unambiguous.
                    if (absX > absY && e.deltaX !== 0) {
                        dx = e.deltaX;
                    } else if (e.shiftKey && e.deltaY !== 0) {
                        // Explicit shift+wheel — user is asking to
                        // translate vertical wheel into horizontal
                        // scroll. Ignore deltaX dominance here.
                        dx = e.deltaY;
                    }
                    if (dx !== 0) {
                        this.element.scrollLeft += dx;
                        e.preventDefault();
                    }
                }, { passive: false });
            },
        });
    });