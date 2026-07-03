# Reduce Motion — BGA Preference Design

## Motivation

The game currently suppresses its decorative pulsing/flashing/looping animations only via
the browser-level `prefers-reduced-motion: reduce` media query (theoracleofdelphi.css:4263-4290).
That protects players whose OS or browser already declares the preference, but doesn't help
players who haven't set that OS-level flag (shared/library computers, unfamiliarity with the
setting, or simply expecting to find the control inside BGA's own preferences panel).

This is an accessibility feature: the target audience includes players for whom pulsing/
flashing visuals are a photosensitivity or vestibular trigger, not just a comfort preference.
That raises the bar on correctness and fail-safety for everything below.

## Scope: what qualifies

Enumeration was already effectively done by the existing reduced-motion CSS block. Nine
looping/decorative `@keyframes` animations qualify, all currently suppressed by the OS media
query:

| Animation | Selector | Marks |
|---|---|---|
| `cargo-pulse` | `.cargo-selectable` | selectable cargo/injury/equipment/oracle cards |
| `hex-action-pulse` | `.hex-overlay.hex-action-target` | clickable board hex for an action |
| `hex-action-pulse` (water) | `.hex-overlay.hex-action-target-water` | Poseidon teleport / water action targets |
| `pulse-reachable` | `.hex-reachable-marker` | valid ship-move destination |
| `monster-pulse` | `.delphi-monster.monster-targetable` | fightable monster |
| `god-advance-arrow-bob` | `.delphi-god-token.god-advanceable::after` | eligible god token during god-advance |
| `god-top-row-pulse` | `.god-cell[data-step="6"] .delphi-god-token` | god ability available |
| `shrine-peek-marker-pulse` | `.delphi-shrine .shrine-peek-marker` | opponent peeking at a shrine |
| `zeus-tile-discardable-pulse` | `.delphi-zeus-tile.zeus-tile-discardable` | Zeus tile eligible for discard |

**Deliberately excluded**: `wild-rainbow` (dice/cards under Apollo's wild power) — it's the
only visual signal for which pieces are currently in wild mode, so removing it would remove
information, not just motion. The new preference mirrors the OS media query's list exactly,
including this exclusion, so both gates stay behaviorally identical.

**Also out of scope**: one-shot animations (card/piece flights, drops, lifts, dice rolls,
shake/pulse feedback on an action). These convey what just happened and already run
unconditionally under the existing reduced-motion policy — no change needed.

**Alternatives already exist**: every qualifying animation has a static "resting" appearance
baked into its base CSS rule, independent of its keyframes (e.g. `.cargo-selectable`'s base
gold outline, `.hex-reachable-marker`'s base ring). Disabling the animation freezes the
element at that static look rather than blanking the cue — no new visual designs are needed.

## Architecture: two independent gates

Two options were considered:

- **Single unified gate** (rejected): JS computes one OR'd boolean
  (`matchMedia('(prefers-reduced-motion: reduce)').matches || pref == 2`) at the top of
  `setup()` and drives a single CSS class; the OS media query is removed in favor of one
  selector list. Cleaner, but OS-level protection would then depend on that JS line executing
  correctly before any animated element is created — a bug upstream in `setup()` could
  silently drop protection for OS-reduced-motion users.
- **Two independent gates** (chosen): the existing `@media (prefers-reduced-motion: reduce)`
  block stays completely untouched — pure CSS, cannot fail even if JS throws. The new BGA
  preference is a second, additive gate: its own CSS class, its own (duplicated) selector
  list, wired by a small amount of JS. Costs a second selector list to maintain in parallel,
  mitigated with a cross-reference comment in both blocks. For a feature whose purpose is
  protecting people from seizure/migraine triggers, a small duplication tax is worth not
  having a single point of failure.

## Implementation

### 1. `gamepreferences.json`

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

- ID `100`: BGA reserves lower IDs for platform use; custom prefs start at 100.
- `needReload: false`: pure CSS class toggle, applies live without a page refresh.
- Default `1` (Off): opt-in — this doesn't change the default look for players who don't need it.
- Label spells out "pulsing/flashing highlights" rather than a bare "Reduce motion" so players
  aren't left guessing whether it also affects sound or piece-flight animations (it doesn't).

### 2. CSS (`theoracleofdelphi.css`)

Add immediately after the existing reduced-motion block (after line 4290), mirroring its
selector list under a new class instead of the media query:

```css
/* Mirrors the @media (prefers-reduced-motion) block above — same
   selector list, gated by the BGA "Reduce motion" preference instead
   of the OS setting. Keep both lists in sync. */
body.motion-reduced-pref
    .delphi-zeus-tile.zeus-tile-discardable,
body.motion-reduced-pref
    .delphi-monster.monster-targetable,
body.motion-reduced-pref
    .hex-reachable-marker,
body.motion-reduced-pref
    .hex-overlay.hex-action-target,
body.motion-reduced-pref
    .hex-overlay.hex-action-target-water,
body.motion-reduced-pref
    .cargo-selectable,
body.motion-reduced-pref
    .god-cell[data-step="6"] .delphi-god-token,
body.motion-reduced-pref
    .delphi-god-token.god-advanceable::after,
body.motion-reduced-pref
    .delphi-shrine .shrine-peek-marker {
    animation: none !important;
}
```

Also add a back-reference comment to the existing `@media` block (theoracleofdelphi.css:4263)
pointing at this new block, so anyone maintaining one remembers the other.

### 3. JS (`theoracleofdelphi.js`)

- **`setup()`**: as the very first statement, before `_buildGameLayout()` (line 390) and
  before any pulsing element can be created:
  ```js
  document.body.classList.toggle('motion-reduced-pref', this.prefs[100].value == 2);
  ```
- **`onPreferenceChange(prefId, prefValue)`**: new method on the game class. BGA's framework
  calls this automatically when a `needReload:false` preference changes; do the same toggle
  here so the switch applies live without a page refresh:
  ```js
  onPreferenceChange: function(prefId, prefValue) {
      if (prefId == 100) {
          document.body.classList.toggle('motion-reduced-pref', prefValue == 2);
      }
  }
  ```

## Edge cases

- **Spectators**: BGA preferences are per-viewer, so a spectator's own setting governs what
  they see — no special-casing needed.
- **Multi-tab / reconnect**: `this.prefs` is repopulated from `gamedatas` on every `setup()`
  call, so any reload reads the current stored value — no stale-state risk.
- **Assumption to verify empirically**: that `this.prefs` is already populated by the
  framework by the time this game's `setup()` runs. This is standard BGA behavior but should
  be confirmed against this project's BGA SDK version rather than trusted from memory —
  verify during implementation/testing, not assumed.

## Testing plan

- Toggle the preference in Off/On/Off sequence mid-game (no reload) and confirm each of the 9
  animation classes stops/resumes pulsing live.
- Load the game fresh with the preference pre-set to On and confirm no animation ever starts
  (i.e. the class is applied before `setup()` builds any board element — no flash of motion).
- Confirm `wild-rainbow` continues to animate regardless of the preference's state.
- Confirm the OS-level `prefers-reduced-motion` behavior is unaffected (test with the
  preference Off but OS reduced-motion On, and vice versa — both gates should suppress
  independently; either one being active is enough to stop the animation).
- Spectate a game as a second BGA account with a different preference value than the active
  player and confirm each viewer sees their own setting applied.

## Open follow-ups (not blocking this design)

- None currently — scope was deliberately kept to mirroring the existing, already-vetted
  reduced-motion policy rather than inventing new suppression rules.
