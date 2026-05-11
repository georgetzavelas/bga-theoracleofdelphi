# Card Pickers Pick-on-Click + Recover One-at-a-Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace confirm-button card-picker UX with single-click commits + a 600ms travel-to-destination animation for Equipment + Companion selection; remove the modal from Recover and force one-at-a-time injury discards directly on the player board.

**Architecture:** All changes live in the BGA-frontend module (`theoracleofdelphigzed.js`) and its CSS, plus light reuse of `modules/js/Components.js::removeInjuryCard`. No PHP / server changes — the existing `actDiscardInjuries(cardIdsJson)` contract is honored by gathering 3 picks client-side before firing once. Animation uses a body-level cloned `.delphi-picking-card` driven by a single CSS keyframe that interpolates translate + scale together.

**Tech Stack:** Plain DOM + dojo (BGA's framework), CSS keyframe animations, BGA notif subscribers (no React, no build step).

**Verification approach:** This codebase has no JS unit tests for UI/animation; existing `tests/` are PHP. Per-task verification is **manual in a BGA staging environment**. Each task ends with a specific browser walkthrough. The dev workflow: bump `JS_VERSION` (already automated per task), open the table in BGA studio, exercise the path, confirm the expected behavior in the in-game state described.

---

## File Structure

| File | Role in this plan |
|---|---|
| `theoracleofdelphigzed.css` | New `.card-picker-dismiss` button, `.delphi-picking-card` clone, `@keyframes delphi-pick-flight`, `.delphi-card-picker.fading-out` opacity state |
| `theoracleofdelphigzed.js` | All JS changes: picker DOM template, `_showCardPicker` simplification + new opts, new `_commitPickerSelection`, `_showEquipmentStrip` / `_showCompanionStrip` rework, `notif_companionSelected` skip-duplicate guard, removal of `_showRecoveryPicker`, new `_setupRecoverDiscardAffordance` family, `onEnteringState`/`onLeavingState` for Recover, cache-bust bumps |
| `modules/js/Components.js` | Used (not modified) — existing `removeInjuryCard(color)` decrements a stack and removes the card when count hits 0 |
| `docs/superpowers/specs/2026-05-10-card-pickers-pick-on-click-design.md` | Spec (already committed). Do not edit during implementation. |

Each task below is self-contained and ends with a working commit.

---

## Task 1: CSS — dismiss button, clone class, pick-flight keyframes

**Files:**
- Modify: `theoracleofdelphigzed.css` (append near the existing `.card-picker-*` block around line 3429)

- [ ] **Step 1: Add the dismiss-button styles**

Find the `.card-picker-card` block at `theoracleofdelphigzed.css:3429`. Add this CSS BEFORE that block (so it lives near the picker chrome rules already there):

```css
/* Green-X dismiss button at the top-right of the card picker dialog.
   Matches BGA's standard "X to close" convention so players have a
   recognizable escape hatch. The button is absolute-positioned inside
   the picker; the picker itself is position: relative so this anchors
   to the dialog's top-right regardless of contents. */
.card-picker-dismiss {
    position: absolute;
    top: -12px;
    right: -12px;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: #2ea043;
    color: white;
    font-size: 18px;
    font-weight: bold;
    line-height: 32px;
    text-align: center;
    cursor: pointer;
    padding: 0;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
    z-index: 2;
    transition: background 0.15s, transform 0.15s;
}

.card-picker-dismiss:hover {
    background: #3fb955;
    transform: scale(1.08);
}

.card-picker-dismiss::before {
    content: "\00d7"; /* multiplication-sign U+00D7 — visual "X" */
}

/* Picker fades out during a commit-on-click pick. Backdrop fades
   alongside. The 600ms matches the pick-flight keyframe duration so
   the popup vanishes exactly as the clone reaches its destination. */
.delphi-card-picker.fading-out,
.card-picker-backdrop.fading-out {
    opacity: 0;
    transition: opacity 600ms ease-out;
    pointer-events: none;
}
```

- [ ] **Step 2: Add the picking-card clone class and keyframe**

Append this block at the END of `theoracleofdelphigzed.css` (after the last rule in the file):

```css
/* =====================================================
   PICK-ON-CLICK FLIGHT
   ===================================================== */

/* Body-level clone spawned at the picker card's rect on commit.
   Drives the single overlapping motion: translates toward the
   destination while scaling up to 2x at midpoint then down to
   the destination size. CSS custom properties supply the per-
   instance values (--pick-mid-x/y/scale, --pick-dest-x/y/scale-x/y)
   so a single @keyframes works for any source/destination pair. */
.delphi-picking-card {
    position: fixed;
    background-size: cover;
    background-position: center;
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    z-index: 1200;
    pointer-events: none;
    transform-origin: center;
    animation: delphi-pick-flight 600ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
}

@keyframes delphi-pick-flight {
    0% {
        transform: translate(0, 0) scale(1);
    }
    50% {
        transform: translate(var(--pick-mid-x), var(--pick-mid-y)) scale(2);
    }
    100% {
        transform: translate(var(--pick-dest-x), var(--pick-dest-y))
                   scale(var(--pick-dest-scale-x), var(--pick-dest-scale-y));
    }
}

/* The picker's own source card hides while its clone is flying so
   the eye doesn't see the original sit in place during the animation. */
.card-picker-card.committed {
    visibility: hidden;
}
```

- [ ] **Step 3: Verify the picker is position-relative (needed for the absolute dismiss button)**

Search the CSS for the `.delphi-card-picker` (or `#delphi-card-picker`) selector. Open `theoracleofdelphigzed.css` and grep:

```bash
grep -n '#delphi-card-picker\b\|\.delphi-card-picker\b' theoracleofdelphigzed.css
```

Expected: a rule for `#delphi-card-picker` exists with `position: fixed` (or similar). The dismiss button is `position: absolute`, so the picker just needs ANY non-static `position`. Fixed counts. If you don't find one, ADD `position: relative` to the existing picker rule.

- [ ] **Step 4: Commit**

```bash
git add theoracleofdelphigzed.css
git commit -m "feat(picker): css for dismiss button + pick-flight clone animation"
```

---

## Task 2: Add the dismiss button to the picker DOM template

**Files:**
- Modify: `theoracleofdelphigzed.js:299-304` (the picker DOM template literal)

- [ ] **Step 1: Add the dismiss button element to the template**

Open `theoracleofdelphigzed.js`. Find the existing picker DOM template at line 299:

```js
'<div id="delphi-card-picker-backdrop" class="card-picker-backdrop"></div>' +
'<div id="delphi-card-picker" role="dialog" aria-modal="true" aria-labelledby="card-picker-title">' +
    '<div class="card-picker-title" id="card-picker-title"></div>' +
    '<div class="card-picker-cards" id="card-picker-cards"></div>' +
    '<div class="card-picker-actions" id="card-picker-actions"></div>' +
'</div>' +
```

Replace it with (note the new `<button>` line):

```js
'<div id="delphi-card-picker-backdrop" class="card-picker-backdrop"></div>' +
'<div id="delphi-card-picker" role="dialog" aria-modal="true" aria-labelledby="card-picker-title">' +
    '<button id="card-picker-dismiss" class="card-picker-dismiss" type="button" aria-label="Close"></button>' +
    '<div class="card-picker-title" id="card-picker-title"></div>' +
    '<div class="card-picker-cards" id="card-picker-cards"></div>' +
    '<div class="card-picker-actions" id="card-picker-actions"></div>' +
'</div>' +
```

The X glyph itself comes from the `::before` content in the CSS — leaving the button text empty keeps the markup clean.

- [ ] **Step 2: Bump the cache-bust so the new DOM ships**

Find the `?v268` markers near the top of `theoracleofdelphigzed.js` and the `JS_VERSION` property. Replace all `?v268` → `?v269` and `JS_VERSION: "v268"` → `JS_VERSION: "v269"`.

```bash
grep -n '?v268\|JS_VERSION' theoracleofdelphigzed.js
```

Update each occurrence.

- [ ] **Step 3: Verify in a browser**

Reload a BGA table that's in `SelectReward` (companion). The picker should open with a green-X button at its top-right corner. The button does nothing yet (no click handler in this task). Confirm the X positions correctly and isn't clipped by anything.

- [ ] **Step 4: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat(picker): add dismiss button + bump cache-bust to v269"
```

---

## Task 3: `_showCardPicker` — pickOnClick mode, onDismiss, drop multi-select + cancel branches

**Files:**
- Modify: `theoracleofdelphigzed.js:5764-5912` (the entire `_showCardPicker` function body)

- [ ] **Step 1: Replace the function body**

Open `theoracleofdelphigzed.js`. Find `_showCardPicker:` at line 5764. Replace the whole function (lines 5764-5912 — from `_showCardPicker: function(opts) {` through the closing `},`) with this:

```js
        _showCardPicker: function(opts) {
            var picker = document.getElementById('delphi-card-picker');
            var backdrop = document.getElementById('delphi-card-picker-backdrop');
            var dismissBtn = document.getElementById('card-picker-dismiss');
            var titleEl = document.getElementById('card-picker-title');
            var cardsEl = document.getElementById('card-picker-cards');
            var actionsEl = document.getElementById('card-picker-actions');
            if (!picker || !backdrop || !titleEl || !cardsEl || !actionsEl) return;
            var self = this;

            // Cancel any pending exit cleanup from a recent _hideCardPicker —
            // otherwise the queued setTimeout would wipe the cards we're
            // about to populate.
            if (this._cardPickerExitTimer) {
                clearTimeout(this._cardPickerExitTimer);
                this._cardPickerExitTimer = null;
            }

            // Pickers are single-select after the recovery picker was
            // retired (see 2026-05-10 design doc). Multi-select state
            // bookkeeping intentionally removed.
            this._clearTooltipsIn(cardsEl);
            cardsEl.innerHTML = '';
            actionsEl.innerHTML = '';
            picker.classList.remove('fading-out');
            backdrop.classList.remove('fading-out');

            cardsEl.classList.remove('card-picker-cards--cols-3');
            if (opts.gridColumns === 3) {
                cardsEl.classList.add('card-picker-cards--cols-3');
            }

            titleEl.textContent = opts.title || '';

            // Wire the X dismiss button. Removing then re-adding a listener
            // is safer than tracking handles across show/hide cycles.
            if (dismissBtn) {
                if (this._cardPickerDismissHandler) {
                    dismissBtn.removeEventListener('click', this._cardPickerDismissHandler);
                }
                this._cardPickerDismissHandler = function() {
                    self._hideCardPicker();
                    if (typeof opts.onDismiss === 'function') opts.onDismiss();
                };
                dismissBtn.addEventListener('click', this._cardPickerDismissHandler);
            }

            var pickOnClick = opts.pickOnClick === true;

            var cardClass = 'card-picker-card' + (opts.cardOrientation === 'portrait' ? ' card-picker-card--portrait' : '');
            (opts.cards || []).forEach(function(card, idx) {
                var cardEl = document.createElement('div');
                cardEl.className = cardClass;
                cardEl.id = 'card-picker-card-' + card.id;
                cardEl.dataset.cardId = card.id;
                cardEl.style.backgroundImage = "url('" + card.imageUrl + "')";
                cardEl.style.animationDelay = (idx * 70) + 'ms';
                cardEl.addEventListener('click', function() {
                    var cardId = parseInt(card.id);
                    if (pickOnClick) {
                        // Defer to the commit helper which fires the server
                        // action, spawns the flight clone, and tears down
                        // the picker over 600ms.
                        self._commitPickerSelection(cardId, cardEl, opts);
                    } else if (typeof opts.onConfirm === 'function') {
                        // Legacy direct-confirm path (no pickOnClick). Only
                        // here so callers can opt out of the animation flow
                        // if needed; not currently used after Recover moved
                        // off the picker.
                        self._hideCardPicker();
                        opts.onConfirm(cardId);
                    }
                });
                cardsEl.appendChild(cardEl);
                if (card.tooltipHtml) {
                    self.addTooltipHtml(cardEl.id, card.tooltipHtml);
                }
            });

            cardsEl.classList.add('dealing');
            var lastCard = cardsEl.lastElementChild;
            if (lastCard) {
                var onLastDealEnd = function() {
                    lastCard.removeEventListener('animationend', onLastDealEnd);
                    cardsEl.classList.remove('dealing');
                };
                lastCard.addEventListener('animationend', onLastDealEnd);
            }

            requestAnimationFrame(function() {
                backdrop.classList.add('active');
                picker.classList.add('active');
            });
        },
```

- [ ] **Step 2: Verify in a browser**

Reload a table that lands in `SelectReward`. The picker still opens, the cards still deal in with stagger, and clicking a card does nothing yet (the `_commitPickerSelection` from Task 4 is missing) — that's expected. The X button now closes the picker (calling `_hideCardPicker`).

Also reload a table that lands in `Recover` to make sure the old `_showRecoveryPicker` still works — it passes `selectCount: 3`, which the new code ignores (the multi-select branch is gone). The picker will open as single-select with no Confirm button until Task 8 retires the caller. **Confirm: clicking an injury does nothing for now (no `pickOnClick` flag passed, no Confirm button rendered).** Recover will be temporarily broken until Task 8 — this is acceptable mid-plan because Task 8 lands before the cache-bust commit.

Actually, to avoid that breakage in mid-plan testing, do Step 3 here:

- [ ] **Step 3: Temporarily keep `_showRecoveryPicker` working — add a TODO-bridge pickOnClick path that calls onConfirm directly with a 1-id array**

Open `_showRecoveryPicker` at line 5650. Replace its `_showCardPicker` call (the whole `this._showCardPicker({ ... })` invocation around line 5666-5676) with:

```js
            // TODO(2026-05-10 plan task 8): replace this picker entirely
            // with a click-on-board affordance. Temporary bridge: keep the
            // legacy non-pickOnClick path alive so Recover doesn't break
            // mid-plan. The picker will be unreachable after Task 8.
            this._showCardPicker({
                title: _('Select 3 injury cards to discard'),
                cards: cards,
                cardOrientation: 'landscape',
                // No pickOnClick — falls through to the legacy single-click
                // onConfirm. Players need to triple-click here, which is
                // wrong UX but functional until Task 8 lands.
                onConfirm: function(cardId) {
                    // Stub: gather a single id and fire immediately.
                    self.bgaPerformAction('actDiscardInjuries', {
                        cardIdsJson: JSON.stringify([cardId]),
                    });
                },
            });
```

This is **deliberately broken** UX (single-click discards 1 card instead of 3, and the server rejects with "You must select exactly 3"). The intent is to keep the file compiling and the picker open. Recover will be unusable for testing between tasks 3 and 8 — that's acceptable since the new Recover flow ships in Task 8.

(If you'd rather not introduce this temporary break, you can reorder so Task 8 happens immediately after Task 3. The plan as written keeps Task 8 at its natural position so the Equipment + Companion path can be verified first.)

- [ ] **Step 4: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "refactor(picker): single-select only + pickOnClick flag + onDismiss wire-up"
```

---

## Task 4: `_commitPickerSelection` — the new pick-and-fly helper

**Files:**
- Modify: `theoracleofdelphigzed.js` (add a new method right after `_showCardPicker`'s closing `},` — so around line 5913 in the post-Task-3 numbering)

- [ ] **Step 1: Add the new method**

After the closing `},` of `_showCardPicker`, INSERT this block (before `_hideCardPicker:` starts):

```js
        // Commit a single pick from the card-picker modal: fire the server
        // action immediately (optimistic), spawn a body-level clone that
        // flies from the clicked card to a destination on the player
        // board, and fade the picker out alongside. The clone uses CSS
        // custom properties so a single keyframe drives any source →
        // destination interpolation. opts.getDestination(cardId) is the
        // caller-supplied resolver that returns { x, y, width, height }
        // in viewport coords for the final landing rect.
        _commitPickerSelection: function(cardId, cardEl, opts) {
            var picker = document.getElementById('delphi-card-picker');
            var backdrop = document.getElementById('delphi-card-picker-backdrop');
            if (!picker || !cardEl || typeof opts.getDestination !== 'function') {
                // Degraded path: just close the picker and fire the action.
                if (typeof opts.onConfirm === 'function') opts.onConfirm(cardId);
                this._hideCardPicker();
                return;
            }

            // 1. Capture the source rect BEFORE hiding the card so we
            //    don't measure post-visibility-hidden zero dims.
            var srcRect = cardEl.getBoundingClientRect();
            cardEl.classList.add('committed'); // visibility:hidden

            // 2. Resolve destination rect (caller-supplied — Equipment
            //    computes from the hand-strip layout, Companion pre-
            //    appends an invisible card and returns its rect).
            var destRect = opts.getDestination(cardId);
            if (!destRect) {
                // Fallback: just close and fire action without animating.
                if (typeof opts.onConfirm === 'function') opts.onConfirm(cardId);
                this._hideCardPicker();
                return;
            }

            // 3. Fire the server action immediately — animation overlaps
            //    with the server roundtrip. Picker actions in this game
            //    have no preconditions that change between open and
            //    commit, so optimistic UI is safe (see spec Risks).
            if (typeof opts.onConfirm === 'function') opts.onConfirm(cardId);

            // 4. Spawn the body-level clone at the source rect.
            var clone = document.createElement('div');
            clone.className = 'delphi-picking-card';
            clone.style.left = srcRect.left + 'px';
            clone.style.top = srcRect.top + 'px';
            clone.style.width = srcRect.width + 'px';
            clone.style.height = srcRect.height + 'px';
            clone.style.backgroundImage = getComputedStyle(cardEl).backgroundImage;

            var srcCenterX = srcRect.left + srcRect.width / 2;
            var srcCenterY = srcRect.top + srcRect.height / 2;
            var destCenterX = destRect.x + destRect.width / 2;
            var destCenterY = destRect.y + destRect.height / 2;
            var dx = destCenterX - srcCenterX;
            var dy = destCenterY - srcCenterY;

            clone.style.setProperty('--pick-mid-x', (dx / 2) + 'px');
            clone.style.setProperty('--pick-mid-y', (dy / 2) + 'px');
            clone.style.setProperty('--pick-dest-x', dx + 'px');
            clone.style.setProperty('--pick-dest-y', dy + 'px');
            clone.style.setProperty('--pick-dest-scale-x', (destRect.width / srcRect.width));
            clone.style.setProperty('--pick-dest-scale-y', (destRect.height / srcRect.height));

            document.body.appendChild(clone);

            // 5. Fade the picker + backdrop alongside the flight (600ms).
            picker.classList.add('fading-out');
            if (backdrop) backdrop.classList.add('fading-out');

            // 6. On animationend (or 700ms safety net), tear down the
            //    clone and the picker DOM. The destination card is
            //    materialized by the caller's getDestination (Companion)
            //    or by the notif handler (Equipment).
            var self = this;
            var done = false;
            var finish = function() {
                if (done) return;
                done = true;
                if (clone.parentNode) clone.parentNode.removeChild(clone);
                self._hideCardPicker();
            };
            clone.addEventListener('animationend', finish, { once: true });
            setTimeout(finish, 700);
        },
```

- [ ] **Step 2: Verify nothing breaks for callers that don't pass `pickOnClick`**

Reload `SelectReward` and `CombatVictory` — both still use the legacy `onConfirm` path (Task 5/6 wires `pickOnClick`). The new helper is dormant. The Recover bridge from Task 3 also still works (kind of — see Task 3 note).

- [ ] **Step 3: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat(picker): _commitPickerSelection helper for single-click commit + clone flight"
```

---

## Task 5: `_showEquipmentStrip` — opt into pickOnClick, add reentry button

**Files:**
- Modify: `theoracleofdelphigzed.js:5948-5975` (the `_showEquipmentStrip` function body)
- Modify: `theoracleofdelphigzed.js` (the `onUpdateActionButtons` `case 'CombatVictory'` — around line 4964-4993, to also restore the reentry button on reload)

- [ ] **Step 1: Replace `_showEquipmentStrip`**

Find `_showEquipmentStrip: function()` (around line 5948). Replace the WHOLE function (start at the function declaration, end at the closing `},`) with:

```js
        _showEquipmentStrip: function() {
            var self = this;
            // Title is owned by the picker dialog itself — clear the
            // BGA pagemaintitle while the picker is up. The action bar
            // gets the reentry button (so X-dismiss still has a path
            // back) instead of being wiped.
            var titleEl = document.getElementById('pagemaintitletext');
            if (titleEl) titleEl.innerHTML = '';
            this._addEquipmentPickerReentryButton();

            var cards = (this._equipmentCards || []).map(function(card) {
                var typeArg = parseInt(card.card_type_arg);
                var cardNum = String(typeArg).padStart(3, '0');
                return {
                    id: parseInt(card.card_id),
                    imageUrl: g_gamethemeurl + 'img/equipment/card-' + cardNum + '.jpg',
                    tooltipHtml: self._buildEquipmentTooltipHtml(typeArg),
                };
            });

            this._showCardPicker({
                title: _('Select an Equipment Card'),
                cards: cards,
                cardOrientation: 'landscape',
                gridColumns: 3,
                pickOnClick: true,
                onConfirm: function(cardId) {
                    self.bgaPerformAction('actSelectEquipment', { card_id: cardId });
                },
                onDismiss: function() {
                    // X close: leave the action-bar reentry button intact
                    // so the player can re-open the picker.
                    // _addEquipmentPickerReentryButton is idempotent.
                    self._addEquipmentPickerReentryButton();
                },
                getDestination: function(cardId) {
                    return self._resolveEquipmentDestRect();
                },
            });
        },

        // Reentry button on the status bar — opens (or re-opens) the
        // equipment picker. Idempotent: removes any prior copy before
        // appending so refresh paths can call freely. Removed once a
        // card is committed (the state transitions and the bar reshuffles).
        _addEquipmentPickerReentryButton: function() {
            if (!this.isCurrentPlayerActive()) return;
            var bar = document.getElementById('generalactions');
            if (!bar) return;
            var existing = document.getElementById('btn-picker-reentry-equipment');
            if (existing) existing.remove();
            var self = this;
            var btn = this.statusBar.addActionButton(
                _('Select Equipment Card'),
                function() { self._showEquipmentStrip(); }
            );
            if (btn) btn.id = 'btn-picker-reentry-equipment';
        },

        // Compute the rect of the equipment hand-strip slot the next
        // card will land in. Avoids the pre-append-invisible trick used
        // for companion because the equipment hand strip's layout is
        // deterministic from existing-card count. Returns { x, y, width,
        // height } in viewport coords, or null if the container is
        // missing.
        _resolveEquipmentDestRect: function() {
            var container = document.getElementById('delphi-equipment-cards-area');
            if (!container) return null;
            // Final card rendered size (matches .delphi-equipment-card CSS).
            var W = 140, H = 94;
            var rect = container.getBoundingClientRect();
            var existingCount = container.querySelectorAll('.delphi-equipment-card').length;
            var styles = getComputedStyle(container);
            var gap = parseFloat(styles.gap || styles.columnGap || '0') || 0;
            // The strip is a horizontal flex row; new card appends at the
            // right of the existing ones. Origin is the container's left
            // edge plus prior cards + their gaps.
            var x = rect.left + existingCount * (W + gap);
            var y = rect.top;
            return { x: x, y: y, width: W, height: H };
        },
```

- [ ] **Step 2: Restore reentry button on reload mid-CombatVictory**

Find the `case 'CombatVictory':` branch in `onUpdateActionButtons` (around line 4964). At the END of that case, AFTER the existing if/else that decides between the combat-dialog button and direct `_showEquipmentStrip()` call, the picker is already opened OR the combat dialog has its button. The action-bar reentry button is now also added inside `_showEquipmentStrip` itself, so a normal entry covers it. **No change needed in this step** — the reload-into-CombatVictory case calls `_showEquipmentStrip()` directly (line 4991), which now adds the reentry button.

If the combat dialog is still active on reload (uncommon — dialogs don't persist across reloads), the existing "Select Equipment Card" button inside the dialog opens the picker, which also adds the reentry button. Either path lands at a consistent state.

- [ ] **Step 3: Verify in a browser**

Win a combat and pick an equipment card. Expected:
- Picker opens, X button visible at top-right.
- Status bar shows "Select Equipment Card" button (text only, no icon).
- Click a card → it scales up 2x, flies to your hand strip's next empty slot, shrinks down to 140×94 on landing. Picker fades out alongside.
- Card materializes in the hand strip (notif handler runs after — its `addEquipmentCard` call is the first time the real card exists in the DOM).
- Status bar reshuffles to the next state's buttons (no leftover reentry button).
- Alternative path: dismiss with X. Picker disappears, reentry button stays. Click reentry → picker reopens with same cards.

- [ ] **Step 4: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat(equipment-pick): single-click commit + 600ms flight to hand strip + reentry button"
```

---

## Task 6: `_showCompanionStrip` — pickOnClick + reentry + pre-append destination

**Files:**
- Modify: `theoracleofdelphigzed.js:5977-6002` (the `_showCompanionStrip` function body)

- [ ] **Step 1: Replace `_showCompanionStrip`**

Find `_showCompanionStrip: function()` (around line 5977 after Task 5 lands). Replace the whole function with:

```js
        _showCompanionStrip: function() {
            var self = this;
            var titleEl = document.getElementById('pagemaintitletext');
            if (titleEl) titleEl.innerHTML = '';
            this._addCompanionPickerReentryButton();

            var cards = (this._companionCards || []).map(function(card) {
                var typeArg = parseInt(card.card_type_arg);
                var typeIdx = typeArg % 3;
                return {
                    id: parseInt(card.card_id),
                    imageUrl: g_gamethemeurl + 'img/companion/' + card.color + '-card-' + typeIdx + '.png',
                    tooltipHtml: self._buildCompanionTooltipHtml(typeArg),
                };
            });

            this._showCardPicker({
                title: _('Select a Companion Card'),
                cards: cards,
                cardOrientation: 'portrait',
                pickOnClick: true,
                onConfirm: function(cardId) {
                    self.bgaPerformAction('actSelectReward', { card_id: cardId });
                },
                onDismiss: function() {
                    self._addCompanionPickerReentryButton();
                },
                getDestination: function(cardId) {
                    // Pre-append the real companion card to the cards-area
                    // (visibility:hidden) so the flight has a deterministic
                    // landing slot. The notif handler will detect the
                    // already-existing card and skip its duplicate
                    // addCompanionCard call (Task 7).
                    var card = (self._companionCards || []).find(function(c) {
                        return parseInt(c.card_id) === parseInt(cardId);
                    });
                    if (!card) return null;
                    var typeArg = parseInt(card.card_type_arg);
                    var typeIdx = typeArg % 3;
                    var imgUrl = g_gamethemeurl + 'img/companion/' + card.color + '-card-' + typeIdx + '.png';
                    self.components.addCompanionCard(
                        parseInt(cardId),
                        'companion',
                        card.color,
                        imgUrl,
                        { gameModule: self, cardTypeArg: typeArg }
                    );
                    var landed = self.components.companionCards.get(parseInt(cardId));
                    if (!landed) return null;
                    landed.style.visibility = 'hidden';
                    var rect = landed.getBoundingClientRect();
                    // Reveal at flight end. We use the existing notif's
                    // playerPanel.updateCompanions path to handle the
                    // panel slot rewrite; this only flips visibility on
                    // the cards-area card.
                    self._pendingCompanionReveal = parseInt(cardId);
                    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
                },
            });
        },

        _addCompanionPickerReentryButton: function() {
            if (!this.isCurrentPlayerActive()) return;
            var bar = document.getElementById('generalactions');
            if (!bar) return;
            var existing = document.getElementById('btn-picker-reentry-companion');
            if (existing) existing.remove();
            var self = this;
            var btn = this.statusBar.addActionButton(
                _('Select Companion Card'),
                function() { self._showCompanionStrip(); }
            );
            if (btn) btn.id = 'btn-picker-reentry-companion';
        },
```

- [ ] **Step 2: Hook the reveal into the flight's animationend**

The pre-append puts the card at the correct slot but visibility-hidden. The flight clone lands there. We need to flip visibility on at the same `animationend` that tears down the clone. Add to `_commitPickerSelection` (from Task 4) — replace its `finish` body. Find the `var finish = function() { ... }` block and replace with:

```js
            var finish = function() {
                if (done) return;
                done = true;
                if (clone.parentNode) clone.parentNode.removeChild(clone);
                // Companion path stashes the pre-appended card id in
                // _pendingCompanionReveal; flip visibility back on now
                // that the flight has reached it.
                if (self._pendingCompanionReveal != null) {
                    var landedEl = self.components.companionCards.get(self._pendingCompanionReveal);
                    if (landedEl) landedEl.style.visibility = '';
                    self._pendingCompanionReveal = null;
                }
                self._hideCardPicker();
            };
```

- [ ] **Step 3: Verify in a browser**

Trigger `SelectReward` (typically via combat reward path or scout reveal). Expected:
- Picker opens with companion cards in portrait orientation, X button visible.
- Status bar shows "Select Companion Card" button (no icon).
- Click a card → enlarges 2x, flies toward the right-side companion cards-area column, shrinks to 94×140. On landing, the real card is visible at the top of the column (first card) or appended below existing ones.
- Dismiss-with-X then reentry-click both work.
- Picking the 2nd, 3rd companion lands at the right slot too.

- [ ] **Step 4: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat(companion-pick): single-click commit + 600ms flight + reveal on landing"
```

---

## Task 7: `notif_companionSelected` — skip duplicate `addCompanionCard` when pre-appended

**Files:**
- Modify: `theoracleofdelphigzed.js:7376-7459` (the `notif_companionSelected` function body)

- [ ] **Step 1: Add the skip guard**

Find `notif_companionSelected: async function(args) {` (around line 7376). Locate the block we changed yesterday that pre-appends the local card. With the picker now pre-appending in `_showCompanionStrip.getDestination`, this notif path needs to detect "the local viewer already has the card in components.companionCards" and skip the second add.

Replace the entire `isSelf` pre-append block (the one with the `selfCardEl = ...addCompanionCard(...)` call) — that's around line 7416-7427 — with this guarded version:

```js
            // For the local viewer, the picker may have already pre-
            // appended the real card during _commitPickerSelection
            // (visibility:hidden, flipped on at flight end). Detect that
            // case and skip the duplicate add. The non-picker entry path
            // (e.g. when a card is acquired via some other flow) still
            // goes through the pre-append-then-fly pattern from
            // yesterday's fix.
            var selfCardEl = null;
            if (isSelf) {
                var existing = this.components.companionCards.get(parseInt(args.card_id, 10));
                if (existing) {
                    // Picker already placed it. Nothing to do here.
                    selfCardEl = existing;
                } else {
                    this.components.addCompanionCard(
                        parseInt(args.card_id),
                        args.subtype || 'companion',
                        color,
                        imgUrl,
                        { gameModule: this, cardTypeArg: cardTypeArg }
                    );
                    selfCardEl = this.components.companionCards.get(parseInt(args.card_id));
                    if (selfCardEl) selfCardEl.style.visibility = 'hidden';
                }
            }
```

The rest of the function (the `_flyCard` call, panel update, deck top render) stays the same. Note: if the picker path took over (existing card found), the subsequent `_flyCard` will start from the source deck and land on the now-visible local card, which is **redundant** with the picker's clone flight. We need to skip the `_flyCard` too in that case.

- [ ] **Step 2: Skip the redundant deck → card flight when the picker handled it**

Find the `this._flyCard({` call inside `notif_companionSelected` (around line 7438). Wrap it in a guard:

```js
            // Skip the deck-to-cards flight when the picker already
            // animated the card to its slot via _commitPickerSelection.
            // The picker's clone IS the flight for the local viewer; the
            // opponent path (no pre-append) still runs this flight.
            var pickerHandledLocalFlight = isSelf && !!this.components.companionCards.get(parseInt(args.card_id, 10))
                && getComputedStyle(this.components.companionCards.get(parseInt(args.card_id, 10))).visibility !== 'hidden';
```

Wait — at the time this notif fires, the local card may still be visibility:hidden (flight not complete yet). Use a simpler signal: stash a flag on the game module when the picker is handling the flight.

Replace the picker's destination resolver in Task 6 to ALSO set:

Open Task 6's `getDestination` in `_showCompanionStrip` — add ONE line after `self._pendingCompanionReveal = parseInt(cardId);`:

```js
                    self._companionPickerHandled = parseInt(cardId);
```

And in `_commitPickerSelection`'s finish callback (Task 6 step 2), add a cleanup:

```js
            var finish = function() {
                if (done) return;
                done = true;
                if (clone.parentNode) clone.parentNode.removeChild(clone);
                if (self._pendingCompanionReveal != null) {
                    var landedEl = self.components.companionCards.get(self._pendingCompanionReveal);
                    if (landedEl) landedEl.style.visibility = '';
                    self._pendingCompanionReveal = null;
                }
                // _companionPickerHandled is consumed by notif_companionSelected;
                // clear it in case the notif already fired (race).
                if (self._companionPickerHandled != null) {
                    self._companionPickerHandled = null;
                }
                self._hideCardPicker();
            };
```

Then in `notif_companionSelected`, guard the `_flyCard` block:

```js
            var pickerHandledLocalFlight = isSelf && (this._companionPickerHandled === parseInt(args.card_id, 10));
            if (pickerHandledLocalFlight) {
                // Picker's clone is the flight. Skip the deck-to-cards
                // _flyCard and just do the onLanding work directly.
                this._companionPickerHandled = null;
                if (ps) {
                    this.components.playerPanel.updateCompanions(args.player_id, ps.companions);
                    this._refreshMovementHex(args.player_id);
                }
                this._renderCompanionDeckTop(args.new_top_card || null);
                this._adjustDeckCount('companion', -1);
                return;
            }
```

Insert this guard right before the existing `this._flyCard({` call. The early return skips the deck→card flight and runs the equivalent onLanding work inline.

- [ ] **Step 3: Verify**

Same test as Task 6: pick a companion via the picker. Verify the card travels via the picker clone (single flight), NOT a double flight (one from picker + one from deck). Pre-existing flows where companion arrives via a non-picker code path (if any) still animate from the deck.

- [ ] **Step 4: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "fix(companion-notif): skip duplicate flight when picker pre-appended"
```

---

## Task 8: Recover — replace modal picker with click-on-board affordance

**Files:**
- Modify: `theoracleofdelphigzed.js` — remove `_showRecoveryPicker` (around lines 5645-5689); replace `case 'Recover':` in `onEnteringState` (line 3979); add `case 'Recover':` cleanup in `onLeavingState`; add 3 new methods (`_setupRecoverDiscardAffordance`, `_onRecoverInjuryClick`, `_teardownRecoverDiscardAffordance`)

- [ ] **Step 1: Delete `_showRecoveryPicker` entirely**

Find `_showRecoveryPicker: function(injuryCards) {` (around line 5650 — note this was edited in Task 3). Delete the WHOLE function and its preceding doc comment (`// Recover state: player has too many...`) lines. The next function after deletion should be `_showCardPicker`.

- [ ] **Step 2: Add the three new methods**

Where `_showRecoveryPicker` used to live (between the surrounding methods — typically right before `_showCardPicker:`), INSERT:

```js
        // Recover state: player must discard exactly 3 injury cards.
        // Replaces the old modal picker with direct clicks on the
        // player's own injury hand area (#delphi-injury-cards-area).
        // Each click flies one injury card to the supply discard pile
        // and decrements the corresponding color stack. After the
        // third click, fires actDiscardInjuries with all 3 ids batched.
        _setupRecoverDiscardAffordance: function(injuryCards) {
            this._teardownRecoverDiscardAffordance();
            this._recoverInjuryCards = (injuryCards || []).slice(); // [{ card_id, color }, ...]
            this._recoverPicks = [];
            this._recoverInjuryHandlers = [];
            this._updateRecoverTitle();

            var self = this;
            var area = document.getElementById('delphi-injury-cards-area');
            if (!area) return;
            var stacks = area.querySelectorAll('.delphi-injury-card');
            stacks.forEach(function(el) {
                el.classList.add('injury-discardable');
                var handler = function() { self._onRecoverInjuryClick(el); };
                el.addEventListener('click', handler);
                self._recoverInjuryHandlers.push({ el: el, handler: handler });
            });
        },

        _onRecoverInjuryClick: function(el) {
            if (!this._recoverPicks || this._recoverPicks.length >= 3) return;
            var color = el.dataset.color;
            // Pop any id of this color that isn't already in picks.
            var nextId = null;
            for (var i = 0; i < this._recoverInjuryCards.length; i++) {
                var c = this._recoverInjuryCards[i];
                if (c.color === color && this._recoverPicks.indexOf(c.card_id) === -1) {
                    nextId = c.card_id;
                    break;
                }
            }
            if (nextId === null) return;
            this._recoverPicks.push(nextId);
            this._updateRecoverTitle();

            // Decrement the source stack badge eagerly. If the stack is
            // about to empty, _flyCard will see a still-visible source
            // for its measurement before we mutate the DOM, so capture
            // the rect first.
            var sourceRect = el.getBoundingClientRect();
            var bgImg = getComputedStyle(el).backgroundImage;
            this.components.removeInjuryCard(color); // decrements badge or removes el

            // Fly a clone of the (formerly-clicked) card to the supply
            // discard pile. Use _flyCard's deck-flight semantics: source
            // size = injury card 140x94 landscape, destination = injury
            // supply slot 63x95 portrait → 90deg rotation handles the
            // orientation flip.
            var supplyEl = document.getElementById('supply-deck-injury');
            if (supplyEl) {
                // Build a transient anchor at the source rect so _flyCard
                // can read it. The original element may have been removed
                // by removeInjuryCard above.
                var anchor = document.createElement('div');
                anchor.style.position = 'fixed';
                anchor.style.left = sourceRect.left + 'px';
                anchor.style.top = sourceRect.top + 'px';
                anchor.style.width = sourceRect.width + 'px';
                anchor.style.height = sourceRect.height + 'px';
                anchor.style.backgroundImage = bgImg;
                anchor.style.backgroundSize = 'cover';
                anchor.style.visibility = 'hidden';
                document.body.appendChild(anchor);
                var self = this;
                this._flyCard({
                    from: anchor,
                    to: supplyEl,
                    backgroundImage: bgImg,
                    targetWidth: 95,  // swapped (landscape → portrait via 90deg)
                    targetHeight: 63,
                    rotation: 90,
                    onLanding: function() {
                        if (anchor.parentNode) anchor.parentNode.removeChild(anchor);
                    },
                });
            }

            if (this._recoverPicks.length === 3) {
                this._teardownRecoverDiscardAffordance();
                this.bgaPerformAction('actDiscardInjuries', {
                    cardIdsJson: JSON.stringify(this._recoverPicks),
                });
            }
        },

        _updateRecoverTitle: function() {
            var titleEl = document.getElementById('pagemaintitletext');
            if (!titleEl) return;
            var remaining = 3 - (this._recoverPicks ? this._recoverPicks.length : 0);
            if (remaining === 3) {
                titleEl.textContent = _('Discard 3 injury cards');
            } else if (remaining === 2) {
                titleEl.textContent = _('Discard 2 more injury cards');
            } else if (remaining === 1) {
                titleEl.textContent = _('Discard 1 more injury card');
            } else {
                titleEl.textContent = '';
            }
        },

        _teardownRecoverDiscardAffordance: function() {
            if (this._recoverInjuryHandlers) {
                this._recoverInjuryHandlers.forEach(function(entry) {
                    entry.el.classList.remove('injury-discardable');
                    entry.el.removeEventListener('click', entry.handler);
                });
            }
            this._recoverInjuryHandlers = null;
            this._recoverInjuryCards = null;
            this._recoverPicks = null;
        },
```

- [ ] **Step 3: Wire `onEnteringState 'Recover'` to the new affordance**

Find `case 'Recover':` in `onEnteringState` (around line 3979). Replace its body with:

```js
                case 'Recover':
                    if (this.isCurrentPlayerActive() && args.args) {
                        this._setupRecoverDiscardAffordance(args.args.injuryCards || []);
                    }
                    break;
```

(Delete the old `this._showRecoveryPicker(...)` call.)

- [ ] **Step 4: Wire `onLeavingState 'Recover'` cleanup**

Find the `onLeavingState` function. Locate the `switch (stateName)` inside. Add (or extend) a `case 'Recover':`:

```js
                case 'Recover':
                    this._teardownRecoverDiscardAffordance();
                    break;
```

If a `Recover` case already exists, just add the `_teardownRecoverDiscardAffordance()` call inside.

- [ ] **Step 5: Remove the `injury-discardable` class collision check**

The existing `_setupInjuryDiscardAffordance` (used for the same-color match-die discard in SelectAction) also uses `.injury-discardable`. The two flows are mutually exclusive (Recover and SelectAction don't co-occur), but to be safe, the teardown in step 2 already removes the class. No extra change needed.

- [ ] **Step 6: Verify in a browser**

Accumulate 6 injuries (force-fight monsters or wait for defeats) to trigger Recover. Expected:
- No modal appears.
- Title bar reads "Discard 3 injury cards".
- All injury cards in `#delphi-injury-cards-area` pulse (existing `.injury-discardable` style).
- Click an injury → it flies to `#supply-deck-injury` (portrait, with 90deg rotation), the source stack badge decrements (or the stack disappears if it was the last of its color), title updates to "Discard 2 more injury cards".
- Continue clicking until 3 total. After the 3rd, the state transitions to NextPlayer (server fires `injuriesRecovered` notif and proceeds).
- Reload mid-Recover: the affordance is reapplied with full counts (since no partial state on server).

- [ ] **Step 7: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat(recover): replace modal with click-on-board one-at-a-time discards"
```

---

## Task 9: Final cache-bust + cross-flow smoke test + clean up Task 3's TODO bridge

**Files:**
- Modify: `theoracleofdelphigzed.js` (cache-bust markers)

- [ ] **Step 1: Confirm the Task 3 bridge is gone**

The TODO bridge in Task 3 added a temporary single-click handler inside `_showRecoveryPicker`. Task 8 deleted `_showRecoveryPicker` entirely, so the bridge is gone. Grep to confirm:

```bash
grep -n '_showRecoveryPicker\|TODO(2026-05-10 plan task 8)' theoracleofdelphigzed.js
```

Expected: zero matches. If any remain, delete them now.

- [ ] **Step 2: Bump cache-bust**

```bash
grep -n '?v269\|JS_VERSION' theoracleofdelphigzed.js
```

Replace `?v269` → `?v270` (all 6 markers) and `JS_VERSION: "v269"` → `JS_VERSION: "v270"`.

- [ ] **Step 3: Cross-flow smoke test**

Run through all three changed flows in a single session:

1. Trigger `CombatVictory` (win a combat). Pick an equipment card with the picker. Card flies to hand strip. Then dismiss-and-reopen via the action-bar reentry button. Pick again. Confirm state transitions cleanly.
2. Trigger `SelectReward` (companion reward). Pick a companion. Card flies to cards-area. Dismiss-and-reopen via reentry. Pick again. Confirm panel mini-strip updates at landing.
3. Accumulate 6 injuries to trigger `Recover`. Click 3 in sequence. Each flies to supply discard, stack badges decrement, title updates. Server transitions to NextPlayer.
4. Trigger `Recover` again with a mixed-color hand (e.g. 2 red + 2 blue + 2 black). Click one of each color across the 3 picks. Confirm the right ids are sent (server doesn't complain).
5. SelectAction same-color injury-discard bonus path (the existing `_setupInjuryDiscardAffordance` for the bonus action). Confirm it still works untouched — not blocked by any new code from this plan.

- [ ] **Step 4: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "chore: bump cache-bust to v270 + cross-flow smoke verified"
```

---

## Self-Review Notes

Spec coverage check:
- Section 1 (Equipment + Companion picker UX): Tasks 1, 2, 3, 5, 6. ✓
- Section 2 (Pick animation): Tasks 1 (CSS), 4 (helper). ✓
- Section 3 (Action-bar reentry button): Tasks 5, 6 (`_addEquipmentPickerReentryButton`, `_addCompanionPickerReentryButton`). ✓
- Section 4 (Recover one-at-a-time): Task 8. ✓
- Multi-select branch removed: Task 3 (rewritten `_showCardPicker` no longer carries multi-select code paths). ✓
- "No icon" decision (#5 from decisions table): Tasks 5, 6 use plain `addActionButton(label, fn)` without `_prependActionIconToButton`. ✓
- Optimistic-UI risk acknowledged: `_commitPickerSelection` (Task 4) fires `onConfirm` BEFORE the animation completes — matches spec. ✓

Type / name consistency:
- `_recoverPicks`, `_recoverInjuryCards`, `_recoverInjuryHandlers`, `_companionPickerHandled`, `_pendingCompanionReveal` are all instance-vars used consistently across tasks 6, 7, 8. ✓
- `_addEquipmentPickerReentryButton` / `_addCompanionPickerReentryButton` named symmetrically. ✓
- `_resolveEquipmentDestRect` (Task 5) returns `{ x, y, width, height }`; `getDestination` callers in `_commitPickerSelection` (Task 4) expect that shape. ✓
- `_commitPickerSelection.finish` in Task 4 vs Task 6 step 2: Task 6 step 2 explicitly replaces the Task 4 `finish` to add the companion reveal — order-dependent but correctly noted. ✓
