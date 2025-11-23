<?php

/**
 * Game State Manager
 *
 * CRITICAL CONCEPT: All game state must be persisted to the database.
 * Local variables are ONLY for temporary computation within a single request.
 *
 * When a player refreshes their browser:
 * - PHP creates a NEW instance of the game class
 * - getAllDatas() is called to reconstruct the ENTIRE game state from database
 * - Frontend receives this state and rebuilds the UI
 *
 * NEVER rely on instance variables persisting between requests!
 */
class GameStateManager {

    /**
     * Get all game data for client (called on page load/refresh)
     * This is the PRIMARY method for state reconstruction
     *
     * IMPORTANT: This method is called:
     * - When player first loads the game
     * - When player refreshes the page
     * - When player reconnects after disconnect
     *
     * It must return the COMPLETE game state from database ONLY.
     */
    protected function getAllDatas(): array {
        $result = [];

        // Get current player ID (safe even if not logged in)
        $currentPlayerId = $this->getCurrentPlayerId();

        /**
         * 1. LOAD PLAYERS STATE
         * All player data from extended player table
         */
        $result['players'] = $this->loadPlayersBasicInfos();

        // Add extended player data
        $sql = "SELECT player_id, player_ship_location, player_shield_strength,
                       player_favor_tokens, player_ship_tile_id, player_has_titan_die
                FROM player";
        $playerData = $this->getCollectionFromDb($sql);

        foreach ($result['players'] as $playerId => $player) {
            $result['players'][$playerId] = array_merge(
                $player,
                $playerData[$playerId]
            );
        }

        /**
         * 2. LOAD GLOBALS STATE
         * Using modern globals API (supports any type)
         */
        $result['gameGlobals'] = [
            'currentRound' => $this->globals->get('currentRound', 1),
            'titanStrength' => $this->globals->get('titanStrength', 0),
            'firstGameMode' => $this->globals->get('firstGameMode', false),
            'boardLayout' => $this->globals->get('boardLayout', []),
            'activePhase' => $this->globals->get('activePhase', 'injury_check')
        ];

        /**
         * 3. LOAD BOARD STATE
         * Complete board structure (spaces, adjacency)
         */
        $result['board'] = [
            'spaces' => $this->getObjectListFromDB("SELECT * FROM board_spaces"),
            'islands' => $this->getObjectListFromDB("SELECT * FROM island_tiles"),
            'adjacency' => $this->globals->get('boardAdjacency', [])
        ];

        /**
         * 4. LOAD COMPONENTS STATE
         * All game components (offerings, statues, monsters, shrines)
         */
        $result['components'] = $this->getObjectListFromDB(
            "SELECT * FROM components ORDER BY component_type, component_color"
        );

        /**
         * 5. LOAD ORACLE DICE
         * Current state of all players' dice
         */
        $result['oracleDice'] = [];
        $allDice = $this->getObjectListFromDB("SELECT * FROM oracle_dice");
        foreach ($allDice as $die) {
            if (!isset($result['oracleDice'][$die['player_id']])) {
                $result['oracleDice'][$die['player_id']] = [];
            }
            $result['oracleDice'][$die['player_id']][] = $die;
        }

        /**
         * 6. LOAD GODS
         * All gods for all players
         */
        $result['gods'] = [];
        $allGods = $this->getObjectListFromDB("SELECT * FROM gods");
        foreach ($allGods as $god) {
            if (!isset($result['gods'][$god['player_id']])) {
                $result['gods'][$god['player_id']] = [];
            }
            $result['gods'][$god['player_id']][] = $god;
        }

        /**
         * 7. LOAD ZEUS TILES
         * Task tracking for all players
         */
        $result['zeusTiles'] = [];
        $allTiles = $this->getObjectListFromDB("SELECT * FROM zeus_tiles");
        foreach ($allTiles as $tile) {
            if (!isset($result['zeusTiles'][$tile['player_id']])) {
                $result['zeusTiles'][$tile['player_id']] = [];
            }
            $result['zeusTiles'][$tile['player_id']][] = $tile;
        }

        /**
         * 8. LOAD CARDS
         * All cards (injury, oracle, equipment, companion)
         *
         * IMPORTANT: Only send to each player their own cards + public information
         */
        // Public cards (display, discard)
        $result['cardsPublic'] = [
            'equipmentDisplay' => $this->getObjectListFromDB(
                "SELECT * FROM cards
                 WHERE card_type = 'equipment' AND card_location = 'display'"
            ),
            'injuryDiscard' => $this->getUniqueValueFromDB(
                "SELECT COUNT(*) FROM cards
                 WHERE card_type = 'injury' AND card_location = 'discard'"
            ),
            'oracleDiscard' => $this->getUniqueValueFromDB(
                "SELECT COUNT(*) FROM cards
                 WHERE card_type = 'oracle' AND card_location = 'discard'"
            )
        ];

        // Private cards (only for current player)
        if ($currentPlayerId) {
            $result['cardsPrivate'] = [
                'hand' => $this->getObjectListFromDB(
                    "SELECT * FROM cards
                     WHERE player_id = $currentPlayerId
                     AND card_location = 'hand'"
                ),
                'active' => $this->getObjectListFromDB(
                    "SELECT * FROM cards
                     WHERE player_id = $currentPlayerId
                     AND card_location = 'active'"
                )
            ];
        }

        /**
         * 9. LOAD COMBAT STATE (if active)
         * Using globals for temporary state during combat
         */
        $combatState = $this->globals->get('combat_state', null);
        if ($combatState) {
            // Only send to player in combat
            if ($currentPlayerId == $combatState['player_id']) {
                $result['activeCombat'] = $combatState;
            }
        }

        /**
         * 10. LOAD GAME OPTIONS
         * From table_options (read-only after game start)
         */
        $result['gameOptions'] = [
            'gameMode' => $this->tableOptions->get(100), // First Game / Standard
            'shipSelection' => $this->tableOptions->get(101) // Random / Draft
        ];

        return $result;
    }

    /**
     * EXAMPLE: Player action showing proper state persistence
     *
     * BAD PRACTICE:
     * - Storing state in $this->someVariable
     * - Expecting it to persist between requests
     *
     * GOOD PRACTICE:
     * - Load from database
     * - Compute
     * - Save to database
     * - Notify clients
     */
    public function moveShip(int $playerId, int $targetSpaceId): void {
        // 1. LOAD current state from DATABASE (not instance variables)
        $currentLocation = $this->getUniqueValueFromDB(
            "SELECT player_ship_location FROM player WHERE player_id = $playerId"
        );

        $shipTile = $this->getObjectFromDB(
            "SELECT * FROM player WHERE player_id = $playerId"
        );

        // 2. VALIDATE using loaded state
        if (!$this->isValidMove($playerId, $currentLocation, $targetSpaceId)) {
            throw new BgaUserException("Invalid move");
        }

        // 3. UPDATE database (persist state change)
        $this->DbQuery(
            "UPDATE player
             SET player_ship_location = $targetSpaceId
             WHERE player_id = $playerId"
        );

        // 4. NOTIFY all clients about state change
        $this->notify->all('shipMoved',
            clienttranslate('${player_name} moved their ship'),
            [
                'player_id' => $playerId,
                'from_space' => $currentLocation,
                'to_space' => $targetSpaceId,
                'player_name' => $this->getPlayerName($playerId)
            ]
        );

        // 5. UPDATE statistics (also persisted to database)
        $this->incStat(1, 'ship_spaces_moved', $playerId);

        // NOTE: No instance variables used! Everything from/to database.
        // If player refreshes now, getAllDatas() will load the new position.
    }

    /**
     * EXAMPLE: Using globals for temporary cross-request state
     *
     * Globals persist between requests (stored in database)
     * Use for state that needs to survive page refreshes during multi-step actions
     */
    public function startMonsterFight(int $playerId, string $monsterColor): void {
        $shield = $this->getUniqueValueFromDB(
            "SELECT player_shield_strength FROM player WHERE player_id = $playerId"
        );

        $monsterStrength = 9 - $shield;

        // Store combat state in GLOBALS (persists between requests)
        $this->globals->set('combat_state', [
            'player_id' => $playerId,
            'monster_color' => $monsterColor,
            'monster_strength' => $monsterStrength,
            'rounds' => 0
        ]);

        // Transition to combat state
        $this->gamestate->nextState('fightMonster');

        // If player refreshes during combat, combat_state will still be in globals
        // and can be loaded in getAllDatas() to reconstruct combat UI
    }

    public function continueMonsterFight(int $playerId, int $battleRoll): void {
        // LOAD combat state from globals (survives refresh)
        $combatState = $this->globals->get('combat_state', null);

        if (!$combatState) {
            throw new BgaUserException("No active combat");
        }

        if ($combatState['player_id'] != $playerId) {
            throw new BgaUserException("Not your combat");
        }

        // Process combat round...
        $combatState['rounds']++;

        if ($battleRoll >= $combatState['monster_strength']) {
            // Victory - clean up globals
            $this->globals->delete('combat_state');
            $this->completeMonsterDefeat($playerId, $combatState['monster_color']);
        } else {
            // Update and persist for next round
            $combatState['monster_strength']--;
            $this->globals->set('combat_state', $combatState);
        }
    }

    /**
     * ANTI-PATTERN EXAMPLES (DO NOT DO THIS)
     */

    // ❌ BAD: Instance variable (will NOT persist)
    private $currentPlayerLocation; // Lost on refresh!

    public function badExample_DoNotDoThis() {
        // ❌ BAD: Storing in instance variable
        $this->currentPlayerLocation = 42;
        // This will be LOST when player refreshes!

        // ✅ GOOD: Store in database
        $this->DbQuery("UPDATE player SET player_ship_location = 42 WHERE player_id = $playerId");
    }

    // ❌ BAD: Static variable (shared across ALL games on server!)
    private static $gameState = []; // NEVER use static for game state!

    /**
     * BEST PRACTICES SUMMARY
     *
     * 1. ✅ DO: Load all state from database in every method
     * 2. ✅ DO: Save all state changes to database immediately
     * 3. ✅ DO: Use globals for temporary multi-step state
     * 4. ✅ DO: Make getAllDatas() reconstruct complete state
     * 5. ✅ DO: Test by refreshing browser frequently during development
     *
     * 6. ❌ DON'T: Store state in instance variables
     * 7. ❌ DON'T: Use static variables for game state
     * 8. ❌ DON'T: Assume any PHP state persists between requests
     * 9. ❌ DON'T: Cache database values in memory
     * 10. ❌ DON'T: Forget to notify clients after state changes
     */

    /**
     * TESTING TIP: Refresh Detection
     *
     * During development, add logging to verify state is properly persisted:
     */
    protected function logStateReconstruction(): void {
        if ($this->getBgaEnvironment() == 'studio') {
            $this->dump('debug', 'getAllDatas called - reconstructing state from database');

            // Verify critical state
            $players = $this->loadPlayersBasicInfos();
            foreach ($players as $playerId => $player) {
                $location = $this->getUniqueValueFromDB(
                    "SELECT player_ship_location FROM player WHERE player_id = $playerId"
                );
                $this->dump('debug', "Player $playerId ship at location: $location");
            }
        }
    }

    /**
     * DEBUGGING: Simulate refresh during development
     *
     * Add this to your action to test state persistence:
     */
    protected function debugSimulateRefresh(): void {
        if ($this->getBgaEnvironment() == 'studio') {
            // Force reload all state as if player refreshed
            $freshState = $this->getAllDatas();
            $this->dump('debug', 'Simulated refresh - fresh state: ' . json_encode($freshState));
        }
    }
}
