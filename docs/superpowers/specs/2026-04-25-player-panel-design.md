# Oracle of Delphi — Player Panel Redesign

**Date:** 2026-04-25
**Status:** Design
**Scope:** Replace the existing per-player BGA sidebar panel with a unified, icon-driven 240px panel that surfaces every relevant game state at a glance.

## Goal

Design a single 240px-wide player panel rendered identically for every seat (active player, opponents, spectators) that exposes the full set of strategically relevant Oracle of Delphi state — task progress, gods, dice, hand, cargo, injuries, equipment, companions — without overwhelming the user. Player panels currently exist in name only (a generic BGA sidebar slot); this spec is the first pass at a real, game-aware panel.

## Constraints

- **Width:** 240px (BGA sidebar standard).
- **Identical for all players:** the same 8 sections render for every panel, in the same order, at the same dimensions.
- **Asset reuse:** prefer existing CSS variables and icon classes from `theoracleofdelphigzed.css` (god icons, color constants, gold accents).
- **Real game palette:** elements use `--delphi-{red,yellow,green,blue,pink,black}` (`#E53935`, `#FDD835`, `#43A047`, `#1E88E5`, `#D81B60`, `#424242`).

## Reference mockup

`./.superpowers/brainstorm/50048-1777078042/content/stat-alignment.html` (Variant B — final). The brainstorm directory holds the full iteration history.

---

## Layout — eight rows, top to bottom

| # | Section | Contents | Public to all? |
|---|---------|----------|----------------|
| 1 | Header | Avatar, name, tasks counter, ★, ELO badge, device, flag, time | Yes (BGA chrome) |
| 2 | Actions | 3 oracle dice + oracle hand cards · ⚜ Favor pill (right) | Yes |
| 3 | Cargo | 🚢 + N typed slots + ship-ability badge · 🔍 Peeked pill (right) | Yes |
| 4 | Injuries | 🩹 + 6-cell color bar + total · 🛡 Shield pill (right) | Yes |
| 5 | Tasks | 4 columns × 3 vertical pips + icon | Yes |
| 6 | Pantheon | 6 vertical god tracks (no labels, no title) | Yes |
| 7 | Companions | 3 slots, color chip + subtype badge | Yes |
| 8 | Equipment | 3-4 named cards on cool-blue tint (visually separated as public) | Yes |

Stat pills (⚜, 🔍, 🛡) sit at the **right** edge of their host row, forming a visual dashboard column.

---

## Section specifications

### 1. Header — BGA chrome

```
[Avatar 40px]   playerName              📱 🇧🇪
                7/12  ★  🏆 205          0:23
```

- **Avatar:** 40×40 circular, 2px gold-deep border. Uses BGA's player avatar URL.
- **Name:** 13px bold, in `gamedatas.players[playerId].player_color` (hex prefixed with `#`).
- **Tasks counter:** small chip showing `X/12` where X = `tasks_completed` from the `player` table. Tooltip: "Tasks completed (Zeus track)".
- **Star (★):** decorative gold glyph; placeholder for future BGA glory/karma if exposed.
- **ELO badge:** laurel-style pill (`🏆 205`) bound to BGA per-game ELO.
- **Device icon (📱):** BGA-provided device hint (phone/tablet/desktop). Optional — falls back to nothing if BGA doesn't expose it.
- **Flag (🇧🇪):** country flag emoji or PNG from BGA player metadata.
- **Time:** `mm:ss` format for live games, `Nh / Nd` for async, auto-derived from BGA turn-timer state.

### 2. Actions row — dice + oracle hand + favor (right)

```
🎲 [die][die][die] | [card][card][card][card]               ⚜ 4
```

- **Oracle dice:** 3 × 18px rounded squares, background = white. Glyph centered = Oracle die symbol.
- **Spent dice:** 35% opacity. Spent state is per-turn; resets when the player rolls fresh dice at the start of their next turn (equivalent to `RoundStart` / `PlayerTurnStart` transitions).
- **Divider:** 1px dashed vertical between dice and hand cards.
- **Oracle hand:** colored 14×18px card chips, one per card in hand. Glyph = Oracle die symbol. Hand size is variable (no hard cap).
- **Favor (right):** favor icon square with number to the right, sits at the far right via `margin-left: auto`. Bound to `player.favor_tokens`.

### 3. Cargo row — slots + ship ability + peeked (right)

```
🚢 [s][o][s][s] [📦+1]                                     🔍 5
```

- **Ship icon:** 14px static glyph. Use the ship image in the img/pieces directory.
- **Cargo slots:** N × 16px slots (N = ship storage capacity, 2-4 from `MaterialDefs::SHIP_TILES[id].storage`).
  - **Empty slot:** dashed border, 60% opacity.
  - **Filled offering slot:** square (3px radius), color = element color, glyph use the offering image in the img/pieces directory.
  - **Filled statue slot:** circle (50% radius), color = element color, glyph use the statue image in the img/pieces directory.
- **Ship ability badge:** 38×18 gold-on-bronze chip with the ship tile's ability glyph + delta. Glyph mapping derived from `MaterialDefs::SHIP_TILES[id].ability`:

  | Ability | Badge content |
  |---------|---------------|
  | `shield_start` | `🛡 +2` |
  | `starting_equipment` | `📇 +1` |
  | `reverse_recolor` | `🎨 ⇄` |
  | `favor_plus_1` | `⚜ +1` |
  | `god_track_high` | `🏛 ↑` |
  | `range_plus_2` | `🚢 +2` |
  | `fewer_tasks` | `📋 −1` |
  | `recolor_discount` | `🎨 −1` |

  Tooltip on the badge shows the full description from `MaterialDefs::SHIP_TILES[id].description`. Final glyphs may be replaced by designer PNGs in a follow-up; the badge container/styling stays the same.
- **Peeked pill (right):** `<peek image> N` where N = islands the player has peeked at (any not-yet-explored shroud the player has previewed). Use the peek image in the img/pieces directory. Clickable — opens a tooltip/popup listing the actual peeked islands. Most useful for shrine planning.

### 4. Injury row — bar + shield (right)

```
🩹 [r][b][p][p][·][·]  4/6                                 🛡 2
```

- **Bar:** 6 unit-cells, ~16px tall. `display: grid` 6 equal columns.
- **Filled cell:** background = injury color, glyph = Oracle die symbol, white text-shadow.
- **Yellow cell:** dark glyph.
- **Threshold visuals:** when N consecutive cells are the same color:
  - **N = 2:** amber inset shadow (`#f0a500`) → next is forced recover.
  - **N = 3:** red inset shadow + outer red glow → must recover this turn.
- **Total:** numeric `N/6` to the right of the bar. Turns amber at 5/6, red at 6/6.
- **Shield pill (right):** `<sheild image> N`. Bound to `player.shield_value`. Use the sheild image in the player colour from the img/pieces directory.

### 5. Tasks — 4 columns

Each column is `[3 vertical pips][icon]`:

```
    Δ  🏛       r  ⚔       b  🗿       g  📦
    Λ                                  p
    Π
```

- **Pip:** 12px circle, 1.5px black border, white background.
- **Done pip (monsters/statues/offerings):** colored fill = element color completed, white ✓ glyph centered. Yellow done pip uses dark ✓.
- **Done pip (shrines):** colored fill = `--player-color`, greek letter centered (Δ/Λ/Π), the greek letters can be derived from the name of the shrine zeus tiles for the player. No ✓ for shrines — letter identity stays visible; color presence is the completion signal.
- **Empty pip (shrines):** white background with faded greek letter (`#888`).
- **Task icons (🏛/⚔/🗿/📦):** 28px circle, gold-deep border. Icons are images in this order all found in the img/pieces directory: shrine, monster, statue and offering.
- **All-3-done (bonus):** when all 3 pips are filled, the icon gets a gold glow `box-shadow: 0 0 0 2px var(--gold), 0 0 8px rgba(255,215,0,0.7)`. Same vocabulary as topped god.

### 6. Pantheon — 6 vertical god tracks

```
[🔱][☀][🏹][♥][⚔][🪽]
```

- **Order (left to right):** Poseidon, Apollo, Artemis, Aphrodite, Ares, Hermes (matches the player board layout).
- **No section title, no per-track labels.** Identity is carried by icon + color; tooltip on hover exposes the god name.
- **Track:** 100% column width × 70px tall. Gradient: gold-to-cream at top (top-row band), white below. 1px gold-deep border, 3px rounded.
- **Token (god dot):** 20px circle, 2px ink border, color = white, glyph = god image from the img/gods directory. `position: absolute; top: calc(currentRow / 6 * (trackHeight - 20px))` — top of the track is row 6 (ability unlocked).
- **Topped state (row 6):** gold ring + soft glow (matches existing `.god-cell[data-row="6"] .delphi-god-token` rule).

### 7. Companions — 3 slots

```
[♥H][🏹D][—]
```

- **3 fixed slots.** A player can hold at most 3 companions, each a different color.
- **Filled slot:** use image of companion card, 22px tall, rounded, gold-deep border.
- **Subtype badge:** small "C/D/H" letter (creature/demigod/hero) in a black-50 backdrop pill positioned bottom-right of the chip.
- **Empty slot:** dashed border, white background, 55% opacity, em-dash glyph.

Companion identity (Phoenix, Penthesilea, etc.) is exposed via tooltip — too many names to fit in 22px chips. Mapping from color × subtype → name lives in `MaterialDefs::COMPANION_NAMES` already.

### 8. Equipment — 3-4 cards (public)

```
[Island Scout] [Hermes Amulet] [Long Hook] [—]
```

- **Visually separated** from companions: 2px top border, cool-blue background tint (`rgba(70,90,140,0.08)`), navy "EQUIP" label. Signals "publicly visible to all players".
- **3 slots by default; 4 when** the player's ship tile is `starting_equipment` or any other source granted +1 equipment capacity.
- **Equipment chip:** 26px tall, parchment gradient (`#f5e6c0` → `#d4b483`), brown border, image of equipment card. Tooltip = full ability text.
- **Empty slot:** dashed outline, em-dash glyph.

---

## Data bindings

| Element | Source |
|---------|--------|
| Avatar / name / flag / device / time | BGA's `gamedatas.players[playerId]` + BGA chrome APIs |
| Tasks counter (X/12) | `player.tasks_completed`, denominator from `MaterialDefs::SHIP_TILES[id].ability === 'fewer_tasks'` (denominator = 11 if so, else 12) |
| ELO | BGA's standard player metadata (per-game ELO) |
| Oracle dice (3) | New game state field — current player's rolled dice + spent flags |
| Oracle hand | `card` table where `location='oracle_hand'` and `location_arg=playerId` |
| Favor | `player.favor_tokens` |
| Cargo slots | `card` table, items located on this player's ship (location like `cargo_<playerId>`); type from card_type |
| Ship ability | `MaterialDefs::SHIP_TILES[player.ship_tile_id]` |
| Peeked count | New tracking field (count of islands player has peeked but not yet explored) — implementation TBD |
| Shield | `player.shield_value` |
| Injury bar | `card` table where `location='injury'` and `location_arg=playerId`, grouped by color |
| Tasks (shrines/monsters/statues/offerings) | Existing per-task tracking; pip color = element color of completed sub-task |
| Pantheon (6 god rows) | `god` table, `current_row` per (player_id, god_name) |
| Companions | `card` table where `location='companion'` and `location_arg=playerId` |
| Equipment | `card` table where `location='equipment'` and `location_arg=playerId`; 4-slot capacity if `ship_tile.ability === 'starting_equipment'` |

---

## Implementation surface

Files expected to change:

- `theoracleofdelphigzed_theoracleofdelphigzed.tpl` — replace contents of `#delphi-player-board` (or wherever the per-player panel is built) with the new section markup.
- `modules/BX/js/UITrait.js` — `addPlayerPanel`, `appendPlayerPanelRow`, and `getPlayerPanelBoardElem` may need updating to emit the new structure.
- `modules/js/Components.js` — add render functions for each new section (`renderPlayerPanel(playerId, state)` plus per-section helpers: `renderActionsRow`, `renderCargoRow`, `renderInjuryRow`, `renderTasks`, `renderPantheon`, `renderCompanions`, `renderEquipment`).
- `theoracleofdelphigzed.css` — new selectors for `.delphi-player-panel-*` per section. Reuse existing CSS variables.
- `theoracleofdelphigzed.js` — wire notification handlers (`notif_*`) to update the relevant per-player section without re-rendering the whole panel.

No PHP / state-machine changes required for the panel itself. The peeked-islands count is the only new field that may need server support, and only if it isn't already trackable from existing state.

---

## Visual vocabulary

| Signal | Meaning |
|--------|---------|
| Gold ring + glow on a circular element | Unlocked / topped / completed (used for: topped god, all-3-done task icon) |
| White ✓ inside a colored pip | Individual sub-task done |
| Greek letter inside a pip | Shrine identity (Δ/Λ/Π) |
| Square slot vs. circle slot | Offering vs. statue (in cargo) |
| Color of any element | Element/god identity (red/yellow/green/blue/pink/black) |
| Amber glow / amber border | Warning — one step from a forced action (shrines: 2 same-color injuries; injuries near 5/6 total) |
| Red glow / red border | Critical — must act this turn (3 same-color injuries; 6/6 total) |
| Dashed outline + 55% opacity | Empty slot, available |
| Faded glyph | Identity hint, not yet active |

---

## Open questions

1. **Peeked islands tracking.** Is there already a server field for "islands this player has peeked but not explored"? If not, we need a new `peeked_islands` JSON column on `player` or a small helper table.
2. **Mobile/narrow viewports.** BGA scales the sidebar; do we need a min-width snap or a collapsible state below ~200px? Out of scope for this spec but worth a follow-up.

---

## Out of scope

- Animations on state changes (pip fills, dice rolls, god advances). Will inherit existing transitions where possible; net-new animations are a follow-up.
- Hover/click popups beyond what's listed (peeked islands popup is the only one explicitly required).
- Active-player highlighting (likely a colored panel border or glow when `playerId === activePlayerId` — TBD).
- Real ship-ability icons. Spec uses placeholder glyphs (📦, 🛡, ⚜, etc.); designer-supplied PNGs land in a follow-up.
