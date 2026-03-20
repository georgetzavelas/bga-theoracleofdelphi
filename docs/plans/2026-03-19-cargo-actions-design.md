# Cargo Actions Design — Load/Deliver Offerings & Statues

## Overview

Implements 4 cargo actions: Load Offering, Deliver Offering (Make Offering), Load Statue, Raise Statue. These share a common pattern: ship adjacent to target hex + matching die color + cargo capacity check.

## State Machine

| State | ID | Type | Purpose |
|-------|----|------|---------|
| LoadCargo | 34 | activeplayer | Load offering OR statue onto ship |
| DeliverCargo | 35 | activeplayer | Deliver offering OR raise statue |
| SelectReward | 39 | activeplayer | Reused — companion card selection after raising statue |

### Globals for Context

- `cargo_action_type`: `'offering'` or `'statue'` — set in SelectAction before transitioning to 34/35
- `reward_type`: `'equipment'` (combat) or `'companion'` (raise statue) — disambiguates SelectReward(39)
- `reward_color`: color filter for companion card selection

Note: `selected_die_index` (existing global) stays set until the action completes, so cancel naturally restores die state without a separate `cargo_die_index`.

### Transitions

```
SelectAction(21) → actLoadOffering/actLoadStatue → LoadCargo(34)
SelectAction(21) → actMakeOffering/actRaiseStatue → DeliverCargo(35)
LoadCargo(34) → actConfirmLoad → PlayerActions(20)
LoadCargo(34) → actCancel → SelectAction(21)
DeliverCargo(35) → actConfirmDeliver → PlayerActions(20) [offering]
DeliverCargo(35) → actConfirmDeliver → SelectReward(39) [statue]
DeliverCargo(35) → actCancel → SelectAction(21)
SelectReward(39) → actSelectReward → PlayerActions(20)
```

## PHP Validation & DB Logic

### LoadCargo (State 34)

**getArgs()** returns `validItems` — offerings or statues (based on `cargo_action_type`) that are:
1. On a hex adjacent to ship (`HexUtils::hexDistance() === 1`)
2. Matching the die color
3. Not already loaded by any player (`player_id IS NULL`)

**actConfirmLoad(int $itemId)**:
1. Validate `$itemId` is in `validItems`
2. Check cargo capacity: `getCargoCount($playerId) < getCargoCapacity($playerId)`
3. DB update: `SET player_id = $playerId WHERE id = $itemId`
4. Mark die as used
5. Notify → return to PlayerActions(20), auto-end turn if all 3 dice used

**getCargoCount()**: `COUNT(*)` from offerings + statues where `player_id = $playerId AND is_delivered = 0 AND is_raised = 0`

**getCargoCapacity()**: Base 2. Cargo Ship tile (#7) increases to 4.

### DeliverCargo (State 35)

**getArgs()** returns `deliverableItems` — items in cargo that can be delivered from current position:
1. Loaded on this player's ship (`player_id = $playerId, not yet delivered/raised`)
2. Ship is adjacent to a valid destination (matching-color temple for offering, statue island that accepts the statue's color)
3. Die color matches item color

**actConfirmDeliver(int $itemId)**:
1. Validate `$itemId` is in `deliverableItems`
2. DB update:
   - Offering: `SET is_delivered = 1, delivered_to_hex_q/r, delivered_by_player_id`
   - Statue: `SET is_raised = 1, raised_at_hex_q/r, raised_by_player_id`
3. Check and complete matching Zeus tile
4. Mark die as used
5. Award reward:
   - Offering → 3 Favor Tokens (immediate)
   - Statue → set `reward_type = 'companion'`, `reward_color = statue.color`, transition to SelectReward(39)
6. If offering (no reward state needed) → return to PlayerActions(20), auto-end turn check

### SelectReward (State 39) — Companion Card Selection

When `reward_type = 'companion'`:
- **getArgs()**: companion cards in general supply matching `reward_color`
- **actSelectReward(int $cardId)**: validate card matches color, assign to player, notify, return to PlayerActions(20)

## JS Client-Side Interaction

### State Entry — Highlighting Valid Targets

**LoadCargo (state 34):**
- `args.args` contains `{ validItems: [{id, type, hex_q, hex_r, color}], actionType }`
- Add `selectable` CSS class to each valid offering cube or statue circle
- Click handler → `bgaPerformAction('actConfirmLoad', {itemId})`
- Cancel button → `bgaPerformAction('actCancel')` returns to SelectAction

**DeliverCargo (state 35):**
- `args.args` contains `{ deliverableItems: [{id, type, color}] }`
- Highlight cargo items in ship storage as `selectable`
- Single click on cargo item → `bgaPerformAction('actConfirmDeliver', {itemId})`
- Cancel button → `bgaPerformAction('actCancel')` returns to SelectAction

**SelectReward (state 39) — companion mode:**
- `args.args` contains `{ rewardType: 'companion', availableCards: [{id, name, color}] }`
- Highlight matching companion cards in supply
- Click → `bgaPerformAction('actSelectReward', {cardId})`

## Notifications & Game Log

| Notification | Args | Log Message | JS Animation |
|-------------|------|-------------|--------------|
| `notif_loadCargo` | itemId, itemType, color, playerId | `'${player_name} loads a ${color} ${itemType}'` | Slide from board hex → ship storage |
| `notif_deliverCargo` | itemId, itemType, color, hex_q, hex_r | `'${player_name} delivers a ${color} offering'` / `'raises a ${color} statue'` | Slide from ship storage → destination hex |
| `notif_favorTokensChanged` | playerId, favor_tokens, delta | `'${player_name} receives 3 Favor Tokens'` | Update favor counter |
| `notif_taskCompleted` | playerId, tile_id | `'${player_name} completes a Zeus tile'` | Flip tile, update score (reuses existing) |
| `notif_companionSelected` | playerId, card_id, card_type_arg, subtype, color | `'${player_name} takes a ${subtype} companion'` | Card from supply → player area |

Reuses existing `notif_dieUsed` for marking oracle die as spent.

## Statue Island Color Restrictions

Each statue island accepts exactly 3 colors. Pedestal positions are fixed: E edge, SW edge, NW edge (in that order). Stored in `MaterialDefs::STATUE_ISLAND_COLORS`.

| Cluster | E | SW | NW |
|---------|---|----|----|
| cluster-7-5 | pink | blue | red |
| cluster-9-0 | green | red | yellow |
| cluster-9-1 | blue | black | yellow |
| cluster-9-2 | pink | green | yellow |
| cluster-11-1 | green | black | blue |
| cluster-11-2 | pink | black | red |

Each color appears exactly 3 times across all islands.

## Polish (Phase 6)

- Auto-select single valid cargo target: when only 1 valid item exists, skip the selection step and auto-confirm.
