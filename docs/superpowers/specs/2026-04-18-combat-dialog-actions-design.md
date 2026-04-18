# Combat Dialog Action Buttons — Design

**Date:** 2026-04-18
**Status:** Approved (pending implementation)

## Goal

Move the combat action buttons (`Roll Battle Die`, `Cancel`, `Pay 1 Favor to continue`, `Surrender`, `Select Equipment Card`) out of the BGA status bar and into the Fight dialog (`#delphi-combat-dialog`) itself, so the user's eye stays in one place during combat.

## Scope

In scope — action buttons for these three combat states:

- **CombatRound** — `Roll Battle Die (need X+)` (primary) + `Cancel` (secondary)
- **CombatDefeat** — `Pay 1 Favor to continue (N left)` (primary, only if `canContinue`) + `Surrender` (secondary)
- **CombatVictory** — `Select Equipment Card` (primary)

Out of scope — any other statusBar buttons, any combat flow/rules changes.

## Current State

- Dialog lives at [theoracleofdelphigzed_theoracleofdelphigzed.tpl:196](../../../theoracleofdelphigzed_theoracleofdelphigzed.tpl) — shows monster info + battle die, no action row.
- Action buttons are added via `this.statusBar.addActionButton(...)` in `onEnteringState` at [theoracleofdelphigzed.js:2162](../../../theoracleofdelphigzed.js).
- Supporting CSS (`.dialog-actions`, `.delphi-btn.primary`, `.delphi-btn.secondary`) already exists in [theoracleofdelphigzed.css:2298](../../../theoracleofdelphigzed.css) and [:2446](../../../theoracleofdelphigzed.css).

## Changes

### 1. Template

Add an empty `.dialog-actions` footer inside `#delphi-combat-dialog`:

```html
<div class="dialog-actions" id="combat-dialog-actions"></div>
```

Buttons are populated dynamically per state — no static markup.

### 2. JS — populate dialog buttons per state

Add a helper `_setCombatDialogActions(buttons)`:

- Clears `#combat-dialog-actions`.
- For each `{ label, color, onClick, id? }` entry, appends `<button class="delphi-btn primary|secondary">label</button>` and wires the click handler.

In `onEnteringState`:

- **CombatRound**: replace the two `statusBar.addActionButton` calls with one `_setCombatDialogActions(...)` call producing the same two buttons (Roll Battle Die + Cancel), preserving the dynamic `(need X+)` suffix.
- **CombatDefeat**: same — Pay-1-Favor (only when `canContinue`) + Surrender.
- **CombatVictory**: same — Select Equipment Card, preserving the existing click behavior (remove `.active` on dialog, clear battle die, show equipment strip).

### 3. JS — cleanup

Dialog buttons persist in the DOM (unlike status-bar buttons BGA auto-clears on state transition). Clear `#combat-dialog-actions` at:

- `onLeavingState` for `CombatRound`, `CombatDefeat`, `CombatVictory`.
- Every existing site that closes the combat dialog: `notif_combatCancel`, `notif_combatSurrender`, `notif_fightEnded`, and the inline close inside the `CombatVictory` button handler.

A small helper `_clearCombatDialogActions()` keeps this tidy.

### 4. CSS

No changes. The existing `.dialog-actions` rule provides the flex row, gap, right-alignment, and top border that separates the button row from the die area.

## Testing

Manual verification only (BGA JS has no headless test suite in this repo):

1. Start a fight → dialog shows with `Roll Battle Die (need X+)` + `Cancel` buttons in the footer, not in the top status bar.
2. Click `Roll Battle Die` → die rolls; buttons update correctly on each new CombatRound.
3. Click `Cancel` → dialog closes, no orphan buttons remain.
4. Lose a round with favor tokens → `Pay 1 Favor to continue (N left)` + `Surrender` appear in the dialog.
5. Lose a round with zero favor → only `Surrender` appears.
6. Win the fight → `Select Equipment Card` appears; clicking it closes the dialog and opens the equipment strip as before.
7. After any exit path, reopen a new fight → no stale buttons from the previous fight.

## Risks / Notes

- The status bar will be empty during these combat states. That is intentional — the dialog already draws the user's attention.
- Cleanup must be thorough: a lingering button from a prior fight would be a visible regression. The `onLeavingState` + notification hooks cover this.
