# Design: Oracle die-colour glyphs in the game log

Date: 2026-05-29
Status: Approved (ready for implementation plan)

## Goal

Replace colour *words* in Oracle-die log lines with an inline die-face
glyph, so the log reads at a glance. Example:

- Before: `gzed0 consults the oracle for 3 starting Oracle Dice: green, red, green`
- After:  `gzed0 consults the oracle for 3 starting Oracle Dice: 🟢 🔴 🟢` (die-face glyphs)

## Scope

In scope: **Oracle-die colour references only**, plus the die-coloured
bonus-action line. NOT offerings, statues, injuries, oracle cards, or
companion colours (those reference `${color}`/`${colors_text}` too, which
is why scoping must be collision-proof — see below).

The 7 in-scope log templates (6 notification types):

| # | Notif | File:line | Current template | Colour arg(s) | New placeholder |
|---|-------|-----------|------------------|---------------|-----------------|
| 1 | `startingDiceRolled` | Game.php:778 | `...3 starting Oracle Dice: ${colors_text}` | `colors_text` (joined), `colors` (array) | `${dice}` |
| 2 | `diceRolled` | ConsultOracle.php:63 | `...Oracle Dice show: ${colors_text}` | `colors_text`, `colors` | `${dice}` |
| 3 | `dieUsed` | Game.php:3201 | `${color} Oracle Die is spent` | `color` = `'Red'` (ucfirst) | `${die}` |
| 4 | `dieSelected` | PlayerActions.php:197 | `selects a ${die_color} die` | `die_color` = `'red'` (raw) | `${die}` |
| 5a | `dieRecolored` (favor) | SelectAction.php:912 | `recolors die to ${target_color} (${cost} Favor)` | `target_color` | `${die_to}` |
| 5b | `dieRecolored` (Apollo) | SelectAction.php:908 | `uses Apollo to recolor die to ${target_color}` | `target_color` | `${die_to}` |
| 5c | `dieRecolored` (demigod) | SelectAction.php:910 | `treats ${player_name}'s ${origin_color} die as ${target_color}` | `origin_color`, `target_color` | `${die_from}`, `${die_to}` |
| 6 | `bonusActionStarted` | PlayerActions.php:481 | `takes a ${color} bonus action` | `color` = raw | `${die}` |

Out of scope (explicitly, to avoid collateral glyphification): the
status-bar action prompt `selects action for ${die_color} die`
(SelectAction.php:19) — it is a state description, not a log entry.

## Approach (chosen)

Client-side argument injection via the BGA-documented log pattern. The
server keeps sending plain data; a client `bgaFormatText` override turns
the colour value into glyph HTML at render time.

Rejected alternatives:
- **Server-side HTML** in the notification arg. Rejected per the BGA
  Studio Cookbook, which lists five reasons to inject client-side
  (preserves replay logs/tutorials, eliminates translator
  complications, no log-preview corruption, less data transfer,
  UI/server separation), and the hard rule: *"you must only apply
  modifications to the args object, and not try to substitute the keys."*
- **Client override keyed by arg name globally** (e.g. glyphify any
  `color`). Rejected: `${color}`/`${die_color}` collide with offerings,
  injuries, statues, and the status bar — would glyphify out-of-scope
  lines.

## Mechanism

### 1. Collision-proof placeholders

`bgaFormatText` runs on every log line and keys off arg *names*. Because
`${color}`/`${die_color}` are shared with non-dice lines, the in-scope
templates are changed to use **dice-unique placeholder names that appear
nowhere else**: `${dice}`, `${die}`, `${die_from}`, `${die_to}`. The
override glyphifies only these four keys, so there is no collateral
glyphification and no need to inspect notification type.

### 1b. Glyph keys must be separate from handler-read keys

`bgaFormatText` mutates the **same** `args` object the `notif_*` handlers
receive. So the glyph must be written to a NEW dice-unique key, never to a
key a handler reads, or the handler would get glyph HTML instead of the raw
colour. Audit of the in-scope handlers:

- `notif_dieSelected`, `notif_dieUsed`: do NOT read the colour arg (they use
  `die_index` + panelState). → clean rename of the placeholder/key is safe.
- `notif_diceRolled` reads `args.colors` (roll animation); `notif_dieRecolored`
  reads `args.target_color`; `notif_bonusActionStarted` reads `args.color`.
  → keep those keys under their original names, add a separate glyph key, and
  add the original key to a `preserve` array (it is no longer referenced by a
  template placeholder, so it would otherwise be stripped on replay).

### 2. Value carries its own text fallback

Each dice-unique arg holds the **readable colour text**, not separate
data:
- singles: `die => 'Red'` (or `'red'`), `die_from`/`die_to` likewise
- list: `dice => implode(', ', $rolled)` → `'green, red, green'`

Because the placeholder is referenced in the template, the value:
- **survives replay** (not stripped — see `preserve` note below), and
- **renders as plain words** wherever the override does not run (email
  digests, archive, non-JS), satisfying BGA Guidelines §D.2
  *"Provide alt-text for graphic components inside logs."*

### 3. The override

```js
bgaFormatText: function (log, args) {
    try {
        if (log && args && !args.processed) {
            args.processed = true;            // canonical idempotency guard
            ['die', 'die_from', 'die_to'].forEach(function (k) {
                if (args[k]) args[k] = this.dieGlyph(args[k]);
            }, this);
            if (args.dice) {
                args.dice = String(args.dice)
                    .split(',')
                    .map(function (s) { return this.dieGlyph(s.trim()); }, this)
                    .join(' ');
            }
        }
    } catch (e) {
        console.error(log, args, 'bgaFormatText exception', e.stack);
    }
    return { log: log, args: args };
}
```

`dieGlyph(value)` normalises to a token and returns glyph HTML, or
returns the value unchanged if it is not a known colour (graceful
fallback):

```js
dieGlyph: function (value) {
    var token = String(value).toLowerCase().trim();
    if (!DIE_COLOR_LABELS.hasOwnProperty(token)) return value; // fallback
    var label = DIE_COLOR_LABELS[token];
    return '<span class="log-die die-color-' + token + '" role="img" '
         + 'aria-label="' + label + '" title="' + label + '"></span>';
}
```

Idempotency: re-render is safe via the `args.processed` flag (the
Cookbook's canonical guard); `dieGlyph` is also tolerant if handed
already-built HTML (token lookup fails → returns unchanged).

### 4. Translatable labels (required)

Per the Translations doc, `_(variable)` only translates if the value is
a registered literal. So the label map uses literal `_()` calls (which
the string extractor picks up):

```js
var DIE_COLOR_LABELS = {
    red: _('Red'), yellow: _('Yellow'), green: _('Green'),
    blue: _('Blue'), pink: _('Pink'), black: _('Black'), wild: _('Wild')
};
```

### 5. Glyph CSS (reuses existing assets)

Assets already exist: `img/oracle-dice/die-face-{red,yellow,green,blue,pink,black,wild}.png`
(used today by `.recolor-die-icon` and `.monster-tooltip-die`). Add a
small inline `.log-die` class sized to sit in the log line (per §D.2
*"do not use oversized images that break log flow"*):

```css
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

## Accessibility

- §D.2 alt-text: satisfied by (a) the plain-text fallback in the arg
  value for non-JS contexts and (b) `title` + `aria-label` on the glyph
  for hover + screen readers.
- §D.1 "don't rely on colour alone": satisfied — each die face is a
  **unique image**, not merely a colour tint, so the glyph is
  distinguishable without perceiving hue. No letter overlay needed.

## Server edits (each ~1 line)

For each in-scope notification, rename the colour placeholder in the
`clienttranslate(...)` template to the dice-unique name and set the
matching arg. Keep existing handlers working:

- `startingDiceRolled` / `diceRolled`: template uses `${dice}`; set
  `dice => implode(', ', $rolledColors)`. The `colors` array stays for
  the tray-rendering handler. **If that handler reads `colors` on
  replay**, add `'preserve' => ['colors']` (the array is not referenced
  in the template text, so it is otherwise stripped on replay).
- `dieUsed`: `${die}`, `die => ucfirst($dieColor)` (or raw).
- `dieSelected`: `${die}`, `die => $die['color']`.
- `dieRecolored`: payload gains `die_from => $currentColor`,
  `die_to => $targetColor`; the three `$logMsg` variants use
  `${die}`/`${die_to}`/`${die_from}` accordingly.
- `bonusActionStarted`: `${die}`, `die => $chosen_color`.

## Open verification items (resolve during implementation)

1. **Framework hook**: confirm the loaded BGA framework exposes
   `bgaFormatText` (current Cookbook) vs the older
   `format_string_recursive`. Use whichever the framework calls; the
   override body is the same shape.
2. **`preserve` need**: confirm whether the `startingDiceRolled` /
   `diceRolled` notif handlers consume `colors` during replay; add
   `preserve` only if so.
3. **JS cache-bust**: bump the `?v<NNN>` markers + `JS_VERSION` per repo
   convention when shipping JS/CSS.

## Testing

- Trigger each of the 7 lines on BGA Studio; confirm glyph renders in the
  live log.
- Confirm plain-word fallback (no-CSS context / disable the override) for
  each line.
- Confirm `title`/`aria-label` present on hover and to screen readers.
- Confirm idempotent rendering on game replay/reload (no double-glyph,
  no stripped data).
- Confirm no glyphs leak into out-of-scope lines (offerings, injuries,
  statues, oracle cards, the status-bar action prompt).
