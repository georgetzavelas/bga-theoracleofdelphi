# Oracle Die-Colour Log Glyphs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace colour words in Oracle-die game-log lines with inline die-face glyphs, with accessible text fallback.

**Architecture:** Client-side log injection per the BGA Studio Cookbook. A pure, unit-tested JS module (`LogGlyphs.js`) maps a colour token to a `<span class="log-die ...">` glyph; the game's `bgaFormatText` override calls it on dice-unique log args. The server keeps sending readable data; the glyph is built at render time only, so non-JS contexts (email/archive) show plain words. Glyph args are kept SEPARATE from any arg a notif handler reads, to avoid clobbering handler data on the shared args object.

**Tech Stack:** PHP 8 (BGA `Game.php` / state classes), vanilla JS + dojo/ebg (BGA client), CSS, Node.js (unit test harness via stubbed `define()`).

**Spec:** `docs/superpowers/specs/2026-05-29-log-die-glyphs-design.md`

---

## File structure

- Create `modules/js/LogGlyphs.js` — pure glyph-builder module, no DOM/dojo/`_()` deps (labels passed in). One responsibility: token → glyph HTML.
- Create `tests/test_log_glyphs_js.js` — Node unit test for the module.
- Modify `theoracleofdelphi.js` — add `LogGlyphs` dep, the `_dieColorLabels` map, the `bgaFormatText` override, bump cache-bust.
- Modify `theoracleofdelphi.css` — add the `.log-die` glyph block.
- Modify `modules/php/Game.php`, `modules/php/States/ConsultOracle.php`, `modules/php/States/PlayerActions.php`, `modules/php/States/SelectAction.php` — change 7 log templates + args across 6 notification types.

## Key contract (read before any task)

- Glyph keys (built into HTML by the override, referenced in templates): **`dice`** (list), **`die`**, **`die_from`**, **`die_to`** (singles). These names appear nowhere else in the codebase, so the override never touches offerings/injuries/statues/oracle-card/status-bar lines.
- Handler-read colour keys stay under their ORIGINAL names and are NOT glyphified: `colors` (diceRolled), `target_color` (dieRecolored), `color` (bonusActionStarted). When such a key is no longer referenced by any template placeholder, add it to a `preserve` array so it survives replay.
- Recognised tokens: `red, yellow, green, blue, pink, black, wild`. Anything else → returned unchanged (fallback).

---

### Task 1: Pure glyph-builder module + unit test

**Files:**
- Create: `modules/js/LogGlyphs.js`
- Create: `tests/test_log_glyphs_js.js`

- [ ] **Step 1: Write the failing test**

Create `tests/test_log_glyphs_js.js`:

```javascript
/**
 * Unit test for LogGlyphs.js (pure colour-token -> die-glyph HTML).
 * Run: node tests/test_log_glyphs_js.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); pass++; }
    else      { console.log('  FAIL: ' + msg); fail++; }
}

// Load LogGlyphs.js by stubbing dojo's define()
const sandbox = {
    console,
    captured: null,
    define(_deps, factory) { sandbox.captured = factory(); },
};
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'modules', 'js', 'LogGlyphs.js'), 'utf8'),
    sandbox
);
const LG = sandbox.captured;
const L = { red:'Red', yellow:'Yellow', green:'Green', blue:'Blue',
            pink:'Pink', black:'Black', wild:'Wild' };

ok(LG !== null, 'LogGlyphs module loaded');

// glyph() on a known token
const g = LG.glyph('green', L);
ok(g.indexOf('log-die') >= 0 && g.indexOf('die-color-green') >= 0,
   "glyph('green') has log-die + die-color-green classes");
ok(g.indexOf('aria-label="Green"') >= 0, "glyph('green') has aria-label Green");
ok(g.indexOf('title="Green"') >= 0, "glyph('green') has title Green");
ok(g.indexOf('role="img"') >= 0, "glyph('green') has role=img");

// Capitalised input normalises
ok(LG.glyph('Red', L).indexOf('die-color-red') >= 0,
   "glyph('Red') normalises to die-color-red");

// Unknown colour -> fallback unchanged
ok(LG.glyph('purple', L) === 'purple', "glyph('purple') falls back unchanged");

// Empty / null pass through
ok(LG.glyph('', L) === '', "glyph('') returns ''");
ok(LG.glyph(null, L) === null, "glyph(null) returns null");

// glyphList()
const list = LG.glyphList('green, red, green', L);
ok((list.match(/log-die/g) || []).length === 3, "glyphList builds 3 glyphs");
ok(list.indexOf('die-color-red') >= 0, 'glyphList includes red');

// Idempotency: glyph of an already-built glyph is unchanged
ok(LG.glyph(LG.glyph('green', L), L) === LG.glyph('green', L),
   'glyph() is idempotent on built HTML');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/test_log_glyphs_js.js`
Expected: FAIL — `Cannot find module '.../modules/js/LogGlyphs.js'` (file does not exist yet).

- [ ] **Step 3: Create the module to make the test pass**

Create `modules/js/LogGlyphs.js`:

```javascript
/**
 * LogGlyphs.js — pure helper that turns an Oracle-die colour value into an
 * inline die-face glyph for the game log. No DOM / dojo / _() dependency:
 * the translatable labels are passed in by the caller so this stays unit
 * testable in Node. Unknown values are returned unchanged (text fallback).
 */
define([], function () {
    var KNOWN = { red:1, yellow:1, green:1, blue:1, pink:1, black:1, wild:1 };

    // Normalise an arbitrary log value ('Red', ' green ') to a token, or null.
    function token(value) {
        if (value === null || value === undefined) return null;
        var t = String(value).toLowerCase().trim();
        return KNOWN.hasOwnProperty(t) ? t : null;
    }

    // value -> glyph HTML, or the original value unchanged if not a colour.
    function glyph(value, labels) {
        var t = token(value);
        if (t === null) return value;
        var label = (labels && labels[t]) || t;
        return '<span class="log-die die-color-' + t + '" role="img" aria-label="'
             + label + '" title="' + label + '"></span>';
    }

    // "green, red, green" -> three space-joined glyphs. Non-colours pass through.
    function glyphList(value, labels) {
        if (value === null || value === undefined) return value;
        return String(value).split(',').map(function (part) {
            return glyph(part.trim(), labels);
        }).join(' ');
    }

    return { token: token, glyph: glyph, glyphList: glyphList };
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/test_log_glyphs_js.js`
Expected: PASS — `12 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add modules/js/LogGlyphs.js tests/test_log_glyphs_js.js
git commit -m "feat(log): add pure LogGlyphs module + unit test for die-face glyphs"
```

---

### Task 2: Wire the override, label map, and CSS into the client

**Files:**
- Modify: `theoracleofdelphi.js` (define block ~line 16-28; `JS_VERSION` ~line 76; add override near `setupNotifications` ~line 7477)
- Modify: `theoracleofdelphi.css` (append a `.log-die` block)

- [ ] **Step 1: Add LogGlyphs to the define() block and bump cache-bust**

In `theoracleofdelphi.js`, change the comment and the dependency list. Replace:

```javascript
// JS cache-bust marker. Bump in all 6 URLs in the define() block AND the
// JS_VERSION class property below when JS modules change.
define([
    "dojo","dojo/_base/declare",
    "ebg/core/gamegui",
    "ebg/counter",
    g_gamethemeurl + "modules/js/HexGrid.js?v324",
    g_gamethemeurl + "modules/js/Components.js?v324",
    g_gamethemeurl + "modules/js/ClusterDefinitions.js?v324",
    g_gamethemeurl + "modules/js/BoardBuilder.js?v324",
    g_gamethemeurl + "modules/js/BoardRenderer.js?v324",
    g_gamethemeurl + "modules/BX/js/DragScroller.js?v324",
],
function (dojo, declare, gamegui, counter, HexGrid, Components, ClusterDefinitions, BoardBuilder, BoardRenderer) {
```

with:

```javascript
// JS cache-bust marker. Bump in all 7 URLs in the define() block AND the
// JS_VERSION class property below when JS modules change.
define([
    "dojo","dojo/_base/declare",
    "ebg/core/gamegui",
    "ebg/counter",
    g_gamethemeurl + "modules/js/HexGrid.js?v325",
    g_gamethemeurl + "modules/js/Components.js?v325",
    g_gamethemeurl + "modules/js/ClusterDefinitions.js?v325",
    g_gamethemeurl + "modules/js/BoardBuilder.js?v325",
    g_gamethemeurl + "modules/js/BoardRenderer.js?v325",
    g_gamethemeurl + "modules/js/LogGlyphs.js?v325",
    g_gamethemeurl + "modules/BX/js/DragScroller.js?v325",
],
function (dojo, declare, gamegui, counter, HexGrid, Components, ClusterDefinitions, BoardBuilder, BoardRenderer, LogGlyphs) {
```

(LogGlyphs is inserted before DragScroller so the positional params line up; DragScroller stays uncaptured as before.)

- [ ] **Step 2: Bump the JS_VERSION property**

In `theoracleofdelphi.js`, change:

```javascript
        JS_VERSION: "v324",
```

to:

```javascript
        JS_VERSION: "v325",
```

- [ ] **Step 3: Add the bgaFormatText override**

In `theoracleofdelphi.js`, immediately ABOVE the `setupNotifications: function()` definition (~line 7477), insert:

```javascript
        // Translatable colour labels for log die-glyphs. Literal _() calls so
        // the string extractor registers them. Built lazily + cached.
        _dieColorLabels: null,

        // BGA log-injection hook (Cookbook "Inject icon images in the log").
        // Replaces the readable colour text in dice-unique log args
        // (dice/die/die_from/die_to) with an inline die-face glyph. Only these
        // keys are touched, so offerings/injuries/statues/oracle-card/status-bar
        // colour lines are never affected. Glyph keys are distinct from any key
        // a notif_* handler reads, so mutating the shared args object is safe.
        bgaFormatText: function (log, args) {
            try {
                if (log && args && !args.processed) {
                    args.processed = true;
                    var labels = this._dieColorLabels || (this._dieColorLabels = {
                        red: _('Red'), yellow: _('Yellow'), green: _('Green'),
                        blue: _('Blue'), pink: _('Pink'), black: _('Black'),
                        wild: _('Wild')
                    });
                    var single = ['die', 'die_from', 'die_to'];
                    for (var i = 0; i < single.length; i++) {
                        var k = single[i];
                        if (args[k] !== undefined && args[k] !== null && args[k] !== '') {
                            args[k] = LogGlyphs.glyph(args[k], labels);
                        }
                    }
                    if (args.dice !== undefined && args.dice !== null && args.dice !== '') {
                        args.dice = LogGlyphs.glyphList(args.dice, labels);
                    }
                }
            } catch (e) {
                console.error(log, args, 'bgaFormatText exception', e.stack);
            }
            return { log: log, args: args };
        },

```

- [ ] **Step 4: Add the `.log-die` CSS block**

Append to `theoracleofdelphi.css`:

```css
/* Inline Oracle die-face glyph for the game log (LogGlyphs.js).
   Sized to sit on the text baseline without breaking log flow
   (BGA Guidelines D.2). Reuses the existing die-face art. */
.log-die {
    display: inline-block;
    width: 1.15em;
    height: 1.15em;
    vertical-align: text-bottom;
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
}
.log-die.die-color-red    { background-image: url('img/oracle-dice/die-face-red.png'); }
.log-die.die-color-yellow { background-image: url('img/oracle-dice/die-face-yellow.png'); }
.log-die.die-color-green  { background-image: url('img/oracle-dice/die-face-green.png'); }
.log-die.die-color-blue   { background-image: url('img/oracle-dice/die-face-blue.png'); }
.log-die.die-color-pink   { background-image: url('img/oracle-dice/die-face-pink.png'); }
.log-die.die-color-black  { background-image: url('img/oracle-dice/die-face-black.png'); }
.log-die.die-color-wild   { background-image: url('img/oracle-dice/die-face-wild.png'); }
```

- [ ] **Step 5: Syntax-check the JS**

Run: `node --check theoracleofdelphi.js`
Expected: no output (exit 0).

- [ ] **Step 6: Verify the override hook name against the loaded framework**

The current BGA framework calls `bgaFormatText` (this game uses 2026+ APIs such as `getImgUrl`). On Studio, open the game, trigger any dice log line, and confirm the glyph renders. If the framework still calls the legacy `format_string_recursive(log, args)` instead (glyphs do NOT appear), rename the method to `format_string_recursive`, move the same body in, and change the final line from `return { log: log, args: args };` to mutate `args` then `return this.inherited(arguments);`. Re-test.

- [ ] **Step 7: Commit**

```bash
git add theoracleofdelphi.js theoracleofdelphi.css
git commit -m "feat(log): render Oracle die colours as glyphs via bgaFormatText"
```

---

### Task 3: Server log templates + args (6 notification types)

**Files:**
- Modify: `modules/php/Game.php:778` (startingDiceRolled), `modules/php/Game.php:3201` (dieUsed)
- Modify: `modules/php/States/ConsultOracle.php:63` (diceRolled)
- Modify: `modules/php/States/PlayerActions.php:197` (dieSelected), `:481` (bonusActionStarted)
- Modify: `modules/php/States/SelectAction.php:905-925` (dieRecolored ×3 templates)

- [ ] **Step 1: startingDiceRolled (Game.php:778) — handler is a no-op, simple rename**

Replace:

```php
            $this->notify->all("startingDiceRolled", clienttranslate('${player_name} consults the oracle for 3 starting Oracle Dice: ${colors_text}'), [
                "player_id" => $playerId,
                "player_name" => $this->getPlayerNameById($playerId),
                "colors" => $rolled,
                "colors_text" => implode(', ', $rolled),
            ]);
```

with:

```php
            $this->notify->all("startingDiceRolled", clienttranslate('${player_name} consults the oracle for 3 starting Oracle Dice: ${dice}'), [
                "player_id" => $playerId,
                "player_name" => $this->getPlayerNameById($playerId),
                "colors" => $rolled,
                "dice" => implode(', ', $rolled),
            ]);
```

- [ ] **Step 2: diceRolled (ConsultOracle.php:63) — handler reads `colors`, so preserve it**

Replace:

```php
        $this->notify->all("diceRolled",
            clienttranslate('${player_name}\'s Oracle Dice show: ${colors_text}'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "colors" => $newColors,
            "colors_text" => implode(', ', $newColors),
        ]);
```

with:

```php
        $this->notify->all("diceRolled",
            clienttranslate('${player_name}\'s Oracle Dice show: ${dice}'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "colors" => $newColors,
            "dice" => implode(', ', $newColors),
            "preserve" => ["colors"],
        ]);
```

- [ ] **Step 3: dieUsed (Game.php:3201) — handler ignores colour, clean rename**

Replace:

```php
            $this->notify->all("dieUsed",
                clienttranslate('${player_name}\'s ${color} Oracle Die is spent'), [
                "player_id" => $playerId,
                "player_name" => $this->getPlayerNameById($playerId),
                "die_index" => $dieIndex,
                "color" => ucfirst($dieColor),
            ]);
```

with:

```php
            $this->notify->all("dieUsed",
                clienttranslate('${player_name}\'s ${die} Oracle Die is spent'), [
                "player_id" => $playerId,
                "player_name" => $this->getPlayerNameById($playerId),
                "die_index" => $dieIndex,
                "die" => ucfirst($dieColor),
            ]);
```

- [ ] **Step 4: dieSelected (PlayerActions.php:197) — handler ignores colour, clean rename**

Replace:

```php
        $this->notify->all("dieSelected", clienttranslate('${player_name} selects a ${die_color} die'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "die_color" => $die['color'],
            "die_index" => $die_index,
        ]);
```

with:

```php
        $this->notify->all("dieSelected", clienttranslate('${player_name} selects a ${die} die'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "die" => $die['color'],
            "die_index" => $die_index,
        ]);
```

- [ ] **Step 5: bonusActionStarted (PlayerActions.php:481) — handler reads `color`, so keep + preserve it**

Replace:

```php
        $this->notify->all("bonusActionStarted", clienttranslate('${player_name} takes a ${color} bonus action'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "color" => $chosen_color,
```

with:

```php
        $this->notify->all("bonusActionStarted", clienttranslate('${player_name} takes a ${die} bonus action'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "color" => $chosen_color,
            "die" => $chosen_color,
            "preserve" => ["color"],
```

(Leave the rest of that notify payload untouched. If the payload already
ends with other keys after `color`, the two new lines slot in before them;
if a `preserve` key already exists, merge `"color"` into it instead of
adding a second.)

- [ ] **Step 6: dieRecolored (SelectAction.php:905-925) — handler reads `target_color`; add die_from/die_to, preserve target_color**

Replace the three `$logMsg` assignments:

```php
        if ($apolloWild) {
            $this->game->globals->set('apollo_pending_recolor', 0);
            $logMsg = clienttranslate('${player_name} uses Apollo to recolor die to ${target_color}');
        } elseif ($demigodWild) {
            $logMsg = clienttranslate('${companion_name} treats ${player_name}\'s ${origin_color} die as ${target_color}');
        } else {
            $logMsg = clienttranslate('${player_name} recolors die to ${target_color} (${cost} Favor)');
        }
```

with:

```php
        if ($apolloWild) {
            $this->game->globals->set('apollo_pending_recolor', 0);
            $logMsg = clienttranslate('${player_name} uses Apollo to recolor die to ${die_to}');
        } elseif ($demigodWild) {
            $logMsg = clienttranslate('${companion_name} treats ${player_name}\'s ${die_from} die as ${die_to}');
        } else {
            $logMsg = clienttranslate('${player_name} recolors die to ${die_to} (${cost} Favor)');
        }
```

Then in the `$this->notify->all("dieRecolored", $logMsg, [ ... ]);` payload, replace:

```php
            "die_index" => $dieIndex,
            "target_color" => $targetColor,
            "origin_color" => $currentColor,
            "cost" => $cost,
```

with:

```php
            "die_index" => $dieIndex,
            "target_color" => $targetColor,
            "origin_color" => $currentColor,
            "die_to" => $targetColor,
            "die_from" => $currentColor,
            "cost" => $cost,
            "preserve" => ["target_color"],
```

(If the payload already has a `preserve` key, merge `"target_color"` into it.)

- [ ] **Step 7: Lint all changed PHP files**

Run:
```bash
php -l modules/php/Game.php && \
php -l modules/php/States/ConsultOracle.php && \
php -l modules/php/States/PlayerActions.php && \
php -l modules/php/States/SelectAction.php
```
Expected: `No syntax errors detected` for each.

- [ ] **Step 8: Run the PHP test suite to confirm no regressions**

Run:
```bash
php tests/test_material_defs.php && \
php tests/test_distribute_colors.php && \
php tests/test_player_panel_data.php && \
php tests/test_board_generator.php
```
Expected: all suites report `0 failed`.

- [ ] **Step 9: Confirm `preserve` is supported by this framework's notify**

Grep for any existing use to confirm the convention, and verify on Studio
that `colors` (diceRolled) and `target_color` (dieRecolored) are still
present in `notif.args` when a finished game is replayed (the roll
animation and the recolor still work on replay). If `preserve` is not
honoured by the loaded framework, the fallback is to also reference the
key in the template via a hidden span, but confirm support first.

Run: `grep -rn "preserve" modules/php/ | head`
Expected: informational (may be empty; `preserve` is a framework arg).

- [ ] **Step 10: Commit**

```bash
git add modules/php/Game.php modules/php/States/ConsultOracle.php \
        modules/php/States/PlayerActions.php modules/php/States/SelectAction.php
git commit -m "feat(log): emit dice-unique glyph args for Oracle die log lines"
```

---

### Task 4: Studio integration verification

No code changes. Deploy to BGA Studio (SFTP) and verify the live behaviour.

- [ ] **Step 1: Deploy** — upload the changed files to `/theoracleofdelphi` and reload game information in the Control Panel.

- [ ] **Step 2: Verify each of the 7 lines renders a glyph in the live log:**
  - Start a game → "consults the oracle for 3 starting Oracle Dice: [🎲🎲🎲]"
  - Consult the oracle → "Oracle Dice show: [🎲🎲🎲]"
  - Select a die → "selects a [🎲] die"
  - Spend a die → "[🎲] Oracle Die is spent"
  - Recolor (Favor) → "recolors die to [🎲]"; (Apollo) → "uses Apollo to recolor die to [🎲]"; (demigod wild) → "treats [🎲] die as [🎲]"
  - Take a bonus action → "takes a [🎲] bonus action"

- [ ] **Step 3: Verify accessibility** — hover a glyph shows the colour name (title); inspect shows `role="img"` + `aria-label`.

- [ ] **Step 4: Verify scope** — confirm NON-dice colour lines are unchanged words: an offering delivery, an injury draw, a statue raise, an oracle-card play, and the status-bar action prompt ("selects action for ... die").

- [ ] **Step 5: Verify replay** — replay the finished game; confirm glyphs still render (not doubled), the dice-roll animation still plays (colors preserved), and recolor still applies (target_color preserved).

- [ ] **Step 6: Verify fallback** — view a no-CSS context (e.g. the move-by-move text log / email if available); confirm colour words appear in place of glyphs.

---

## Self-review notes

- **Spec coverage:** mechanism (Task 2), collision-proof dice-unique keys (Tasks 2-3), translatable labels (Task 2 Step 3), `.log-die` CSS reusing assets (Task 2 Step 4), all 7 templates (Task 3), alt-text via fallback args + aria/title (Tasks 1, 3), `preserve` for handler-read keys (Task 3), framework-hook + preserve verification (Task 2 Step 6, Task 3 Step 9), testing (Task 4). All covered.
- **Refinement beyond spec:** handler-read colour keys (`colors`, `target_color`, `color`) are kept separate from glyph keys and `preserve`d, because `bgaFormatText` mutates the shared args object. This is reflected here and should be back-noted in the spec.
- **Type/name consistency:** glyph keys `dice`/`die`/`die_from`/`die_to` and module API `LogGlyphs.glyph` / `LogGlyphs.glyphList` are used identically across Tasks 1-3.
- **Cache-bust:** v324 → v325 across all 7 module URLs + `JS_VERSION` (Task 2 Steps 1-2).
