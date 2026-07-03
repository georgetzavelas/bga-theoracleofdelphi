# Reduce Motion BGA Preference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a BGA game preference ("Reduce motion (pulsing/flashing highlights)") that lets a player independently suppress the same 9 decorative looping animations already suppressed by the OS-level `prefers-reduced-motion` CSS, without touching that existing mechanism.

**Architecture:** Two independent, additive gates. The existing `@media (prefers-reduced-motion: reduce)` CSS block (theoracleofdelphi.css:4263-4290) is left untouched. A new BGA preference (id 100) drives a `body.motion-reduced-pref` class, toggled from JS in `setup()` (initial load) and `onPreferenceChange()` (live updates), which a second CSS block — mirroring the same 9-selector list — suppresses the identical set of animations. `wild-rainbow` stays excluded from both gates since it conveys gameplay state (Apollo wild-die mode), not decoration.

**Tech Stack:** Plain JS (dojo/BGA `ebg.core.gamegui` framework, no build step), plain CSS (no preprocessor), BGA Studio `gamepreferences.json` declaration format. `node`/`php`/`python3` are used below only as ad hoc syntax-checking tools — this repo has no npm/node application runtime.

Full design rationale: `docs/plans/2026-07-03-reduce-motion-preference-design.md`.

## Global Constraints

- Preference id `100`, `needReload: false`, values `1` = Off (default), `2` = On. These were validated with the game's designer (G) in the design doc — do not change them.
- New CSS class must be named exactly `motion-reduced-pref`.
- The new CSS block's selector list must be exactly these 9 selectors, and must NOT include `#delphi-oracle-wheel .delphi-die-mirror.die-selected` (has no `animation` property to suppress — already a static, non-animated rule) or `wild-rainbow` (excluded by design — it conveys gameplay state, not decoration):
  `.delphi-zeus-tile.zeus-tile-discardable`, `.delphi-monster.monster-targetable`, `.hex-reachable-marker`, `.hex-overlay.hex-action-target`, `.hex-overlay.hex-action-target-water`, `.cargo-selectable`, `.god-cell[data-step="6"] .delphi-god-token`, `.delphi-god-token.god-advanceable::after`, `.delphi-shrine .shrine-peek-marker`.
- Do NOT modify the existing `@media (prefers-reduced-motion: reduce)` block (theoracleofdelphi.css:4274-4290) except to add one cross-reference comment line — its selector list, its `html { scroll-behavior: auto !important; }` rule, and its behavior must stay identical.
- No new build tooling, npm packages, or CSS preprocessor may be introduced to solve the "two lists" duplication — that duplication is an accepted, deliberate trade-off (see design doc's Architecture section).
- Commit messages must NOT include `Co-Authored-By:` lines or any AI-attribution footer (project-specific override in this repo's CLAUDE.md) — plain subject/body only.

---

### Task 1: Declare the BGA preference

**Files:**
- Modify: `gamepreferences.json` (currently `{}`)

**Interfaces:**
- Produces: preference id `100`, read at runtime as `this.prefs[100].value` (`1` = Off, `2` = On). Tasks 3 and 4 consume this.

- [ ] **Step 1: Replace the file contents**

```json
{
  "100": {
    "name": "Reduce motion (pulsing/flashing highlights)",
    "needReload": false,
    "values": {
      "1": { "name": "Off" },
      "2": { "name": "On" }
    },
    "default": 1
  }
}
```

- [ ] **Step 2: Validate JSON syntax**

Run: `node -e "JSON.parse(require('fs').readFileSync('gamepreferences.json','utf8')); console.log('JSON_OK')"`
Expected output: `JSON_OK`

- [ ] **Step 3: Commit**

```bash
git add gamepreferences.json
git commit -m "feat(prefs): declare Reduce motion BGA preference"
```

### Task 2: Add the preference-driven CSS suppression block

**Files:**
- Modify: `theoracleofdelphi.css:4271-4272` (cross-reference comment) and immediately after `theoracleofdelphi.css:4290` (new block)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: CSS class `body.motion-reduced-pref` — when present on `<body>`, suppresses `animation` on the 9 selectors listed in Global Constraints. Tasks 3 and 4 consume this exact class name.

- [ ] **Step 1: Record current brace count (sanity baseline)**

Run: `python3 -c "s=open('theoracleofdelphi.css').read(); print(s.count('{'), s.count('}'))"`
Expected output: two equal numbers, e.g. `905 905`

- [ ] **Step 2: Add a cross-reference line to the existing comment**

Find this comment block (theoracleofdelphi.css:4263-4272):
```css
/* --- Reduced Motion ---
   Inverted policy (vs the typical "blanket-zero everything" pattern):
   gameplay-feedback animations run normally for reduced-motion users
   too, because they communicate what just happened (where a piece went,
   which die rolled, that an action landed). Only the infinite
   decorative pulses / shimmers / glows are suppressed — they're pure
   visual emphasis with no information value, and they're the kind of
   constant motion that reduced-motion users specifically opt out of.
   When you add a new looping decorative animation, add its selector
   to the list below. One-shot animations don't need touching. */
```

Replace the last line (`   to the list below. One-shot animations don't need touching. */`) with:
```css
   to the list below AND to the .motion-reduced-pref block further
   down (BGA in-game preference — same selectors, independent gate).
   One-shot animations don't need touching. */
```

- [ ] **Step 3: Insert the new block immediately after the existing block's closing `}` (theoracleofdelphi.css:4290)**

```css

/* Mirrors the @media (prefers-reduced-motion) block above — same
   selector list, gated by the BGA "Reduce motion" preference instead
   of the OS setting. Keep both lists in sync. */
body.motion-reduced-pref .delphi-zeus-tile.zeus-tile-discardable,
body.motion-reduced-pref .delphi-monster.monster-targetable,
body.motion-reduced-pref .hex-reachable-marker,
body.motion-reduced-pref .hex-overlay.hex-action-target,
body.motion-reduced-pref .hex-overlay.hex-action-target-water,
body.motion-reduced-pref .cargo-selectable,
body.motion-reduced-pref .god-cell[data-step="6"] .delphi-god-token,
body.motion-reduced-pref .delphi-god-token.god-advanceable::after,
body.motion-reduced-pref .delphi-shrine .shrine-peek-marker {
    animation: none !important;
}
```

(This repeats the `body.motion-reduced-pref` prefix on each selector line rather than the design doc's line-broken form, so each selector is self-contained and easy to scan/diff in future edits — functionally identical.)

- [ ] **Step 4: Verify brace balance still matches (one rule added = braces still equal)**

Run: `python3 -c "s=open('theoracleofdelphi.css').read(); print(s.count('{'), s.count('}'))"`
Expected output: two equal numbers, each 1 higher than Step 1's baseline (e.g. `906 906`)

- [ ] **Step 5: Verify the new selector list is exactly the 9 required selectors**

Run: `grep -A11 "^body.motion-reduced-pref .delphi-zeus-tile" theoracleofdelphi.css | grep -c "^body.motion-reduced-pref"`
Expected output: `9`

- [ ] **Step 6: Commit**

```bash
git add theoracleofdelphi.css
git commit -m "feat(css): add motion-reduced-pref suppression block for Reduce motion preference"
```

### Task 3: Toggle the class on initial load

**Files:**
- Modify: `theoracleofdelphi.js:385-390` (inside `setup()`)

**Interfaces:**
- Consumes: `this.prefs[100].value` (Task 1), CSS class `motion-reduced-pref` (Task 2).
- Produces: `document.body` carries the `motion-reduced-pref` class immediately on load if the preference is On, before any board element exists. Task 4 relies on this exact toggle expression.

- [ ] **Step 1: Insert the toggle as the first statement inside `setup()`**

Current code (theoracleofdelphi.js:385-390):
```js
        setup: function( gamedatas )
        {
            // Inject the static skeleton DOM. Must run before any code that
            // references its IDs (BoardRenderer, HexGrid, Components, etc.).
            // bga.gameArea.getElement() replaces the deprecated .tpl mount.
            dojo.place(this._buildGameLayout(), this.bga.gameArea.getElement(), 'only');
```

New code:
```js
        setup: function( gamedatas )
        {
            // Must run before any pulsing element can be created (see
            // Task 2's motion-reduced-pref CSS block).
            document.body.classList.toggle('motion-reduced-pref', this.prefs[100].value == 2);

            // Inject the static skeleton DOM. Must run before any code that
            // references its IDs (BoardRenderer, HexGrid, Components, etc.).
            // bga.gameArea.getElement() replaces the deprecated .tpl mount.
            dojo.place(this._buildGameLayout(), this.bga.gameArea.getElement(), 'only');
```

- [ ] **Step 2: Syntax-check the file**

Run: `node --check theoracleofdelphi.js`
Expected output: no output, exit code 0

- [ ] **Step 3: Commit**

```bash
git add theoracleofdelphi.js
git commit -m "feat(js): toggle motion-reduced-pref class from preference on setup"
```

### Task 4: Apply the preference live without a page reload

**Files:**
- Modify: `theoracleofdelphi.js` — new method inserted between `setup()`'s closing `},` and the `initResponsiveScaling: function() {` method (originally theoracleofdelphi.js:766-769; locate by the anchor text below, not the line number, since Task 3 shifts it by +1 line)

**Interfaces:**
- Consumes: same toggle expression pattern as Task 3; BGA framework's `onPreferenceChange(prefId, prefValue)` callback contract (invoked automatically by `ebg.core.gamegui` whenever a `needReload:false` preference changes).
- Produces: nothing further consumed by later tasks — this is the last code task.

- [ ] **Step 1: Locate the insertion point**

Find this in `theoracleofdelphi.js` (the end of `setup()` followed by the start of the next method):
```js
        },

        /**
         * Scale the player area to fit the available width.
         * Uses transform: scale() so all absolute positioning inside is preserved.
         * Sets a data attribute to suppress the CSS media-query fallback.
         */
        initResponsiveScaling: function() {
```

- [ ] **Step 2: Insert the new method between them**

```js
        },

        /**
         * BGA calls this automatically when a needReload:false preference
         * changes, so the Reduce motion toggle applies live without a
         * page refresh.
         */
        onPreferenceChange: function(prefId, prefValue) {
            if (prefId == 100) {
                document.body.classList.toggle('motion-reduced-pref', prefValue == 2);
            }
        },

        /**
         * Scale the player area to fit the available width.
         * Uses transform: scale() so all absolute positioning inside is preserved.
         * Sets a data attribute to suppress the CSS media-query fallback.
         */
        initResponsiveScaling: function() {
```

- [ ] **Step 3: Syntax-check the file**

Run: `node --check theoracleofdelphi.js`
Expected output: no output, exit code 0

- [ ] **Step 4: Confirm exactly one definition of each method (guards against a duplicate paste)**

Run: `grep -c "onPreferenceChange: function" theoracleofdelphi.js; grep -c "setup: function( gamedatas )" theoracleofdelphi.js`
Expected output: `1` then `1`

- [ ] **Step 5: Commit**

```bash
git add theoracleofdelphi.js
git commit -m "feat(js): apply Reduce motion preference live via onPreferenceChange"
```

### Task 5: Manual verification

No BGA Studio runtime is available in this repo/worktree (no docker/local-server config, no `.claude/launch.json` — BGA games only run for real inside BGA's own Studio environment). This task is a manual checklist for whoever has Studio access (G), not something a coding agent can execute standalone. Try the `run` skill first in case a preview path exists; if it reports no launchable app, do the static checks below and hand the runtime checklist to G rather than claiming visual verification that didn't happen.

**Files:** none (verification only)

- [ ] **Step 1: Attempt automated preview**

Try the project's `run` skill. If it finds no way to launch this BGA game locally, note that explicitly.

- [ ] **Step 2: Static fallback checks (do these regardless of Step 1's outcome)**

```bash
grep -n "motion-reduced-pref" theoracleofdelphi.css theoracleofdelphi.js
```
Expected: the CSS selector block (Task 2) and both JS toggle lines (Tasks 3 and 4) all appear, all spelled identically (`motion-reduced-pref` — no typos/case mismatches).

```bash
node --check theoracleofdelphi.js && echo JS_SYNTAX_OK
node -e "JSON.parse(require('fs').readFileSync('gamepreferences.json','utf8')); console.log('PREFS_JSON_OK')"
```
Expected: `JS_SYNTAX_OK` then `PREFS_JSON_OK`.

- [ ] **Step 3: Hand off the runtime checklist to G**

In BGA Studio (or whatever BGA dev environment G normally uses for this project), verify:
1. The preference appears in the table-creation / in-game preferences panel labeled "Reduce motion (pulsing/flashing highlights)" with Off/On options, defaulting to Off.
2. With it Off, trigger each of the 9 animation states in-game (select a cargo/injury/equipment/oracle card, hover a clickable action hex, a valid ship-move hex, a fightable monster, an eligible god-advance token, a god at top row, an opponent peeking a shrine, a discardable Zeus tile) and confirm each still pulses as before.
3. Switch the preference On mid-game (no reload) and confirm all 9 stop pulsing immediately, settling at their static "resting" look (not disappearing).
4. Switch it back Off mid-game and confirm pulsing resumes.
5. Reload the page with the preference already On and confirm no animation ever starts (no flash of motion before settling static).
6. Confirm `wild-rainbow` (Apollo wild-die mode dice/cards) keeps animating regardless of the preference's state.
7. With the preference Off, enable the OS/browser-level `prefers-reduced-motion` setting and confirm the 9 animations are still suppressed (the untouched existing gate still works independently).
8. Open the game as a spectator/second account with a different preference value than the active player and confirm each viewer's own setting is what's applied for them.

- [ ] **Step 4: Report results to G**

Do not mark this feature complete until G confirms the Step 3 checklist passed in a real BGA environment.
