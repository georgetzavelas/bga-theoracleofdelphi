# God Special Abilities Design

## Overview

Implement the 6 god special abilities that activate when a god reaches the top row (row 6) of the God Track. Abilities are free actions (no die cost), usable anytime during the action phase, and reset the god to row 0 after use. Multiple gods can be used in the same turn.

## State Machine Integration

### PlayerActions (state 20)

- `getArgs()` returns `availableGods` — list of gods at row 6 for the active player, filtered by usability (e.g., Hermes hidden if no cargo space, Ares hidden if no adjacent monsters, Artemis hidden if no unrevealed islands)
- New action: `actUseGodAbility(godName)`
  - **Simple abilities** (Aphrodite, Apollo): resolve server-side immediately, reset god to row 0, notify client, return to PlayerActions
  - **Targeting abilities** (Poseidon, Artemis, Ares, Hermes): store `active_god_ability` global, transition to UseGodAbility (state 38) for target selection, then return to PlayerActions

### UseGodAbility (state 38)

Currently an empty stub. Expand to handle target selection for 4 gods:

- `getArgs()` returns valid targets based on `active_god_ability` global
- Each god has its own action method for target confirmation
- Cancel action returns to PlayerActions without resetting the god
- After successful use: reset god to row 0, notify, return to PlayerActions

### God Reset

After any ability use, set `player_god.track_row = 0` (not player-count row). The god must climb the full track again.

## The 6 Abilities

### Simple Abilities (resolve immediately in PlayerActions)

#### 1. Aphrodite (red) — Discard All Injuries

- Delete all injury cards from player's hand
- Send notification with count of injuries discarded
- No targeting needed

#### 2. Apollo (yellow) — Dice Wild + Wild Oracle Card

Two effects:
1. **All remaining dice become wild** for the rest of the turn — set `apollo_wild_active = 1` global. While active, `getActionColor()` bypasses color restrictions (any die works for any action). Flag cleared in ConsultOracle at end of turn.
2. **Draw a wild oracle card** — draw from oracle deck, mark with `is_wild = 1` in the card table. When played, player chooses what color it acts as (color picker UI).

### Targeting Abilities (transition to UseGodAbility state 38)

#### 3. Poseidon (blue) — Teleport Ship

- Player clicks any water hex on the board
- Ship moves there instantly (no range limit, no path, no favor cost)
- JS highlights all water hexes as valid targets
- Always available if at row 6 (water hexes always exist)

#### 4. Artemis (green) — Free Island Flip

- Player clicks any unrevealed island anywhere on the board (no adjacency required)
- Triggers the normal explore island flow (flip animation, shrine placement, bonus resolution)
- Not available if all islands are already revealed
- Does not cost a die

#### 5. Ares (black) — Auto-Defeat Adjacent Monster

- Ship must be adjacent to at least one monster (validated server-side; icon hidden if not)
- Player clicks an island hex with monsters adjacent to their ship
- Monster popup appears showing available monsters
- Player selects one to auto-defeat (no combat roll)
- Normal victory rewards follow (equipment card selection, Zeus tile completion)

#### 6. Hermes (pink) — Grab Any Statue From Any City

- **Prerequisite:** Ship must be adjacent to any city tile (validated server-side; icon hidden if not)
- Player clicks any city tile on the board (not just the adjacent one)
- Statue loads onto ship from that city
- Requires cargo space (icon hidden if ship cargo full)
- Statue color matches the source city

## Client-Side UX

### God Ability Buttons in PlayerActions

- God icons rendered in the status bar using existing `img/gods/[name].png` assets
- Only shown for gods at row 6, filtered by usability conditions
- Styled as clickable buttons with subtle glow/highlight
- Tooltip on hover: ability name (e.g., "Poseidon: Teleport ship")
- Icon disappears after use (god resets to row 0)

### Targeting Mode (Poseidon, Artemis, Ares, Hermes)

- Status bar updates with instruction text (e.g., "Select a water hex to teleport to")
- Cancel button to abort and return to PlayerActions
- Board hexes highlight based on valid targets:
  - **Poseidon:** all water hexes
  - **Artemis:** all unrevealed islands
  - **Ares:** island hexes with monsters adjacent to ship
  - **Hermes:** all cities with statues

### Apollo Wild Card UX

- When playing the wild oracle card, a color picker appears (6 oracle wheel colors) for the player to choose the card's acting color
- While Apollo is active, dice on the oracle wheel show a rainbow/shimmer effect to indicate "wild"

### Notifications

- `notif_godAbilityUsed` — animates god icon usage, log message describing the ability
- `notif_godReset` — animates god token sliding back to row 0 on the track

## Data Changes

### Database

- Add `is_wild` column to the card table: `TINYINT(1) NOT NULL DEFAULT 0`
- Marks Apollo's drawn oracle card as playable for any color

### Globals

| Global | Type | Purpose | Lifecycle |
|--------|------|---------|-----------|
| `apollo_wild_active` | 0/1 | Dice become wild for rest of turn | Set on Apollo use, cleared in ConsultOracle |
| `active_god_ability` | string | Which god ability is being targeted | Set on targeting ability start, cleared after resolution |

### No New Tables

Existing `player_god` table and globals handle all state.

## Edge Cases

- **Apollo + oracle card:** If Apollo is active (dice wild) AND player plays the wild oracle card, card color choice is redundant but functions normally
- **Hermes cargo full:** Don't show icon if no cargo space
- **Ares no adjacent monsters:** Don't show icon if no monsters adjacent to ship
- **Artemis no unrevealed islands:** Don't show icon if all islands revealed
- **Poseidon:** Always available at row 6
- **Multiple abilities same turn:** Each god resolves and resets independently
- **God reset row:** Goes to row 0 (not player-count row)
