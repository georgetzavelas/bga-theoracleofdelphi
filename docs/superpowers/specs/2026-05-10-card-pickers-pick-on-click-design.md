# Card Pickers: Pick-on-Click + Recover One-at-a-Time

**Date:** 2026-05-10
**Status:** Design
**Scope:** Replace the confirm-button card-picker UX for Equipment and Companion selection with single-click commits and a continuous "card travels to the player board" animation. Remove the modal entirely from Recover (post-injury discard) and force the player to click 3 of their own injury cards on the player board, one at a time. Retire the multi-select branch of the shared picker once Recover stops using it.

## Goal

Modal-driven card selection feels heavy: hover → click → look-for-Confirm → click. The card disappears when the modal closes and pops back into existence on the player board, breaking continuity. The new flow makes the click the commit and uses one continuous motion to carry the picked card from the picker to its home on the player board.

For Recover, the modal is the wrong surface entirely — the cards being discarded already live in the player's injury area at the bottom of the player board. Clicking the cards in place is more direct and matches the existing "click an injury to discard it for the SelectAction bonus" idiom already in the game ([theoracleofdelphigzed.js:6282](../../../theoracleofdelphigzed.js#L6282)).

## Background

The shared modal picker `_showCardPicker` ([theoracleofdelphigzed.js:5764](../../../theoracleofdelphigzed.js#L5764)) is currently called from three sites:

| Caller | Mode | State entry |
|---|---|---|
| `_showEquipmentStrip` | single-select | `CombatVictory` → "Select Equipment Card" button |
| `_showCompanionStrip` | single-select | `SelectReward` → auto-open |
| `_showRecoveryPicker` | multi-select (3) | `Recover` → auto-open |

Each picker dim-backdrops the board, shows a row of cards, applies a checkmark overlay on click, and only enables the Confirm button when the selection is complete.

The destination DOM for a picked card already exists in all three cases:

- Equipment lands in the local viewer's hand strip via `addEquipmentCard` ([Components.js:2131](../../../modules/js/Components.js#L2131)), appended to `#delphi-equipment-cards-area`.
- Companion lands in `#delphi-companion-cards-area` via `addCompanionCard` ([Components.js:2047](../../../modules/js/Components.js#L2047)). (Yesterday's fix pre-appends the card invisible so flights land at the correct slot — that pattern carries over here.)
- Injury cards already render in `#delphi-injury-cards-area` ([Components.js:1871](../../../modules/js/Components.js#L1871)) as stacks-by-colour with a count badge. The supply-side discard pile is `#supply-deck-injury`.

## Decisions (from brainstorming)

| # | Question | Decision |
|---|----------|----------|
| 1 | Commit gesture | Single-click on a card = commit. No checkmark overlay, no Confirm button. |
| 2 | Animation shape | Single overlapping ~600ms motion: popup fades while the clicked card detaches, scales up to 2x at midpoint, translates to destination, scales down to destination size. |
| 3 | Backdrop click | Inert. Only the X dismiss button or a card click closes the popup. |
| 4 | Reentry after dismiss | Status-bar button ("Select Equipment Card" / "Select Companion Card") that re-opens the picker. No icon prefix on these buttons. |
| 5 | Reentry button lifetime | Lives while the picker state is active; removed once a card is picked (animation runs, state transitions, action bar reshuffles). |
| 6 | Recover server contract | Batch-on-client (Option A). Three clicks gather ids client-side; one batched `actDiscardInjuries` fires after the 3rd. Server `Recover.php` unchanged. |
| 7 | Recover per-click feedback | Each clicked injury flies to `#supply-deck-injury` (~400ms each) and the source stack's count decrements on landing. |
| 8 | Recover rollback | None. Once clicked, the injury is committed to the local pending list. Mid-discard disconnect falls back to existing `Recover::zombie`. |
| 9 | Multi-select branch | Removed from `_showCardPicker` once Recover stops calling it. Picker becomes single-select only. |

## Architecture

### Component map

```
_showCardPicker (single-select, with opts.pickOnClick + opts.onDismiss)
   ├── header (title + new green-X dismiss button)
   ├── card row (each card has click handler → _commitPickerSelection)
   └── (no footer — confirm/cancel buttons gone)

_commitPickerSelection(cardId, cardEl)
   ├── fire opts.onConfirm(cardId)         // server action dispatched first
   ├── start picker fade (opacity 1→0, 600ms)
   ├── spawn .delphi-picking-card clone at cardEl's rect
   ├── animate clone (scale 1 → 2 → destScale, translate to destCenter) over 600ms
   └── on animationend → remove clone (notif materialises real card)

Recover entry (replaces _showRecoveryPicker)
   ├── decorate #delphi-injury-cards-area children with .injury-discardable
   ├── attach click handler per card → _onRecoverInjuryClick
   ├── status-bar title: "Discard 3 injury cards"
   └── (no modal)

_onRecoverInjuryClick(cardId, color, cardEl)
   ├── push cardId to this._recoverPicks
   ├── update title ("Discard N more…")
   ├── _flyCard from cardEl to #supply-deck-injury (~400ms)
   ├── on landing → decrement stack count badge for color
   └── if _recoverPicks.length === 3 → fire actDiscardInjuries(JSON.stringify(...))
```

### `_showCardPicker` changes

Add two new options:

- `pickOnClick: true` — switches to commit-on-click mode. Skips checkmark + Confirm/Cancel footer rendering. The card's click handler calls a new internal `_commitPickerSelection`.
- `onDismiss: fn` — fired by the X button. Picker fades out (no animation flight). Caller responsible for the action-bar reentry button.

Remove from `_showCardPicker`:

- Multi-select branch (the `multi` / `selectedSet` / `selectCount` paths). Single-select only after this change. Untouched callers will still work because they don't pass `selectCount`.
- The "Cancel" branch (`opts.onCancel`). Now subsumed by `onDismiss`.

Keep:

- Per-card stagger entry (`.dealing` class).
- Tooltips (`addTooltipHtml`).
- Three-column override (`gridColumns: 3`).
- Title rendering.
- Backdrop fade in/out.

### New green-X dismiss button

DOM addition inside the picker dialog, top-right corner:

```html
<button id="card-picker-dismiss" class="card-picker-dismiss" aria-label="Close">
  <!-- green circle + white X glyph via CSS, matching BGA convention -->
</button>
```

Click handler invokes `opts.onDismiss` (callback set per-caller). For Equipment/Companion: `onDismiss` is `_hideCardPicker` and leaves the action-bar reentry button in place.

### Pick animation (`_commitPickerSelection`)

A new method on the game module:

```js
_commitPickerSelection: function(cardId, cardEl, opts) {
    // 1. Resolve destination element NOW so layout is consistent.
    //    Caller passes opts.getDestination(cardId) → DOMElement.
    //    For Equipment, destination = next empty slot in hand strip
    //    (resolved via _resolveEquipmentDest()).
    //    For Companion, destination = pre-appended invisible card
    //    (same pattern as yesterday's notif_companionSelected fix).

    // 2. Fire the server action.
    opts.onConfirm(cardId);

    // 3. Spawn body-level clone at cardEl's current rect.
    //    Hide cardEl (visibility:hidden) so it doesn't double-render
    //    behind the clone.

    // 4. Start picker fade (opacity 1 → 0 over 600ms).

    // 5. Animate clone with a single CSS keyframe (`delphi-pick-flight`):
    //    0%   { transform: translate(0,0) scale(1); }
    //    50%  { transform: translate(midX, midY) scale(2); }
    //    100% { transform: translate(destX, destY) scale(destScaleX, destScaleY); opacity: 1; }
    //    midX/midY = halfway between source and destination centers.
    //    destScale = destW / cloneW (resolved from the destination rect).

    // 6. On animationend: remove clone, hide picker DOM (clear innerHTML,
    //    remove .active). The notif handler will materialise the real card
    //    (Equipment: addEquipmentCard via notif_equipmentSelected, which
    //     already runs after _hideCardPicker; we keep that path).
}
```

### Equipment destination resolution

Equipment lands in the local viewer's hand strip. The strip appends new cards via `addEquipmentCard`. The new card's final position is the rightmost slot after the current set. For pick-on-click, the clone's destination is the *would-be* position of the next card — computed as:

- `containerRect = #delphi-equipment-cards-area.getBoundingClientRect()`
- Existing cards count = `containerRect.children.length`
- Card width = 140px, gap = (CSS-defined)
- Destination center = `containerRect.left + (existingCount * (cardW + gap)) + cardW/2`, `containerRect.top + cardH/2`

This avoids the "pre-append invisible card" trick used for companion — equipment's hand strip already has a deterministic layout we can compute. If layout drifts later, we fall back to the pre-append pattern.

### Companion destination resolution

Reuse yesterday's pre-append-invisible trick from `notif_companionSelected`. Pre-create the `.delphi-companion-card` with `visibility:hidden` BEFORE the animation; the clone targets the now-pre-positioned slot's rect. After landing, flip visibility on.

Order of operations:

1. Click card → fire `actSelectReward` (server begins processing).
2. Pre-append the invisible real card.
3. Spawn clone, start animation.
4. Animation lands at the pre-appended card's center.
5. On animationend → remove clone, flip visibility on the real card. Notif `notif_companionSelected` arrives later and updates the player panel + companion deck top (the pre-existing onLanding logic minus the `addCompanionCard` call which now happens in step 2).

This means **`notif_companionSelected` needs a small change**: it should detect that the local viewer has already pre-appended the card (companionCards.has(id)) and skip the duplicate `addCompanionCard`. The panel update + deck top render still run.

### Recover one-at-a-time discard

Replace `_showRecoveryPicker` with `_setupRecoverDiscardAffordance` (new method):

```js
_setupRecoverDiscardAffordance: function(injuryCards) {
    this._recoverPicks = [];
    this._recoverRemaining = 3;
    this._recoverInjuryHandlers = [];
    this._updateRecoverTitle();

    // Decorate every injury card in the hand area as discardable.
    // (Recovers only the local viewer's own area; opponents see no UI.)
    var area = document.getElementById('delphi-injury-cards-area');
    var cards = area.querySelectorAll('.delphi-injury-card');
    cards.forEach(function(el) {
        el.classList.add('injury-discardable');
        var handler = function() { self._onRecoverInjuryClick(el); };
        el.addEventListener('click', handler);
        self._recoverInjuryHandlers.push({ el: el, handler: handler });
    });
}

_onRecoverInjuryClick: function(el) {
    // Resolve the card id and color from the stack. Injury cards are
    // stacked by color — clicking the stack discards the top card.
    var color = el.dataset.color;
    // Find an undiscarded card id for this color from injuryCards arg.
    // The server arg from getArgs() carries all the player's injuries
    // with ids; we already have it on `this._recoverInjuryCards`.
    // Recover.getArgs() returns the full injury list as
    // [{ card_id, color }, ...]. Cached on the game module as
    // this._recoverInjuryCards at state entry. Pop any id of the
    // requested color that isn't already in this._recoverPicks.
    var nextId = this._popRecoverInjuryId(color);
    if (nextId === null) return;
    this._recoverPicks.push(nextId);
    this._recoverRemaining--;
    this._updateRecoverTitle();

    // Decrement the stack's count badge eagerly. If the stack hits 0,
    // remove it entirely (existing removeInjuryCard equivalent — extend
    // Components if needed).
    this._decrementInjuryStack(el, color);

    // Fly the clicked card to the supply discard pile.
    this._flyCard({
        from: el,
        to: document.getElementById('supply-deck-injury'),
        backgroundImage: getComputedStyle(el).backgroundImage,
        targetWidth: 63,
        targetHeight: 95,
        // landscape (140x94) → portrait (63x95) — needs the 90deg rotation
        // pattern from the injury-to-supply flight (theoracleofdelphigzed.js:1740).
        rotation: 90,
    });

    if (this._recoverPicks.length === 3) {
        this._teardownRecoverDiscardAffordance();
        this.bgaPerformAction('actDiscardInjuries', {
            cardIdsJson: JSON.stringify(this._recoverPicks),
        });
    }
}
```

Teardown clears `.injury-discardable`, removes click handlers, and on `onLeavingState 'Recover'` runs as a safety net.

Title messaging:

| Remaining | Title text |
|---|---|
| 3 | "Discard 3 injury cards" |
| 2 | "Discard 2 more injury cards" |
| 1 | "Discard 1 more injury card" |
| 0 | (state transitions before this renders) |

### Notif handler changes summary

- `notif_equipmentSelected` — no change (already calls `_hideCardPicker`; the new animation finishes before the notif arrives or interleaves harmlessly).
- `notif_companionSelected` — small refactor: skip `addCompanionCard` if the local viewer has pre-appended (which the new flow does); keep the panel update, deck top render, and the for-opponents path.
- `notif_injuriesRecovered` — no change (it just updates other players' panels; the local viewer already updated optimistically via per-click decrements).

## Files affected

| File | Change |
|---|---|
| `theoracleofdelphigzed.js` | `_showCardPicker` simplification + pick-on-click flag + onDismiss; `_commitPickerSelection`; `_showEquipmentStrip`/`_showCompanionStrip` pass new opts; remove `_showRecoveryPicker`; add `_setupRecoverDiscardAffordance` / `_onRecoverInjuryClick` / `_teardownRecoverDiscardAffordance`; `onEnteringState 'Recover'` switches to the new flow; reentry button in SelectReward / CombatVictory entry |
| `theoracleofdelphigzed.css` | `.card-picker-dismiss` button; `.delphi-picking-card` clone class + `@keyframes delphi-pick-flight`; picker `.fading-out` state |
| `modules/js/Components.js` | Add a `removeInjuryCard(color)` or `decrementInjuryStack(color)` helper used by `_decrementInjuryStack` (or do it inline in the game module) |
| Server PHP | **No changes.** `actDiscardInjuries` still takes a JSON array of 3 ids. |

## Testing

- Equipment pick: enter `CombatVictory`, click "Select Equipment Card" → click a card → animation runs → card lands in hand strip. Dismiss-then-reopen via the action-bar button also works.
- Companion pick: enter `SelectReward` with companion reward → picker auto-opens → click a card → animation runs → card lands in cards-area at the correct slot (slot 0 for first companion). Dismiss-then-reopen works.
- Recover: deliberately accumulate 6 injuries → enter Recover → no modal appears. Player's injury area pulses, status bar says "Discard 3 injury cards", click 3 injuries in sequence, each flies to the supply discard pile, then state transitions.
- Reload mid-Recover (before 3 clicks): server has no record of partial discards, so the entry handler re-decorates the full injury area. Player starts over.
- Existing in-game injury-discard affordance (`_setupInjuryDiscardAffordance` for the SelectAction same-colour-as-die bonus) still works untouched; the new Recover affordance is a separate code path.

## Risks

- **Optimistic UI**: the animation starts immediately on click (before the server confirms). If the server rejects the action (e.g., desync), the local viewer would see the card land in their hand area and the server's rollback would later un-add it. In practice, Equipment / Companion / Recover actions have no preconditions that change between picker open and pick commit, so rejection should not occur. Accepted risk.
- **Pre-appended companion card visible briefly if animation drops a frame**: the pre-append uses `visibility:hidden`, which is layout-affecting but invisible. A reflow at exactly the wrong moment shouldn't expose it (browsers commit the hidden state synchronously). If a regression appears, fall back to wrapping in a position-absolute zero-opacity container.

## Out of scope

- Per-click server progress (rejected in favour of Option A batch-on-client).
- Visual changes to the injury area outside the discardable pulse (which already exists).
- Refactoring the `_flyCard` API. The existing API is sufficient for both the pick animation (override clone size + destination) and the injury → supply flight.
- Equipment / Companion player-panel mini-slot animation. Today's notif_companionSelected change targets the main cards-area, not the panel slot wrapper. The panel update remains a silent innerHTML rewrite.
