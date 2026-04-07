<?php
/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * theoracleofdelphigzed implementation : © <Your name here> <Your email address here>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * Game.php
 *
 * This is the main file for your game logic.
 *
 * In this PHP file, you are going to defines the rules of the game.
 */
declare(strict_types=1);

namespace Bga\Games\theoracleofdelphigzed;

use Bga\Games\theoracleofdelphigzed\States\RoundStart;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class Game extends \Bga\GameFramework\Table
{
    /**
     * Your global variables labels:
     *
     * Here, you can assign labels to global variables you are using for this game. You can use any number of global
     * variables with IDs between 10 and 99. If you want to store any type instead of int, use $this->globals instead.
     *
     * NOTE: afterward, you can get/set the global variables with `getGameStateValue`, `setGameStateInitialValue` or
     * `setGameStateValue` functions.
     */
    public function __construct()
    {
        parent::__construct();
        $this->initGameStateLabels([]); // mandatory, even if the array is empty
    }

    /**
     * Fisher-Yates shuffle using BGA's deterministic random for replay support.
     * @param array &$arr Array to shuffle in place
     */
    private static function bgaShuffle(array &$arr): void
    {
        $n = count($arr);
        for ($i = $n - 1; $i > 0; $i--) {
            $j = bga_rand(0, $i);
            [$arr[$i], $arr[$j]] = [$arr[$j], $arr[$i]];
        }
    }

    /**
     * Distribute 6 colors across 6 slots over N rounds.
     * Each round shuffles all 6 colors and assigns one per slot.
     * Guarantees: N items per slot, no duplicate colors per slot.
     *
     * @param int $rounds Number of rounds (= pieces per island)
     * @return array<int, string[]> Index 0-5 -> array of assigned colors
     */
    public static function distributeColorRounds(int $rounds): array
    {
        if ($rounds < 0 || $rounds > 6) {
            throw new \InvalidArgumentException(
                "rounds must be 0-6 (only 6 colors available), got $rounds"
            );
        }
        $slots = array_fill(0, 6, []);
        for ($r = 0; $r < $rounds; $r++) {
            do {
                $colors = MaterialDefs::COLORS;
                self::bgaShuffle($colors);
                $valid = true;
                for ($i = 0; $i < 6; $i++) {
                    if (in_array($colors[$i], $slots[$i], true)) {
                        $valid = false;
                        break;
                    }
                }
            } while (!$valid);
            for ($i = 0; $i < 6; $i++) {
                $slots[$i][] = $colors[$i];
            }
        }
        return $slots;
    }

    /**
     * Ensure custom columns exist on the player table.
     * Uses a column check to avoid "Duplicate column" errors on re-creation.
     */
    private function ensurePlayerColumns(): void
    {
        $columns = [
            'ship_q' => 'INT DEFAULT NULL',
            'ship_r' => 'INT DEFAULT NULL',
            'shield_value' => 'INT NOT NULL DEFAULT 0',
            'favor_tokens' => 'INT NOT NULL DEFAULT 0',
            'ship_tile_id' => 'INT DEFAULT NULL',
            'oracle_card_used_this_turn' => 'TINYINT(1) DEFAULT 0',
            'tasks_completed' => 'INT NOT NULL DEFAULT 0',
        ];

        $existing = array_column(
            self::getObjectListFromDB("SHOW COLUMNS FROM `player`"),
            'Field'
        );

        foreach ($columns as $name => $definition) {
            if (!in_array($name, $existing, true)) {
                static::DbQuery("ALTER TABLE `player` ADD `$name` $definition");
            }
        }
    }

    /**
     * DEV ONLY: Drop and recreate all custom tables to ensure schema matches dbmodel.sql.
     * Remove before production release.
     */
    private function resetCustomTables(): void
    {
        $tables = [
            'god_advancement_queue', 'player_island_knowledge', 'oracle_die', 'player_god', 'zeus_tile',
            'shrine', 'card', 'offering', 'statue', 'temple', 'monster',
            'hex', 'board_placement',
        ];
        foreach ($tables as $t) {
            static::DbQuery("DROP TABLE IF EXISTS `$t`");
        }

        // Re-read and execute dbmodel.sql to recreate tables
        $sql = file_get_contents(__DIR__ . '/../../dbmodel.sql');
        // Split on semicolons, skip ALTER TABLE (player table extensions handled separately)
        $statements = array_filter(
            array_map('trim', explode(';', $sql)),
            fn($s) => $s !== '' && !str_starts_with(strtoupper($s), 'ALTER')
        );
        foreach ($statements as $stmt) {
            // Remove IF NOT EXISTS since we just dropped
            $stmt = str_replace('IF NOT EXISTS ', '', $stmt);
            static::DbQuery($stmt);
        }
    }

    /**
     * Populate hex grid and place game pieces after board generation.
     */
    private function populateBoard(array $boardResult, array $clusterPlacementIds, int $playerCount, array $players = []): void
    {
        // Step 1: Save all hexes to hex table, grouped by island attribute
        $hexesByAttribute = [];

        foreach ($boardResult['clusters'] as $idx => $placement) {
            $placementId = $clusterPlacementIds[$idx];
            $clusterType = addslashes($placement['cluster']['id']);
            $rotation = (int)$placement['rotation'];

            foreach ($placement['hexes'] as $hex) {
                $q = (int)$hex['q'];
                $r = (int)$hex['r'];
                $tileType = addslashes($hex['type']);
                $color = $hex['color'] !== null ? "'" . addslashes($hex['color']) . "'" : 'NULL';
                // For shrine islands, store explorationColor in the color column
                if ($hex['attribute'] === 'shrine' && isset($hex['explorationColor'])) {
                    $color = "'" . addslashes($hex['explorationColor']) . "'";
                }
                $attribute = $hex['attribute'] !== null ? "'" . addslashes($hex['attribute']) . "'" : 'NULL';
                $isRevealed = 0; // islands start face-down

                static::DbQuery("INSERT INTO hex (q, r, tile_type, color, island_content, is_revealed,
                    cluster_id, cluster_type, cluster_rotation)
                    VALUES ($q, $r, '$tileType', $color, $attribute, $isRevealed,
                    $placementId, '$clusterType', $rotation)");

                // Track hexes by attribute for piece placement
                if ($hex['attribute'] !== null) {
                    $hexesByAttribute[$hex['attribute']][] = ['q' => $q, 'r' => $r];
                }
            }
        }

        // Step 2: Place monsters
        $this->placeMonsters($hexesByAttribute, $playerCount);

        // Step 3: Place offerings
        $this->placeOfferings($hexesByAttribute, $playerCount);

        // Step 4: Place temples
        $this->placeTemples($hexesByAttribute);

        // Step 5: Place statues at cities
        $this->placeStatues($hexesByAttribute, $boardResult);

        // Step 6: Assign shrine tokens to shrine hexes
        $this->placeShrines($hexesByAttribute, $players);
    }

    /**
     * Place monsters on monster and two_monster hexes.
     * Rule 6: N per color, 2 on each marked island, rest distributed evenly.
     */
    private function placeMonsters(array $hexesByAttribute, int $playerCount): void
    {
        $twoMonsterHexes = $hexesByAttribute['two_monster'] ?? [];
        $monsterHexes = $hexesByAttribute['monster'] ?? [];

        // Step 1: Marked islands — shuffle 6 colors, deal 2 per island
        $colors = MaterialDefs::COLORS;
        self::bgaShuffle($colors);
        foreach ($twoMonsterHexes as $i => $hex) {
            for ($j = 0; $j < 2; $j++) {
                $color = $colors[$i * 2 + $j];
                $type = MaterialDefs::monsterTypeByColor($color);
                static::DbQuery("INSERT INTO monster (color, monster_type, hex_q, hex_r, is_defeated)
                    VALUES ('$color', '$type', {$hex['q']}, {$hex['r']}, 0)");
            }
        }

        // Step 2: Regular islands — distribute remaining (playerCount - 1) rounds
        $regularRounds = $playerCount - 1;
        if ($regularRounds > 0) {
            $distribution = self::distributeColorRounds($regularRounds);
            foreach ($monsterHexes as $i => $hex) {
                foreach ($distribution[$i] as $color) {
                    $type = MaterialDefs::monsterTypeByColor($color);
                    static::DbQuery("INSERT INTO monster (color, monster_type, hex_q, hex_r, is_defeated)
                        VALUES ('$color', '$type', {$hex['q']}, {$hex['r']}, 0)");
                }
            }
        }
    }

    /**
     * Place offerings on offering hexes.
     * Rule 4: N per color, distributed evenly, no color twice per island.
     */
    private function placeOfferings(array $hexesByAttribute, int $playerCount): void
    {
        $offeringHexes = $hexesByAttribute['offering'] ?? [];
        $distribution = self::distributeColorRounds($playerCount);

        foreach ($offeringHexes as $i => $hex) {
            foreach ($distribution[$i] as $color) {
                static::DbQuery("INSERT INTO offering (color, origin_hex_q, origin_hex_r, is_delivered)
                    VALUES ('$color', {$hex['q']}, {$hex['r']}, 0)");
            }
        }
    }

    /**
     * Place 6 temples (one per color) on temple hexes, randomly assigned.
     */
    private function placeTemples(array $hexesByAttribute): void
    {
        $templeHexes = $hexesByAttribute['temple'] ?? [];
        $colors = MaterialDefs::COLORS;
        self::bgaShuffle($colors);

        foreach ($templeHexes as $i => $hex) {
            $color = $colors[$i];
            static::DbQuery("INSERT INTO temple (color, hex_q, hex_r)
                VALUES ('$color', {$hex['q']}, {$hex['r']})");
        }
    }

    /**
     * Place 3 statues of each color at the matching city tile.
     * City color derived from cluster ID (e.g., 'city-red' -> 'red').
     */
    private function placeStatues(array $hexesByAttribute, array $boardResult): void
    {
        foreach ($boardResult['clusters'] as $placement) {
            $clusterId = $placement['cluster']['id'];
            if (!str_starts_with($clusterId, 'city-')) {
                continue;
            }
            $cityColor = substr($clusterId, 5); // 'city-red' -> 'red'

            foreach ($placement['hexes'] as $hex) {
                if ($hex['attribute'] === 'city') {
                    $q = (int)$hex['q'];
                    $r = (int)$hex['r'];
                    for ($s = 0; $s < 3; $s++) {
                        static::DbQuery("INSERT INTO statue (color, origin_hex_q, origin_hex_r, is_raised)
                            VALUES ('$cityColor', $q, $r, 0)");
                    }
                }
            }
        }
    }

    /**
     * Assign shrine tokens to shrine hexes during setup.
     * Each player has 3 shrines (indexed by SHRINE_LETTERS), randomly distributed across 12 shrine hexes.
     * Stores owner + letter directly on the hex table (hidden until explored).
     */
    private function placeShrines(array $hexesByAttribute, array $players): void
    {
        $shrineHexes = $hexesByAttribute['shrine'] ?? [];

        // Build player_id lookup by game color
        $playerIdByColor = [];
        foreach ($players as $player) {
            $gameColor = MaterialDefs::HEX_TO_GAME_COLOR[$player['player_color']] ?? null;
            if ($gameColor) {
                $playerIdByColor[$gameColor] = (int)$player['player_id'];
            }
        }

        // Build all 12 shrine tokens (4 colors × 3 letters), regardless of player count.
        // Absent player colors get player_id = 0 (shrines still placed on board).
        $tokens = [];
        foreach (MaterialDefs::SHRINE_LETTERS as $gameColor => $letters) {
            $playerId = $playerIdByColor[$gameColor] ?? 0;
            foreach ($letters as $index => $letter) {
                $tokens[] = [
                    'player_id' => $playerId,
                    'letter' => $letter,
                    'shrine_index' => $index,
                    'game_color' => $gameColor,
                ];
            }
        }

        // Shuffle and assign to hexes
        self::bgaShuffle($tokens);

        foreach ($shrineHexes as $i => $hex) {
            if (!isset($tokens[$i])) break;
            $token = $tokens[$i];
            $q = (int)$hex['q'];
            $r = (int)$hex['r'];
            $letter = addslashes($token['letter']);
            $playerId = $token['player_id'];
            $gameColor = addslashes($token['game_color']);

            static::DbQuery(
                "UPDATE hex SET shrine_player_id = $playerId, shrine_letter = '$letter', shrine_game_color = '$gameColor'
                 WHERE q = $q AND r = $r"
            );
        }
    }

    /**
     * Create and shuffle all 4 card decks. Deal 6 equipment to display.
     * Must be called before initPlayers() since starting injury + ship tile bonus draw cards.
     */
    private function createCardDecks(): void
    {
        // Oracle deck: 6 colors x 5 = 30 cards
        $oracleCards = [];
        foreach (MaterialDefs::COLORS as $color) {
            $colorIdx = MaterialDefs::COLOR_INDEX[$color];
            for ($i = 0; $i < MaterialDefs::ORACLE_CARDS_PER_COLOR; $i++) {
                $oracleCards[] = $colorIdx;
            }
        }
        self::bgaShuffle($oracleCards);
        foreach ($oracleCards as $order => $colorIdx) {
            static::DbQuery("INSERT INTO card (card_type, card_type_arg, card_location, card_location_arg, card_order)
                VALUES ('oracle', $colorIdx, 'deck', 0, $order)");
        }

        // Equipment deck: 22 cards (IDs 0-21)
        $equipIds = array_keys(MaterialDefs::EQUIPMENT_CARDS);
        self::bgaShuffle($equipIds);
        foreach ($equipIds as $order => $cardId) {
            // First 6 go to display, rest stay in deck
            $location = $order < 6 ? 'display' : 'deck';
            static::DbQuery("INSERT INTO card (card_type, card_type_arg, card_location, card_location_arg, card_order)
                VALUES ('equipment', $cardId, '$location', 0, $order)");
        }

        // Companion deck: 6 colors x 3 types = 18 cards
        // card_type_arg = color_index * 3 + type_index
        $companionIds = [];
        for ($c = 0; $c < 6; $c++) {
            for ($t = 0; $t < 3; $t++) {
                $companionIds[] = $c * 3 + $t;
            }
        }
        self::bgaShuffle($companionIds);
        foreach ($companionIds as $order => $cardId) {
            static::DbQuery("INSERT INTO card (card_type, card_type_arg, card_location, card_location_arg, card_order)
                VALUES ('companion', $cardId, 'deck', 0, $order)");
        }

        // Injury deck: 6 colors x 7 = 42 cards
        $injuryCards = [];
        foreach (MaterialDefs::COLORS as $color) {
            $colorIdx = MaterialDefs::COLOR_INDEX[$color];
            for ($i = 0; $i < MaterialDefs::INJURY_CARDS_PER_COLOR; $i++) {
                $injuryCards[] = $colorIdx;
            }
        }
        self::bgaShuffle($injuryCards);
        foreach ($injuryCards as $order => $colorIdx) {
            static::DbQuery("INSERT INTO card (card_type, card_type_arg, card_location, card_location_arg, card_order)
                VALUES ('injury', $colorIdx, 'deck', 0, $order)");
        }
    }

    /**
     * Distribute 12 Zeus tiles per player: 3 shrine + 3 statue + 3 offering + 3 monster.
     * Dual-sided offering/monster tiles: randomly pick 2 of 4 to show offering, other 2 show monster.
     * The flip selection is global (same for all players).
     *
     * @param array<int, array{player_id: int, player_color: string}> $players
     */
    private function distributeZeusTiles(array $players): void
    {
        // Step 1: Global dual-sided flip — pick 2 of 4 to remain as offerings
        $dualIndices = [0, 1, 2, 3];
        self::bgaShuffle($dualIndices);
        $offeringIndices = [$dualIndices[0], $dualIndices[1]]; // these stay offering-side
        $monsterIndices = [$dualIndices[2], $dualIndices[3]];  // these flip to monster-side

        $offeringColors = array_map(
            fn($i) => MaterialDefs::DUAL_SIDED_TILES[$i]['offering_color'],
            $offeringIndices
        );
        $monsterTypes = array_map(
            fn($i) => MaterialDefs::DUAL_SIDED_TILES[$i]['monster_type'],
            $monsterIndices
        );

        // Store flip selection as global for image reference
        $this->globals->set('zeus_flip_offering_colors', $offeringColors);

        foreach ($players as $player) {
            $playerId = (int)$player['player_id'];
            $playerColor = MaterialDefs::HEX_TO_GAME_COLOR[$player['player_color']] ?? null;

            // --- Shrine tiles (3): fixed Greek letters per player color ---
            $letters = MaterialDefs::SHRINE_LETTERS[$playerColor] ?? ['omega', 'phi', 'psi'];
            $shrineOrder = [0, 1, 2];
            self::bgaShuffle($shrineOrder);
            foreach ($shrineOrder as $sortIdx => $letterIdx) {
                $letter = addslashes($letters[$letterIdx]);
                static::DbQuery("INSERT INTO zeus_tile (player_id, task_type, task_color, task_letter, is_completed, sort_order)
                    VALUES ($playerId, 'shrine', NULL, '$letter', 0, $sortIdx)");
            }

            // --- Statue tiles (3): generic, no color ---
            $statueOrder = [0, 1, 2];
            self::bgaShuffle($statueOrder);
            foreach ($statueOrder as $sortIdx) {
                static::DbQuery("INSERT INTO zeus_tile (player_id, task_type, task_color, task_letter, is_completed, sort_order)
                    VALUES ($playerId, 'statue', NULL, NULL, 0, $sortIdx)");
            }

            // --- Offering tiles (3): "any" + 2 unflipped colors ---
            $offeringTiles = [null]; // "any" = null task_color
            foreach ($offeringColors as $c) {
                $offeringTiles[] = $c;
            }
            $offeringOrder = [0, 1, 2];
            self::bgaShuffle($offeringOrder);
            foreach ($offeringOrder as $sortIdx => $tileIdx) {
                $color = $offeringTiles[$tileIdx];
                $colorSql = $color !== null ? "'" . addslashes($color) . "'" : 'NULL';
                static::DbQuery("INSERT INTO zeus_tile (player_id, task_type, task_color, task_letter, is_completed, sort_order)
                    VALUES ($playerId, 'offering', $colorSql, NULL, 0, $sortIdx)");
            }

            // --- Monster tiles (3): "any" + 2 flipped monster types ---
            $monsterTiles = [null]; // "any" = null task_color
            foreach ($monsterTypes as $t) {
                $monsterTiles[] = $t;
            }
            $monsterOrder = [0, 1, 2];
            self::bgaShuffle($monsterOrder);
            foreach ($monsterOrder as $sortIdx => $tileIdx) {
                $color = $monsterTiles[$tileIdx];
                $colorSql = $color !== null ? "'" . addslashes($color) . "'" : 'NULL';
                static::DbQuery("INSERT INTO zeus_tile (player_id, task_type, task_color, task_letter, is_completed, sort_order)
                    VALUES ($playerId, 'monster', $colorSql, NULL, 0, $sortIdx)");
            }
        }
    }

    /**
     * Initialize player state: ship placement, ship tiles, favor tokens, shrines, gods.
     * Must be called after createCardDecks() since starting injury + bonuses draw cards.
     *
     * @param array<int, array{player_id: int, player_no: int, player_color: string}> $players
     * @param array{q: int, r: int} $zeusPosition
     */
    private function initPlayers(array $players, array $zeusPosition): void
    {
        $zeusQ = (int)$zeusPosition['q'];
        $zeusR = (int)$zeusPosition['r'];

        // Assign ship tiles: shuffle [0..7], deal first N
        $shipTileIds = array_keys(MaterialDefs::SHIP_TILES);
        self::bgaShuffle($shipTileIds);

        $playerIndex = 0;
        foreach ($players as $player) {
            $playerId = (int)$player['player_id'];
            $playerNo = (int)$player['player_no'];
            $shipTileId = $shipTileIds[$playerIndex];

            // Base resources
            $favorTokens = 2 + $playerNo; // Player 1 gets 3, Player 2 gets 4, etc.
            $shieldValue = 0;

            // Ship tile immediate bonuses
            $ability = MaterialDefs::SHIP_TILES[$shipTileId]['ability'];
            if ($ability === 'shield_start') {
                $shieldValue += 2;
            }
            if ($ability === 'favor_plus_1') {
                $favorTokens += 1;
            }

            // Update player row
            static::DbQuery("UPDATE player SET
                ship_q = $zeusQ,
                ship_r = $zeusR,
                shield_value = $shieldValue,
                favor_tokens = $favorTokens,
                ship_tile_id = $shipTileId,
                tasks_completed = 0
                WHERE player_id = $playerId");

            // Insert 3 shrines
            for ($s = 0; $s < 3; $s++) {
                static::DbQuery("INSERT INTO shrine (player_id, shrine_index, is_built)
                    VALUES ($playerId, $s, 0)");
            }

            // Insert 6 gods — god_track_high tile starts gods at player-count row
            $godStartRow = $ability === 'god_track_high'
                ? MaterialDefs::PLAYER_COUNT_ROW[count($players)]
                : 0;
            foreach (MaterialDefs::GODS as $godName => $godData) {
                $godName = addslashes($godName);
                static::DbQuery("INSERT INTO player_god (player_id, god_name, track_row)
                    VALUES ($playerId, '$godName', $godStartRow)");
            }

            $playerIndex++;
        }

        // Set titan holder = last player (highest player_no)
        $lastPlayer = null;
        $maxNo = 0;
        foreach ($players as $player) {
            if ((int)$player['player_no'] >= $maxNo) {
                $maxNo = (int)$player['player_no'];
                $lastPlayer = (int)$player['player_id'];
            }
        }
        $this->globals->set('titan_holder_id', $lastPlayer);
    }

    /**
     * Each player draws 1 injury card and advances their matching god.
     * God advances from row 0 to the player-count row.
     *
     * @param array<int, array{player_id: int}> $players
     */
    private function drawStartingInjuries(array $players): void
    {
        $playerCount = count($players);
        $playerCountRow = MaterialDefs::PLAYER_COUNT_ROW[$playerCount];

        foreach ($players as $player) {
            $playerId = (int)$player['player_id'];

            // Draw top injury card (lowest card_order in deck)
            $card = self::getObjectFromDB(
                "SELECT card_id, card_type_arg FROM card
                 WHERE card_type = 'injury' AND card_location = 'deck'
                 ORDER BY card_order ASC LIMIT 1"
            );

            if ($card === null) {
                throw new \BgaSystemException('No injury cards in deck during setup');
            }

            // Move card to player's hand
            $cardId = (int)$card['card_id'];
            static::DbQuery("UPDATE card SET card_location = 'hand', card_location_arg = $playerId
                WHERE card_id = $cardId");

            // Find matching god by color index
            $colorIdx = (int)$card['card_type_arg'];
            $colorName = MaterialDefs::COLORS[$colorIdx];

            // Find the god matching this color
            $godName = null;
            foreach (MaterialDefs::GODS as $name => $data) {
                if ($data['color'] === $colorName) {
                    $godName = $name;
                    break;
                }
            }

            if ($godName !== null) {
                // Advance this player's matching god from row 0 to player-count row
                $godName = addslashes($godName);
                static::DbQuery("UPDATE player_god SET track_row = $playerCountRow
                    WHERE player_id = $playerId AND god_name = '$godName' AND track_row = 0");
            }
        }
    }

    /**
     * Apply ship tile starting bonuses that require existing card decks.
     * Currently only tile 1 (starting_equipment): draw 1 equipment from display + 1 oracle from deck.
     *
     * @param array<int, array{player_id: int}> $players
     */
    private function applyShipTileBonuses(array $players): void
    {
        foreach ($players as $player) {
            $playerId = (int)$player['player_id'];
            $shipTileId = (int)self::getUniqueValueFromDB(
                "SELECT ship_tile_id FROM player WHERE player_id = $playerId"
            );

            $ability = MaterialDefs::SHIP_TILES[$shipTileId]['ability'];

            if ($ability === 'starting_equipment') {
                // Draw 1 equipment from display
                $equipCard = self::getObjectFromDB(
                    "SELECT card_id FROM card
                     WHERE card_type = 'equipment' AND card_location = 'display'
                     ORDER BY card_order ASC LIMIT 1"
                );
                if ($equipCard !== null) {
                    static::DbQuery("UPDATE card SET card_location = 'hand', card_location_arg = $playerId
                        WHERE card_id = {$equipCard['card_id']}");

                    // Refill display from deck
                    $deckCard = self::getObjectFromDB(
                        "SELECT card_id FROM card
                         WHERE card_type = 'equipment' AND card_location = 'deck'
                         ORDER BY card_order ASC LIMIT 1"
                    );
                    if ($deckCard !== null) {
                        static::DbQuery("UPDATE card SET card_location = 'display'
                            WHERE card_id = {$deckCard['card_id']}");
                    }
                }

                // Draw 1 oracle from deck
                $oracleCard = self::getObjectFromDB(
                    "SELECT card_id FROM card
                     WHERE card_type = 'oracle' AND card_location = 'deck'
                     ORDER BY card_order ASC LIMIT 1"
                );
                if ($oracleCard !== null) {
                    static::DbQuery("UPDATE card SET card_location = 'hand', card_location_arg = $playerId
                        WHERE card_id = {$oracleCard['card_id']}");
                }
            }
        }
    }

    /**
     * Roll 3 oracle dice per player, assigning random colors.
     *
     * @param array<int, array{player_id: int}> $players
     */
    private function rollInitialDice(array $players): void
    {
        $colorCount = count(MaterialDefs::COLORS);

        foreach ($players as $player) {
            $playerId = (int)$player['player_id'];

            for ($d = 0; $d < 3; $d++) {
                $colorIdx = bga_rand(0, $colorCount - 1);
                $color = addslashes(MaterialDefs::COLORS[$colorIdx]);
                static::DbQuery("INSERT INTO oracle_die (player_id, die_index, color, original_color, is_used)
                    VALUES ($playerId, $d, '$color', '$color', 0)");
            }
        }
    }

    /**
     * Compute and return the current game progression.
     *
     * The number returned must be an integer between 0 and 100.
     *
     * This method is called each time we are in a game state with the "updateGameProgression" property set to true.
     *
     * @return int
     * @see ./states.inc.php
     */
    public function getGameProgression()
    {
        // TODO: compute and return the game progression

        return 0;
    }

    /**
     * Migrate database.
     *
     * You don't have to care about this until your game has been published on BGA. Once your game is on BGA, this
     * method is called everytime the system detects a game running with your old database scheme. In this case, if you
     * change your database scheme, you just have to apply the needed changes in order to update the game database and
     * allow the game to continue to run with your new version.
     *
     * @param int $from_version
     * @return void
     */
    public function upgradeTableDb($from_version)
    {
//       if ($from_version <= 1404301345)
//       {
//            // ! important ! Use `DBPREFIX_<table_name>` for all tables
//
//            $sql = "ALTER TABLE `DBPREFIX_xxxxxxx` ....";
//            $this->applyDbUpgradeToAllDB( $sql );
//       }
//
//       if ($from_version <= 1405061421)
//       {
//            // ! important ! Use `DBPREFIX_<table_name>` for all tables
//
//            $sql = "CREATE TABLE `DBPREFIX_xxxxxxx` ....";
//            $this->applyDbUpgradeToAllDB( $sql );
//       }
    }

    /*
     * Gather all information about current game situation (visible by the current player).
     *
     * The method is called each time the game interface is displayed to a player, i.e.:
     *
     * - when the game starts
     * - when a player refreshes the game page (F5)
     */
    protected function getAllDatas(): array
    {
        $result = [];

        // WARNING: We must only return information visible by the current player.
        $current_player_id = (int) $this->getCurrentPlayerId();

        // Get information about players.
        // NOTE: you can retrieve some extra field you added for "player" table in `dbmodel.sql` if you need it.
        $result["players"] = $this->getCollectionFromDb(
            "SELECT player_id id, player_score score, player_no playerNo,
                    player_color playerColor,
                    ship_q shipQ, ship_r shipR,
                    shield_value shieldValue, favor_tokens favorTokens,
                    ship_tile_id shipTileId, tasks_completed tasksCompleted
             FROM player"
        );

        // Board placements for client-side rendering
        $result['boardPlacements'] = self::getObjectListFromDB(
            "SELECT cluster_id AS clusterId, anchor_q AS anchorQ, anchor_r AS anchorR, rotation
             FROM board_placement"
        );

        // Zeus starting position
        $result['zeusPosition'] = $this->globals->get('zeus_position');

        // Hex grid — filter island_content by visibility
        $hexes = self::getObjectListFromDB(
            "SELECT hex_id AS id, q, r, tile_type AS tileType, color,
                    island_content AS islandContent, is_revealed AS isRevealed,
                    shrine_player_id AS shrinePlayerId, shrine_letter AS shrineLetter, shrine_game_color AS shrineGameColor,
                    revealed_by_player_id AS revealedByPlayerId,
                    cluster_id AS clusterId, cluster_type AS clusterType,
                    cluster_rotation AS clusterRotation
             FROM hex"
        );

        // Get islands this player has peeked at
        $peekedHexes = self::getObjectListFromDB(
            "SELECT hex_q AS q, hex_r AS r FROM player_island_knowledge
             WHERE player_id = $current_player_id"
        );
        $peekedSet = [];
        foreach ($peekedHexes as $ph) {
            $peekedSet["{$ph['q']},{$ph['r']}"] = true;
        }

        // Hide island_content for unrevealed, non-peeked islands
        foreach ($hexes as &$hex) {
            if ($hex['tileType'] === 'island'
                && (int)$hex['isRevealed'] === 0
                && !isset($peekedSet["{$hex['q']},{$hex['r']}"])) {
                $hex['islandContent'] = null;
                $hex['shrinePlayerId'] = null;
                $hex['shrineLetter'] = null;
            }
        }
        unset($hex);
        $result['hexes'] = $hexes;

        // Monsters — on board + defeated per player
        $result['monsters'] = self::getObjectListFromDB(
            "SELECT monster_id AS id, color, monster_type AS monsterType,
                    hex_q AS hexQ, hex_r AS hexR,
                    is_defeated AS isDefeated, defeated_by_player_id AS defeatedBy
             FROM monster"
        );

        // Offerings
        $result['offerings'] = self::getObjectListFromDB(
            "SELECT offering_id AS id, color, origin_hex_q AS originQ, origin_hex_r AS originR,
                    player_id AS playerId, is_delivered AS isDelivered,
                    delivered_to_hex_q AS deliveredQ, delivered_to_hex_r AS deliveredR,
                    delivered_by_player_id AS deliveredBy
             FROM offering"
        );

        // Statues
        $result['statues'] = self::getObjectListFromDB(
            "SELECT statue_id AS id, color, origin_hex_q AS originQ, origin_hex_r AS originR,
                    player_id AS playerId, is_raised AS isRaised,
                    raised_at_hex_q AS raisedQ, raised_at_hex_r AS raisedR,
                    raised_by_player_id AS raisedBy
             FROM statue"
        );

        // Temples
        $result['temples'] = self::getObjectListFromDB(
            "SELECT temple_id AS id, color, hex_q AS hexQ, hex_r AS hexR
             FROM temple"
        );

        // Shrines (per player)
        $result['shrines'] = self::getObjectListFromDB(
            "SELECT shrine_id AS id, player_id AS playerId, shrine_index AS shrineIndex,
                    is_built AS isBuilt, built_at_hex_q AS builtQ, built_at_hex_r AS builtR
             FROM shrine"
        );

        // Gods (per player)
        $result['gods'] = self::getObjectListFromDB(
            "SELECT id, player_id AS playerId, god_name AS godName, track_row AS trackRow
             FROM player_god"
        );

        // Oracle dice (per player)
        $result['oracleDice'] = self::getObjectListFromDB(
            "SELECT die_id AS id, player_id AS playerId, die_index AS dieIndex,
                    color, original_color AS originalColor, is_used AS isUsed
             FROM oracle_die"
        );

        // Zeus tiles (per player)
        $result['zeusTiles'] = self::getObjectListFromDB(
            "SELECT tile_id AS id, player_id AS playerId, task_type AS taskType,
                    task_color AS taskColor, task_letter AS taskLetter,
                    is_completed AS isCompleted, sort_order AS sortOrder
             FROM zeus_tile"
        );

        // Cards: equipment display (visible to all)
        $result['equipmentDisplay'] = self::getObjectListFromDB(
            "SELECT card_id AS id, card_type_arg AS cardTypeArg
             FROM card WHERE card_type = 'equipment' AND card_location = 'display'
             ORDER BY card_order ASC"
        );

        // Cards: current player's hand (oracle + injury + equipment + companion)
        $result['hand'] = self::getObjectListFromDB(
            "SELECT card_id AS id, card_type AS cardType, card_type_arg AS cardTypeArg
             FROM card WHERE card_location = 'hand' AND card_location_arg = $current_player_id
             ORDER BY card_type, card_order ASC"
        );

        // Card counts for other players (no card details revealed)
        $result['playerCardCounts'] = self::getObjectListFromDB(
            "SELECT card_location_arg AS playerId, card_type AS cardType, COUNT(*) AS cnt
             FROM card WHERE card_location = 'hand'
             GROUP BY card_location_arg, card_type"
        );

        // Deck sizes (for display)
        $result['deckSizes'] = self::getObjectListFromDB(
            "SELECT card_type AS cardType, COUNT(*) AS cnt
             FROM card WHERE card_location = 'deck'
             GROUP BY card_type"
        );

        // Game globals
        $result['titanHolderId'] = $this->globals->get('titan_holder_id');
        $result['zeusFlipOfferingColors'] = $this->globals->get('zeus_flip_offering_colors');
        $result['oracleCardPlayed'] = (int)$this->globals->get('oracle_card_played');
        $result['selectedOracleCardId'] = (int)$this->globals->get('selected_oracle_card_id');

        return $result;
    }

    /**
     * Get the color of the current action source (die or oracle card).
     */
    public function getActionColor(int $playerId): ?string
    {
        $oracleCardId = (int)$this->globals->get('selected_oracle_card_id');
        if ($oracleCardId > 0) {
            $card = $this->getObjectFromDB(
                "SELECT card_type_arg, is_wild FROM card WHERE card_id = $oracleCardId"
            );
            if ($card) {
                if ((int)$card['is_wild'] === 1) {
                    // Wild card: return the chosen color stored in global
                    return $this->globals->get('wild_card_chosen_color') ?? null;
                }
                return MaterialDefs::COLORS[(int)$card['card_type_arg']] ?? null;
            }
            return null;
        }

        $dieIndex = $this->globals->get('selected_die_index');
        $die = $this->getObjectFromDB(
            "SELECT color FROM oracle_die WHERE player_id = $playerId AND die_index = $dieIndex"
        );
        return $die ? $die['color'] : null;
    }

    /**
     * Check if Apollo's wild ability is active for this turn.
     * When active, all dice match any color.
     */
    public function isApolloWildActive(): bool
    {
        return (int)$this->globals->get('apollo_wild_active') === 1;
    }

    /**
     * Check if all 3 oracle dice have been used this turn.
     */
    public function allDiceUsed(int $playerId): bool
    {
        $unused = (int)$this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM oracle_die WHERE player_id = $playerId AND is_used = 0"
        );
        return $unused === 0;
    }

    /**
     * Spend the current action source (die or oracle card) after an action completes.
     * Returns the next state class: ConsultOracle if all dice used, else PlayerActions.
     */
    public function spendActionSource(int $playerId): string
    {
        $oracleCardId = (int)$this->globals->get('selected_oracle_card_id');

        if ($oracleCardId > 0) {
            // Discard the oracle card
            $this->DbQuery(
                "UPDATE card SET card_location = 'discard', card_location_arg = 0
                 WHERE card_id = $oracleCardId"
            );
            $this->globals->set('selected_oracle_card_id', 0);

            $this->notify->all("oracleCardDiscarded", '', [
                "player_id" => $playerId,
                "card_id" => $oracleCardId,
            ]);
        } else {
            // Spend the die
            $dieIndex = $this->globals->get('selected_die_index');
            $this->DbQuery(
                "UPDATE oracle_die SET is_used = 1
                 WHERE player_id = $playerId AND die_index = $dieIndex"
            );
            $this->globals->set('selected_die_index', null);

            $this->notify->all("dieUsed", '', [
                "player_id" => $playerId,
                "die_index" => $dieIndex,
            ]);
        }

        if ($this->allDiceUsed($playerId)) {
            return \Bga\Games\theoracleofdelphigzed\States\ConsultOracle::class;
        }
        return \Bga\Games\theoracleofdelphigzed\States\PlayerActions::class;
    }

    /**
     * Reset a god to row 0 after using its ability.
     */
    public function resetGod(int $playerId, string $godName): void
    {
        $safeName = addslashes($godName);
        $this->DbQuery(
            "UPDATE player_god SET track_row = 0
             WHERE player_id = $playerId AND god_name = '$safeName'"
        );

        $this->notify->all("godReset", clienttranslate('${player_name} uses ${god_name}\'s power (god returns to bottom of track)'), [
            "player_id" => $playerId,
            "player_name" => $this->getPlayerNameById($playerId),
            "god_name" => $godName,
        ]);
    }

    /**
     * This method is called only once, when a new game is launched. In this method, you must setup the game
     *  according to the game rules, so that the game is ready to be played.
     */
    protected function setupNewGame($players, $options = [])
    {
        // Set the colors of the players with HTML color code. The default below is red/green/blue/orange/brown. The
        // number of colors defined here must correspond to the maximum number of players allowed for the gams.
        $gameinfos = $this->getGameinfos();
        $default_colors = $gameinfos['player_colors'];

        foreach ($players as $player_id => $player) {
            // Now you can access both $player_id and $player array
            $query_values[] = vsprintf("('%s', '%s', '%s', '%s', '%s')", [
                $player_id,
                array_shift($default_colors),
                $player["player_canal"],
                addslashes($player["player_name"]),
                addslashes($player["player_avatar"]),
            ]);
        }

        // Create players based on generic information.
        //
        // NOTE: You can add extra field on player table in the database (see dbmodel.sql) and initialize
        // additional fields directly here.
        static::DbQuery(
            sprintf(
                "INSERT INTO player (player_id, player_color, player_canal, player_name, player_avatar) VALUES %s",
                implode(",", $query_values)
            )
        );

        $this->reattributeColorsBasedOnPreferences($players, $gameinfos["player_colors"]);
        $this->reloadPlayersBasicInfos();

        // Init global values with their initial values.
        $this->globals->set('selected_die_index', null);
        $this->globals->set('oracle_card_played', 0);
        $this->globals->set('selected_oracle_card_id', 0);

        // Init game statistics.
        //
        // NOTE: statistics used in this file must be defined in your `stats.inc.php` file.

        // Dummy content.
        // $this->tableStats->init('table_teststat1', 0);
        // $this->playerStats->init('player_teststat1', 0);

        // Ensure player table has our custom columns (idempotent)
        $this->ensurePlayerColumns();

        // DEV: Drop and recreate custom tables to ensure schema is current.
        // dbmodel.sql uses CREATE TABLE IF NOT EXISTS which won't update existing tables.
        // Remove this block before production release.
        $this->resetCustomTables();

        // Generate the game board
        require_once(__DIR__ . '/BoardGenerator.php');
        $generator = new \BoardGenerator();
        $result = $generator->generate();

        if (!$result['valid']) {
            throw new \BgaSystemException('Board generation failed');
        }

        // Save placements to board_placement table and capture IDs
        $clusterPlacementIds = [];
        foreach ($result['clusters'] as $idx => $placement) {
            $clusterId = addslashes($placement['cluster']['id']);
            $q = (int)$placement['anchorQ'];
            $r = (int)$placement['anchorR'];
            $rot = (int)$placement['rotation'];
            static::DbQuery("INSERT INTO board_placement (cluster_id, anchor_q, anchor_r, rotation)
                VALUES ('$clusterId', $q, $r, $rot)");
            $clusterPlacementIds[$idx] = (int)self::DbGetLastId();
        }

        // Load player data with player_no for ordering (needed for shrine placement)
        $playerRows = self::getObjectListFromDB(
            "SELECT player_id, player_no, player_color FROM player ORDER BY player_no ASC"
        );

        // Populate hex grid and game pieces (Phase 3b)
        $this->populateBoard($result, $clusterPlacementIds, count($players), $playerRows);

        // Save zeus position as a global
        $this->globals->set('zeus_position', $result['zeusPosition']);

        // Create all card decks (Phase 3e) — must come before player init
        $this->createCardDecks();

        // Distribute Zeus tiles (Phase 3d)
        $this->distributeZeusTiles($playerRows);

        // Initialize players: ships, tiles, favor, shrines, gods (Phase 3c)
        $this->initPlayers($playerRows, $result['zeusPosition']);

        // Draw starting injuries + advance matching god (Phase 3c)
        $this->drawStartingInjuries($playerRows);

        // Apply ship tile bonuses that require card decks (Phase 3c)
        $this->applyShipTileBonuses($playerRows);

        // Roll initial oracle dice (Phase 3f)
        $this->rollInitialDice($playerRows);

        // Activate first player once everything has been initialized and ready.
        $this->activeNextPlayer();

        return RoundStart::class;
    }

    /**
     * Example of debug function.
     * Here, jump to a state you want to test (by default, jump to next player state)
     * You can trigger it on Studio using the Debug button on the right of the top bar.
     */
    public function debug_goToState(int $state = 3) {
        $this->gamestate->jumpToState($state);
    }

    /**
     * Another example of debug function, to easily test the zombie code.
     */
    public function debug_playAutomatically(int $moves = 50) {
        $count = 0;
        while (intval($this->gamestate->getCurrentMainStateId()) < 99 && $count < $moves) {
            $count++;
            foreach($this->gamestate->getActivePlayerList() as $playerId) {
                $playerId = (int)$playerId;
                $this->gamestate->runStateClassZombie($this->gamestate->getCurrentState($playerId), $playerId);
            }
        }
    }

    /*
    Another example of debug function, to easily create situations you want to test.
    Here, put a card you want to test in your hand (assuming you use the Deck component).

    public function debug_setCardInHand(int $cardType, int $playerId) {
        $card = array_values($this->cards->getCardsOfType($cardType))[0];
        $this->cards->moveCard($card['id'], 'hand', $playerId);
    }
    */
}
