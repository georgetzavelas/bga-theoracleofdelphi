# BGA Game State Persistence Guide

## 🚨 CRITICAL CONCEPT

**All game state MUST be persisted to the database.**

Local variables and instance properties are **ONLY** for temporary computation within a single request. They do NOT persist between requests or page refreshes.

---

## How BGA State Works

### What Happens on Page Refresh

```
1. Player clicks "Refresh" in browser
   ↓
2. Browser makes NEW request to server
   ↓
3. PHP creates NEW instance of game class
   ↓
4. getAllDatas() is called
   ↓
5. Complete game state loaded from DATABASE
   ↓
6. State sent to browser as JSON
   ↓
7. JavaScript rebuilds entire UI from this data
```

**Key Point**: Every instance variable is LOST. Only database persists.

---

## State Storage Locations

### ✅ Persistent Storage (Survives Refresh)

#### 1. Database Tables
**Primary storage for all game state**

```php
// Player state
$location = $this->getUniqueValueFromDB(
    "SELECT player_ship_location FROM player WHERE player_id = $playerId"
);

// Components
$monsters = $this->getObjectListFromDB(
    "SELECT * FROM components WHERE component_type = 'monster'"
);

// Cards
$hand = $this->getObjectListFromDB(
    "SELECT * FROM cards WHERE player_id = $playerId AND card_location = 'hand'"
);
```

#### 2. Globals (Modern API)
**For global game state and temporary multi-step state**

```php
// Set (auto-serializes any type)
$this->globals->set('combat_state', [
    'player_id' => 42,
    'monster_color' => 'red',
    'rounds' => 2
]);

// Get (survives refresh!)
$combatState = $this->globals->get('combat_state', null);

// Delete when done
$this->globals->delete('combat_state');
```

#### 3. Table Options
**Read-only after game start (from gameoptions.json)**

```php
$gameMode = $this->tableOptions->get(100); // First Game / Standard
$shipSelection = $this->tableOptions->get(101); // Random / Draft
```

### ❌ Temporary Storage (LOST on Refresh)

#### Instance Variables
```php
class MyGame extends Table {
    private $currentLocation; // ❌ LOST on refresh!
    private $playerStates = []; // ❌ LOST on refresh!

    // These variables exist ONLY during single request
    // New request = new instance = variables reset
}
```

#### Static Variables
```php
class MyGame extends Table {
    private static $gameCache = []; // ❌ VERY BAD!
    // Static variables are shared across ALL games on the server!
    // NEVER use static for game-specific state!
}
```

#### Local Variables
```php
public function someAction() {
    $temp = $this->loadSomeData(); // ✅ OK for computation
    // ... process ...
    // Lost when method returns, but that's fine
}
```

---

## The getAllDatas() Method

**Most Important Method for State Persistence**

This method reconstructs the ENTIRE game state from the database. It's called:
- When player first loads the game
- When player refreshes the page
- When player reconnects after disconnect
- When player switches tabs and comes back

### Complete Example

See [GameStateManager.php](code-examples/php/GameStateManager.php) for full implementation.

**Key Structure**:

```php
protected function getAllDatas(): array {
    $result = [];

    // 1. Load players (with extended data)
    $result['players'] = $this->loadPlayersBasicInfos();
    // Add ship location, shield, favor tokens, etc.

    // 2. Load globals
    $result['gameGlobals'] = [
        'currentRound' => $this->globals->get('currentRound', 1),
        'titanStrength' => $this->globals->get('titanStrength', 0),
        // ...
    ];

    // 3. Load board
    $result['board'] = [
        'spaces' => $this->getObjectListFromDB("SELECT * FROM board_spaces"),
        'islands' => $this->getObjectListFromDB("SELECT * FROM island_tiles"),
        // ...
    ];

    // 4. Load components
    $result['components'] = $this->getObjectListFromDB("SELECT * FROM components");

    // 5. Load oracle dice
    // 6. Load gods
    // 7. Load zeus tiles
    // 8. Load cards (public + private)
    // 9. Load active combat state (if any)
    // 10. Load game options

    return $result; // Complete state!
}
```

---

## Proper Action Pattern

### ✅ CORRECT: Load → Compute → Save → Notify

```php
public function moveShip(int $playerId, int $targetSpaceId): void {
    // 1. LOAD current state from database
    $currentLocation = $this->getUniqueValueFromDB(
        "SELECT player_ship_location FROM player WHERE player_id = $playerId"
    );

    $favorTokens = $this->getUniqueValueFromDB(
        "SELECT player_favor_tokens FROM player WHERE player_id = $playerId"
    );

    // 2. VALIDATE using loaded state
    if (!$this->isValidMove($playerId, $currentLocation, $targetSpaceId)) {
        throw new BgaUserException("Invalid move");
    }

    // 3. SAVE changes to database
    $this->DbQuery(
        "UPDATE player
         SET player_ship_location = $targetSpaceId
         WHERE player_id = $playerId"
    );

    // 4. NOTIFY all clients
    $this->notify->all('shipMoved', '', [
        'player_id' => $playerId,
        'to_space' => $targetSpaceId
    ]);

    // 5. UPDATE statistics
    $this->incStat(1, 'ship_spaces_moved', $playerId);

    // NO instance variables used!
    // If player refreshes now, getAllDatas() loads new position.
}
```

### ❌ INCORRECT: Using Instance Variables

```php
class MyGame extends Table {
    private $shipLocations = []; // ❌ Will be lost!

    public function moveShip_WRONG(int $playerId, int $targetSpaceId): void {
        // ❌ BAD: Store in instance variable
        $this->shipLocations[$playerId] = $targetSpaceId;

        // ❌ BAD: Not saved to database
        // When player refreshes, this is LOST!

        // What happens:
        // 1. Player moves ship
        // 2. Instance variable updated
        // 3. Player refreshes browser
        // 4. NEW PHP instance created
        // 5. $this->shipLocations is empty!
        // 6. Ship appears at old location
        // 7. Player is confused and angry
    }
}
```

---

## Multi-Step Actions

For actions that span multiple requests (like monster combat), use **globals**:

```php
// Step 1: Start combat
public function startCombat(int $playerId, string $monsterColor): void {
    $shield = $this->getUniqueValueFromDB(
        "SELECT player_shield_strength FROM player WHERE player_id = $playerId"
    );

    // Store in GLOBALS (persists between requests)
    $this->globals->set('combat_state', [
        'player_id' => $playerId,
        'monster_color' => $monsterColor,
        'monster_strength' => 9 - $shield,
        'rounds' => 0
    ]);

    // Player can refresh here and combat state remains!
}

// Step 2: Continue combat (might be after refresh)
public function continueCombat(int $playerId, int $roll): void {
    // LOAD from globals (even if player refreshed)
    $combatState = $this->globals->get('combat_state', null);

    if (!$combatState) {
        throw new BgaUserException("No active combat");
    }

    // Process...
    if ($roll >= $combatState['monster_strength']) {
        // Victory! Clean up
        $this->globals->delete('combat_state');
        $this->completeVictory($playerId, $combatState['monster_color']);
    } else {
        // Update and save for next round
        $combatState['rounds']++;
        $this->globals->set('combat_state', $combatState);
    }
}
```

---

## Frontend State Reconstruction

When browser receives data from `getAllDatas()`, JavaScript must rebuild UI:

```javascript
setup: function(gamedatas) {
    console.log('Setting up game from state:', gamedatas);

    // Rebuild board from state
    this.boardManager.setup(gamedatas.board);

    // Place all ships at their current locations
    for (const playerId in gamedatas.players) {
        const player = gamedatas.players[playerId];
        this.placeShip(playerId, player.player_ship_location);
    }

    // Place all components
    for (const component of gamedatas.components) {
        this.placeComponent(component);
    }

    // Setup oracle dice
    for (const playerId in gamedatas.oracleDice) {
        this.oracleManager.placeDice(
            playerId,
            gamedatas.oracleDice[playerId]
        );
    }

    // Restore combat UI if active
    if (gamedatas.activeCombat) {
        this.showCombatUI(gamedatas.activeCombat);
    }

    // Everything rebuilt from database state!
}
```

---

## Testing State Persistence

### Manual Testing

**Test EVERY feature with these steps:**

1. Perform action (e.g., move ship)
2. **Immediately refresh browser (F5)**
3. Verify action persisted correctly
4. Repeat for EVERY action type

If anything doesn't persist, you forgot to save to database!

### Automated Testing Pattern

```php
public function testStatePersistence() {
    // 1. Perform action
    $this->moveShip(42, 100);

    // 2. Simulate refresh by calling getAllDatas
    $state = $this->getAllDatas();

    // 3. Verify state is correct
    $this->assertEquals(100, $state['players'][42]['player_ship_location']);
}
```

### Debug Helper

Add to your game class during development:

```php
protected function debugVerifyPersistence() {
    if ($this->getBgaEnvironment() == 'studio') {
        // Reload state as if player refreshed
        $freshState = $this->getAllDatas();

        // Log it
        $this->dump('debug', 'State after refresh: ' . json_encode($freshState));

        // Can add assertions here to catch issues
    }
}

// Call after critical actions during development
public function moveShip($playerId, $targetSpaceId) {
    // ... normal code ...
    $this->debugVerifyPersistence(); // Verify it would survive refresh
}
```

---

## Common Mistakes

### ❌ Mistake #1: Caching Database Queries

```php
class MyGame extends Table {
    private $cachedPlayers; // ❌ BAD!

    public function getPlayers() {
        if (!$this->cachedPlayers) {
            $this->cachedPlayers = $this->loadPlayersBasicInfos();
        }
        return $this->cachedPlayers;
    }

    // Problem: Cache lost on refresh, but worse:
    // Cache not updated when player data changes!
}
```

**Fix**: Just query database each time. It's fast!

```php
public function getPlayers() {
    return $this->loadPlayersBasicInfos(); // ✅ Always fresh
}
```

### ❌ Mistake #2: State in State Machine Arguments

```php
// State machine definition
'playerAction' => [
    'type' => 'activeplayer',
    'args' => 'argPlayerAction'
],

// ❌ BAD: Trying to pass state through args
function argPlayerAction() {
    return [
        'shipLocation' => $this->currentLocation // ❌ Instance var!
    ];
}

// ✅ GOOD: Load from database
function argPlayerAction() {
    $playerId = $this->getActivePlayerId();
    return [
        'shipLocation' => $this->getUniqueValueFromDB(
            "SELECT player_ship_location FROM player WHERE player_id = $playerId"
        )
    ];
}
```

### ❌ Mistake #3: Forgetting to Update Database

```php
public function takeFavorToken($playerId) {
    // ❌ Only updates notification, not database!
    $this->notify->player($playerId, 'favorGained', '', [
        'favor' => 1
    ]);

    // ✅ Must update database!
    $this->DbQuery(
        "UPDATE player
         SET player_favor_tokens = player_favor_tokens + 1
         WHERE player_id = $playerId"
    );
}
```

---

## Best Practices Checklist

### ✅ DO:
1. **Load all state from database** at start of every method
2. **Save all changes to database** immediately
3. **Use globals** for temporary multi-step state
4. **Make getAllDatas() complete** - must reconstruct entire game
5. **Test with frequent refreshes** during development
6. **Query database liberally** - it's fast, don't cache
7. **Notify clients** after every state change
8. **Use transactions** for multi-table updates

### ❌ DON'T:
1. **Store game state in instance variables**
2. **Use static variables** for game-specific data
3. **Cache database queries** in memory
4. **Assume any PHP state persists** between requests
5. **Forget to test with browser refresh**
6. **Pass state through method calls** - reload from DB instead
7. **Trust client-side state** - always verify server-side
8. **Skip database updates** thinking "I'll do it later"

---

## Summary

**Golden Rule**: If it's important, it's in the database.

**Testing Rule**: If it doesn't survive a browser refresh, it's broken.

**Development Rule**: Refresh your browser after EVERY action you implement.

**Reference**: See [GameStateManager.php](code-examples/php/GameStateManager.php) for complete example.

---

## Quick Reference

### State Storage Decision Tree

```
Need to store data?
├─ Is it game state that must persist?
│  ├─ YES → Store in database table
│  │  └─ Player-specific? → player table
│  │  └─ Game component? → components table
│  │  └─ Cards? → cards table
│  │  └─ Temporary multi-step? → globals
│  │
│  └─ NO → Can use local variable
│     └─ Just for computation in this method? → local var OK
│
└─ Is it configuration?
   └─ Game options? → table_options (via gameoptions.json)
   └─ User preference? → player preferences (via gamepreferences.json)
```

### When in Doubt

**Ask yourself**: "If the player refreshes their browser right now, will this data still be there?"

- If NO → You forgot to save to database!
- If YES → You're doing it right! ✅
