# Equipment Cards — Batch 1: Shared Infrastructure + Canary Cards

**Date:** 2026-04-19
**Status:** Design
**Scope:** Shared infrastructure for all 22 equipment cards, plus 5 canary card implementations (one per effect archetype).

## Goal

Land the server/client/schema scaffolding every equipment card will use, and prove it works by shipping one fully playable card from each of the five effect archetypes. Subsequent batches (2–5) implement the remaining 17 cards without further infrastructure work.

## Background

Equipment cards are defined in `MaterialDefs::EQUIPMENT_CARDS` (22 entries, ids 0–21) and grouped into five effect archetypes per `misc/equipment-cards.md`:

| Archetype | Cards | Behavior |
|-----------|-------|----------|
| Passive modifier | 008, 014, 015, 016(storage half) | Read in an existing handler; no UI |
| Triggered reaction | 000, 001, 002, 011 | Synchronous check in an existing state's `onEnteringState` |
| Activated, inline | 003, 004–006, 009–012, 016(shield half), 021 | Click card → effect resolves without sub-selection |
| Activated, sub-selection | 013, 017–020 | Click card → transition to sub-state → confirm choice |
| Activated, one-time lifetime | 007, 013, 016(shield half), 017–021 | Overlaps above; "one-time" means `is_used` flag is permanent, not per-turn |

"Activated" rows above are not mutually exclusive — 017 is both sub-selection and one-time-lifetime.

Today equipment cards render but are not clickable, and there is no mechanism to mark a card as permanently used. This batch adds both.

## Decisions

Each decision below has two to three alternatives considered and rejected; see the corresponding "Rejected alternatives" entry.

### D1. Exhaustion tracking: `is_used` column on `card` table
Add `is_used TINYINT UNSIGNED NOT NULL DEFAULT 0` to the `card` table. Set to `1` when a one-time lifetime card activates; never reset. Only equipment cards consult this column.

"Once per turn" tracking (card 003) uses a turn-scoped global instead — see D4.

**Rejected:** (a) side-table keyed by `(player_id, card_id)` — extra join, extra writes, no benefit; (b) moving exhausted cards to a `used` location_arg — overloads the location semantics already used for hand/discard/played.

### D2. Activation dispatch: single `actActivateEquipment($cardId)` on `SelectAction`, with targeted shared sub-states
One entry point on the existing `SelectAction` state switches by `card_type_arg`:
- Inline effects resolve and return `SelectAction::class`.
- Sub-selection effects transition to a dedicated sub-state.

Sub-states are shared across mirror cards where possible (017+018 will share `SelectOfferingFromAnyIsland`; 019+020 will share `SelectStatueFromAnyCity` in a later batch).

**Rejected:** (a) generic `ActivateEquipment` state branching over 22 cards — 500+ line god-state; (b) 22 separate `act*` methods — noisy and unnecessarily rigid.

### D3. Reaction hooks: per-state inline checks (Hero pattern)
`ConsultOracle::onEnteringState` checks for owned reaction equipment (000/001/002) after dice roll. `SelectReward::onEnteringState` (or equivalent) handles 011 when a future batch lands it. Each call uses `Game::playerOwnsEquipment($pid, $cardTypeArg)` analogous to `playerOwnsCompanion`.

**Rejected:** (a) central event dispatcher — premature abstraction for 4 reaction cards; (b) `EquipmentReactions` helper class — adds a layer without reducing churn.

### D4. Once-per-turn tracking: new global, reset in `NextPlayer`
Card 003 (bonus action for 3 favor) uses a new global `equipment_bonus_action_used`, mirroring the existing `oracle_card_played`. `NextPlayer::onEnteringState` (or wherever per-turn globals are cleared today) resets it to 0.

**Rejected:** reusing `is_used` column — conflates per-turn and lifetime semantics.

### D5. Batch-1 canaries: one per archetype (5 cards)
| Archetype | Canary | Integration point |
|-----------|--------|-------------------|
| Passive | **008** ship range +1 | `MoveShip::getMovementRange()` |
| Triggered reaction | **000** yellow die on Consult → 2 favor | `ConsultOracle::onEnteringState` |
| Activated inline, once-per-turn | **003** 3 favor → bonus action | `actActivateEquipment` + `equipment_bonus_action_used` |
| Activated inline, one-time lifetime | **007** 3 favor + 1 oracle + 2 god steps | `actActivateEquipment` + existing god-pick sub-state + `is_used=1` |
| Activated sub-selection, one-time lifetime | **017** take red/green/yellow offering from any island | new `SelectOfferingFromAnyIsland` state + `is_used=1` |

## Architecture

### Schema
`dbmodel.sql`:
```sql
ALTER TABLE `card` ADD COLUMN `is_used` TINYINT UNSIGNED NOT NULL DEFAULT 0;
```
For dev (pre-release), this is added via the existing `ensurePlayerColumns()` dev workaround. Pre-release cleanup (Phase 6 item) folds it into the base `CREATE TABLE`.

### PHP

**`MaterialDefs`**
- Add `EQUIPMENT_NAMES` constant: map of `card_type_arg → short display name` for log messages (e.g., 008 → "Quadrireme"). Names sourced from BGA card art.

**`Game` (or suitable helper module)**
- `equipmentName(int $cardTypeArg): string` — mirrors `companionName`.
- `playerOwnsEquipment(int $pid, int $cardTypeArg, bool $unusedOnly = true): bool` — queries `card` table: `card_type='equipment' AND card_type_arg=? AND card_location='hand' AND card_location_arg=?` (and optionally `is_used=0`).

**`SelectAction`**
- `getArgs` adds `activatableEquipment`: array of `{card_id, card_type_arg}` for cards the player can click *right now* (accounts for favor, turn state, `is_used`, game-state preconditions).
- `#[PossibleAction] actActivateEquipment(int $cardId, int $activePlayerId)`:
  1. Load the card row; assert it belongs to `$activePlayerId`, is `card_type='equipment'`, and passes per-card preconditions.
  2. Switch by `card_type_arg`:
     - **003:** require `equipment_bonus_action_used=0` and `favor >= 3`; spend 3 favor; set flag; increment action budget (same mechanism as granting a normal action source); notify `equipmentActivated`; return `SelectAction::class`.
     - **007:** require `is_used=0`; grant 3 favor, draw 1 oracle card; set `is_used=1`; notify `equipmentActivated` + `equipmentUsed`; transition to the existing god-advance sub-state with a context flag `{source: 'equipment-7', budget: 2, min_gods: 1, max_gods: 2}` — that state returns to `SelectAction` when done. Free activation (does not consume a die/action-source).
     - **017:** require `is_used=0`; transition to `SelectOfferingFromAnyIsland::class` with args `{card_id, color_options: [red, green, yellow]}`. `is_used` flip happens in the sub-state on confirm. Free activation.

**`ConsultOracle::onEnteringState`**
- After dice are rolled, for each of cards 000/001/002 the active player owns, check whether any rolled die matches the card's color; if so, grant 2 favor and notify `equipmentReactionTriggered` with `{player_id, card_id, equipment_name, favor_delta: 2}`.

**`MoveShip::getMovementRange`**
- `if (playerOwnsEquipment($pid, 8)) $range += 1;` at the same spot other ship-tile range modifiers live.

**`SelectOfferingFromAnyIsland`** (new state class, ~80 lines)
- `onEnteringState`: no side effects.
- `getArgs`: returns `{card_id, islands: [{island_id, offerings_available: [{color, count}]}], color_options}`.
- `#[PossibleAction] actConfirmOffering(int $cardId, int $islandId, string $color)`:
  - Validate island has that color offering, color is in `color_options`, card is still in hand with `is_used=0`.
  - Transfer the offering token from island to the player's ship storage.
  - `is_used=1`; notify `equipmentUsed`; return `SelectAction::class`.
- `zombie()`: auto-pick first available and confirm.

### Client

**`Components.js`**
- `addEquipmentCard`: attach `click` + `keydown(Enter/Space)` listeners that call `gameModule.onEquipmentCardClick(cardId)`.
- Apply `.used` class when the card's `is_used=1`, `.activatable` when present in `gamestate.args.activatableEquipment`.

**`theoracleofdelphigzed.js`**
- `onEquipmentCardClick(cardId)`:
  - If current state exposes `activatableEquipment` and contains this id → `bgaPerformAction('actActivateEquipment', {card_id: cardId})`.
  - Otherwise no-op with a brief shake animation on the card (reuse the existing disabled-action feedback pattern).
- `onUpdateActionButtons`: no new buttons needed for batch 1 canaries; activation flows through card clicks.
- In `setupHandCardsFromGamedata`: read `is_used` and apply `.used` class on reload.
- Notification handlers:
  - `notif_equipmentActivated({player_id, card_id, equipment_name})`: log only.
  - `notif_equipmentReactionTriggered({player_id, card_id, equipment_name, favor_delta})`: log + update favor counter + brief card pulse.
  - `notif_equipmentUsed({player_id, card_id})`: set `.used` class on the card element.

**CSS (`theoracleofdelphigzed.css`)**
- `.delphi-equipment-card.used { filter: grayscale(1) opacity(0.5); cursor: default; }`
- `.delphi-equipment-card.activatable { cursor: pointer; box-shadow: 0 0 8px 2px var(--activatable-glow); }` — reuse the `.oracle-card.playable` glow variable.
- Optional hover-scale on `.activatable` matching oracle card conventions.

### `getAllDatas()` additions
Already returns player `hand`. Extend each equipment-card entry to include `is_used`. Extend the top-level gamestate args already returned for `SelectAction` to include `activatableEquipment` (no separate top-level key needed).

### Tooltips
Add a plain `title` attribute to `.delphi-equipment-card` elements containing the card's effect text from `MaterialDefs::EQUIPMENT_CARDS[cardTypeArg].ability`. Full tooltip system remains a separate Phase 6 item.

### DevTools
Add `DevTools::giveEquipment(int $cardTypeArg)`: move a card of that type from the equipment deck to the active player's hand, drawing a fresh card into the display to refill. Used to seed canaries for manual testing and reused by batches 2–5.

## Data Flow

### Activation (inline, card 003)
1. JS: user clicks equipment card 003 → `onEquipmentCardClick(cardId)`.
2. JS → Server: `actActivateEquipment({card_id})`.
3. PHP: `SelectAction::actActivateEquipment` dispatches to card-003 branch → spends favor, flips `equipment_bonus_action_used`, grants an action source, emits `equipmentActivated`.
4. Server → JS: notif `equipmentActivated`.
5. PHP returns `SelectAction::class` — player stays in the same state with +1 action source.

### Activation (sub-selection, card 017)
1. JS click → `actActivateEquipment({card_id: 017-row-id})`.
2. PHP: dispatches to 017 branch → transitions to `SelectOfferingFromAnyIsland::class` with args.
3. JS: renders island picker from `getArgs`.
4. JS: user confirms → `actConfirmOffering({card_id, island_id, color})`.
5. PHP: transfers token, sets `is_used=1`, emits `equipmentActivated` + `equipmentUsed`, returns `SelectAction::class`.
6. JS applies `.used` class on notif.

### Reaction (card 000)
1. Player enters `ConsultOracle` → dice rolled.
2. `onEnteringState` checks each owned reaction card after roll; for 000, if any die is yellow, grants 2 favor + emits `equipmentReactionTriggered`.
3. JS logs and updates favor counter.

### Passive (card 008)
No new data flow — `MoveShip::getMovementRange` reads ownership at each call site.

## Testing

- DevTools buttons to seed canary cards to the active player.
- Manual exercise of each canary through the affected state (move, consult, select action, god-advance, island-offering pick).
- Reload page mid-turn after activating 003 → `equipment_bonus_action_used` survives, card stays unhighlighted but in hand.
- Reload page after activating 007 or 017 → `.used` class re-applies.

## Risks

- **Action-source semantics for card 003.** 003 is the only canary that *grants* an action; the existing action-budget model must accept externally-granted actions. If action-availability is derived from turn state rather than a counter, a small refactor is needed. Verify during implementation; not a blocker.
- **God-advance sub-state reuse for card 007.** Card 007 grants "1 or 2 gods, 2 steps total" — the existing god-advance flow is per-action and advances 1 god by 1. The sub-state will need a `budget` arg and a "confirm before returning" button. Covered by existing god-pick code path; extension is additive.
- **Free-activation turn-boundary.** 007, 013, 016-shield, 017–021 do not consume an action source, but they can still only be activated during the active player's turn. Dispatcher must check that the current sub-state of `SelectAction` allows free activations (not mid-action-resolution).
- **Name sourcing for `EQUIPMENT_NAMES`.** If card art doesn't name every equipment, use descriptive names (e.g., "Range Charm"). Non-blocking.

## Out of scope

- Cards 001, 002, 004–006, 009–016, 018–021 — deferred to batches 2–5.
- Full tooltip system — remains Phase 6 item.
- Statistics tracking per activation — remains Phase 6 item.
- Migration of `is_used` column into base `CREATE TABLE` — covered by the pre-release DB-cleanup item.

## Follow-up batches (for reference, not part of this spec)

- **Batch 2 — Passive + storage + injury threshold:** 014, 015, 016.
- **Batch 3 — Remaining reaction + god-coupled rewards:** 001, 002, 011.
- **Batch 4 — Alt-action die cards + range-by-1:** 004, 005, 006, 009, 010, 012.
- **Batch 5 — Remaining one-time + advance to top:** 013, 018, 019, 020, 021.

Each batch reuses the infrastructure landed here and adds ~0 new schema/state-class churn.
