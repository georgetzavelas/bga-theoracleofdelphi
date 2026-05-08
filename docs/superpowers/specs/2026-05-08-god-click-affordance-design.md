# Oracle of Delphi — God Click Affordance & Hover Cleanup

**Date:** 2026-05-08
**Status:** Design
**Scope:** Replace the unconditional hover scaling on god tokens with a contextual affordance, and let the active player advance a god by clicking its token directly on the player board (in addition to the existing status-bar buttons).

## Goal

When the active player is in a state where one or more gods can be advanced, surface that affordance directly on the gods themselves: a bobbing ↑ arrow badge above each advanceable god, with the token clickable to perform the advancement. Hover scaling on non-advanceable gods is removed. The status-bar action buttons remain for accessibility and redundancy. The result is a single, consistent visual language: arrow above a god ⇒ click to advance.

## Background

Today, every `.delphi-god-token` scales 1.15× on hover regardless of game state, player, or row ([theoracleofdelphigzed.css:1711](../../../theoracleofdelphigzed.css#L1711)). The cursor is `pointer`. But the token has no click handler — only the BGA tooltip fires. This trains players to treat the hover affordance as decorative noise. Meanwhile, advancement happens via status-bar buttons in four states ([theoracleofdelphigzed.js:3490-3548](../../../theoracleofdelphigzed.js#L3490)) — disconnected from the gods on the board.

A row-6 god already shows a permanent gold ring + glow signalling "ability available" ([theoracleofdelphigzed.css:1726-1730](../../../theoracleofdelphigzed.css#L1726)). The new affordance must coexist with — and remain visually distinct from — that gold ring.

## Decisions (from brainstorming)

| # | Question | Decision |
|---|----------|----------|
| 1 | Which states get the new affordance? | All five: `SelectAction` (post-die-click in-action affordance), `ChooseGodAdvancement`, `CheckGodAdvancement`, `SelectGodForTopRow`, `NoInjuryBonus`. Single mental model. (`SelectAction` was added as a follow-up after the initial implementation missed it.) |
| 2 | What does hover do on non-advanceable gods? | Tooltip only — no scale, no pointer cursor. Hover stops being a clickability lie. |
| 3 | Visual treatment for the advanceable affordance? | Floating bobbing ↑ arrow above the token (cyan `#22d3ee`, 1.4s bob). Token itself unchanged at rest. |
| 4 | How does the click integrate with the existing status-bar buttons? | Both work. Clicking a god fires the same action as the matching button. |
| 5 | Affordance scope on opponents' boards? | Active-player-only. Arrows render only on the active player's own god track. |

## Visual specification

### Advanceable affordance — bobbing ↑ arrow

Rendered as a CSS `::after` pseudo-element on the god token. Cyan triangle (`#22d3ee`), 14px wide × 10px tall, centred horizontally above the token. Animates between `top: -10px` and `top: -14px` over 1.4s ease-in-out, infinite. Soft cyan drop-shadow (`drop-shadow(0 0 3px rgba(34, 211, 238, 0.7))`).

Hover on an advanceable token adds: `transform: scale(1.15)`, `box-shadow: 0 0 0 2px #22d3ee, 0 0 12px rgba(34, 211, 238, 0.7)`, `cursor: pointer`. Arrow keeps bobbing.

### Hover on non-advanceable tokens

`cursor: default`. No `transform`, no shadow change. The BGA tooltip continues to fire because it is bound at the element level, not via CSS hover.

### Row-6 gold ring

Untouched — both at rest and on hover (the row-6 hover-brighten of the gold ring stays). A row-6 god is never advanceable per `can_advance: $row < 6` in [ChooseGodAdvancement::getArgs](../../../modules/php/States/ChooseGodAdvancement.php#L38), so the gold ring and the cyan arrow never appear on the same god in the same moment.

### Arrow placement — row 5 clearance

The arrow renders up to 14px above the host token at peak bob. The worst case is an advanceable god at row 5: the arrow then sits inside the row-6 cell area above it. If the column's bounding box clips at the row-6 boundary, the arrow gets cropped. **Implementation check:** verify that arrow pixels above a row-5 token render fully without clipping. **Fallback** if they don't: pin the arrow to the top of the column (above row 6) with a thin connector line down to the host token, instead of bobbing immediately above it. The arrow never appears on a row-6 god (row 6 fails `can_advance`).

## Behavioural specification

### Client state machine — entry and exit

For each of the four states, the existing `onEnteringState` block in `theoracleofdelphigzed.js` ([3490-3548](../../../theoracleofdelphigzed.js#L3490)) already iterates the eligible gods to add status-bar buttons. The new behaviour:

1. **On entering** any of the four states (active player only): for each eligible god name, add the class `god-advanceable` to the matching token element on the active player's god track, and attach a click handler that fires the same action as the matching status-bar button.
2. **On leaving** the state: remove the class from every token on every player's track, and detach the click handlers.

### State-to-action mapping

| State | Eligibility data | Action fired | Multi-step? |
|-------|------------------|--------------|-------------|
| `SelectAction` | `args.advanceableGod` (single string or null) | `actAdvanceGod({godName})` | No — one of several action choices for the selected die |
| `ChooseGodAdvancement` | `args.gods[]` filtered by `can_advance` | `actAdvanceGod({godName})` | Yes — state re-entered while `steps_remaining > 0` |
| `CheckGodAdvancement` | `args.eligibleGods[]` | `actAdvanceGod({godName})` | No — single step then `actPass` flow |
| `SelectGodForTopRow` | `args.eligible_gods[]` filtered by `can_advance` | `actSelectGod({godName})` | No — single pick |
| `NoInjuryBonus` | `args.advanceableGods[]` (server pre-filtered to `track_row < 6`) | `actAdvanceGod({godName})` | Yes |

The multi-step states will naturally re-enter and re-render the affordance because `onEnteringState` fires every time the state is entered.

### Active player only

All four states are `ACTIVE_PLAYER` states ([ChooseGodAdvancement.php:15](../../../modules/php/States/ChooseGodAdvancement.php#L15) etc.). The arrow + click affordance applies only to the active player's own god track, identified by the player ID in the token element's `data-player` attribute (already present per the template at [theoracleofdelphigzed.js:49](../../../theoracleofdelphigzed.js#L49)). Spectators and opponents see plain god tokens with the existing row-6 gold ring and no scale-on-hover anywhere.

### Click handler

The action call mirrors the existing status-bar button. For example, in `ChooseGodAdvancement`:

```js
tokenEl.addEventListener('click', () => {
  this.bgaPerformAction("actAdvanceGod", { godName: g.god_name });
});
```

`bgaPerformAction` already handles request deduplication, so a fast double-click (or a click + button press) reduces to a single server action.

## CSS changes

### Removed / replaced

```css
/* DELETE — the unconditional hover-scale that lies about clickability */
.delphi-god-token:hover {
    transform: scale(1.15);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4);
}
```

### Added

```css
/* Default: tokens are not interactive at rest */
.delphi-god-token {
    cursor: default;
}

/* Active-player advanceable god: bobbing arrow + clickable */
.delphi-god-token.god-advanceable {
    cursor: pointer;
    position: relative;
}
.delphi-god-token.god-advanceable::after {
    content: '';
    position: absolute;
    top: -10px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-bottom: 10px solid #22d3ee;
    filter: drop-shadow(0 0 3px rgba(34, 211, 238, 0.7));
    animation: god-advance-arrow-bob 1.4s ease-in-out infinite;
    pointer-events: none;
}
@keyframes god-advance-arrow-bob {
    0%, 100% { top: -10px; }
    50%      { top: -14px; }
}
.delphi-god-token.god-advanceable:hover {
    transform: scale(1.15);
    box-shadow: 0 0 0 2px #22d3ee, 0 0 12px rgba(34, 211, 238, 0.7);
}
```

### Preserved (no change)

```css
/* Row-6 gold ring — different concept (ability available), keeps current behaviour */
.god-cell[data-row="6"] .delphi-god-token { /* gold ring */ }
.god-cell[data-row="6"] .delphi-god-token:hover { /* brighter gold */ }
```

## JS changes

A small helper pair in the `theoracleofdelphigzed.js` main object:

```js
_setAdvanceableGods: function(godNames, actionName) {
    this._clearAdvanceableGods();
    var activePlayerId = this.getActivePlayerId();
    godNames.forEach(name => {
        var sel = '#god_' + activePlayerId + '_' + name;
        var el = document.querySelector(sel);
        if (!el) return;
        el.classList.add('god-advanceable');
        var handler = () => this.bgaPerformAction(actionName, { godName: name });
        el.addEventListener('click', handler);
        el._advanceableHandler = handler;
    });
},

_clearAdvanceableGods: function() {
    document.querySelectorAll('.delphi-god-token.god-advanceable').forEach(el => {
        el.classList.remove('god-advanceable');
        if (el._advanceableHandler) {
            el.removeEventListener('click', el._advanceableHandler);
            delete el._advanceableHandler;
        }
    });
},
```

Both helpers are called from `onEnteringState` / `onLeavingState`, gated on `this.isCurrentPlayerActive()` for the entry path. The exit path always clears (defensive — handles edge cases where the active player changes mid-state).

## Out of scope (YAGNI)

- Keyboard activation (Enter/Space on focused token). The tokens already have `tabindex="0" role="button"` per the existing template, so this is a small follow-up if desired, but not part of this design.
- Animating the arrow with the player's seat colour. Single cyan colour for all players keeps the affordance globally legible and avoids the yellow-on-yellow problem.
- Replacing the status-bar buttons. Decision 4 — they stay.
- Highlighting *non-active-player* boards during these states. Active-player-only.

## Acceptance tests

1. **Affordance appears.** Enter `ChooseGodAdvancement` as the active player. Bobbing cyan arrow appears above every god whose `can_advance` is true on your own board. No arrow on opponents' boards.
2. **Click fires the action.** Click an advanceable god — same outcome as clicking the matching status-bar button.
3. **Multi-step re-render.** With `steps_remaining ≥ 2`, advance a god by clicking. After the action returns, the arrow re-appears (re-entering the state).
4. **Affordance clears.** After `actPass` (or the last step), all arrows on all boards disappear.
5. **Hover quiet on non-advanceable.** Outside any of the four states, hovering any god produces no scale, no shadow change, no pointer cursor — only the BGA tooltip.
6. **Row-6 gold ring intact.** A row-6 god still shows the gold ring + glow, with the existing slight hover brighten. No cyan arrow ever overlaps a row-6 token.
7. **All four states.** Repeat test 1 for `CheckGodAdvancement`, `SelectGodForTopRow`, `NoInjuryBonus`. Each fires its respective action on click.
8. **Both routes coexist.** With status-bar buttons rendered, clicking the god and clicking the button produce identical server actions.

## Reference mockup

`./.superpowers/brainstorm/94361-1778280704/content/visual-treatments.html` — option D selected as final.
