# Combat (Fight Monster) — Design Document

## Rules Summary

- Player must be **adjacent** to monster's island hex (ship on water, monster on land)
- Monster color must match selected oracle die color
- Monster starts with **strength 9 minus player's shield value**
- Each round: roll battle die (0-9)
  - Roll >= strength → **Victory** (defeat monster)
  - Roll < strength → **Lost round**
  - Roll == 0 → draw 1 injury card
- After losing: pay 1 Favor Token → reduce strength by 1, fight again
- Or surrender (no penalty)
- Monster strength resets between separate fights

## Rewards on Victory

- Choose 1 equipment card from 6-card display
- Mark matching Zeus tile as complete (remove from player board)
- Place monster token on player board

## State Flow

```
SelectAction (actFightMonster — only shown if fightable monsters exist)
  → FightMonsterStart [GAME, id:31]
      - Validate: adjacent, color match, not defeated
      - Store globals: combat_monster_id, combat_strength (9 - shield)
      - Mark die as used, send dieUsed notification
      - Notify combatStart
      → CombatRound [ACTIVE_PLAYER, id:32]
          - "Roll Battle Die" button
          - actRollDie → server rolls (bga_rand 0-9), stores combat_roll
          - Notify battleDieRolled → animate 3D die
          → CombatResult [GAME, id:33]
              - Roll >= strength → CombatVictory
              - Roll < strength:
                  - If roll == 0 → draw injury, notify combatInjury
                  → CombatDefeat [ACTIVE_PLAYER, id:34]
                      - "Pay 1 Favor" / "Surrender" buttons
                      - actPayFavor → strength--, notify combatContinue → CombatRound
                      - actSurrender → clear globals → PlayerActions or ConsultOracle

CombatVictory [ACTIVE_PLAYER, id:35]
  - Mark monster defeated, remove Zeus tile
  - Notify monsterDefeated
  - Show equipment display for selection
  - actSelectEquipment(card_id) → card to player → PlayerActions or ConsultOracle
```

## Globals

| Global | Type | Purpose |
|--------|------|---------|
| `combat_monster_id` | int | Monster being fought |
| `combat_strength` | int | Current monster strength (decreases each round) |
| `combat_roll` | int | Last battle die result |

## Adjacency Check (SelectAction gating)

- Get player ship position (q, r)
- Get undefeated monsters from DB
- Filter: hex_distance(ship, monster) == 1 AND monster.color == die color
- Return as `fightableMonsters` in SelectAction args
- "Fight Monster" button only shown if list is non-empty

## Notifications

| Notification | Data | Client Action |
|---|---|---|
| `combatStart` | monster_id, monster_type, color, strength | Show combat panel |
| `battleDieRolled` | roll, strength | Animate 3D battle die |
| `combatInjury` | color | Add injury card to hand |
| `combatContinue` | new_strength, favor_remaining | Update strength display |
| `monsterDefeated` | monster_id, player_id | Remove from board, place on player board |
| `equipmentSelected` | card_id, player_id | Move card from display to player |

## Client-Side UI

- **CombatRound**: Combat info panel showing monster name, strength, "Roll Battle Die" button
- **CombatDefeat**: Result text, "Pay 1 Favor (continue)" / "Surrender" buttons; Favor button disabled if 0 tokens
- **CombatVictory**: Victory text, highlight 6 equipment cards, player clicks one
- Reuses existing `combat-battle-die` container and `components.rollBattleDie()` for 3D die animation

## Files to Modify/Create

### PHP States (modify existing scaffolds)
- `FightMonsterStart.php` — adjacency validation, combat init
- `CombatRound.php` — actRollDie with bga_rand
- `CombatResult.php` — evaluate roll vs strength, branch
- `CombatDefeat.php` — new state (id:34), pay favor or surrender
- `CombatVictory.php` — new state (id:35), equipment selection

### PHP Shared
- `SelectAction.php` — add fightableMonsters to getArgs, add actFightMonster

### Client JS
- `theoracleofdelphigzed.js` — combat state handlers, notification handlers, equipment selection UI
