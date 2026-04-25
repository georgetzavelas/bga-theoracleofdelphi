# Player Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 240px BGA player panel from spec [docs/superpowers/specs/2026-04-25-player-panel-design.md](../specs/2026-04-25-player-panel-design.md) — 8 sections, identical for every player, wired to existing game state with new server data added where needed.

**Architecture:** All visual work in CSS + JS (`Components.js`). Two new server-data extensions to `getAllDatas()`: per-player panel-state bundle (gods, injuries, hand, companions, equipment, cargo, peeked count) and a small set of new `notif_*` payloads where they're missing. The panel renders into BGA's standard `#player_board_${playerId}` containers — no `tplPlayerBoard` PHP template is needed; we manipulate the DOM after BGA creates the slots.

**Tech Stack:** PHP 8 (BGA framework), JS (BGA's Dojo + CometD `dojo.subscribe` for notifications), CSS3.

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `modules/js/Components.js` | Modify | Add `Components.playerPanel.*` namespace: `init`, `render*`, `update*` per section |
| `theoracleofdelphigzed.js` | Modify | Call `Components.playerPanel.init(playerId, gamedatas)` for each player in `setup()`. Add/extend `notif_*` handlers to call panel update functions |
| `theoracleofdelphigzed.css` | Modify | New `.delphi-pp-*` selectors (player-panel) for all 8 sections. Reuse `--delphi-{color}`, `--gold`, `--gold-deep` |
| `theoracleofdelphigzed_theoracleofdelphigzed.tpl` | No changes | Panel structure injected by JS at runtime |
| `modules/php/Game.php` | Modify | Extend `getAllDatas()` with `panelState` bundle per player. Add `peeked_count` to player notifications when knowledge changes. No state-machine changes |
| `tests/test_player_panel_data.php` | Create | PHP smoke tests for the new `panelState` shape and ship-ability glyph mapping |

`Components.playerPanel` is a sub-namespace inside the existing `Components` object (not a separate module file) per the spec: "Components.js — add render functions". Each render function targets a single section and is independently callable, so notifications can update one row without re-rendering the whole panel.

---

## Conventions used by every task

- **CSS class prefix:** `.delphi-pp-*` (player-panel) for every new selector.
- **Element id pattern:** `pp-{section}-{playerId}` (e.g. `pp-favor-12345`, `pp-injuries-bar-12345`).
- **Color tokens:** existing `--delphi-red/yellow/green/blue/pink/black`, `--gold`, `--gold-deep`. Player color from `gamedatas.players[playerId].player_color` (hex without `#`).
- **Image roots:** `g_gamethemeurl + 'img/{folder}/'`. The pattern is already used by existing CSS like `.god-tooltip-icon.god-aphrodite { background-image: url('img/oracle-dice/die-face-red.png'); }`. For inline JS image references, use `g_gamethemeurl` to build absolute paths.
- **Greek letter mapping for shrines:** filename glyphs are `omega/phi/sigma/psi`. For each player there are 3 shrine zeus tiles selected at setup; the letter is the suffix of `img/zeus-tiles/shrines/{player_color}-player-{letter}.jpg` (e.g. `red-player-omega.jpg` → `Ω`). Letter-to-glyph map: `omega→Ω`, `phi→Φ`, `sigma→Σ`, `psi→Ψ`. Add this map to `Components.playerPanel.SHRINE_GLYPHS`.
- **Existing test runner:** PHP tests are plain scripts run with `php tests/test_<x>.php`. They use `assert_true(condition, message)` and tally `$passed`/`$failed`. There is no PHPUnit and no JS test harness; JS verification is manual against a running game.
- **Frequent commits:** every task ends in a commit. Commit messages follow existing repo style: `feat(player-panel): <short summary>` or `fix(player-panel): <short summary>`. **No** `Co-Authored-By: Claude` trailer (per repo convention).

---

## Task 1: Module skeleton + base CSS + setup wiring

**Goal:** Get an empty player panel container rendering into every `#player_board_${id}` BGA slot. Verifies the wire-up before any content lands.

**Files:**
- Modify: `modules/js/Components.js` (add `Components.playerPanel` skeleton)
- Modify: `theoracleofdelphigzed.js` `setup()` (call `Components.playerPanel.init` for each player)
- Modify: `theoracleofdelphigzed.css` (base `.delphi-pp` styling)

- [ ] **Step 1: Add the skeleton sub-namespace to `Components.js`**

Locate the existing `Components` object literal in `modules/js/Components.js` and add this block at the bottom of the object (before the closing `}`):

```javascript
playerPanel: {
    SHRINE_GLYPHS: {
        omega: 'Ω', phi: 'Φ', sigma: 'Σ', psi: 'Ψ',
    },
    GOD_ORDER: ['poseidon', 'apollo', 'artemis', 'aphrodite', 'ares', 'hermes'],
    init: function(playerId, gamedatas) {
        var slot = document.getElementById('player_board_' + playerId);
        if (!slot) {
            console.warn('[player-panel] no player_board slot for', playerId);
            return null;
        }
        var panel = document.createElement('div');
        panel.id = 'pp-root-' + playerId;
        panel.className = 'delphi-pp';
        panel.dataset.playerId = String(playerId);
        slot.appendChild(panel);
        return panel;
    },
    getRoot: function(playerId) {
        return document.getElementById('pp-root-' + playerId);
    },
},
```

- [ ] **Step 2: Wire the call in `setup()`**

Locate `setup: function(gamedatas)` in `theoracleofdelphigzed.js` (the BGA-required entry point — search for `setup: function`). After the `gamedatas.players` are processed but before `setupNotifications()`, add:

```javascript
// Build the redesigned player panel for every seat.
for (var pid in gamedatas.players) {
    if (gamedatas.players.hasOwnProperty(pid)) {
        this.components.playerPanel.init(pid, gamedatas);
    }
}
```

`this.components` is the existing alias for the `Components` object — confirm it exists by grepping `this.components.` in `theoracleofdelphigzed.js`. If the alias is named differently in your local copy (e.g. `this.gameComponents`), use that.

- [ ] **Step 3: Add base CSS for `.delphi-pp`**

Append to `theoracleofdelphigzed.css`:

```css
/* =====================================================
   PLAYER PANEL — redesigned 240px sidebar panel
   ===================================================== */

.delphi-pp {
    --pp-bg: #f0e8d2;
    --pp-frame: #c9b890;
    --pp-ink: #2a2017;
    --pp-ink-light: #5a4a2f;

    width: 240px;
    background: var(--pp-bg);
    border: 1px solid var(--pp-frame);
    border-radius: 6px;
    overflow: hidden;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 11px;
    color: var(--pp-ink);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    margin-bottom: 8px;
}
```

- [ ] **Step 4: Manual verification**

Start the game (refresh F5 with the dev workflow used by your team). Open DevTools, in the Elements panel confirm there is a `<div id="pp-root-${playerId}" class="delphi-pp">` inside each `#player_board_${playerId}`. The panel will look like a 240px tan rectangle with no content yet — that's correct.

If the panel doesn't appear, log `gamedatas.players` in `setup()` and confirm the player IDs match what BGA injected as `#player_board_*` slot ids.

- [ ] **Step 5: Commit**

```bash
git add modules/js/Components.js theoracleofdelphigzed.js theoracleofdelphigzed.css
git commit -m "feat(player-panel): scaffold panel module + base CSS

Adds Components.playerPanel namespace with init() that injects an empty
.delphi-pp container into each BGA #player_board_\${id} slot. Sets up
the SHRINE_GLYPHS and GOD_ORDER constants for downstream sections.
Hooks the call into setup() so every seat gets a panel."
```

---

## Task 2: Header section

**Goal:** Render the BGA-chrome header — avatar, name, tasks counter (X/12 with fewer-tasks awareness), star, ELO badge, device, flag, time.

**Files:**
- Modify: `modules/js/Components.js` (add `playerPanel.renderHeader` + `playerPanel.updateTasksCounter`)
- Modify: `theoracleofdelphigzed.js` (call `renderHeader` per player; wire `notif_taskCompleted`)
- Modify: `theoracleofdelphigzed.css` (header CSS)
- Modify: `modules/php/Game.php` (add `taskTotal` to `panelState` per player — the denominator)

- [ ] **Step 1: Add `taskTotal` to server data**

In `modules/php/Game.php`, locate `getAllDatas()`. After the existing `$result["players"]` query (around line 875), add:

```php
// Per-player panel state. Keep this small and only what the panel needs.
$shipTiles = MaterialDefs::SHIP_TILES;
$panelState = [];
foreach ($result['players'] as $pid => $p) {
    $tileId = $p['shipTileId'] !== null ? (int)$p['shipTileId'] : null;
    $ability = $tileId !== null ? ($shipTiles[$tileId]['ability'] ?? null) : null;
    $taskTotal = $ability === 'fewer_tasks' ? 11 : 12;
    $panelState[$pid] = [
        'taskTotal' => $taskTotal,
        'shipAbility' => $ability,           // string or null
        'shipTileDescription' => $tileId !== null ? ($shipTiles[$tileId]['description'] ?? '') : '',
    ];
}
$result['panelState'] = $panelState;
```

- [ ] **Step 2: Add a PHP smoke test for `panelState`**

Create `tests/test_player_panel_data.php`:

```php
<?php
/**
 * Smoke test for the player-panel data extension to MaterialDefs lookups.
 * Run: php tests/test_player_panel_data.php
 */

require_once __DIR__ . '/../modules/php/MaterialDefs.php';

use Bga\Games\theoracleofdelphigzed\MaterialDefs;

$passed = 0;
$failed = 0;

function assert_true(bool $condition, string $message): void {
    global $passed, $failed;
    if ($condition) {
        $passed++;
    } else {
        $failed++;
        echo "FAIL: $message\n";
    }
}

// All 8 ship tiles have an ability
assert_true(count(MaterialDefs::SHIP_TILES) === 8, 'Should have 8 ship tiles');
foreach (MaterialDefs::SHIP_TILES as $id => $tile) {
    assert_true(isset($tile['ability']), "Ship tile $id has ability");
    assert_true(isset($tile['storage']), "Ship tile $id has storage");
    assert_true(isset($tile['description']), "Ship tile $id has description");
}

// Storage values are 2 or 4
foreach (MaterialDefs::SHIP_TILES as $id => $tile) {
    assert_true(in_array($tile['storage'], [2, 4], true), "Ship tile $id storage in {2,4}");
}

// Exactly one ship tile is fewer_tasks (which sets task total to 11)
$fewerTasksTiles = array_filter(
    MaterialDefs::SHIP_TILES,
    fn($t) => ($t['ability'] ?? null) === 'fewer_tasks'
);
assert_true(count($fewerTasksTiles) === 1, 'Exactly one ship tile is fewer_tasks');

echo "\nPassed: $passed\nFailed: $failed\n";
exit($failed === 0 ? 0 : 1);
```

- [ ] **Step 3: Run the test, expect PASS**

```bash
php tests/test_player_panel_data.php
```

Expected: `Failed: 0`. If it fails, the `MaterialDefs::SHIP_TILES` shape diverged from what the spec assumed — fix the assumption in the test or the data, but don't proceed without a green run.

- [ ] **Step 4: Add CSS for header**

Append to `theoracleofdelphigzed.css`:

```css
.delphi-pp-header {
    display: grid;
    grid-template-columns: 40px 1fr auto;
    gap: 6px;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(90, 74, 47, 0.15);
    align-items: center;
}
.delphi-pp-avatar {
    width: 40px; height: 40px;
    border-radius: 50%;
    border: 2px solid var(--gold-deep);
    background-size: cover;
    background-position: center;
    background-color: var(--pp-frame);
}
.delphi-pp-meta-left { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.delphi-pp-meta-right { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; }
.delphi-pp-name {
    font-weight: 700; font-size: 13px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    line-height: 1.1;
}
.delphi-pp-stats-row { display: flex; align-items: center; gap: 4px; font-size: 11px; line-height: 1; }
.delphi-pp-tasks-counter {
    font-weight: 800;
    background: rgba(91, 71, 30, 0.1);
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid rgba(91, 71, 30, 0.3);
    min-width: 14px;
    text-align: center;
}
.delphi-pp-star { color: var(--gold); font-size: 12px; }
.delphi-pp-elo {
    font-weight: 700; font-size: 11px;
    background: linear-gradient(180deg, #cfd8dc, #90a4ae);
    color: #1a237e;
    padding: 1px 6px 1px 16px;
    border-radius: 8px;
    position: relative;
    border: 1px solid #546e7a;
}
.delphi-pp-elo::before {
    content: '🏆';
    position: absolute; left: 2px; top: 50%;
    transform: translateY(-50%); font-size: 10px;
}
.delphi-pp-meta-right .right-top { display: flex; align-items: center; gap: 3px; }
.delphi-pp-device { font-size: 11px; opacity: 0.65; }
.delphi-pp-flag { font-size: 14px; line-height: 1; }
.delphi-pp-time {
    font-size: 10px; color: var(--pp-ink-light);
    background: rgba(255, 255, 255, 0.5);
    padding: 1px 5px; border-radius: 3px;
    line-height: 1.2; font-weight: 600;
}
```

- [ ] **Step 5: Add `renderHeader` to `Components.playerPanel`**

Inside `Components.playerPanel` in `modules/js/Components.js`, add:

```javascript
renderHeader: function(playerId, gamedatas) {
    var root = this.getRoot(playerId);
    if (!root) return;
    var p = gamedatas.players[playerId];
    if (!p) return;
    var taskTotal = (gamedatas.panelState && gamedatas.panelState[playerId])
        ? gamedatas.panelState[playerId].taskTotal : 12;
    var done = parseInt(p.tasksCompleted || p.tasks_completed || 0, 10);
    var elo = (p.elo !== undefined ? p.elo : (p.player_elo || ''));
    var flag = p.flag || (p.country ? this._countryFlag(p.country) : '');
    var device = p.device_icon || '';
    var avatarUrl = p.avatar_url || (p.avatar ? g_gamethemeurl + 'img/avatars/' + p.avatar : '');

    var headerHtml = ''
        + '<div class="delphi-pp-header" id="pp-header-' + playerId + '">'
        +   '<div class="delphi-pp-avatar" id="pp-avatar-' + playerId + '"'
        +     (avatarUrl ? ' style="background-image:url(\'' + avatarUrl + '\')"' : '') + '></div>'
        +   '<div class="delphi-pp-meta-left">'
        +     '<span class="delphi-pp-name" style="color:#' + p.player_color + '">' + this._escape(p.player_name || p.name || '') + '</span>'
        +     '<div class="delphi-pp-stats-row">'
        +       '<span class="delphi-pp-tasks-counter" id="pp-tasks-counter-' + playerId + '" title="Tasks completed (Zeus track)">'
        +         done + '<small style="opacity:0.6">/' + taskTotal + '</small>'
        +       '</span>'
        +       '<span class="delphi-pp-star">★</span>'
        +       (elo !== '' ? '<span class="delphi-pp-elo">' + elo + '</span>' : '')
        +     '</div>'
        +   '</div>'
        +   '<div class="delphi-pp-meta-right">'
        +     '<div class="right-top">'
        +       (device ? '<span class="delphi-pp-device">' + device + '</span>' : '')
        +       (flag ? '<span class="delphi-pp-flag">' + flag + '</span>' : '')
        +     '</div>'
        +     '<span class="delphi-pp-time" id="pp-time-' + playerId + '"></span>'
        +   '</div>'
        + '</div>';

    root.insertAdjacentHTML('beforeend', headerHtml);
},

updateTasksCounter: function(playerId, done, total) {
    var el = document.getElementById('pp-tasks-counter-' + playerId);
    if (!el) return;
    var t = total || 12;
    el.innerHTML = done + '<small style="opacity:0.6">/' + t + '</small>';
},

// Internal — basic HTML escape so player names don't inject markup.
_escape: function(s) {
    var div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
},
_countryFlag: function(code) {
    // BGA exposes player.country as ISO code in some setups; build a flag emoji
    // from regional indicator pairs. Falls back to empty if code is invalid.
    if (!code || code.length !== 2) return '';
    var cc = code.toUpperCase();
    var a = 0x1F1E6;
    return String.fromCodePoint(a + cc.charCodeAt(0) - 65) + String.fromCodePoint(a + cc.charCodeAt(1) - 65);
},
```

- [ ] **Step 6: Call `renderHeader` from setup**

In `theoracleofdelphigzed.js` `setup()`, update the loop added in Task 1:

```javascript
for (var pid in gamedatas.players) {
    if (gamedatas.players.hasOwnProperty(pid)) {
        this.components.playerPanel.init(pid, gamedatas);
        this.components.playerPanel.renderHeader(pid, gamedatas);
    }
}
```

- [ ] **Step 7: Wire `notif_taskCompleted` to update the counter**

Find `notif_taskCompleted` in `theoracleofdelphigzed.js` (it exists per earlier grep). Inside the function body (preserve existing behavior), append:

```javascript
if (typeof args.player_id !== 'undefined' && typeof args.tasks_completed !== 'undefined') {
    var total = (this.gamedatas.panelState && this.gamedatas.panelState[args.player_id])
        ? this.gamedatas.panelState[args.player_id].taskTotal : 12;
    this.components.playerPanel.updateTasksCounter(args.player_id, parseInt(args.tasks_completed, 10), total);
}
```

If `notif_taskCompleted` doesn't yet receive `tasks_completed` and `player_id` in its payload, locate the PHP code that calls `$this->notify->all('taskCompleted', ...)` and add those keys.

- [ ] **Step 8: Manual verification**

Refresh the game. Each player panel now shows: avatar (or BGA-styled fallback), name in the player's color, `0/12` tasks counter (or `0/11` if a player has the `fewer_tasks` ship tile), gold ★, ELO badge if exposed by BGA, device + flag if BGA exposes them. Complete a task in-game and confirm the counter increments without a full panel re-render.

- [ ] **Step 9: Commit**

```bash
git add modules/js/Components.js theoracleofdelphigzed.js theoracleofdelphigzed.css modules/php/Game.php tests/test_player_panel_data.php
git commit -m "feat(player-panel): header section + panelState server bundle

Adds the BGA-chrome header (avatar, name, tasks counter, star, ELO,
device, flag, time) for every player. Server emits panelState[playerId]
with taskTotal (11 or 12 based on fewer_tasks ship ability) and ship
ability metadata. Wires notif_taskCompleted to update the counter
in place. Adds tests/test_player_panel_data.php smoke test."
```

---

## Task 3: Stat pills (favor / shield / peeked) shared component

**Goal:** Build the shared visual primitive that all three stats use. Render the favor pill (in actions row, deferred to Task 7), shield pill (in injuries row, deferred to Task 5), and peeked pill (in cargo row, deferred to Task 4) — but the **CSS** lands here so all three sections can use it. Also add update functions.

**Files:**
- Modify: `theoracleofdelphigzed.css` (pill CSS)
- Modify: `modules/js/Components.js` (`updateFavor`, `updateShield`, `updatePeeked`)

- [ ] **Step 1: Add stat-pill CSS**

Append to `theoracleofdelphigzed.css`:

```css
.delphi-pp-stat-pill {
    display: flex; align-items: center; gap: 3px;
    font-size: 12px; font-weight: 800; color: var(--pp-ink);
    padding: 2px 6px;
    border-radius: 12px;
    flex-shrink: 0;
    line-height: 1;
}
.delphi-pp-stat-pill .pp-stat-icon {
    width: 14px; height: 14px;
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
}
.delphi-pp-stat-pill.right { margin-left: auto; }

.delphi-pp-stat-favor {
    background: linear-gradient(180deg, #fef4cb, #f0d895);
    border: 1.5px solid var(--gold-deep);
}
.delphi-pp-stat-favor .pp-stat-icon { background-image: url('img/pieces/favor-token.jpg'); }

.delphi-pp-stat-shield {
    background: linear-gradient(180deg, #d8e1ec, #a3b3c8);
    border: 1.5px solid #546e7a;
}
.delphi-pp-stat-shield .pp-stat-icon {
    /* Shield in player color; the JS sets the data-color attribute. */
    background-image: url('img/pieces/red-shield.png');
}
.delphi-pp-stat-shield[data-color="yellow"] .pp-stat-icon { background-image: url('img/pieces/yellow-shield.png'); }
.delphi-pp-stat-shield[data-color="green"]  .pp-stat-icon { background-image: url('img/pieces/green-shield.png'); }
.delphi-pp-stat-shield[data-color="blue"]   .pp-stat-icon { background-image: url('img/pieces/blue-shield.png'); }
.delphi-pp-stat-shield[data-color="red"]    .pp-stat-icon { background-image: url('img/pieces/red-shield.png'); }

.delphi-pp-stat-peeked {
    background: rgba(255, 255, 255, 0.6);
    border: 1.5px solid var(--pp-frame);
    cursor: pointer;
}
.delphi-pp-stat-peeked .pp-stat-icon { background-image: url('img/pieces/peek.png'); }
```

Note: `img/pieces/` only ships 4 player-colored shield images (red, yellow, green, blue). Pink and black aren't player colors in OoD — only the four standard player colors apply. The CSS above covers all four.

- [ ] **Step 2: Add update functions to `Components.playerPanel`**

```javascript
updateFavor: function(playerId, n) {
    var el = document.querySelector('#pp-favor-' + playerId + ' .pp-stat-value');
    if (el) el.textContent = String(n);
},
updateShield: function(playerId, n) {
    var el = document.querySelector('#pp-shield-' + playerId + ' .pp-stat-value');
    if (el) el.textContent = String(n);
},
updatePeeked: function(playerId, n) {
    var el = document.querySelector('#pp-peeked-' + playerId + ' .pp-stat-value');
    if (el) el.textContent = String(n);
},
_renderStatPill: function(opts) {
    // opts: { id, kind: 'favor'|'shield'|'peeked', value, playerColor?, alignRight?, title? }
    var classes = 'delphi-pp-stat-pill delphi-pp-stat-' + opts.kind + (opts.alignRight ? ' right' : '');
    var dataColor = opts.playerColor ? ' data-color="' + opts.playerColor + '"' : '';
    var title = opts.title ? ' title="' + this._escape(opts.title) + '"' : '';
    return ''
        + '<div id="' + opts.id + '" class="' + classes + '"' + dataColor + title + '>'
        +   '<span class="pp-stat-icon"></span>'
        +   '<span class="pp-stat-value">' + opts.value + '</span>'
        + '</div>';
},
```

These three update functions are intentionally tiny — they only swap the value text. Pill DOM is rendered once by the row that hosts each pill (Tasks 4, 5, 7).

- [ ] **Step 3: Verify no regressions**

The CSS is additive; the JS adds new functions that aren't called yet. Refresh the game and confirm nothing on screen changed and there are no console errors. Inspect `Components.playerPanel.updateFavor` in DevTools and confirm it's defined.

- [ ] **Step 4: Commit**

```bash
git add modules/js/Components.js theoracleofdelphigzed.css
git commit -m "feat(player-panel): stat-pill shared CSS + update functions

Adds the shared CSS used by favor/shield/peeked pills, plus
updateFavor/updateShield/updatePeeked functions that swap the value
text without re-rendering. Pill DOM is rendered by the host row in
later tasks (cargo, injuries, actions)."
```

---

## Task 4: Cargo row + ship-ability badge + peeked pill

**Goal:** Render the cargo row with N typed slots (square=offering, circle=statue), the gold-on-bronze ship-ability badge, and the right-aligned peeked pill.

**Files:**
- Modify: `modules/php/Game.php` (extend `panelState` with cargo + peeked count)
- Modify: `modules/js/Components.js` (add `renderCargoRow`, `updateCargo`, `updateShipAbility`)
- Modify: `theoracleofdelphigzed.js` (call `renderCargoRow` per player; wire cargo notifications)
- Modify: `theoracleofdelphigzed.css` (cargo CSS)

- [ ] **Step 1: Extend `panelState` server-side**

In `modules/php/Game.php` `getAllDatas()`, where `$panelState[$pid]` is built (Task 2 step 1), expand each entry:

```php
foreach ($result['players'] as $pid => $p) {
    $tileId = $p['shipTileId'] !== null ? (int)$p['shipTileId'] : null;
    $ability = $tileId !== null ? ($shipTiles[$tileId]['ability'] ?? null) : null;
    $taskTotal = $ability === 'fewer_tasks' ? 11 : 12;
    $storage = $tileId !== null ? (int)($shipTiles[$tileId]['storage'] ?? 2) : 2;

    // Cargo: statues + offerings carried by this player but not delivered/raised yet
    $statuesCarried = self::getObjectListFromDB(
        "SELECT statue_id AS id, color, 'statue' AS type
         FROM statue
         WHERE player_id = $pid AND is_raised = 0"
    );
    $offeringsCarried = self::getObjectListFromDB(
        "SELECT offering_id AS id, color, 'offering' AS type
         FROM offering
         WHERE player_id = $pid AND is_delivered = 0"
    );
    $cargo = array_merge($statuesCarried, $offeringsCarried);

    // Peeked count: rows in player_island_knowledge for this player.
    $peekedCount = (int)self::getUniqueValueFromDB(
        "SELECT COUNT(*) FROM player_island_knowledge WHERE player_id = $pid"
    );

    $panelState[$pid] = [
        'taskTotal' => $taskTotal,
        'shipAbility' => $ability,
        'shipTileId' => $tileId,
        'shipTileDescription' => $tileId !== null ? ($shipTiles[$tileId]['description'] ?? '') : '',
        'storage' => $storage,
        'cargo' => $cargo,
        'peekedCount' => $peekedCount,
    ];
}
```

Note: the schema for `statue` and `offering` was confirmed earlier — `player_id` is the carrier when `is_raised = 0` / `is_delivered = 0`. Verify by reading the relevant lines around the existing `$result['statues']` and `$result['offerings']` queries (~line 936) — the spec already describes the same predicates.

- [ ] **Step 2: Extend the smoke test**

In `tests/test_player_panel_data.php` add (before the final `echo`):

```php
// Ship-ability glyph map covers all 8 abilities used in MaterialDefs::SHIP_TILES
$abilities = array_unique(array_column(MaterialDefs::SHIP_TILES, 'ability'));
$expectedAbilities = [
    'shield_start', 'starting_equipment', 'reverse_recolor', 'favor_plus_1',
    'god_track_high', 'range_plus_2', 'fewer_tasks', 'recolor_discount',
];
sort($abilities);
sort($expectedAbilities);
assert_true($abilities === $expectedAbilities, 'Ship-tile abilities cover the 8 expected values');
```

- [ ] **Step 3: Run the test, expect PASS**

```bash
php tests/test_player_panel_data.php
```

Expected: `Failed: 0`.

- [ ] **Step 4: Add CSS for the cargo row**

Append to `theoracleofdelphigzed.css`:

```css
.delphi-pp-cargo-row {
    padding: 5px 10px;
    background: rgba(255, 255, 255, 0.4);
    border-bottom: 1px solid rgba(90, 74, 47, 0.15);
    display: flex; align-items: center; gap: 6px;
}
.delphi-pp-ship-icon {
    width: 16px; height: 16px;
    background: url('img/pieces/ship.png') center/contain no-repeat;
    flex-shrink: 0;
}
.delphi-pp-cargo-slots { display: flex; gap: 4px; }
.delphi-pp-cargo-slot {
    width: 16px; height: 16px;
    border: 1.5px solid var(--pp-frame);
    background: white;
}
.delphi-pp-cargo-slot.empty { border-style: dashed; opacity: 0.6; }
.delphi-pp-cargo-slot.offering { border-radius: 3px; }
.delphi-pp-cargo-slot.statue { border-radius: 50%; }
.delphi-pp-cargo-slot.filled {
    background-color: var(--cell-color, #ccc);
    background-image: var(--cell-bg, none);
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    border-color: rgba(0, 0, 0, 0.4);
}

.delphi-pp-ship-ability {
    width: 38px; height: 18px;
    background: linear-gradient(135deg, #6b4520 0%, #3a2510 100%);
    color: var(--gold);
    border-radius: 3px;
    border: 1.5px solid var(--gold-deep);
    display: flex; align-items: center; justify-content: center;
    gap: 2px;
    font-size: 11px; font-weight: 800;
    box-shadow: inset 0 1px 0 rgba(255, 215, 0, 0.2);
    flex-shrink: 0;
}
```

- [ ] **Step 5: Add `SHIP_ABILITY_GLYPHS` and `renderCargoRow` to `Components.playerPanel`**

```javascript
SHIP_ABILITY_GLYPHS: {
    shield_start:       { glyph: '🛡', delta: '+2' },
    starting_equipment: { glyph: '📇', delta: '+1' },
    reverse_recolor:    { glyph: '🎨', delta: '⇄' },
    favor_plus_1:       { glyph: '⚜', delta: '+1' },
    god_track_high:     { glyph: '🏛', delta: '↑' },
    range_plus_2:       { glyph: '🚢', delta: '+2' },
    fewer_tasks:        { glyph: '📋', delta: '−1' },
    recolor_discount:   { glyph: '🎨', delta: '−1' },
},

renderCargoRow: function(playerId, gamedatas) {
    var root = this.getRoot(playerId);
    if (!root) return;
    var s = (gamedatas.panelState && gamedatas.panelState[playerId]) || {};
    var storage = s.storage || 2;
    var cargo = s.cargo || [];
    var ability = s.shipAbility;
    var abilityInfo = ability ? this.SHIP_ABILITY_GLYPHS[ability] : null;
    var peekedCount = s.peekedCount || 0;

    var slotsHtml = '';
    for (var i = 0; i < storage; i++) {
        var item = cargo[i];
        if (item) {
            var bg = 'img/pieces/' + (item.type === 'statue'
                ? item.color + '-statue.png'
                : 'offering.png');
            slotsHtml += '<div class="delphi-pp-cargo-slot ' + item.type + ' filled"'
                + ' style="--cell-color: var(--delphi-' + item.color + ');'
                + ' --cell-bg: url(\'' + bg + '\')"'
                + ' data-color="' + item.color + '"></div>';
        } else {
            slotsHtml += '<div class="delphi-pp-cargo-slot offering empty"></div>';
        }
    }

    var abilityHtml = abilityInfo
        ? '<div class="delphi-pp-ship-ability" title="' + this._escape(s.shipTileDescription || '') + '">'
            + '<span>' + abilityInfo.glyph + '</span><span>' + abilityInfo.delta + '</span>'
            + '</div>'
        : '';

    var peekedHtml = this._renderStatPill({
        id: 'pp-peeked-' + playerId,
        kind: 'peeked',
        value: peekedCount,
        alignRight: true,
        title: 'Click to view peeked islands',
    });

    var cargoRowHtml = ''
        + '<div class="delphi-pp-cargo-row" id="pp-cargo-row-' + playerId + '">'
        +   '<span class="delphi-pp-ship-icon"></span>'
        +   '<div class="delphi-pp-cargo-slots" id="pp-cargo-slots-' + playerId + '">' + slotsHtml + '</div>'
        +   abilityHtml
        +   peekedHtml
        + '</div>';
    root.insertAdjacentHTML('beforeend', cargoRowHtml);
},

updateCargo: function(playerId, gamedatas) {
    // Re-render the slots div from current panelState. Storage and ability don't change mid-game.
    var s = (gamedatas.panelState && gamedatas.panelState[playerId]) || {};
    var storage = s.storage || 2;
    var cargo = s.cargo || [];
    var slotsEl = document.getElementById('pp-cargo-slots-' + playerId);
    if (!slotsEl) return;
    var slotsHtml = '';
    for (var i = 0; i < storage; i++) {
        var item = cargo[i];
        if (item) {
            var bg = 'img/pieces/' + (item.type === 'statue'
                ? item.color + '-statue.png'
                : 'offering.png');
            slotsHtml += '<div class="delphi-pp-cargo-slot ' + item.type + ' filled"'
                + ' style="--cell-color: var(--delphi-' + item.color + ');'
                + ' --cell-bg: url(\'' + bg + '\')"'
                + ' data-color="' + item.color + '"></div>';
        } else {
            slotsHtml += '<div class="delphi-pp-cargo-slot offering empty"></div>';
        }
    }
    slotsEl.innerHTML = slotsHtml;
},
```

- [ ] **Step 6: Call `renderCargoRow` from setup and wire notifications**

Update the `setup()` loop:

```javascript
this.components.playerPanel.init(pid, gamedatas);
this.components.playerPanel.renderHeader(pid, gamedatas);
this.components.playerPanel.renderCargoRow(pid, gamedatas);
```

Wire notifications for cargo changes — append to whichever existing handlers represent "statue/offering loaded onto ship", "delivered", "raised". Search `theoracleofdelphigzed.js` for `notif_offeringDelivered`, `notif_offeringLoaded`, `notif_statueRaised`, `notif_statueLoaded`. In each one, after the existing logic, refresh the cargo for the affected player by mutating `this.gamedatas.panelState[playerId].cargo` and calling `updateCargo`. Concretely, for `notif_offeringLoaded`:

```javascript
if (typeof args.player_id !== 'undefined' && typeof args.offering_id !== 'undefined') {
    var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
    if (ps) {
        ps.cargo = ps.cargo || [];
        ps.cargo.push({ id: args.offering_id, color: args.color, type: 'offering' });
        this.components.playerPanel.updateCargo(args.player_id, this.gamedatas);
    }
}
```

For `notif_offeringDelivered` (and the statue equivalents), splice the matching item out:

```javascript
if (typeof args.player_id !== 'undefined' && typeof args.offering_id !== 'undefined') {
    var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
    if (ps && Array.isArray(ps.cargo)) {
        ps.cargo = ps.cargo.filter(function(c) {
            return !(c.type === 'offering' && c.id === args.offering_id);
        });
        this.components.playerPanel.updateCargo(args.player_id, this.gamedatas);
    }
}
```

If the relevant notifications don't exist in JS yet, look in PHP for `notify->all('offeringLoaded'...)` etc. and add subscriptions in `setupNotifications`. If the PHP doesn't emit them, that's a separate gap — log a TODO for that handler and proceed; the panel state will be correct on next page refresh.

Also wire peeked changes — when the player peeks an island, `notif_islandsPeeked` (search confirms it exists, around line 1836 in `theoracleofdelphigzed.js`) is the relevant notification. In its handler:

```javascript
if (typeof args.player_id !== 'undefined') {
    var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
    if (ps) {
        // Server can include the new total to avoid drift; otherwise increment.
        if (typeof args.peeked_count !== 'undefined') {
            ps.peekedCount = parseInt(args.peeked_count, 10);
        } else {
            ps.peekedCount = (ps.peekedCount || 0) + 1;
        }
        this.components.playerPanel.updatePeeked(args.player_id, ps.peekedCount);
    }
}
```

If `peeked_count` isn't on the payload yet, add it to the PHP `notify->all('islandsPeeked', ...)` call by selecting `COUNT(*)` from `player_island_knowledge` for the acting player at notification time.

- [ ] **Step 7: Manual verification**

Refresh the game. Each panel shows: ship icon, N empty/filled cargo slots (correct shape per type, correct color), gold-on-bronze ship-ability badge with the glyph + delta from the spec table, and a peeked pill on the right.

Load an offering onto a ship in-game and verify the panel slot fills with the correct color square. Deliver it and verify the slot empties. Peek an island and verify the peeked count goes up.

- [ ] **Step 8: Commit**

```bash
git add modules/js/Components.js theoracleofdelphigzed.js theoracleofdelphigzed.css modules/php/Game.php tests/test_player_panel_data.php
git commit -m "feat(player-panel): cargo row with ship ability + peeked pill

Renders the cargo row with N typed slots (square=offering circle=statue
colored to element), the gold-on-bronze ship-ability badge keyed to
SHIP_ABILITY_GLYPHS, and a right-aligned peeked-islands pill bound to
player_island_knowledge. Server panelState now carries cargo,
storage, shipAbility, shipTileDescription, peekedCount.

Wires offering/statue load+deliver+raise notifications and
islandsPeeked to update the panel in place."
```

---

## Task 5: Injuries row + shield pill

**Goal:** 6-cell injury bar with god symbols, threshold colors at 2 and 3 same-color, total counter (amber/red at 5/6), and a right-aligned shield pill in the player's color.

**Files:**
- Modify: `modules/php/Game.php` (extend `panelState` with injuries by color)
- Modify: `modules/js/Components.js` (add `renderInjuryRow`, `updateInjuries`)
- Modify: `theoracleofdelphigzed.js` (wire injury notifications)
- Modify: `theoracleofdelphigzed.css` (injury bar CSS)

- [ ] **Step 1: Extend `panelState` with injuries**

In `Game.php` `getAllDatas()`, inside the same `$panelState[$pid]` loop:

```php
$injuriesByColor = self::getCollectionFromDb(
    "SELECT card_type AS color, COUNT(*) AS n
     FROM card
     WHERE card_type_arg = 0 AND card_location = 'injury'
       AND card_location_arg = $pid
     GROUP BY card_type"
);
// Server card schema check: injury cards live in card_type='injury_<color>' OR
// card_type='injury' with card_type_arg=color_idx. Inspect modules/php/States/*
// or the existing notif_injuryAdded payload to confirm. The query above assumes
// card_type holds the color string — adjust the column name if the schema
// differs.
$panelState[$pid]['injuries'] = $injuriesByColor;
$panelState[$pid]['shieldValue'] = (int)$p['shieldValue'];
$panelState[$pid]['favorTokens'] = (int)$p['favorTokens'];
```

**Important:** the `card` table schema may use a different column for injury color. Before writing this query, run:

```bash
grep -n "'injury'" modules/php/Game.php modules/php/States/*.php | head -20
```

to find an existing injury query (e.g. how `Recover` / `ChooseInjuryColor` query the table). Adapt the query above to match. The contract for the panel is just: produce an array of `{color: string, n: int}` rows.

- [ ] **Step 2: Add CSS for the injury row**

```css
.delphi-pp-injury-row {
    padding: 6px 10px;
    background: rgba(255, 200, 200, 0.18);
    border-bottom: 1px solid rgba(90, 74, 47, 0.15);
    display: flex; align-items: center; gap: 6px;
}
.delphi-pp-injury-icon {
    font-size: 14px; flex-shrink: 0;
}
.delphi-pp-injury-bar {
    flex: 1;
    display: grid; grid-template-columns: repeat(6, 1fr);
    gap: 2px;
    background: white;
    border: 1px solid var(--pp-frame);
    border-radius: 3px;
    padding: 1px;
    height: 16px;
}
.delphi-pp-injury-cell {
    border-radius: 1px;
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    background-color: transparent;
}
.delphi-pp-injury-cell.filled[data-color="red"]    { background-color: var(--delphi-red);    background-image: url('img/oracle-dice/die-face-red.png'); }
.delphi-pp-injury-cell.filled[data-color="yellow"] { background-color: var(--delphi-yellow); background-image: url('img/oracle-dice/die-face-yellow.png'); }
.delphi-pp-injury-cell.filled[data-color="green"]  { background-color: var(--delphi-green);  background-image: url('img/oracle-dice/die-face-green.png'); }
.delphi-pp-injury-cell.filled[data-color="blue"]   { background-color: var(--delphi-blue);   background-image: url('img/oracle-dice/die-face-blue.png'); }
.delphi-pp-injury-cell.filled[data-color="pink"]   { background-color: var(--delphi-pink);   background-image: url('img/oracle-dice/die-face-pink.png'); }
.delphi-pp-injury-cell.filled[data-color="black"]  { background-color: var(--delphi-black);  background-image: url('img/oracle-dice/die-face-black.png'); }
.delphi-pp-injury-cell.warn-2  { box-shadow: inset 0 0 0 1.5px #f0a500; }
.delphi-pp-injury-cell.danger-3 {
    box-shadow: inset 0 0 0 1.5px #d33, 0 0 6px rgba(211, 51, 51, 0.6);
}
.delphi-pp-injury-total {
    font-size: 11px; font-weight: 800; color: var(--pp-ink-light);
    flex-shrink: 0;
}
.delphi-pp-injury-total.warn { color: #f0a500; }
.delphi-pp-injury-total.danger { color: #d33; }
```

- [ ] **Step 3: Add `renderInjuryRow` and `updateInjuries`**

In `Components.playerPanel`:

```javascript
INJURY_COLORS: ['red', 'yellow', 'green', 'blue', 'pink', 'black'],

renderInjuryRow: function(playerId, gamedatas) {
    var root = this.getRoot(playerId);
    if (!root) return;
    var s = (gamedatas.panelState && gamedatas.panelState[playerId]) || {};
    var playerColor = (gamedatas.players[playerId].player_color || '').toLowerCase();

    var rowHtml = ''
        + '<div class="delphi-pp-injury-row" id="pp-injury-row-' + playerId + '">'
        +   '<span class="delphi-pp-injury-icon">🩹</span>'
        +   '<div class="delphi-pp-injury-bar" id="pp-injury-bar-' + playerId + '"></div>'
        +   '<span class="delphi-pp-injury-total" id="pp-injury-total-' + playerId + '">0/6</span>'
        +   this._renderStatPill({
                id: 'pp-shield-' + playerId,
                kind: 'shield',
                value: (s.shieldValue || 0),
                alignRight: true,
                playerColor: this._playerColorName(playerColor),
            })
        + '</div>';
    root.insertAdjacentHTML('beforeend', rowHtml);
    this.updateInjuries(playerId, s.injuries || []);
},

updateInjuries: function(playerId, byColor) {
    // byColor: array of {color, n} rows. Order in the bar: same color cells contiguous.
    var bar = document.getElementById('pp-injury-bar-' + playerId);
    var totalEl = document.getElementById('pp-injury-total-' + playerId);
    if (!bar || !totalEl) return;

    // Build the cell array with run lengths per color.
    var cells = [];
    var total = 0;
    var anyDanger = false;
    var anyWarn = false;
    byColor.forEach(function(row) {
        var n = parseInt(row.n, 10);
        total += n;
        for (var i = 0; i < n; i++) {
            cells.push({ color: row.color, runIdx: i, runLen: n });
        }
        if (n === 2) anyWarn = true;
        if (n >= 3) anyDanger = true;
    });
    while (cells.length < 6) cells.push(null);

    bar.innerHTML = cells.map(function(cell) {
        if (!cell) return '<div class="delphi-pp-injury-cell"></div>';
        var cls = 'delphi-pp-injury-cell filled';
        if (cell.runLen === 2) cls += ' warn-2';
        if (cell.runLen >= 3) cls += ' danger-3';
        return '<div class="' + cls + '" data-color="' + cell.color + '"></div>';
    }).join('');

    var totalCls = 'delphi-pp-injury-total';
    if (total >= 6) totalCls += ' danger';
    else if (total >= 5) totalCls += ' warn';
    totalEl.className = totalCls;
    totalEl.textContent = total + '/6';
},

// Map BGA hex player_color to OoD player color name (matching MaterialDefs).
_playerColorName: function(hexColor) {
    var map = {
        'dc3545': 'red', 'ed3939': 'red', 'e53935': 'red',
        'ffc107': 'yellow', 'ffd835': 'yellow', 'fdd835': 'yellow',
        '28a745': 'green', '43a047': 'green',
        '007bff': 'blue', '1e88e5': 'blue', '0d47a1': 'blue',
    };
    return map[(hexColor || '').toLowerCase()] || 'red';
},
```

- [ ] **Step 4: Call `renderInjuryRow` from setup, wire notifications**

In `setup()` loop, after `renderCargoRow`, add:

```javascript
this.components.playerPanel.renderInjuryRow(pid, gamedatas);
```

Wire notifications: search for `notif_injuryAdded`, `notif_injuryDiscarded`, `notif_recoverPerformed` (or similar names — grep `injury` in `theoracleofdelphigzed.js`). In each handler, refresh the per-player injuries by mutating `this.gamedatas.panelState[playerId].injuries` and re-calling `updateInjuries`. Example for an "injury added":

```javascript
if (typeof args.player_id !== 'undefined' && typeof args.color !== 'undefined') {
    var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
    if (ps) {
        ps.injuries = ps.injuries || [];
        var existing = ps.injuries.find(function(x) { return x.color === args.color; });
        if (existing) existing.n = parseInt(existing.n, 10) + 1;
        else ps.injuries.push({ color: args.color, n: 1 });
        this.components.playerPanel.updateInjuries(args.player_id, ps.injuries);
    }
}
```

Wire `notif_shieldChanged` (it exists per earlier grep) to call `updateShield`:

```javascript
if (typeof args.player_id !== 'undefined' && typeof args.shield_value !== 'undefined') {
    this.components.playerPanel.updateShield(args.player_id, parseInt(args.shield_value, 10));
}
```

- [ ] **Step 5: Manual verification**

Refresh. Each panel shows: 🩹 icon, 6-cell empty bar (or pre-filled if the game state has injuries), `0/6` total, shield pill in the player's color showing current shield. Trigger a monster combat that produces an injury and verify the bar fills with that color's god-symbol cell. Stack injuries to 2 of one color and verify the amber outline appears; to 3 and verify the red glow.

- [ ] **Step 6: Commit**

```bash
git add modules/js/Components.js theoracleofdelphigzed.js theoracleofdelphigzed.css modules/php/Game.php
git commit -m "feat(player-panel): injuries bar + shield pill

Renders a 6-cell injury bar grouped by color with same-color run
threshold visuals (amber at 2, red glow at 3). Total turns amber at
5/6 and red at 6/6. Right-aligned shield pill uses the player's color
shield image from img/pieces.

Server panelState carries injuries-by-color and shieldValue; client
listens to injury and shield notifications to update without
re-rendering the panel."
```

---

## Task 6: Tasks row (4 columns)

**Goal:** 4-column task row — shrines (greek-letter pips), monsters/statues/offerings (color-✓ pips). Gold glow when all 3 are done.

**Files:**
- Modify: `modules/php/Game.php` (extend `panelState` with task progress)
- Modify: `modules/js/Components.js` (add `renderTasks`, `updateTask`)
- Modify: `theoracleofdelphigzed.js` (wire task notifications)
- Modify: `theoracleofdelphigzed.css` (task CSS)

- [ ] **Step 1: Extend `panelState` with task progress**

In `Game.php` `getAllDatas()`:

```php
// Shrines placed: hex.shrine_player_id matches; hex.shrine_letter is the slug.
$shrinesPlaced = self::getObjectListFromDB(
    "SELECT shrine_letter AS letter
     FROM hex
     WHERE shrine_player_id = $pid AND shrine_letter IS NOT NULL"
);
$shrineLetters = array_column($shrinesPlaced, 'letter');

// Monsters defeated by this player.
$monstersDefeated = self::getObjectListFromDB(
    "SELECT color FROM monster WHERE defeated_by_player_id = $pid"
);
$monsterColors = array_column($monstersDefeated, 'color');

// Statues raised by this player.
$statuesRaised = self::getObjectListFromDB(
    "SELECT color FROM statue WHERE raised_by_player_id = $pid AND is_raised = 1"
);
$statueColors = array_column($statuesRaised, 'color');

// Offerings delivered by this player.
$offeringsDelivered = self::getObjectListFromDB(
    "SELECT color FROM offering WHERE delivered_by_player_id = $pid AND is_delivered = 1"
);
$offeringColors = array_column($offeringsDelivered, 'color');

$panelState[$pid]['tasks'] = [
    'shrines' => $shrineLetters,       // e.g. ["omega","phi"]
    'monsters' => $monsterColors,      // e.g. ["red","yellow"]
    'statues' => $statueColors,
    'offerings' => $offeringColors,
];
// All three shrine slugs the player owns (placed or not).
$shrineSlugs = self::getObjectListFromDB(
    "SELECT shrine_letter AS letter
     FROM hex
     WHERE shrine_player_id = $pid OR shrine_letter IS NULL" // shrine_letter on the player's tile slots
);
// Better: derive from the player's three Zeus shrine tiles. Query the zeus_tile table:
$shrineSlots = self::getObjectListFromDB(
    "SELECT shrine_letter AS letter
     FROM zeus_tile
     WHERE owner_player_id = $pid AND task_type = 'shrine'
     ORDER BY id"
);
$panelState[$pid]['tasks']['shrineSlots'] = array_column($shrineSlots, 'letter');
```

The exact column names for `zeus_tile` and the shrine-letter source need to be verified against the schema in `Game.php` `dbInit` (search for `zeus_tile`). If the player's three shrine letters are stored in a different table or as JSON on `player`, adapt the query. The contract for the client is:

```
tasks.shrineSlots: ["omega", "phi", "psi"]   // 3 letters in slot order
tasks.shrines:     ["omega", "phi"]          // letters already placed
```

- [ ] **Step 2: Add CSS for tasks**

```css
.delphi-pp-tasks {
    padding: 7px 10px;
    background: rgba(255, 255, 255, 0.2);
    border-bottom: 1px solid rgba(90, 74, 47, 0.15);
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px;
}
.delphi-pp-task {
    display: flex; align-items: center; justify-content: center; gap: 5px;
}
.delphi-pp-task-pips { display: flex; flex-direction: column; gap: 2px; }
.delphi-pp-task-pip {
    width: 12px; height: 12px;
    border-radius: 50%;
    border: 1.5px solid #2a2017;
    background: white;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 900;
    color: transparent;
    line-height: 1;
}
.delphi-pp-task-pip.shrine { color: #888; }
.delphi-pp-task-pip.shrine::before { content: attr(data-letter); }
.delphi-pp-task-pip.shrine.done {
    background: var(--player-color, var(--delphi-red));
    border-color: rgba(0, 0, 0, 0.4);
    color: white;
}
.delphi-pp-task-pip.color.done {
    background: currentColor;
    border-color: rgba(0, 0, 0, 0.4);
    color: white;
}
.delphi-pp-task-pip.color.done::before { content: '✓'; color: white; text-shadow: 0 1px 1px rgba(0, 0, 0, 0.5); }
.delphi-pp-task-pip.color.done.on-yellow::before {
    color: #2a2017; text-shadow: 0 1px 1px rgba(255, 255, 255, 0.5);
}
.delphi-pp-task-icon {
    width: 28px; height: 28px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.7) center/16px no-repeat;
    border: 1.5px solid var(--gold-deep);
    transition: box-shadow 0.2s ease;
}
.delphi-pp-task-icon[data-task="shrine"]   { background-image: url('img/pieces/shrine.png'); }
.delphi-pp-task-icon[data-task="monster"]  { background-image: url('img/pieces/monster.png'); }
.delphi-pp-task-icon[data-task="statue"]   { background-image: url('img/pieces/red-statue.png'); }
.delphi-pp-task-icon[data-task="offering"] { background-image: url('img/pieces/offering.png'); }
.delphi-pp-task.complete .delphi-pp-task-icon {
    box-shadow: 0 0 0 2px var(--gold), 0 0 8px rgba(255, 215, 0, 0.7);
    background-color: rgba(255, 215, 0, 0.25);
}
```

The statue icon uses `red-statue.png` as a default; if you want a generic statue image, add `img/pieces/statue.png` in a follow-up. For this task the colored variant reads as "statue".

- [ ] **Step 3: Add `renderTasks` and `updateTask`**

```javascript
TASK_ORDER: ['shrine', 'monster', 'statue', 'offering'],

renderTasks: function(playerId, gamedatas) {
    var root = this.getRoot(playerId);
    if (!root) return;
    var s = (gamedatas.panelState && gamedatas.panelState[playerId]) || {};
    var tasks = s.tasks || {};
    var playerColor = '#' + (gamedatas.players[playerId].player_color || 'dc3545');

    var html = '<div class="delphi-pp-tasks" id="pp-tasks-' + playerId + '">';
    var self = this;
    this.TASK_ORDER.forEach(function(task) {
        var col = task === 'shrine'
            ? self._renderShrineColumn(playerId, tasks.shrineSlots || [], tasks.shrines || [], playerColor)
            : self._renderColorColumn(playerId, task, tasks[task + 's'] || []);
        html += col;
    });
    html += '</div>';
    root.insertAdjacentHTML('beforeend', html);
},

_renderShrineColumn: function(playerId, slots, placed, playerColorHex) {
    var glyphs = this.SHRINE_GLYPHS;
    var pips = '';
    var allDone = slots.length > 0 && slots.every(function(slot) { return placed.indexOf(slot) >= 0; });
    for (var i = 0; i < 3; i++) {
        var slot = slots[i];
        if (!slot) {
            pips += '<div class="delphi-pp-task-pip shrine" data-letter=""></div>';
            continue;
        }
        var letter = glyphs[slot] || '?';
        var done = placed.indexOf(slot) >= 0;
        pips += '<div class="delphi-pp-task-pip shrine ' + (done ? 'done' : '') + '"'
            + ' data-slot="' + slot + '" data-letter="' + letter + '"'
            + ' style="--player-color: ' + playerColorHex + '"></div>';
    }
    return ''
        + '<div class="delphi-pp-task ' + (allDone ? 'complete' : '') + '" data-task="shrine">'
        +   '<div class="delphi-pp-task-pips" id="pp-task-pips-shrine-' + playerId + '">' + pips + '</div>'
        +   '<div class="delphi-pp-task-icon" data-task="shrine"></div>'
        + '</div>';
},

_renderColorColumn: function(playerId, task, doneColors) {
    // doneColors: array of color strings for completed sub-tasks (length 0..3+).
    var pips = '';
    for (var i = 0; i < 3; i++) {
        var c = doneColors[i];
        if (c) {
            var yellowCls = c === 'yellow' ? ' on-yellow' : '';
            pips += '<div class="delphi-pp-task-pip color done' + yellowCls + '"'
                + ' style="color: var(--delphi-' + c + ')"></div>';
        } else {
            pips += '<div class="delphi-pp-task-pip"></div>';
        }
    }
    var allDone = doneColors.length >= 3;
    return ''
        + '<div class="delphi-pp-task ' + (allDone ? 'complete' : '') + '" data-task="' + task + '">'
        +   '<div class="delphi-pp-task-pips" id="pp-task-pips-' + task + '-' + playerId + '">' + pips + '</div>'
        +   '<div class="delphi-pp-task-icon" data-task="' + task + '"></div>'
        + '</div>';
},

updateTask: function(playerId, task, doneList) {
    // doneList: shrines = array of letter slugs; others = array of color strings.
    var ps = (window.gameui && window.gameui.gamedatas && window.gameui.gamedatas.panelState
        && window.gameui.gamedatas.panelState[playerId]) || {};
    var tasks = ps.tasks || {};
    if (task === 'shrine') tasks.shrines = doneList;
    else tasks[task + 's'] = doneList;
    // Re-render just this column.
    var col = task === 'shrine'
        ? this._renderShrineColumn(playerId, tasks.shrineSlots || [], doneList,
            '#' + (window.gameui.gamedatas.players[playerId].player_color || 'dc3545'))
        : this._renderColorColumn(playerId, task, doneList);
    var existingCol = document.querySelector('#pp-tasks-' + playerId + ' [data-task="' + task + '"]');
    if (existingCol) existingCol.outerHTML = col;
},
```

- [ ] **Step 4: Call `renderTasks` from setup, wire notifications**

In `setup()` loop, after `renderInjuryRow`:

```javascript
this.components.playerPanel.renderTasks(pid, gamedatas);
```

Wire `notif_taskCompleted` (already touched in Task 2) to also call `updateTask` and increment the right done-list. Find the existing handler and after the counter update, add:

```javascript
if (typeof args.task_type !== 'undefined' && typeof args.player_id !== 'undefined') {
    var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
    if (ps && ps.tasks) {
        if (args.task_type === 'shrine' && args.shrine_letter) {
            ps.tasks.shrines = (ps.tasks.shrines || []).concat([args.shrine_letter]);
            this.components.playerPanel.updateTask(args.player_id, 'shrine', ps.tasks.shrines);
        } else if (args.color && ['monster', 'statue', 'offering'].indexOf(args.task_type) >= 0) {
            var key = args.task_type + 's';
            ps.tasks[key] = (ps.tasks[key] || []).concat([args.color]);
            this.components.playerPanel.updateTask(args.player_id, args.task_type, ps.tasks[key]);
        }
    }
}
```

The PHP for `taskCompleted` may not yet include `task_type` / `color` / `shrine_letter` — extend the `notify->all('taskCompleted', ...)` payload in the relevant state files to include them. Search for `'taskCompleted'` in `modules/php/States/*.php` and update each call site.

- [ ] **Step 5: Manual verification**

Refresh. Each panel shows 4 columns: shrines (3 grey-letter pips), monsters/statues/offerings (3 empty pips each). Place a shrine in-game and watch the corresponding letter pip fill with player color. Defeat a monster and watch the matching colored pip fill with a ✓. When all 3 of one task are done, the icon glows gold.

- [ ] **Step 6: Commit**

```bash
git add modules/js/Components.js theoracleofdelphigzed.js theoracleofdelphigzed.css modules/php/Game.php
git commit -m "feat(player-panel): tasks row with pip + icon columns

Renders 4 task columns: shrines (greek-letter pips, color-fill on
placement) and monsters/statues/offerings (color-✓ pips). Icon
gold-glows when all 3 are done. Server panelState carries shrineSlots,
shrines, monsters, statues, offerings; notif_taskCompleted updates
the relevant column in place."
```

---

## Task 7: Pantheon — 6 vertical god tracks

**Goal:** 6 vertical god tracks per panel, ordered Poseidon→Apollo→Artemis→Aphrodite→Ares→Hermes. God token sits at the current row, gold glow at row 6 (topped).

**Files:**
- Modify: `modules/php/Game.php` (extend `panelState` with god rows per player)
- Modify: `modules/js/Components.js` (add `renderPantheon`, `updateGodRow`)
- Modify: `theoracleofdelphigzed.js` (wire god-advanced notification)
- Modify: `theoracleofdelphigzed.css` (pantheon CSS)

- [ ] **Step 1: Extend `panelState` with god rows**

In `Game.php` `getAllDatas()`:

```php
$godRows = self::getCollectionFromDb(
    "SELECT god_name AS god, current_row AS row
     FROM god
     WHERE player_id = $pid"
);
$panelState[$pid]['gods'] = $godRows;  // { 'aphrodite' => { god: 'aphrodite', row: 2 }, ... }
```

Verify the `god` table column names match (`god_name`, `current_row`, `player_id`) — search `Game.php` for the existing `god` queries to confirm.

- [ ] **Step 2: Add CSS**

```css
.delphi-pp-pantheon {
    display: grid; grid-template-columns: repeat(6, 1fr);
    gap: 3px;
    padding: 6px 8px 7px;
    background: linear-gradient(180deg, rgba(255, 215, 0, 0.07), transparent 30%);
    border-bottom: 1px solid rgba(90, 74, 47, 0.15);
}
.delphi-pp-god-track {
    position: relative;
    width: 100%; height: 70px;
    background: linear-gradient(180deg,
        rgba(255, 215, 0, 0.3) 0%,
        rgba(255, 215, 0, 0.15) 14%,
        rgba(255, 255, 255, 0.3) 15%,
        rgba(255, 255, 255, 0.3) 100%);
    border: 1px solid var(--gold-deep);
    border-radius: 3px;
    overflow: hidden;
}
.delphi-pp-god-token {
    position: absolute; left: 50%; transform: translateX(-50%);
    width: 20px; height: 20px;
    border-radius: 50%;
    border: 2px solid var(--pp-ink);
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    background-color: white;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
    transition: top 0.4s ease;
}
.delphi-pp-god-token.god-poseidon  { background-image: url('img/gods/poseidon.png'); }
.delphi-pp-god-token.god-apollo    { background-image: url('img/gods/apollo.png'); }
.delphi-pp-god-token.god-artemis   { background-image: url('img/gods/artemis.png'); }
.delphi-pp-god-token.god-aphrodite { background-image: url('img/gods/aphrodite.png'); }
.delphi-pp-god-token.god-ares      { background-image: url('img/gods/ares.png'); }
.delphi-pp-god-token.god-hermes    { background-image: url('img/gods/hermes.png'); }
.delphi-pp-god-token.topped {
    box-shadow: 0 0 0 2px var(--gold), 0 0 8px rgba(255, 215, 0, 0.9);
}
```

- [ ] **Step 3: Add `renderPantheon` and `updateGodRow`**

```javascript
renderPantheon: function(playerId, gamedatas) {
    var root = this.getRoot(playerId);
    if (!root) return;
    var s = (gamedatas.panelState && gamedatas.panelState[playerId]) || {};
    var gods = s.gods || {};

    var html = '<div class="delphi-pp-pantheon" id="pp-pantheon-' + playerId + '">';
    var self = this;
    this.GOD_ORDER.forEach(function(g) {
        var row = (gods[g] && gods[g].row !== undefined) ? parseInt(gods[g].row, 10) : 0;
        html += self._renderGodTrack(playerId, g, row);
    });
    html += '</div>';
    root.insertAdjacentHTML('beforeend', html);
},

_renderGodTrack: function(playerId, god, row) {
    var topPx = this._godTopPx(row);
    var topped = row >= 6;
    return ''
        + '<div class="delphi-pp-god-track" id="pp-god-track-' + playerId + '-' + god + '" data-god="' + god + '">'
        +   '<div class="delphi-pp-god-token god-' + god + (topped ? ' topped' : '') + '"'
        +     ' style="top: ' + topPx + 'px;"'
        +     ' title="' + this._capitalize(god) + ' — row ' + row + '"></div>'
        + '</div>';
},

_godTopPx: function(row) {
    // Track is 70px tall, token is 20px. row 0 = bottom (top: 50px), row 6 = top (top: 0px).
    var trackHeight = 70;
    var tokenSize = 20;
    var maxOffset = trackHeight - tokenSize;       // 50
    var pct = Math.max(0, Math.min(6, row)) / 6;   // 0..1
    return Math.round(maxOffset * (1 - pct));
},

updateGodRow: function(playerId, god, row) {
    var token = document.querySelector('#pp-god-track-' + playerId + '-' + god + ' .delphi-pp-god-token');
    if (!token) return;
    token.style.top = this._godTopPx(row) + 'px';
    if (row >= 6) token.classList.add('topped');
    else token.classList.remove('topped');
    token.title = this._capitalize(god) + ' — row ' + row;
},

_capitalize: function(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; },
```

- [ ] **Step 4: Call `renderPantheon` from setup, wire notification**

In `setup()` loop, after `renderTasks`:

```javascript
this.components.playerPanel.renderPantheon(pid, gamedatas);
```

Wire `notif_godAdvanced` (search for it — the existing god-advance flow must emit something). In its handler:

```javascript
if (typeof args.player_id !== 'undefined' && typeof args.god_name !== 'undefined' && typeof args.new_row !== 'undefined') {
    var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
    if (ps && ps.gods) {
        ps.gods[args.god_name] = { god: args.god_name, row: parseInt(args.new_row, 10) };
    }
    this.components.playerPanel.updateGodRow(args.player_id, args.god_name, parseInt(args.new_row, 10));
}
```

If the existing notification uses different field names (e.g. `god` vs `god_name`), adapt. The exact handler name is also flexible — the goal is to update the panel whenever a god moves on the existing main god-track.

- [ ] **Step 5: Manual verification**

Refresh. Each panel's pantheon row shows 6 vertical tracks left to right (Poseidon, Apollo, Artemis, Aphrodite, Ares, Hermes) with each god's token at the correct row. Advance a god in-game and confirm the token slides up the track in both the main board AND every player panel pantheon (since all panels render every god's row).

- [ ] **Step 6: Commit**

```bash
git add modules/js/Components.js theoracleofdelphigzed.js theoracleofdelphigzed.css modules/php/Game.php
git commit -m "feat(player-panel): pantheon — 6 vertical god tracks

Renders 6 god tracks per panel in board order (Poseidon, Apollo,
Artemis, Aphrodite, Ares, Hermes). Token position is computed from
current_row 0..6 with smooth top transition. Topped (row 6) tokens get
a gold ring + glow matching the main god-track's vocabulary. Server
panelState carries gods as { godName: { god, row } } per player."
```

---

## Task 8: Actions row (oracle dice + oracle hand + favor pill)

**Goal:** Top-of-panel actions row — 3 oracle dice on the left (white background, color glyph), divider, oracle hand cards as small color chips, favor pill on the right.

**Files:**
- Modify: `modules/php/Game.php` (extend `panelState` with oracle dice and hand per player)
- Modify: `modules/js/Components.js` (add `renderActionsRow`, `updateDice`, `updateOracleHand`)
- Modify: `theoracleofdelphigzed.js` (wire dice and hand notifications)
- Modify: `theoracleofdelphigzed.css` (actions CSS)

- [ ] **Step 1: Extend `panelState` with dice and hand**

In `Game.php` `getAllDatas()`:

```php
// Oracle dice — current player's roll. Schema check: dice live in oracle_die
// table or as a per-player JSON column. Search Game.php for 'die' / 'dice' to
// confirm. Assume oracle_die(player_id, idx, color, is_spent).
$dice = self::getObjectListFromDB(
    "SELECT die_index AS idx, color, is_spent AS spent
     FROM oracle_die
     WHERE player_id = $pid
     ORDER BY die_index"
);
$panelState[$pid]['dice'] = $dice;

// Oracle hand — cards in this player's oracle hand.
$hand = self::getObjectListFromDB(
    "SELECT card_id AS id, card_type AS color
     FROM card
     WHERE card_location = 'oracle_hand' AND card_location_arg = $pid"
);
$panelState[$pid]['oracleHand'] = $hand;
```

Adjust the `oracle_die` and `card` queries to match the actual schema. If oracle dice are stored as an array on `player` (e.g. `dice_json`) or in `Globals`, fetch them from there instead.

**Privacy:** the hand may need to be hidden for non-self players. Wrap the hand query so opponents see card backs (color hidden). Suggested approach:

```php
$isSelf = ($pid === $current_player_id);
$hand = self::getObjectListFromDB(
    "SELECT card_id AS id, card_type AS color
     FROM card
     WHERE card_location = 'oracle_hand' AND card_location_arg = $pid"
);
if (!$isSelf) {
    // Render face-down placeholders: keep count, drop color.
    $hand = array_map(fn($c) => ['id' => $c['id'], 'color' => null], $hand);
}
```

If the rules say opponent hand colors are public, drop the masking. Confirm with the rulebook before merging.

- [ ] **Step 2: Add CSS**

```css
.delphi-pp-actions-row {
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.35);
    border-bottom: 1px solid rgba(90, 74, 47, 0.15);
    display: flex; align-items: center; gap: 6px;
}
.delphi-pp-dice { display: flex; gap: 3px; flex-shrink: 0; }
.delphi-pp-die {
    width: 18px; height: 18px;
    border-radius: 4px;
    background: white center/contain no-repeat;
    border: 1.5px solid rgba(0, 0, 0, 0.4);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 1px 2px rgba(0, 0, 0, 0.3);
}
.delphi-pp-die[data-color="red"]    { background-image: url('img/oracle-dice/die-face-red.png'); }
.delphi-pp-die[data-color="yellow"] { background-image: url('img/oracle-dice/die-face-yellow.png'); }
.delphi-pp-die[data-color="green"]  { background-image: url('img/oracle-dice/die-face-green.png'); }
.delphi-pp-die[data-color="blue"]   { background-image: url('img/oracle-dice/die-face-blue.png'); }
.delphi-pp-die[data-color="pink"]   { background-image: url('img/oracle-dice/die-face-pink.png'); }
.delphi-pp-die[data-color="black"]  { background-image: url('img/oracle-dice/die-face-black.png'); }
.delphi-pp-die.spent { opacity: 0.35; }

.delphi-pp-divider {
    width: 1px; height: 20px;
    border-left: 1px dashed rgba(90, 74, 47, 0.4);
    flex-shrink: 0;
}

.delphi-pp-oracle-hand { display: flex; gap: 3px; flex: 1; flex-wrap: wrap; }
.delphi-pp-oracle-card {
    width: 14px; height: 18px;
    border-radius: 2px;
    border: 1.5px solid rgba(0, 0, 0, 0.4);
    background: #d8d4c8 center/contain no-repeat;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}
.delphi-pp-oracle-card[data-color="red"]    { background-color: var(--delphi-red);    background-image: url('img/oracle-dice/die-face-red.png'); }
.delphi-pp-oracle-card[data-color="yellow"] { background-color: var(--delphi-yellow); background-image: url('img/oracle-dice/die-face-yellow.png'); }
.delphi-pp-oracle-card[data-color="green"]  { background-color: var(--delphi-green);  background-image: url('img/oracle-dice/die-face-green.png'); }
.delphi-pp-oracle-card[data-color="blue"]   { background-color: var(--delphi-blue);   background-image: url('img/oracle-dice/die-face-blue.png'); }
.delphi-pp-oracle-card[data-color="pink"]   { background-color: var(--delphi-pink);   background-image: url('img/oracle-dice/die-face-pink.png'); }
.delphi-pp-oracle-card[data-color="black"]  { background-color: var(--delphi-black);  background-image: url('img/oracle-dice/die-face-black.png'); }
.delphi-pp-oracle-card.facedown { background-image: none; background-color: #6b4520; }
```

- [ ] **Step 3: Add render and update functions**

```javascript
renderActionsRow: function(playerId, gamedatas) {
    var root = this.getRoot(playerId);
    if (!root) return;
    var s = (gamedatas.panelState && gamedatas.panelState[playerId]) || {};
    var dice = s.dice || [];
    var hand = s.oracleHand || [];
    var favor = s.favorTokens !== undefined ? s.favorTokens : 0;

    var diceHtml = '<div class="delphi-pp-dice" id="pp-dice-' + playerId + '">'
        + this._diceMarkup(dice)
        + '</div>';

    var handHtml = '<div class="delphi-pp-oracle-hand" id="pp-oracle-hand-' + playerId + '">'
        + this._handMarkup(hand)
        + '</div>';

    var favorHtml = this._renderStatPill({
        id: 'pp-favor-' + playerId,
        kind: 'favor',
        value: favor,
        alignRight: true,
    });

    var rowHtml = ''
        + '<div class="delphi-pp-actions-row" id="pp-actions-row-' + playerId + '">'
        +   diceHtml
        +   '<div class="delphi-pp-divider"></div>'
        +   handHtml
        +   favorHtml
        + '</div>';
    root.insertAdjacentHTML('beforeend', rowHtml);
},

_diceMarkup: function(dice) {
    if (!dice || !dice.length) {
        // Render 3 placeholder white dice if not yet rolled.
        return '<div class="delphi-pp-die"></div>'.repeat(3);
    }
    return dice.map(function(d) {
        var spent = (d.spent === '1' || d.spent === 1 || d.spent === true) ? ' spent' : '';
        return '<div class="delphi-pp-die' + spent + '" data-color="' + d.color + '"></div>';
    }).join('');
},

_handMarkup: function(hand) {
    return (hand || []).map(function(c) {
        if (!c.color) return '<div class="delphi-pp-oracle-card facedown"></div>';
        return '<div class="delphi-pp-oracle-card" data-color="' + c.color + '" data-card-id="' + c.id + '"></div>';
    }).join('');
},

updateDice: function(playerId, dice) {
    var el = document.getElementById('pp-dice-' + playerId);
    if (el) el.innerHTML = this._diceMarkup(dice);
},

updateOracleHand: function(playerId, hand) {
    var el = document.getElementById('pp-oracle-hand-' + playerId);
    if (el) el.innerHTML = this._handMarkup(hand);
},
```

- [ ] **Step 4: Call from setup BEFORE the cargo row, wire notifications**

The actions row is row 2 per the spec — it must render after the header but before the cargo row. Adjust the `setup()` loop order:

```javascript
this.components.playerPanel.init(pid, gamedatas);
this.components.playerPanel.renderHeader(pid, gamedatas);
this.components.playerPanel.renderActionsRow(pid, gamedatas);   // row 2 — NEW
this.components.playerPanel.renderCargoRow(pid, gamedatas);     // row 3
this.components.playerPanel.renderInjuryRow(pid, gamedatas);    // row 4
this.components.playerPanel.renderTasks(pid, gamedatas);        // row 5
this.components.playerPanel.renderPantheon(pid, gamedatas);     // row 6
```

(Companions and Equipment land in Tasks 9 and 10.)

Wire `notif_diceRolled` (it exists per earlier grep) — in its handler, after existing logic:

```javascript
if (typeof args.player_id !== 'undefined' && Array.isArray(args.dice)) {
    var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
    if (ps) ps.dice = args.dice;
    this.components.playerPanel.updateDice(args.player_id, args.dice);
}
```

Wire dice-spent and dice-recolored notifications similarly. Search for `notif_dieSpent`, `notif_diceRecolored`, etc.

Wire `notif_oracleCardDrawn`, `notif_oracleCardPlayed`, `notif_oracleCardDiscarded` (search for the actual names) to mutate `ps.oracleHand` and call `updateOracleHand`. The existing oracle-card flow in `theoracleofdelphigzed.js` (the `delphi-oracle-cards-area` rendering) is the right place to find the notification names.

Wire favor changes: `notif_favorTokensChanged` exists (line 3801 per earlier grep). Find it and add:

```javascript
if (typeof args.player_id !== 'undefined' && typeof args.favor_tokens !== 'undefined') {
    this.components.playerPanel.updateFavor(args.player_id, parseInt(args.favor_tokens, 10));
}
```

Same for `notif_favorTokensTaken` and `notif_favorSpentForMovement`.

- [ ] **Step 5: Manual verification**

Refresh. Each panel's actions row shows: 3 dice (placeholders or actual rolled dice), divider, hand (own player's cards visible with colors; opponents face-down), favor pill on the right with current favor count. Roll dice, spend a die, draw an oracle card, gain favor — confirm each notification updates the correct sub-element on the correct player panel without re-rendering.

- [ ] **Step 6: Commit**

```bash
git add modules/js/Components.js theoracleofdelphigzed.js theoracleofdelphigzed.css modules/php/Game.php
git commit -m "feat(player-panel): actions row — dice, oracle hand, favor pill

Adds the row-2 actions section: 3 oracle dice (white background,
color-glyph face), dashed divider, oracle hand cards (own-player faces
visible, opponents face-down), and a right-aligned favor pill. Server
panelState carries dice + oracleHand per player; client subscribes to
diceRolled/dieSpent/oracleCard*/favor* notifications to update without
re-rendering."
```

---

## Task 9: Companions row

**Goal:** 3 fixed companion slots — color chip with subtype badge (C/D/H), empty dashed slot for unfilled. Always 3 slots regardless of game state.

**Files:**
- Modify: `modules/php/Game.php` (extend `panelState` with companions per player)
- Modify: `modules/js/Components.js` (add `renderCompanions`, `updateCompanions`)
- Modify: `theoracleofdelphigzed.js` (wire companion notifications)
- Modify: `theoracleofdelphigzed.css` (companion CSS)

- [ ] **Step 1: Extend `panelState` with companions**

In `Game.php`:

```php
// Companions: card_type holds 'companion_<color>', card_type_arg = subtype index.
// Schema check: search Game.php for 'companion' card location convention.
$companions = self::getObjectListFromDB(
    "SELECT card_id AS id, card_type AS color, card_type_arg AS subtype_idx
     FROM card
     WHERE card_location = 'companion' AND card_location_arg = $pid"
);
$panelState[$pid]['companions'] = $companions;
```

Adjust to match the actual companion-card location convention. The existing `delphi-companion-cards-area` rendering in the .tpl tells us companions are stored as cards somewhere — confirm before writing the query.

- [ ] **Step 2: Add CSS**

```css
.delphi-pp-companions-row {
    padding: 5px 10px;
    background: rgba(180, 140, 100, 0.12);
    border-bottom: 1px solid rgba(90, 74, 47, 0.15);
    display: flex; align-items: center; gap: 4px;
}
.delphi-pp-companions-row .lbl {
    font-size: 9px; color: var(--pp-ink-light);
    letter-spacing: 0.1em; text-transform: uppercase; padding-right: 4px;
}
.delphi-pp-companion-slots { display: flex; gap: 4px; flex: 1; }
.delphi-pp-companion-slot {
    flex: 1; height: 22px;
    border-radius: 3px;
    border: 1.5px solid var(--gold-deep);
    background-size: cover; background-position: center;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    position: relative;
}
.delphi-pp-companion-slot.empty {
    background: white;
    border: 1.5px dashed rgba(90, 74, 47, 0.4);
    box-shadow: none;
    opacity: 0.55;
}
.delphi-pp-companion-slot .subtype {
    position: absolute; bottom: -1px; right: 2px;
    font-size: 7px; font-weight: 800;
    background: rgba(0, 0, 0, 0.5);
    color: var(--gold);
    padding: 0 3px; border-radius: 2px;
}
```

- [ ] **Step 3: Add render functions**

```javascript
COMPANION_SUBTYPE_LETTER: { 0: 'C', 1: 'D', 2: 'H' },  // creature, demigod, hero

renderCompanions: function(playerId, gamedatas) {
    var root = this.getRoot(playerId);
    if (!root) return;
    var s = (gamedatas.panelState && gamedatas.panelState[playerId]) || {};
    var html = '<div class="delphi-pp-companions-row">'
        + '<span class="lbl">Comp</span>'
        + '<div class="delphi-pp-companion-slots" id="pp-companions-' + playerId + '">'
        +   this._companionsMarkup(s.companions || [])
        + '</div>'
        + '</div>';
    root.insertAdjacentHTML('beforeend', html);
},

_companionsMarkup: function(comps) {
    var slots = [];
    for (var i = 0; i < 3; i++) {
        var c = comps[i];
        if (c) {
            var letter = this.COMPANION_SUBTYPE_LETTER[parseInt(c.subtype_idx || c.subtypeIdx || 0, 10)] || '?';
            var imgUrl = 'img/companion/' + c.color + '-card-' + (c.subtype_idx || c.subtypeIdx) + '.png';
            slots.push('<div class="delphi-pp-companion-slot" data-color="' + c.color + '"'
                + ' style="background-image: url(\'' + imgUrl + '\')">'
                + '<span class="subtype">' + letter + '</span></div>');
        } else {
            slots.push('<div class="delphi-pp-companion-slot empty"></div>');
        }
    }
    return slots.join('');
},

updateCompanions: function(playerId, comps) {
    var el = document.getElementById('pp-companions-' + playerId);
    if (el) el.innerHTML = this._companionsMarkup(comps);
},
```

- [ ] **Step 4: Call from setup, wire notifications**

```javascript
this.components.playerPanel.renderCompanions(pid, gamedatas);
```

(after `renderPantheon`, before `renderEquipment` in Task 10)

Wire `notif_companionGained` / `notif_companionPlayed` / `notif_companionDiscarded` (search for the real names — companions are part of the existing card system). In each, update `ps.companions` and call `updateCompanions`.

- [ ] **Step 5: Manual verification**

Refresh. Each panel shows a companions row: 3 dashed empty slots if the player has no companions yet, or color chips with C/D/H badges for each companion they own. Acquire a companion in-game and confirm the slot fills with the right card image and subtype letter.

- [ ] **Step 6: Commit**

```bash
git add modules/js/Components.js theoracleofdelphigzed.js theoracleofdelphigzed.css modules/php/Game.php
git commit -m "feat(player-panel): companions row — 3 slots with subtype badges

Renders 3 fixed companion slots per panel. Filled slots show the
companion card image (img/companion/<color>-card-<idx>.png) with a
small C/D/H subtype badge in the corner. Empty slots show a dashed
outline. Server panelState carries companions per player."
```

---

## Task 10: Equipment row (public)

**Goal:** 3-4 equipment cards in a visually-separated row (cool-blue tint, navy "EQUIP" label) — 4 slots when ship tile is `starting_equipment`.

**Files:**
- Modify: `modules/php/Game.php` (extend `panelState` with equipment per player + capacity)
- Modify: `modules/js/Components.js` (add `renderEquipment`, `updateEquipment`)
- Modify: `theoracleofdelphigzed.js` (wire equipment notifications)
- Modify: `theoracleofdelphigzed.css` (equipment CSS)

- [ ] **Step 1: Extend `panelState` with equipment**

In `Game.php`:

```php
$equipment = self::getObjectListFromDB(
    "SELECT card_id AS id, card_type_arg AS card_idx
     FROM card
     WHERE card_location = 'equipment' AND card_location_arg = $pid
     ORDER BY card_id"
);
$panelState[$pid]['equipment'] = $equipment;
$panelState[$pid]['equipmentCapacity'] = ($ability === 'starting_equipment') ? 4 : 3;
```

Adjust the location string to whatever the existing equipment-cards system uses (search `'equipment'` in `Game.php` and `States/`). The exact column for the card index — `card_type_arg`, `card_type`, etc. — depends on the existing convention; the goal is an array of `{ id, card_idx }` rows where `card_idx` is the integer key into `MaterialDefs::EQUIPMENT_CARDS` and `MaterialDefs::EQUIPMENT_NAMES`.

- [ ] **Step 2: Expose `EQUIPMENT_NAMES` to client**

The client needs the name → display string mapping. Add to `getAllDatas()`:

```php
$result['equipmentNames'] = MaterialDefs::EQUIPMENT_NAMES;
```

Only emit this once (not per-player).

- [ ] **Step 3: Add CSS**

```css
.delphi-pp-equipment-row {
    padding: 5px 10px;
    background: rgba(70, 90, 140, 0.08);
    border-top: 2px solid rgba(90, 74, 47, 0.3);
    display: flex; align-items: center; gap: 4px;
}
.delphi-pp-equipment-row .lbl {
    font-size: 9px; color: #1a237e;
    letter-spacing: 0.1em; text-transform: uppercase;
    padding-right: 4px; font-weight: 700;
}
.delphi-pp-equipment-slots { display: flex; gap: 3px; flex: 1; }
.delphi-pp-equipment-slot {
    flex: 1; height: 26px;
    border-radius: 2px;
    background: linear-gradient(135deg, #f5e6c0 0%, #d4b483 100%);
    border: 1.5px solid #5a3a1a;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 700; color: #2a1a08;
    padding: 0 2px; line-height: 1;
    text-align: center;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    overflow: hidden; word-break: break-word;
    background-size: cover; background-position: center;
}
.delphi-pp-equipment-slot.empty {
    background: white;
    border: 1.5px dashed rgba(90, 74, 47, 0.4);
    box-shadow: none;
    opacity: 0.55;
}
```

- [ ] **Step 4: Add render functions**

```javascript
renderEquipment: function(playerId, gamedatas) {
    var root = this.getRoot(playerId);
    if (!root) return;
    var s = (gamedatas.panelState && gamedatas.panelState[playerId]) || {};
    var capacity = s.equipmentCapacity || 3;
    var equipment = s.equipment || [];
    var names = gamedatas.equipmentNames || {};

    var html = '<div class="delphi-pp-equipment-row">'
        + '<span class="lbl">Equip</span>'
        + '<div class="delphi-pp-equipment-slots" id="pp-equipment-' + playerId + '">'
        +   this._equipmentMarkup(equipment, capacity, names)
        + '</div>'
        + '</div>';
    root.insertAdjacentHTML('beforeend', html);
},

_equipmentMarkup: function(equipment, capacity, names) {
    var slots = [];
    for (var i = 0; i < capacity; i++) {
        var e = equipment[i];
        if (e) {
            var idx = parseInt(e.card_idx || e.cardIdx || 0, 10);
            var imgUrl = 'img/equipment/card-' + String(idx).padStart(3, '0') + '.jpg';
            var name = names[idx] || '';
            slots.push('<div class="delphi-pp-equipment-slot" title="' + this._escape(name) + '"'
                + ' data-card-idx="' + idx + '"'
                + ' style="background-image: url(\'' + imgUrl + '\')"></div>');
        } else {
            slots.push('<div class="delphi-pp-equipment-slot empty"></div>');
        }
    }
    return slots.join('');
},

updateEquipment: function(playerId, equipment, capacity) {
    var el = document.getElementById('pp-equipment-' + playerId);
    if (!el) return;
    var names = (window.gameui && window.gameui.gamedatas && window.gameui.gamedatas.equipmentNames) || {};
    el.innerHTML = this._equipmentMarkup(equipment, capacity || 3, names);
},
```

`String.prototype.padStart` is ES2017 — every modern browser BGA targets supports it.

- [ ] **Step 5: Call from setup, wire notifications**

```javascript
this.components.playerPanel.renderEquipment(pid, gamedatas);
```

(last in the `setup()` loop)

Wire `notif_equipmentActivated` / `notif_equipmentUsed` (both exist per earlier grep). In each, mutate `ps.equipment` and call `updateEquipment`. For "card removed" or "card flipped used":

```javascript
if (typeof args.player_id !== 'undefined' && typeof args.card_id !== 'undefined') {
    var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
    if (ps && Array.isArray(ps.equipment)) {
        // For one-time used cards, mark/remove per game rules. Removal example:
        ps.equipment = ps.equipment.filter(function(e) { return e.id !== args.card_id; });
        this.components.playerPanel.updateEquipment(args.player_id, ps.equipment, ps.equipmentCapacity);
    }
}
```

Wire the equipment-gained notification (search for `notif_equipmentDealt` / similar) to push onto `ps.equipment`.

- [ ] **Step 6: Manual verification**

Refresh. Each panel shows the equipment row at the bottom: 3 (or 4) parchment-styled slots with each equipment card's image. Hover shows the equipment name as a tooltip. Players with the `starting_equipment` ship tile see 4 slots. Acquire/use an equipment card in-game and confirm the panel updates.

- [ ] **Step 7: Commit**

```bash
git add modules/js/Components.js theoracleofdelphigzed.js theoracleofdelphigzed.css modules/php/Game.php
git commit -m "feat(player-panel): equipment row — public 3-4 slot strip

Adds the bottom-of-panel equipment row, visually separated by a 2px
top border + cool-blue tint to signal 'public'. 3 slots default; 4
slots when ship tile ability is 'starting_equipment'. Each filled slot
shows the equipment card image with the equipment name as a tooltip.
Server emits equipmentNames lookup table once and equipment array per
player; client updates via equipmentActivated / equipmentUsed
notifications."
```

---

## Task 11: End-to-end verification + cleanup

**Goal:** Final pass — verify all 8 sections look right together, no console errors, all notifications wire correctly, and the full panel renders for every seat.

**Files:** none expected; only fixes if regressions are found.

- [ ] **Step 1: Run all PHP tests**

```bash
php tests/test_material_defs.php
php tests/test_player_panel_data.php
```

Both should print `Failed: 0`. If any fail, fix before proceeding.

- [ ] **Step 2: Visual smoke test — fresh game**

Start a new game with at least 2 players. After setup, every player panel must show the 8 sections in this order:

1. Header: avatar, name, `0/12` counter, ★, ELO, flag, time
2. Actions: 3 placeholder dice, divider, empty hand, ⚜ 3 (default starting favor) on the right
3. Cargo: 🚢, N empty cargo slots, ship-ability badge with correct glyph+delta, 🔍 0 on the right
4. Injuries: 🩹, empty 6-cell bar, `0/6`, 🛡 (player color) 0 or 2 on the right
5. Tasks: 4 columns of 3 empty pips with task icons, shrines pre-show greek letter hints
6. Pantheon: 6 god tracks, each token at row 0 (bottom) — or row 5 if `god_track_high` ship tile
7. Companions: 3 dashed empty slots
8. Equipment: 3 dashed empty slots (or 4 if `starting_equipment`)

- [ ] **Step 3: Visual smoke test — mid-game state**

Play forward until at least these states appear:
- One injury added (cell fills with the right color glyph)
- One monster defeated (monster pip fills with ✓)
- One shrine placed (shrine pip fills with player color + letter)
- One offering loaded onto a ship (cargo slot fills as a colored square)
- One god advanced past row 0 (token slides up)
- One equipment card gained (equipment slot fills with card image)
- Favor changes (pill updates without re-render)

For each: confirm the change appears immediately on every player's panel (not just the active player's).

- [ ] **Step 4: Console check**

In DevTools console, no errors during any of step 3's actions. Warnings are acceptable; errors are not.

- [ ] **Step 5: Cross-seat check**

Open the game in a second browser tab as a different player (or use BGA's "view as opponent" feature). The panel for "self" must show the same 8 sections as the opponent's view of "self". The only allowed difference is the oracle-hand chip face (own player sees colors, opponents see facedown chips) per Task 8.

- [ ] **Step 6: Commit (if any fixes were needed)**

```bash
git add -p   # stage only the fixes
git commit -m "fix(player-panel): end-to-end verification fixups

[Brief description of what was fixed, e.g. 'wired missing
notif_companionGained handler to refresh companion slots in
real time'.]"
```

- [ ] **Step 7: Final summary commit (no code changes)**

If all verification passes and nothing needed fixing, no extra commit is required; the feature is done. Otherwise, ensure the cleanup commit message is descriptive.

---

## Self-Review

**1. Spec coverage check** — Each spec section maps to a task:

| Spec section | Implementing task |
|--------------|-------------------|
| Header | Task 2 |
| Actions row | Task 8 |
| Cargo row + ship ability | Task 4 |
| Injuries | Task 5 |
| Tasks | Task 6 |
| Pantheon | Task 7 |
| Companions | Task 9 |
| Equipment | Task 10 |
| Stat pills (shared) | Task 3 |
| Module skeleton + CSS base | Task 1 |
| End-to-end verification | Task 11 |

Open question #1 (peeked-islands tracking) — resolved: `player_island_knowledge` table already exists; Task 4 reads from it. Open question #2 (mobile/narrow viewport) — out of scope per spec.

**2. Placeholder scan** — Searched for "TODO", "TBD", "fill in" across the plan. Two intentional flags remain: each task's "schema check" / "search for actual notification name" callouts. These are not placeholders but explicit reminders for the implementer to verify the existing convention before writing the new code — necessary because the codebase has multiple slightly-different conventions for card locations and notification names that I can't fully resolve without running queries against the live schema. Each call-out is paired with concrete grep/search instructions.

**3. Type consistency** — Cross-checked function names, payload shapes, and section IDs:
- `panelState[playerId]` is consistently the per-player bundle.
- `Components.playerPanel.update*` functions match: `updateTasksCounter`, `updateFavor`, `updateShield`, `updatePeeked`, `updateCargo`, `updateInjuries`, `updateTask` (singular, takes task name + done list), `updateGodRow`, `updateDice`, `updateOracleHand`, `updateCompanions`, `updateEquipment`.
- DOM ids consistently follow `pp-<section>-<playerId>` or `pp-<section>-<modifier>-<playerId>`.
- CSS class prefix `delphi-pp-*` used everywhere.
