# Combat Dialog Action Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the combat action buttons (`Roll Battle Die`, `Cancel`, `Pay 1 Favor to continue`, `Surrender`, `Select Equipment Card`) out of the BGA status bar and into the `#delphi-combat-dialog` footer, so the user's eye stays in one place during a fight.

**Architecture:** Add a `.dialog-actions` footer to the combat dialog template. Introduce two tiny helpers on the game module — `_setCombatDialogActions(buttons)` and `_clearCombatDialogActions()` — that populate or wipe the footer's buttons. Replace the `statusBar.addActionButton(...)` calls in the three combat states with calls to the set-helper, and call the clear-helper at every existing dialog-close site plus `onLeavingState` for the combat states.

**Tech Stack:** Vanilla JS (BGA framework, AMD module), Smarty `.tpl` template, CSS. No build step for the JS (BGA loads it directly); JS version cache-bust is bumped via `DELPHI_JS_VERSION`.

**Spec:** [docs/superpowers/specs/2026-04-18-combat-dialog-actions-design.md](../specs/2026-04-18-combat-dialog-actions-design.md)

**Testing note:** This repo has no headless JS test suite — every task verifies via manual browser checks on BGA Studio. Task 6 is the end-to-end smoke test.

---

## File Structure

- **Modify:** `theoracleofdelphigzed_theoracleofdelphigzed.tpl` — add one `.dialog-actions` footer div inside `#delphi-combat-dialog` (Task 1).
- **Modify:** `theoracleofdelphigzed.js` — add two helper methods and swap five `statusBar.addActionButton` sites to helper calls; add clear-calls in `onLeavingState` and three `notif_*` handlers (Tasks 2–5).
- **Modify:** `theoracleofdelphigzed.js` — bump `DELPHI_JS_VERSION` cache-buster (Task 6).

No new files. No CSS changes (existing `.dialog-actions`, `.delphi-btn.primary`, `.delphi-btn.secondary` rules cover everything).

---

### Task 1: Add `.dialog-actions` footer to the combat dialog template

**Files:**
- Modify: `theoracleofdelphigzed_theoracleofdelphigzed.tpl:196-222`

- [ ] **Step 1: Edit the template**

In `theoracleofdelphigzed_theoracleofdelphigzed.tpl`, locate the `#delphi-combat-dialog` block that ends at line 222 with `</div>` closing `.dialog-content`. Add a new `.dialog-actions` footer right after `.dialog-content` closes, before the outer dialog `</div>`.

Replace:

```html
        <div id="combat-dice-area">
            <div id="combat-battle-die"></div>
        </div>
    </div>
</div>
```

With:

```html
        <div id="combat-dice-area">
            <div id="combat-battle-die"></div>
        </div>
    </div>
    <div class="dialog-actions" id="combat-dialog-actions"></div>
</div>
```

- [ ] **Step 2: Verify visually**

Reload the BGA Studio test table, start a fight so the dialog appears, and confirm:
- The dialog still renders correctly.
- A thin top-border line appears below the die area (from `.dialog-actions` CSS), indicating the empty footer is present.
- No buttons appear yet — that is expected at this step.

- [ ] **Step 3: Commit**

```bash
git add theoracleofdelphigzed_theoracleofdelphigzed.tpl
git commit -m "feat(combat): add empty .dialog-actions footer to fight dialog"
```

---

### Task 2: Add `_setCombatDialogActions` and `_clearCombatDialogActions` helpers

**Files:**
- Modify: `theoracleofdelphigzed.js` — add two new methods near the existing combat-related helpers (e.g., directly above `onRollBattleDie` around [theoracleofdelphigzed.js:2633](../../../theoracleofdelphigzed.js)).

- [ ] **Step 1: Add the helper methods**

Locate `onRollBattleDie: function() {` around line 2633. Insert the following two methods immediately before it:

```javascript
        /**
         * Clear all action buttons from the combat dialog footer.
         */
        _clearCombatDialogActions: function() {
            var footer = document.getElementById('combat-dialog-actions');
            if (footer) footer.innerHTML = '';
        },

        /**
         * Populate the combat dialog footer with action buttons.
         * @param {Array<{label:string,color?:string,onClick:Function,disabled?:boolean}>} buttons
         *   color defaults to 'primary'. Valid: 'primary' | 'secondary'.
         */
        _setCombatDialogActions: function(buttons) {
            var footer = document.getElementById('combat-dialog-actions');
            if (!footer) return;
            footer.innerHTML = '';
            (buttons || []).forEach(function(b) {
                var btn = document.createElement('button');
                var colorClass = (b.color === 'secondary') ? 'secondary' : 'primary';
                btn.className = 'delphi-btn ' + colorClass;
                btn.textContent = b.label;
                if (b.disabled) btn.disabled = true;
                btn.addEventListener('click', function(ev) {
                    ev.preventDefault();
                    if (typeof b.onClick === 'function') b.onClick();
                });
                footer.appendChild(btn);
            });
        },
```

- [ ] **Step 2: Smoke test in the console**

In the BGA Studio table's browser devtools console, after the page loads, run:

```javascript
gameui._setCombatDialogActions([
  { label: 'Test Primary', color: 'primary', onClick: () => console.log('primary') },
  { label: 'Test Secondary', color: 'secondary', onClick: () => console.log('secondary') },
]);
document.getElementById('delphi-combat-dialog').classList.add('active');
```

Expected:
- Dialog opens, two buttons render in the footer with correct styling (red primary, dark secondary).
- Clicking each logs the correct string.

Then clean up:

```javascript
gameui._clearCombatDialogActions();
document.getElementById('delphi-combat-dialog').classList.remove('active');
```

Expected: footer empties, dialog closes.

- [ ] **Step 3: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat(combat): add _setCombatDialogActions/_clearCombatDialogActions helpers"
```

---

### Task 3: Migrate CombatRound buttons into the dialog

**Files:**
- Modify: `theoracleofdelphigzed.js:2162-2168` (CombatRound case in `onEnteringState`)
- Modify: `theoracleofdelphigzed.js:1775-1777` (CombatRound case in `onLeavingState`)

- [ ] **Step 1: Replace the `onEnteringState` CombatRound buttons**

Find the `case 'CombatRound':` block in `onEnteringState` (around line 2162):

```javascript
                    case 'CombatRound':
                        var strengthText = (args && args.strength !== undefined) ? ' (need ' + args.strength + '+)' : '';
                        this.statusBar.addActionButton(_('Roll Battle Die') + strengthText, () => this.onRollBattleDie(), { color: 'primary' });
                        this.statusBar.addActionButton(_('Cancel'), () => {
                            this.bgaPerformAction("actCancelCombat", {});
                        }, { color: 'secondary' });
                        break;
```

Replace with:

```javascript
                    case 'CombatRound':
                        var strengthText = (args && args.strength !== undefined) ? ' (need ' + args.strength + '+)' : '';
                        var self = this;
                        this._setCombatDialogActions([
                            {
                                label: _('Roll Battle Die') + strengthText,
                                color: 'primary',
                                onClick: function() { self.onRollBattleDie(); }
                            },
                            {
                                label: _('Cancel'),
                                color: 'secondary',
                                onClick: function() { self.bgaPerformAction("actCancelCombat", {}); }
                            }
                        ]);
                        break;
```

- [ ] **Step 2: Clear the buttons on leaving CombatRound**

Find the `case 'CombatRound':` block in `onLeavingState` (around line 1775):

```javascript
                case 'CombatRound':
                case 'CombatDefeat':
                    break;
```

Replace with:

```javascript
                case 'CombatRound':
                case 'CombatDefeat':
                    this._clearCombatDialogActions();
                    break;
```

(`CombatDefeat` is covered here too — Task 4 only adds button population for it; the clear is shared.)

- [ ] **Step 3: Manual verification**

Start a fight in the BGA Studio test table. Verify:
- On entering a combat round, **no** `Roll Battle Die` or `Cancel` buttons appear in the top status bar.
- Both buttons appear **inside** the dialog footer, with correct label (including the `(need X+)` suffix) and colors.
- Clicking `Roll Battle Die` rolls the die and the round progresses (buttons are re-populated by the next `CombatRound` entry or replaced by Defeat/Victory).
- Clicking `Cancel` closes the dialog and restores the die visually.

- [ ] **Step 4: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat(combat): move CombatRound buttons into fight dialog"
```

---

### Task 4: Migrate CombatDefeat buttons into the dialog

**Files:**
- Modify: `theoracleofdelphigzed.js:2170-2178` (CombatDefeat case in `onEnteringState`)

- [ ] **Step 1: Replace the `onEnteringState` CombatDefeat buttons**

Find the `case 'CombatDefeat':` block in `onEnteringState` (around line 2170):

```javascript
                    case 'CombatDefeat':
                        if (args && args.canContinue) {
                            this.statusBar.addActionButton(
                                _('Pay 1 Favor to continue') + ' (' + args.favorTokens + ' left)',
                                () => this.onContinueFight()
                            );
                        }
                        this.statusBar.addActionButton(_('Surrender'), () => this.onSurrender(), { color: 'secondary' });
                        break;
```

Replace with:

```javascript
                    case 'CombatDefeat':
                        var self = this;
                        var defeatButtons = [];
                        if (args && args.canContinue) {
                            defeatButtons.push({
                                label: _('Pay 1 Favor to continue') + ' (' + args.favorTokens + ' left)',
                                color: 'primary',
                                onClick: function() { self.onContinueFight(); }
                            });
                        }
                        defeatButtons.push({
                            label: _('Surrender'),
                            color: 'secondary',
                            onClick: function() { self.onSurrender(); }
                        });
                        this._setCombatDialogActions(defeatButtons);
                        break;
```

- [ ] **Step 2: Manual verification**

In a fight, intentionally roll below the shield strength to trigger `CombatDefeat`. Verify:
- With favor tokens remaining: both `Pay 1 Favor to continue (N left)` (primary) and `Surrender` (secondary) appear in the dialog footer, nothing in the status bar.
- With zero favor tokens: only `Surrender` appears.
- Clicking `Pay 1 Favor to continue` decrements favor and starts a new round — buttons refresh correctly from the next `CombatRound` entry.
- Clicking `Surrender` closes the dialog and ends the fight.

- [ ] **Step 3: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat(combat): move CombatDefeat buttons into fight dialog"
```

---

### Task 5: Migrate CombatVictory button and clear on every dialog close

**Files:**
- Modify: `theoracleofdelphigzed.js:2180-2192` (CombatVictory case in `onEnteringState`)
- Modify: `theoracleofdelphigzed.js:1778-1782` (CombatVictory case in `onLeavingState`)
- Modify: `theoracleofdelphigzed.js:2845-2858` (`notif_combatSurrender`, `notif_combatCancelled`)
- Modify: `theoracleofdelphigzed.js:2861-2878` (`notif_equipmentSelected`)

- [ ] **Step 1: Replace the CombatVictory `onEnteringState` button**

Find the `case 'CombatVictory':` block in `onEnteringState` (around line 2180):

```javascript
                    case 'CombatVictory':
                        var victoryMonster = (args && args.monster_type) || 'Monster';
                        victoryMonster = victoryMonster.charAt(0).toUpperCase() + victoryMonster.slice(1);
                        var titleEl = document.getElementById('pagemaintitletext');
                        if (titleEl) titleEl.innerHTML = 'You defeated the ' + victoryMonster + '!';
                        var self = this;
                        this._equipmentCards = args.equipmentDisplay || [];
                        this.statusBar.addActionButton(_('Select Equipment Card'), function() {
                            document.getElementById('delphi-combat-dialog').classList.remove('active');
                            self.components.clearBattleDie();
                            self._showEquipmentStrip();
                        }, { color: 'primary' });
                        break;
```

Replace with:

```javascript
                    case 'CombatVictory':
                        var victoryMonster = (args && args.monster_type) || 'Monster';
                        victoryMonster = victoryMonster.charAt(0).toUpperCase() + victoryMonster.slice(1);
                        var titleEl = document.getElementById('pagemaintitletext');
                        if (titleEl) titleEl.innerHTML = 'You defeated the ' + victoryMonster + '!';
                        var self = this;
                        this._equipmentCards = args.equipmentDisplay || [];
                        this._setCombatDialogActions([
                            {
                                label: _('Select Equipment Card'),
                                color: 'primary',
                                onClick: function() {
                                    self._clearCombatDialogActions();
                                    document.getElementById('delphi-combat-dialog').classList.remove('active');
                                    self.components.clearBattleDie();
                                    self._showEquipmentStrip();
                                }
                            }
                        ]);
                        break;
```

- [ ] **Step 2: Clear buttons on leaving CombatVictory**

Find the `case 'CombatVictory':` block in `onLeavingState` (around line 1778):

```javascript
                case 'CombatVictory':
                    document.getElementById('delphi-equipment-strip').style.display = 'none';
                    document.getElementById('delphi-combat-dialog').classList.remove('active');
                    this.components.clearBattleDie();
                    break;
```

Replace with:

```javascript
                case 'CombatVictory':
                    this._clearCombatDialogActions();
                    document.getElementById('delphi-equipment-strip').style.display = 'none';
                    document.getElementById('delphi-combat-dialog').classList.remove('active');
                    this.components.clearBattleDie();
                    break;
```

- [ ] **Step 3: Clear buttons in `notif_combatSurrender`**

Find `notif_combatSurrender` (around line 2845):

```javascript
        notif_combatSurrender: async function(args) {
            console.log('notif_combatSurrender', args);
            this.components.clearBattleDie();
            document.getElementById('delphi-combat-dialog').classList.remove('active');
        },
```

Replace with:

```javascript
        notif_combatSurrender: async function(args) {
            console.log('notif_combatSurrender', args);
            this._clearCombatDialogActions();
            this.components.clearBattleDie();
            document.getElementById('delphi-combat-dialog').classList.remove('active');
        },
```

- [ ] **Step 4: Clear buttons in `notif_combatCancelled`**

Find `notif_combatCancelled` (around line 2851):

```javascript
        notif_combatCancelled: async function(args) {
            console.log('notif_combatCancelled', args);
            this.components.clearBattleDie();
            document.getElementById('delphi-combat-dialog').classList.remove('active');
            // Restore the die visually
            if (args.die_index != null) {
                this.components.restoreDie(parseInt(args.player_id), parseInt(args.die_index));
            }
        },
```

Replace with:

```javascript
        notif_combatCancelled: async function(args) {
            console.log('notif_combatCancelled', args);
            this._clearCombatDialogActions();
            this.components.clearBattleDie();
            document.getElementById('delphi-combat-dialog').classList.remove('active');
            // Restore the die visually
            if (args.die_index != null) {
                this.components.restoreDie(parseInt(args.player_id), parseInt(args.die_index));
            }
        },
```

- [ ] **Step 5: Clear buttons in `notif_equipmentSelected`**

Find `notif_equipmentSelected` (around line 2861):

```javascript
        notif_equipmentSelected: async function(args) {
            console.log('notif_equipmentSelected', args);
            this.components.clearBattleDie();
            document.getElementById('delphi-combat-dialog').classList.remove('active');
```

Replace the opening lines with:

```javascript
        notif_equipmentSelected: async function(args) {
            console.log('notif_equipmentSelected', args);
            this._clearCombatDialogActions();
            this.components.clearBattleDie();
            document.getElementById('delphi-combat-dialog').classList.remove('active');
```

(Leave the rest of the function unchanged.)

- [ ] **Step 6: Manual verification**

Play through every exit path:

1. Win a fight → `Select Equipment Card` appears in the dialog footer. Click it → dialog closes, equipment strip opens. Pick a card → strip closes, no stale footer buttons on the next fight.
2. Lose and surrender → dialog closes, footer cleared.
3. Start a fight then cancel → dialog closes, footer cleared, die restored.
4. Start a second fight after each of the above → footer is empty on entry; then populates correctly with CombatRound buttons.

- [ ] **Step 7: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat(combat): move CombatVictory button into dialog; clear footer on all close paths"
```

---

### Task 6: Bump JS cache-buster and run the full smoke test

**Files:**
- Modify: `theoracleofdelphigzed.js` — `DELPHI_JS_VERSION` constant (search top of file).

- [ ] **Step 1: Find and bump `DELPHI_JS_VERSION`**

Search `theoracleofdelphigzed.js` for `DELPHI_JS_VERSION`. Increment the version number (e.g., `27` → `28`) so BGA's cache-bust loader picks up the new JS on reload.

- [ ] **Step 2: Full smoke test in BGA Studio**

Reload the test table with a hard refresh. Run the full combat script:

1. Start a new game, advance to a turn where fight is available.
2. Click `Fight <Monster>` in the status bar → dialog opens with monster info, die, and empty footer.
3. After the state settles into `CombatRound`, confirm two buttons (`Roll Battle Die (need X+)` + `Cancel`) appear in the **dialog footer only** — status bar is empty of combat buttons.
4. Roll a losing result → `CombatDefeat` buttons replace the previous ones in the same footer. Verify `(N left)` count.
5. Pay favor to continue → back to `CombatRound` buttons. Verify the favor count on the next defeat decremented.
6. Roll a winning result → `Select Equipment Card` replaces the footer. Title changes to "You defeated the X!".
7. Click `Select Equipment Card` → dialog closes, equipment strip opens, pick a card → strip closes cleanly.
8. Start a second fight → confirm no stale buttons from the previous fight are present on dialog open.
9. Start a third fight and `Cancel` → die is restored visually, dialog closes, no stale buttons.
10. Start a fourth fight, lose, `Surrender` → fight ends cleanly.

- [ ] **Step 3: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "chore: bump DELPHI_JS_VERSION for combat dialog action buttons"
```
