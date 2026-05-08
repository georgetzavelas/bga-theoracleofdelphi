# God Click Affordance & Hover Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unconditional hover-scale on god tokens with a contextual affordance — a bobbing cyan ↑ arrow above advanceable gods, with the token clickable to fire the same advancement action as the existing status-bar buttons. Active-player only; status-bar buttons remain in parallel.

**Architecture:** Pure client-side change. Server already exposes the eligibility data (`args.gods` / `args.eligibleGods` / `args.eligible_gods` / `args.advanceableGods` per state). Two small JS helpers (`_setAdvanceableGods`, `_clearAdvanceableGods`) toggle a `god-advanceable` CSS class on the active player's matching god tokens and attach/detach click handlers. The four `onEnteringState` cases for `ChooseGodAdvancement`, `CheckGodAdvancement`, `SelectGodForTopRow`, `NoInjuryBonus` call `_setAdvanceableGods`; a single `onLeavingState` clause covering all four calls `_clearAdvanceableGods`.

**Tech Stack:** Vanilla JS (BGA dojo-style class), CSS3 keyframes. No new dependencies. Reference spec: `docs/superpowers/specs/2026-05-08-god-click-affordance-design.md`.

**Verification:** No JS unit-test framework in this project. Verification is manual via the BGA dev server using the [browsing-babylist](skill) skill against the 8 acceptance tests in the spec. Each task ends with a manual sanity check; the final task runs the full acceptance battery.

---

## File structure

| File | Change | Why |
|------|--------|-----|
| `theoracleofdelphigzed.css` | Modify (around line 1711) | Replace the universal hover-scale rule with `.god-advanceable`-gated rules; add the bobbing-arrow `::after` and keyframes. |
| `theoracleofdelphigzed.js` | Modify (around line 64, 3490-3548, 3240-onwards) | Bump `JS_VERSION` + 6 `?v` markers; add `_setAdvanceableGods` / `_clearAdvanceableGods` helpers; wire four `onEnteringState` cases; add a single `onLeavingState` clearing clause. |

No new files. No PHP changes. No test files (no JS test framework exists).

---

## Task 1: CSS — replace hover rule and add the advanceable affordance

**Files:**
- Modify: `theoracleofdelphigzed.css:1711-1714` (replace the unconditional hover rule)
- Modify: `theoracleofdelphigzed.css` (insert new rules immediately after the existing `.delphi-god-token` definition block, before the row-6 gold-ring rule at line 1726)

- [ ] **Step 1: Open the file and locate the existing hover rule**

The current rule is:

```css
.delphi-god-token:hover {
    transform: scale(1.15);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4);
}
```

It sits at [theoracleofdelphigzed.css:1711-1714](../../../theoracleofdelphigzed.css#L1711).

- [ ] **Step 2: Replace the hover rule and add new rules**

Replace lines 1711-1714 with:

```css
/* Default: not interactive at rest. Tooltip still fires (it's bound on
   the element, not via :hover). The active-player-only `.god-advanceable`
   class below restores hover scale + cursor when advancement is allowed. */
.delphi-god-token {
    cursor: default;
}

/* Active-player advanceable god: bobbing cyan ↑ arrow + clickable.
   Position-relative so the ::after arrow anchors to the token. */
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

- [ ] **Step 3: Sanity-check existing row-6 rule still wins for row-6 gods**

The row-6 rule at line 1726 is `.god-cell[data-row="6"] .delphi-god-token { box-shadow: ...gold... }`. Per the spec, a row-6 god is never advanceable (`can_advance: $row < 6`), so a row-6 god will never have `.god-advanceable` and the gold ring stays untouched. Open the file briefly and confirm no edits crept into that block.

- [ ] **Step 4: Commit**

```bash
git add theoracleofdelphigzed.css
git commit -m "style(gods): replace universal hover-scale with god-advanceable affordance

Hover scale + pointer cursor on god tokens used to fire on every god,
training players that the affordance was decorative. Hover is now
tooltip-only at rest; the new .god-advanceable class (added by JS in
the four advancement states) restores the click affordance plus a
bobbing cyan arrow."
```

Per project CLAUDE.md, do NOT include `Co-Authored-By:` or any AI attribution trailer. Plain message only.

After this commit, merge into master per the project's post-commit workflow (`git -C /Users/georgetzavelas/src/theoracleofdelphigzed merge --no-ff <branch> -m "Merge branch '<branch>'"`).

---

## Task 2: JS — add `_setAdvanceableGods` and `_clearAdvanceableGods` helpers

**Files:**
- Modify: `theoracleofdelphigzed.js` (insert two new methods near other `_clear*` helpers — search for `_clearGodTargetOverlays` or `_teardownDieClickHandlers` to find the right neighbourhood; place the new helpers next to them)

- [ ] **Step 1: Locate insertion point**

Open `theoracleofdelphigzed.js` and find an existing helper like `_clearGodTargetOverlays:` (used as a reference for style — it's a similar shape: clear-class + cleanup). The new helpers will sit alongside it.

- [ ] **Step 2: Insert the helper pair**

Add these two methods to the main game class:

```javascript
/**
 * Mark a list of gods on the active player's track as advanceable —
 * adds the `god-advanceable` class (bobbing arrow + cursor + hover scale)
 * and attaches a click handler that fires the supplied action.
 *
 * Called from onEnteringState for ChooseGodAdvancement, CheckGodAdvancement,
 * SelectGodForTopRow, NoInjuryBonus. Active-player only; no-op otherwise.
 *
 * @param {string[]} godNames - lowercase god names (e.g., ['apollo', 'artemis'])
 * @param {string} actionName - 'actAdvanceGod' or 'actSelectGod'
 */
_setAdvanceableGods: function(godNames, actionName) {
    this._clearAdvanceableGods();
    if (!this.isCurrentPlayerActive()) return;
    var activePlayerId = this.getActivePlayerId();
    var self = this;
    godNames.forEach(function(name) {
        var el = document.getElementById('god_' + activePlayerId + '_' + name);
        if (!el) return;
        el.classList.add('god-advanceable');
        var handler = function() {
            self.bgaPerformAction(actionName, { godName: name });
        };
        el.addEventListener('click', handler);
        el._advanceableHandler = handler;
    });
},

/**
 * Reverse of _setAdvanceableGods — strips the class and detaches the
 * click handler from every advanceable god on every player's track.
 * Defensive: clears across all players regardless of who's active, so
 * an active-player change mid-state can't leak handlers.
 */
_clearAdvanceableGods: function() {
    document.querySelectorAll('.delphi-god-token.god-advanceable').forEach(function(el) {
        el.classList.remove('god-advanceable');
        if (el._advanceableHandler) {
            el.removeEventListener('click', el._advanceableHandler);
            delete el._advanceableHandler;
        }
    });
},
```

- [ ] **Step 3: Verify the file parses**

The BGA framework loads the file on next page refresh; a syntax error breaks the entire client. Read back the inserted block and confirm:
- Both methods end with a `,` (not `;`) since they're class members
- No stray `}` or missing braces
- The surrounding methods still parse — sanity-check the next 5 lines after the insertion still look like the rest of the file

- [ ] **Step 4: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat(gods): add _setAdvanceableGods / _clearAdvanceableGods helpers

Helper pair toggles the .god-advanceable class on the active player's
god tokens and attaches/detaches click handlers that fire the supplied
action. Used by the four advancement states wired in subsequent
commits."
```

Then merge into master per the project workflow.

---

## Task 3: JS — wire `ChooseGodAdvancement` + add the shared `onLeavingState` clearing clause

**Files:**
- Modify: `theoracleofdelphigzed.js:3512-3527` (the existing `case 'ChooseGodAdvancement':` block in `onEnteringState`)
- Modify: `theoracleofdelphigzed.js:3240-onwards` (`onLeavingState` switch — add a single fall-through case covering all four states)

- [ ] **Step 1: Read the current `ChooseGodAdvancement` block**

Lines 3512-3527 currently render status-bar buttons. The block already has access to `args.gods` (an array of `{god_name, color, current_row, can_advance}`).

- [ ] **Step 2: Add the `_setAdvanceableGods` call inside the same block**

Modify the block from:

```javascript
case 'ChooseGodAdvancement':
    if (args && args.gods) {
        this._sortGodsByBoard(args.gods).forEach(g => {
            if (g.can_advance) {
                var godLabel = g.god_name.charAt(0).toUpperCase() + g.god_name.slice(1) + ' (row ' + g.current_row + ')';
                var btn = this.statusBar.addActionButton(godLabel, () => {
                    this.bgaPerformAction("actAdvanceGod", { godName: g.god_name });
                });
                this._prependGodIconToButton(btn, g.god_name);
            }
        });
    }
    this.statusBar.addActionButton(_('Done'), () => {
        this.bgaPerformAction("actPass", {});
    }, { color: 'secondary' });
    break;
```

To:

```javascript
case 'ChooseGodAdvancement':
    if (args && args.gods) {
        this._sortGodsByBoard(args.gods).forEach(g => {
            if (g.can_advance) {
                var godLabel = g.god_name.charAt(0).toUpperCase() + g.god_name.slice(1) + ' (row ' + g.current_row + ')';
                var btn = this.statusBar.addActionButton(godLabel, () => {
                    this.bgaPerformAction("actAdvanceGod", { godName: g.god_name });
                });
                this._prependGodIconToButton(btn, g.god_name);
            }
        });
        this._setAdvanceableGods(
            args.gods.filter(g => g.can_advance).map(g => g.god_name),
            'actAdvanceGod'
        );
    }
    this.statusBar.addActionButton(_('Done'), () => {
        this.bgaPerformAction("actPass", {});
    }, { color: 'secondary' });
    break;
```

The `_setAdvanceableGods` call sits just after the forEach so the buttons are still rendered first (the visual order in the status bar is unchanged).

- [ ] **Step 3: Add the shared `onLeavingState` clearing clause**

Locate `onLeavingState: function( stateName )` at line 3240. Inside its switch, add this fall-through case (placement: alongside the other `case` blocks — group with `case 'UseGodAbility':` if it makes a natural neighbour):

```javascript
case 'ChooseGodAdvancement':
case 'CheckGodAdvancement':
case 'SelectGodForTopRow':
case 'NoInjuryBonus':
    this._clearAdvanceableGods();
    break;
```

A single fall-through covers all four states; the helper is idempotent.

- [ ] **Step 4: Manual sanity check on the dev server**

Run the BGA dev server (or `staging<N>.babylist.com` if applicable). Trigger `ChooseGodAdvancement` (e.g., complete a shrine that grants god-advancement steps). Confirm:
- Cyan arrows bob above advanceable gods on your own player board
- No arrows on opponents' boards
- Clicking an arrow-marked god advances it (same outcome as the status-bar button)
- After clicking through all steps (or hitting Done), the arrows disappear

If anything fails, debug before committing.

- [ ] **Step 5: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat(gods): wire ChooseGodAdvancement to clickable god affordance

Adds _setAdvanceableGods call inside the existing ChooseGodAdvancement
onEnteringState block, plus a shared onLeavingState clearing clause
covering all four advancement states (3 more wired in following
commits). Status-bar buttons unchanged."
```

Merge into master.

---

## Task 4: JS — wire `CheckGodAdvancement`

**Files:**
- Modify: `theoracleofdelphigzed.js:3490-3510` (the existing `case 'CheckGodAdvancement':` block)

- [ ] **Step 1: Read the current `CheckGodAdvancement` block**

Lines 3490-3510 render buttons from `args.eligibleGods` (already filtered server-side — these are the gods whose colour matches the just-completed action). The "no eligible gods" branch shows a status message instead of buttons; we treat that branch the same way (no `_setAdvanceableGods` call when the list is empty).

- [ ] **Step 2: Add the `_setAdvanceableGods` call**

Modify the block to:

```javascript
case 'CheckGodAdvancement':
    var noEligibleGods = false;
    if (args && args.eligibleGods && args.eligibleGods.length > 0) {
        this._sortGodsByBoard(args.eligibleGods).forEach(g => {
            var godLabel = g.god_name.charAt(0).toUpperCase() + g.god_name.slice(1);
            var btn = this.statusBar.addActionButton(godLabel, () => {
                this.bgaPerformAction("actAdvanceGod", { godName: g.god_name });
            });
            this._prependGodIconToButton(btn, g.god_name);
        });
        this._setAdvanceableGods(
            args.eligibleGods.map(g => g.god_name),
            'actAdvanceGod'
        );
    } else {
        var msg = document.createElement('span');
        msg.className = 'delphi-status-message';
        msg.textContent = _('No matching gods are eligible to advance');
        document.getElementById('generalactions').appendChild(msg);
        noEligibleGods = true;
    }
    this.statusBar.addActionButton(noEligibleGods ? _('OK') : _('Pass'), () => {
        this.bgaPerformAction("actPass", {});
    }, { color: 'secondary' });
    break;
```

`args.eligibleGods` is already filtered to the eligible gods only — no `can_advance` filter needed here.

- [ ] **Step 3: Manual sanity check**

Trigger `CheckGodAdvancement` (typically after an action that completes a Zeus tile and matches a god colour). Confirm only the eligible gods get arrows on the active player's board.

- [ ] **Step 4: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat(gods): wire CheckGodAdvancement to clickable god affordance"
```

Merge into master.

---

## Task 5: JS — wire `SelectGodForTopRow`

**Files:**
- Modify: `theoracleofdelphigzed.js:3529-3548` (the existing `case 'SelectGodForTopRow':` block)

- [ ] **Step 1: Read the current `SelectGodForTopRow` block**

Lines 3529-3548 handle the Divine Surge equipment card: server provides `args.eligible_gods` (note underscore — different shape from `eligibleGods`) with `current_row` and `can_advance`, and a `max_row` for the label. The action is `actSelectGod`, not `actAdvanceGod`.

- [ ] **Step 2: Add the `_setAdvanceableGods` call**

Modify the block to:

```javascript
case 'SelectGodForTopRow':
    // Equipment card 021 (Divine Surge): single pick to
    // advance one of Poseidon/Hermes/Artemis/Aphrodite
    // straight to the topmost row. Gods already at the
    // top are rendered disabled-style (they'd no-op).
    // If all four are at the top the server resolves
    // inline and we never enter this state; no Pass.
    if (args && args.eligible_gods) {
        this._sortGodsByBoard(args.eligible_gods).forEach(g => {
            if (g.can_advance) {
                var surgeLabel = g.god_name.charAt(0).toUpperCase() + g.god_name.slice(1) +
                    ' (row ' + g.current_row + ' → ' + args.max_row + ')';
                var surgeBtn = this.statusBar.addActionButton(surgeLabel, () => {
                    this.bgaPerformAction("actSelectGod", { godName: g.god_name });
                });
                this._prependGodIconToButton(surgeBtn, g.god_name);
            }
        });
        this._setAdvanceableGods(
            args.eligible_gods.filter(g => g.can_advance).map(g => g.god_name),
            'actSelectGod'
        );
    }
    break;
```

Note the action is `actSelectGod`, not `actAdvanceGod`.

- [ ] **Step 3: Manual sanity check**

Easiest trigger: in a debug game, give yourself the Divine Surge equipment card and play it. Confirm only the four eligible gods (Poseidon/Hermes/Artemis/Aphrodite) get arrows, and only those whose `can_advance` is true (i.e., not yet at top). Click one — server should advance it directly to top row.

- [ ] **Step 4: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat(gods): wire SelectGodForTopRow (Divine Surge) to clickable god affordance"
```

Merge into master.

---

## Task 6: JS — wire `NoInjuryBonus`

**Files:**
- Modify: `theoracleofdelphigzed.js:3471-3488` (the existing `case 'NoInjuryBonus':` block)

- [ ] **Step 1: Read the current `NoInjuryBonus` block**

Lines 3471-3488 render the Take-2-Favor button and per-god advance buttons. Server provides `args.advanceableGods` (already filtered to gods with `track_row < 6` per [NoInjuryBonus.php:26-29](../../../modules/php/States/NoInjuryBonus.php#L26)). No `can_advance` field — the array already excludes max-row gods.

- [ ] **Step 2: Add the `_setAdvanceableGods` call**

Modify the block to:

```javascript
case 'NoInjuryBonus':
    var takeFavorBtnNoInjury = this.statusBar.addActionButton(_('Take 2 Favor'), () => {
        this.bgaPerformAction("actTakeFavor", {});
    });
    this._prependActionIconToButton(takeFavorBtnNoInjury, 'take-favors');
    // Same action available via the favor-pile cluster.
    // (NoInjuryBonus uses actTakeFavor, not actTakeFavorTokens.)
    this._activateFavorPile('actTakeFavor');
    if (args && args.advanceableGods && args.advanceableGods.length > 0) {
        this._sortGodsByBoard(args.advanceableGods).forEach(g => {
            var godLabel = g.god_name.charAt(0).toUpperCase() + g.god_name.slice(1);
            var btn = this.statusBar.addActionButton(godLabel, () => {
                this.bgaPerformAction("actAdvanceGod", { godName: g.god_name });
            });
            this._prependGodIconToButton(btn, g.god_name);
        });
        this._setAdvanceableGods(
            args.advanceableGods.map(g => g.god_name),
            'actAdvanceGod'
        );
    }
    break;
```

- [ ] **Step 3: Manual sanity check**

Trigger `NoInjuryBonus` (end your turn with no injuries). Confirm:
- Take-2-Favor button still works
- Cyan arrows above all gods not at row 6 on your own board
- Clicking a god advances it and returns to PlayerActions

- [ ] **Step 4: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat(gods): wire NoInjuryBonus to clickable god affordance"
```

Merge into master.

---

## Task 7: Bump JS cache-bust markers

**Files:**
- Modify: `theoracleofdelphigzed.js:21-26` (six `?v205` markers in the `define([...])` block)
- Modify: `theoracleofdelphigzed.js:64` (the `JS_VERSION` class property)
- Modify: `theoracleofdelphigzed.js:63` (the comment line referencing the version, if it mentions `v205` literally)

- [ ] **Step 1: Find current value**

Current version: `v205` (per [theoracleofdelphigzed.js:21](../../../theoracleofdelphigzed.js#L21) and [:64](../../../theoracleofdelphigzed.js#L64)). Bump to `v206`.

- [ ] **Step 2: Replace all six `?v205` markers in the `define([...])` block**

Lines 21-26 currently read:

```javascript
g_gamethemeurl + "modules/js/HexGrid.js?v205",
g_gamethemeurl + "modules/js/Components.js?v205",
g_gamethemeurl + "modules/js/ClusterDefinitions.js?v205",
g_gamethemeurl + "modules/js/BoardBuilder.js?v205",
g_gamethemeurl + "modules/js/BoardRenderer.js?v205",
g_gamethemeurl + "modules/BX/js/DragScroller.js?v205",
```

Change every `?v205` to `?v206`.

- [ ] **Step 3: Bump the `JS_VERSION` class property**

Line 64 currently reads `JS_VERSION: "v205",`. Change to `JS_VERSION: "v206",`.

The comment on line 63 ("Keep in sync with the ?v205 markers in the define() block above.") references `v205` as the *example* — you may bump it to `v206` for accuracy. Either way works; the comment is a hint, not a build artifact.

- [ ] **Step 4: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "chore: bump JS cache-bust to v206 (god click affordance)"
```

Merge into master.

---

## Task 8: Manual verification — full acceptance battery

**Files:** none modified — verification only.

- [ ] **Step 1: Start the dev environment**

Use the `browsing-babylist` skill (or your usual BGA dev workflow) to open a multi-player game where you can trigger all four advancement states. A two-player game with both seats accessible (or a quick studio test game) is fine.

- [ ] **Step 2: Run acceptance test 1 — Affordance appears**

In `ChooseGodAdvancement` as the active player:
- Cyan arrow bobs above every god whose `can_advance` is true on your own board.
- No arrow on the opponent's board.
- Tooltip on hover still works.

- [ ] **Step 3: Run acceptance test 2 — Click fires the action**

Click an advanceable god. The god advances by one row (or to the player-count row from row 0, or to top in `SelectGodForTopRow`). Same outcome as clicking the matching status-bar button.

- [ ] **Step 4: Run acceptance test 3 — Multi-step re-render**

Trigger a multi-step advancement (e.g., shrine bonus with `steps_remaining ≥ 2`). After each click, the state re-enters and the arrow re-appears on the still-advanceable gods. Steps decrement.

- [ ] **Step 5: Run acceptance test 4 — Affordance clears**

Click `Done` (or finish the last step). All arrows on all boards disappear. Hover on a god produces no scale, no shadow change, no pointer cursor — only the BGA tooltip.

- [ ] **Step 6: Run acceptance test 5 — Hover quiet on non-advanceable**

Outside any of the four states (e.g., during opponent's turn or in `PlayerActions`), hover any god. Only the tooltip fires. No scale, no shadow change, default cursor.

- [ ] **Step 7: Run acceptance test 6 — Row-6 gold ring intact**

Find or place a god at row 6. The gold ring + glow render as before. Hover slightly brightens the gold ring (existing behaviour). No cyan arrow ever appears on a row-6 token.

- [ ] **Step 8: Run acceptance test 7 — All four states**

Repeat acceptance test 1 for `CheckGodAdvancement` (complete a Zeus tile that matches a god colour), `SelectGodForTopRow` (play Divine Surge), `NoInjuryBonus` (end turn with no injuries). Each fires its respective action on click.

- [ ] **Step 9: Run acceptance test 8 — Both routes coexist**

In any of the four states, both clicking the god and clicking the status-bar button produce identical server actions. No double-trigger when clicking quickly.

- [ ] **Step 10: Edge case — Row 5 clearance**

If you can engineer it (e.g., via debug tools), get a god to row 5 and trigger `ChooseGodAdvancement`. Confirm the arrow above the row-5 token is fully visible — no clipping at the row-6 boundary. If clipping is observed, defer to the spec's fallback (column-anchored arrow with a connector line) — that's a separate follow-up issue, not part of this plan.

- [ ] **Step 11: Final summary commit (only if any small fixes were needed during verification)**

If verification surfaces no issues, no extra commit is needed — the plan is complete.

If a small fix was needed (e.g., a typo in a god name, a missing `break;`), make it and commit:

```bash
git add theoracleofdelphigzed.js theoracleofdelphigzed.css
git commit -m "fix(gods): <description of the fix>"
```

Merge into master. Done.
