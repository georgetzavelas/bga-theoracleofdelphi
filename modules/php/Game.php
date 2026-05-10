<?php
/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * theoracleofdelphigzed implementation : © George Tzavelas
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

// HexUtils sits in the global namespace and is required by various
// state classes; pull it in here so Game's own adjacency helpers can
// use \HexUtils::hexDistance regardless of which state loaded first.
require_once(__DIR__ . '/HexUtils.php');

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
        $this->initGameStateLabels([
            'board_seed_decimal' => 20,
            'board_algorithm_version' => 21,
        ]);
    }

    /**
     * Increment a game statistic. Pass $playerId for a player stat; omit for a table stat.
     * Centralized so call sites stay grep-able and a single seam exists for future logging
     * or instrumentation.
     */
    public function statInc(int $delta, string $name, ?int $playerId = null): void
    {
        if ($playerId === null) {
            $this->tableStats->inc($name, $delta);
        } else {
            $this->playerStats->inc($name, $delta, $playerId);
        }
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
     * Ensure custom columns exist on the card table.
     * Uses a column check to avoid "Duplicate column" errors on re-creation.
     */
    private function ensureCardColumns(): void
    {
        $columns = [
            'is_used' => 'TINYINT UNSIGNED NOT NULL DEFAULT 0',
        ];

        $existing = array_column(
            self::getObjectListFromDB("SHOW COLUMNS FROM `card`"),
            'Field'
        );

        foreach ($columns as $name => $definition) {
            if (!in_array($name, $existing, true)) {
                static::DbQuery("ALTER TABLE `card` ADD `$name` $definition");
            }
        }
    }

    /**
     * Ensure custom columns exist on the zeus_tile table. Idempotent —
     * safe for in-progress games whose schema predates the column add.
     */
    private function ensureZeusTileColumns(): void
    {
        $columns = [
            'completion_value' => 'VARCHAR(20) DEFAULT NULL',
        ];

        $existing = array_column(
            self::getObjectListFromDB("SHOW COLUMNS FROM `zeus_tile`"),
            'Field'
        );

        foreach ($columns as $name => $definition) {
            if (!in_array($name, $existing, true)) {
                static::DbQuery("ALTER TABLE `zeus_tile` ADD `$name` $definition");
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

            // Public log: ship tile assignment (tile is face-up, so fully public)
            $tileDescription = MaterialDefs::SHIP_TILES[$shipTileId]['description'];
            $this->notify->all("startingShipTile", clienttranslate('${player_name} receives Ship Tile #${ship_tile_id}: ${tile_description}'), [
                "player_id" => $playerId,
                "player_name" => $this->getPlayerNameById($playerId),
                "ship_tile_id" => $shipTileId,
                "tile_description" => $tileDescription,
            ]);

            // Public log: starting resources (favor + shield visible on player board)
            if ($shieldValue > 0) {
                $this->notify->all("startingResources", clienttranslate('${player_name} starts with ${favor_tokens} Favor and ${shield_value} Shield'), [
                    "player_id" => $playerId,
                    "player_name" => $this->getPlayerNameById($playerId),
                    "favor_tokens" => $favorTokens,
                    "shield_value" => $shieldValue,
                ]);
            } else {
                $this->notify->all("startingResources", clienttranslate('${player_name} starts with ${favor_tokens} Favor Tokens'), [
                    "player_id" => $playerId,
                    "player_name" => $this->getPlayerNameById($playerId),
                    "favor_tokens" => $favorTokens,
                    "shield_value" => 0,
                ]);
            }

            $playerIndex++;
        }

        // Set titan holder = last player (highest player_no) and first
        // player = lowest player_no. First player is stable across rounds
        // (turn order never rotates in this implementation), so it also
        // doubles as the round-end marker used by NextPlayer.
        $lastPlayer = null;
        $firstPlayer = null;
        $maxNo = 0;
        $minNo = PHP_INT_MAX;
        foreach ($players as $player) {
            $no = (int)$player['player_no'];
            if ($no >= $maxNo) {
                $maxNo = $no;
                $lastPlayer = (int)$player['player_id'];
            }
            if ($no <= $minNo) {
                $minNo = $no;
                $firstPlayer = (int)$player['player_id'];
            }
        }
        $this->globals->set('titan_holder_id', $lastPlayer);
        $this->globals->set('first_player_id', $firstPlayer);
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
                $safeGodName = addslashes($godName);
                static::DbQuery("UPDATE player_god SET track_row = $playerCountRow
                    WHERE player_id = $playerId AND god_name = '$safeGodName' AND track_row = 0");
            }

            // Private: exact card goes to drawing player's hand
            $this->notify->player($playerId, "startingInjuryDrawnPrivate", '', [
                "card_id" => $cardId,
                "card_type_arg" => $colorIdx,
                "color" => $colorName,
            ]);

            // Public: injury color is revealed by the matching god advancement
            if ($godName !== null) {
                $this->notify->all("startingInjuryDrawn", clienttranslate('${player_name} draws a starting Injury (${color}) and advances ${god_name} to row ${god_row}'), [
                    "player_id" => $playerId,
                    "player_name" => $this->getPlayerNameById($playerId),
                    "color" => $colorName,
                    "god_name" => $godName,
                    "god_row" => $playerCountRow,
                ]);
            } else {
                $this->notify->all("startingInjuryDrawn", clienttranslate('${player_name} draws a starting Injury (${color})'), [
                    "player_id" => $playerId,
                    "player_name" => $this->getPlayerNameById($playerId),
                    "color" => $colorName,
                ]);
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
                // Equipment is now picked by the player rather than auto-
                // assigned: flag the player as needing to pick before round
                // 1, and let RoundStart detour through SelectStartingEquipment
                // (mirrors the fewer_tasks → DiscardZeusTile detour pattern).
                // The oracle draw stays inline since there's no choice to
                // make on it.
                $this->globals->set('pending_starting_equipment_' . $playerId, 1);

                $drawnOracle = null;

                // Draw 1 oracle from deck (private identity to the drawer).
                $oracleCard = self::getObjectFromDB(
                    "SELECT card_id, card_type_arg FROM card
                     WHERE card_type = 'oracle' AND card_location = 'deck'
                     ORDER BY card_order ASC LIMIT 1"
                );
                if ($oracleCard !== null) {
                    static::DbQuery("UPDATE card SET card_location = 'hand', card_location_arg = $playerId
                        WHERE card_id = {$oracleCard['card_id']}");
                    $drawnOracle = [
                        'card_id' => (int)$oracleCard['card_id'],
                        'card_type_arg' => (int)$oracleCard['card_type_arg'],
                        'color' => MaterialDefs::COLORS[(int)$oracleCard['card_type_arg']] ?? null,
                    ];
                }

                // Private: oracle identity to the drawing player. Equipment
                // identity is null — the player will pick from the display
                // when they reach SelectStartingEquipment.
                $this->notify->player($playerId, "startingBonusCardsPrivate", '', [
                    "equipment" => null,
                    "oracle" => $drawnOracle,
                ]);

                // Public: the equipment pick is deferred, so only the
                // oracle draw is announced now. The equipment selection
                // notification fires later from SelectStartingEquipment.
                $this->notify->all("startingBonusCards", clienttranslate('${player_name} draws 1 Oracle card and will pick a starting Equipment card'), [
                    "player_id" => $playerId,
                    "player_name" => $this->getPlayerNameById($playerId),
                    "equipment" => null,
                    "refilled_equipment" => null,
                ]);
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

            $rolled = [];
            for ($d = 0; $d < 3; $d++) {
                $colorIdx = bga_rand(0, $colorCount - 1);
                $colorName = MaterialDefs::COLORS[$colorIdx];
                $safeColor = addslashes($colorName);
                static::DbQuery("INSERT INTO oracle_die (player_id, die_index, color, original_color, is_used)
                    VALUES ($playerId, $d, '$safeColor', '$safeColor', 0)");
                $rolled[] = $colorName;
            }

            // Public log: dice are displayed in the player's tray
            $this->notify->all("startingDiceRolled", clienttranslate('${player_name} consults the oracle for 3 starting Oracle Dice: ${colors_text}'), [
                "player_id" => $playerId,
                "player_name" => $this->getPlayerNameById($playerId),
                "colors" => $rolled,
                "colors_text" => implode(', ', $rolled),
            ]);
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

        // Per-player panel state. Keep this small and only what the panel needs.
        $shipTiles = MaterialDefs::SHIP_TILES;

        // Bulk-load all Zeus tiles (one query) — drives the per-pip panel render.
        // Each entry per task type carries the assigned color (NULL = "any color"),
        // letter (for shrines), and current is_completed flag. Pip identity stays
        // tied to tile_id so notif_taskCompleted can match in O(1).
        // Note: monster zeus_tile.task_color stores the monster TYPE name
        // (chimera/cyclops/etc.). For the panel we translate it to the element
        // color via MaterialDefs::MONSTERS so the CSS palette applies.
        $monsterTypeToColor = [];
        foreach (MaterialDefs::MONSTERS as $type => $def) {
            $monsterTypeToColor[$type] = $def['color'];
        }
        $zeusTilesByPlayer = [];
        foreach (self::getObjectListFromDB(
            "SELECT player_id AS pid, tile_id AS id, task_type AS type,
                    task_color AS color, task_letter AS letter,
                    completion_value AS completionValue,
                    is_completed AS done
             FROM zeus_tile
             ORDER BY player_id, task_type, sort_order ASC"
        ) as $row) {
            $color = $row['color'];
            $completionValue = $row['completionValue'];
            if ($row['type'] === 'monster') {
                if ($color !== null) {
                    $color = $monsterTypeToColor[$color] ?? null;
                }
                if ($completionValue !== null) {
                    $completionValue = $monsterTypeToColor[$completionValue] ?? null;
                }
            }
            $zeusTilesByPlayer[(int)$row['pid']][$row['type']][] = [
                'id'              => (int)$row['id'],
                'color'           => $color,            // NULL for "any color" tiles
                'letter'          => $row['letter'],    // set for shrines, NULL otherwise
                'completionValue' => $completionValue,  // colour used to fulfill a white tile
                'done'            => (bool)$row['done'],
            ];
        }

        // Bulk-load cargo and peeked counts for all players in 3 queries (not N*3).
        $allStatues = self::getObjectListFromDB(
            "SELECT player_id AS pid, statue_id AS id, color, 'statue' AS type
             FROM statue WHERE player_id IS NOT NULL AND is_raised = 0"
        );
        $allOfferings = self::getObjectListFromDB(
            "SELECT player_id AS pid, offering_id AS id, color, 'offering' AS type
             FROM offering WHERE player_id IS NOT NULL AND is_delivered = 0"
        );
        // Count peeked-but-not-yet-explored hexes per player.
        // Exclude hexes where is_revealed = 1 (already explored by anyone),
        // since those no longer represent outstanding island knowledge.
        $allPeeked = self::getObjectListFromDB(
            "SELECT pik.player_id AS pid, COUNT(*) AS cnt
             FROM player_island_knowledge pik
             INNER JOIN hex h ON h.q = pik.hex_q AND h.r = pik.hex_r
             WHERE h.is_revealed = 0
             GROUP BY pik.player_id"
        );

        // Bulk-load injury counts per player per color (one query).
        $allInjuries = self::getObjectListFromDB(
            "SELECT card_location_arg AS pid, card_type_arg AS colorIdx, COUNT(*) AS n
             FROM card
             WHERE card_type = 'injury' AND card_location = 'hand'
             GROUP BY card_location_arg, card_type_arg"
        );

        // Bulk-load god track rows for all players.
        // `row` is a reserved word in MySQL — alias as `trackRow` and remap below.
        $godsByPlayer = [];
        foreach (self::getObjectListFromDB(
            "SELECT player_id AS pid, god_name AS god, track_row AS trackRow
             FROM player_god"
        ) as $row) {
            $godsByPlayer[(int)$row['pid']][$row['god']] = ['god' => $row['god'], 'row' => (int)$row['trackRow']];
        }

        // Index by player id for O(1) lookup in the loop below.
        $cargoByPlayer = [];
        foreach ($allStatues as $row) {
            $cargoByPlayer[$row['pid']][] = ['id' => $row['id'], 'color' => $row['color'], 'type' => $row['type']];
        }
        foreach ($allOfferings as $row) {
            $cargoByPlayer[$row['pid']][] = ['id' => $row['id'], 'color' => $row['color'], 'type' => $row['type']];
        }
        $peekedByPlayer = [];
        foreach ($allPeeked as $row) {
            $peekedByPlayer[$row['pid']] = (int)$row['cnt'];
        }
        $injuriesByPlayer = [];
        foreach ($allInjuries as $row) {
            $colorName = MaterialDefs::COLORS[(int)$row['colorIdx']] ?? null;
            if ($colorName !== null) {
                $injuriesByPlayer[(int)$row['pid']][] = ['color' => $colorName, 'n' => (int)$row['n']];
            }
        }

        // Bulk-load oracle dice for all players.
        $diceByPlayer = [];
        foreach (self::getObjectListFromDB(
            "SELECT player_id AS pid, die_index AS idx, color, is_used AS isUsed
             FROM oracle_die ORDER BY player_id, die_index"
        ) as $row) {
            $diceByPlayer[(int)$row['pid']][] = [
                'idx'   => (int)$row['idx'],
                'color' => $row['color'],
                'spent' => (int)$row['isUsed'],
            ];
        }

        // Bulk-load oracle hand cards for all players.
        $handByPlayer = [];
        foreach (self::getObjectListFromDB(
            "SELECT card_location_arg AS pid, card_id AS id, card_type_arg AS colorIdx
             FROM card WHERE card_type = 'oracle' AND card_location = 'hand'"
        ) as $row) {
            $colorName = MaterialDefs::COLORS[(int)$row['colorIdx']] ?? null;
            $handByPlayer[(int)$row['pid']][] = [
                'id'    => (int)$row['id'],
                'color' => $colorName,
            ];
        }

        // Bulk-load companion cards for all players.
        $companionsByPlayer = [];
        foreach (self::getObjectListFromDB(
            "SELECT card_location_arg AS pid, card_id AS id, card_type_arg AS typeArg
             FROM card WHERE card_type = 'companion' AND card_location = 'hand'"
        ) as $row) {
            $typeArg = (int)$row['typeArg'];
            $colorName = MaterialDefs::COLORS[intdiv($typeArg, 3)] ?? null;
            $companionsByPlayer[(int)$row['pid']][] = [
                'id'          => (int)$row['id'],
                'color'       => $colorName,
                'subtype_idx' => $typeArg % 3,
            ];
        }

        // Bulk-load equipment cards for all players (public — all players can see counts/thumbnails).
        $equipmentByPlayer = [];
        foreach (self::getObjectListFromDB(
            "SELECT card_location_arg AS pid, card_id AS id, card_type_arg AS card_idx
             FROM card
             WHERE card_type = 'equipment' AND card_location = 'hand'
             ORDER BY card_id"
        ) as $row) {
            $equipmentByPlayer[(int)$row['pid']][] = [
                'id'       => (int)$row['id'],
                'card_idx' => (int)$row['card_idx'],
            ];
        }

        $panelState = [];
        foreach ($result['players'] as $pid => $p) {
            $tileId = $p['shipTileId'] !== null ? (int)$p['shipTileId'] : null;
            $ability = $tileId !== null ? ($shipTiles[$tileId]['ability'] ?? null) : null;
            $taskTotal = $ability === 'fewer_tasks' ? 11 : 12;
            $storage = $tileId !== null ? (int)($shipTiles[$tileId]['storage'] ?? 2) : 2;
            // Reinforced Hull (equipment card 16) adds a permanent +1 storage.
            if (isset($equipmentByPlayer[$pid])) {
                foreach ($equipmentByPlayer[$pid] as $e) {
                    if ((int)$e['card_idx'] === 16) { $storage += 1; break; }
                }
            }

            // Oracle hands are public: every panel shows the real card colors.
            $hand = $handByPlayer[$pid] ?? [];

            $panelState[$pid] = [
                'taskTotal'           => $taskTotal,
                'shipAbility'         => $ability,
                'shipTileId'          => $tileId,
                'shipTileDescription' => $tileId !== null ? ($shipTiles[$tileId]['description'] ?? '') : '',
                'storage'             => $storage,
                'cargo'               => $cargoByPlayer[$pid] ?? [],
                'peekedCount'         => $peekedByPlayer[$pid] ?? 0,
                'injuries'            => $injuriesByPlayer[$pid] ?? [],
                'shieldValue'         => (int)$p['shieldValue'],
                'favorTokens'         => (int)$p['favorTokens'],
                'dice'                => $diceByPlayer[$pid] ?? [],
                'oracleHand'          => $hand,
                'tasks'               => [
                    'shrines'   => $zeusTilesByPlayer[$pid]['shrine']   ?? [],
                    'monsters'  => $zeusTilesByPlayer[$pid]['monster']  ?? [],
                    'statues'   => $zeusTilesByPlayer[$pid]['statue']   ?? [],
                    'offerings' => $zeusTilesByPlayer[$pid]['offering'] ?? [],
                ],
                'gods'                => $godsByPlayer[$pid] ?? [],
                'companions'          => $companionsByPlayer[$pid] ?? [],
                'equipment'           => $equipmentByPlayer[$pid] ?? [],
                // Equipment cap is 3 for everyone, including the
                // starting_equipment ship. CombatVictory enforces the cap
                // server-side and skips the equipment grant (with a log
                // notif) when the player is already at 3.
                'equipmentCapacity'   => 3,
            ];
        }
        $result['panelState'] = $panelState;

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

        // Zeus tiles (per player). completion_value is intentionally not
        // selected here — the pip-rendering path consumes it via
        // panelState.tasks (translated for monster type→color), and no
        // JS consumer of this raw row needs it. Selecting it here would
        // leak the untranslated monster type to a future caller.
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
        // is_wild on oracle cards lets the client add the .oracle-card-wild
        // class on reload — otherwise the wild rainbow halo + ?-badge + the
        // wild-card picking spotlight would all be missing on the hand card
        // after a refresh past the apolloWildCardPrivate notif.
        $result['hand'] = self::getObjectListFromDB(
            "SELECT card_id AS id, card_type AS cardType, card_type_arg AS cardTypeArg,
                    is_used AS isUsed, is_wild AS isWild
             FROM card WHERE card_location = 'hand' AND card_location_arg = $current_player_id
             ORDER BY card_type, card_order ASC"
        );
        // Attach static equipment metadata (description) for hover tooltip.
        foreach ($result['hand'] as &$handCard) {
            if (($handCard['cardType'] ?? '') === 'equipment') {
                $typeArg = (int)($handCard['cardTypeArg'] ?? -1);
                $def = MaterialDefs::EQUIPMENT_CARDS[$typeArg] ?? null;
                $handCard['description'] = $def['description'] ?? '';
            }
        }
        unset($handCard);

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

        // Companion deck top card — companions have no card-back art, so
        // the deck is rendered with its top card face-up. Returns null
        // when the deck is empty.
        $result['companionDeckTopCard'] = self::getObjectFromDB(
            "SELECT card_id AS id, card_type_arg AS cardTypeArg
             FROM card WHERE card_type = 'companion' AND card_location = 'deck'
             ORDER BY card_order ASC LIMIT 1"
        );

        // Game globals
        $result['titanHolderId'] = $this->globals->get('titan_holder_id');
        $result['zeusFlipOfferingColors'] = $this->globals->get('zeus_flip_offering_colors');
        $result['oracleCardPlayed'] = (int)$this->globals->get('oracle_card_played');
        $result['selectedOracleCardId'] = (int)$this->globals->get('selected_oracle_card_id');

        // Private reload payload: peek results only for the active peeker.
        // Shrine contents must never reach other players; guard on active-player match.
        $result['myPeekedHexes'] = null;
        if ($this->globals->get('peek_viewing')) {
            $activePlayerId = (int)$this->getActivePlayerId();
            if ($current_player_id === $activePlayerId) {
                $result['myPeekedHexes'] = json_decode(
                    $this->globals->get('peek_hexes') ?? '[]',
                    true
                );
            }
        }

        // Static lookup for equipment card tooltips: name + description per
        // card_type_arg. 22 entries, one-shot at init; client caches.
        $result['equipmentDefs'] = [];
        foreach (MaterialDefs::EQUIPMENT_CARDS as $arg => $def) {
            $result['equipmentDefs'][(int)$arg] = [
                'name' => MaterialDefs::EQUIPMENT_NAMES[$arg] ?? ('Equipment #' . $arg),
                'description' => $def['description'] ?? '',
            ];
        }

        // Flat idx→name lookup for the player-panel equipment thumbnails.
        $result['equipmentNames'] = MaterialDefs::EQUIPMENT_NAMES;

        // Static lookup for companion card tooltips. card_type_arg encodes
        // color_idx * 3 + type_idx (0=creature, 1=demigod, 2=hero) — 18
        // entries total. Client caches and renders the same name + ability
        // tooltip everywhere a companion appears.
        $result['companionDefs'] = [];
        foreach (MaterialDefs::COMPANION_NAMES as $arg => $name) {
            $colorIdx = intdiv((int)$arg, 3);
            $typeIdx = (int)$arg % 3;
            $color = MaterialDefs::COLORS[$colorIdx] ?? '';
            $typeDef = MaterialDefs::COMPANION_TYPES[$typeIdx] ?? null;
            $result['companionDefs'][(int)$arg] = [
                'name' => $name,
                'subtype' => $typeDef['subtype'] ?? '',
                'description' => $typeDef['description'] ?? '',
                'color' => $color,
            ];
        }

        return $result;
    }

    /**
     * Whether the player owns a companion card of the given color and
     * type (0=creature, 1=demigod, 2=hero). Companion card_type_arg
     * encodes color_idx * 3 + type_idx.
     */
    public function playerOwnsCompanion(int $playerId, string $color, int $typeIdx): bool
    {
        $colorIdx = array_search($color, MaterialDefs::COLORS, true);
        if ($colorIdx === false) return false;
        $arg = (int)$colorIdx * 3 + $typeIdx;
        $count = (int)$this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM card WHERE card_type = 'companion'
             AND card_location = 'hand' AND card_location_arg = $playerId
             AND card_type_arg = $arg"
        );
        return $count > 0;
    }

    /**
     * Thin alias preserved for Hero-specific call sites (auto-discard paths).
     */
    public function playerOwnsHero(int $playerId, string $color): bool
    {
        return $this->playerOwnsCompanion($playerId, $color, 2);
    }

    /**
     * Whether the player owns an equipment card of the given type.
     * When $unusedOnly is true (default), one-time-per-lifetime cards
     * already marked is_used are excluded.
     */
    public function playerOwnsEquipment(int $playerId, int $cardTypeArg, bool $unusedOnly = true): bool
    {
        $usedClause = $unusedOnly ? ' AND is_used = 0' : '';
        $count = (int)$this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM card WHERE card_type = 'equipment'
             AND card_location = 'hand' AND card_location_arg = $playerId
             AND card_type_arg = $cardTypeArg" . $usedClause
        );
        return $count > 0;
    }

    /**
     * Return a human-readable name for an equipment card by card_type_arg.
     */
    public function equipmentName(int $cardTypeArg): string
    {
        return MaterialDefs::EQUIPMENT_NAMES[$cardTypeArg] ?? ('Equipment #' . $cardTypeArg);
    }

    /**
     * Cargo capacity for a player's ship. Reads the player's ship tile's
     * `storage` value (fallback 2 if no tile assigned or value missing).
     *
     * Equipment 016 (Reinforced Hull): permanent +1 storage as long as the
     * card is in the player's hand — applies whether or not the card's
     * one-time shield effect has been used, so we pass `unusedOnly=false`
     * to playerOwnsEquipment.
     *
     * Single source of truth for SelectAction, LoadCargo, and
     * SelectOfferingFromAnyIsland capacity checks.
     */
    public function getCargoCapacity(int $playerId): int
    {
        $shipTileId = $this->getUniqueValueFromDB(
            "SELECT ship_tile_id FROM player WHERE player_id = $playerId"
        );
        $capacity = 2;
        if ($shipTileId !== null) {
            $tile = MaterialDefs::SHIP_TILES[(int)$shipTileId] ?? null;
            if ($tile && isset($tile['storage'])) {
                $capacity = (int)$tile['storage'];
            }
        }
        if ($this->playerOwnsEquipment($playerId, 16, false)) {
            $capacity += 1;
        }
        return $capacity;
    }

    /**
     * House rule: a player's ship may not carry two offerings of the same
     * color, nor two statues of the same color. Mixed (one offering + one
     * statue of the same color) IS allowed — the rule applies per-type,
     * not across types.
     *
     * Single source of truth for the args filters and defensive act
     * checks in LoadCargo, SelectAction, SelectOfferingFromAnyIsland,
     * SelectStatueFromAnyCity, and UseGodAbility (Hermes' actGrabStatue).
     *
     * @param int    $playerId
     * @param string $type   'offering' or 'statue'
     * @param string $color  lowercase color token (red, yellow, green, blue, pink, black)
     */
    public function playerHasCargoOfTypeAndColor(int $playerId, string $type, string $color): bool
    {
        $safeColor = addslashes($color);
        if ($type === 'offering') {
            $count = (int)$this->getUniqueValueFromDB(
                "SELECT COUNT(*) FROM offering
                 WHERE player_id = $playerId AND is_delivered = 0 AND color = '$safeColor'"
            );
        } else {
            $count = (int)$this->getUniqueValueFromDB(
                "SELECT COUNT(*) FROM statue
                 WHERE player_id = $playerId AND is_raised = 0 AND color = '$safeColor'"
            );
        }
        return $count > 0;
    }

    /**
     * True when at least one offering of the given colors is still on an
     * island (not yet loaded into any player's cargo and not yet delivered).
     * Schema note: the `offering` table has no island_id; an offering is "on
     * an island" when player_id IS NULL AND is_delivered = 0.
     */
    public function hasAnyOffering(array $colors): bool
    {
        if (empty($colors)) return false;
        $list = "'" . implode("','", array_map('addslashes', $colors)) . "'";
        return (int)$this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM offering
             WHERE color IN ($list)
             AND player_id IS NULL
             AND is_delivered = 0"
        ) > 0;
    }

    /**
     * True when at least one statue of the given colors is still sitting on
     * its city tile (not yet loaded into any player's cargo and not yet
     * raised). Statues live at `origin_hex_q/origin_hex_r`, which is the
     * corresponding City Tile — there's no separate join needed. A statue is
     * "on its city" when player_id IS NULL AND is_raised = 0.
     */
    public function hasAnyStatue(array $colors): bool
    {
        if (empty($colors)) return false;
        $list = "'" . implode("','", array_map('addslashes', $colors)) . "'";
        return (int)$this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM statue
             WHERE color IN ($list)
             AND player_id IS NULL
             AND is_raised = 0"
        ) > 0;
    }

    /**
     * True if any of the named gods is below the topmost row for this
     * player (i.e. Divine Surge / card 021 could actually advance one).
     * Matches the `$row < 6` guard used throughout ChooseGodAdvancement.
     */
    public function hasAnyAdvanceableGod(int $playerId, array $godNames, int $maxRow = 6): bool
    {
        if (empty($godNames)) return false;
        $list = "'" . implode("','", array_map('addslashes', $godNames)) . "'";
        return (int)$this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM player_god
             WHERE player_id = $playerId
             AND god_name IN ($list)
             AND track_row < $maxRow"
        ) > 0;
    }

    /**
     * Apply the effect of a one-time equipment card immediately.
     *
     * @return string|null  Sub-state class name if activation requires a
     *                      transition (e.g. ChooseGodAdvancement for card 7);
     *                      null if the effect was fully inline.
     *                      Caller must use the return value to decide state.
     *
     * Preconditions: card already moved to player's hand, card_type='equipment',
     * is_used=0. This method sets is_used=1 and emits the standard notifs.
     *
     * For sub-state cases, the caller MUST also call
     * `globals->set('equipment_post_activation_state', <post-resolution state FQCN>)`
     * before returning so the sub-state's finish() can route back correctly.
     */
    public function applyOneTimeEquipmentEffect(int $playerId, int $cardId, int $cardTypeArg): ?string
    {
        switch ($cardTypeArg) {
            case 7:
                // +3 Favor
                $this->DbQuery(
                    "UPDATE player SET favor_tokens = favor_tokens + 3 WHERE player_id = $playerId"
                );
                $newFavor = (int)$this->getUniqueValueFromDB(
                    "SELECT favor_tokens FROM player WHERE player_id = $playerId"
                );

                // +1 Oracle Card from the top of the oracle deck (if any remain).
                // Shared with actDrawOracleCard / Phi shrine bonus / card 4/5/6
                // amulet activations via drawOneOracleCardInline.
                $this->drawOneOracleCardInline($playerId);

                // Mark card 007 used (one-time; stays in hand as greyed out)
                $this->DbQuery(
                    "UPDATE card SET is_used = 1 WHERE card_id = $cardId"
                );

                // Notify activation
                $this->notify->all('equipmentActivated',
                    clienttranslate('${player_name} activates ${equipment_name} (+3 Favor, +1 Oracle Card, advance gods 2 steps)'),
                    [
                        'player_id' => $playerId,
                        'player_name' => $this->getPlayerNameById($playerId),
                        'card_id' => $cardId,
                        'equipment_name' => $this->equipmentName(7),
                        'favor_tokens' => $newFavor,
                    ]
                );
                // Notify one-time used (greys out the card client-side)
                $this->notify->all('equipmentUsed',
                    clienttranslate('${equipment_name} is now spent'), [
                    'player_id' => $playerId,
                    'card_id' => $cardId,
                    'equipment_name' => $this->equipmentName($cardTypeArg),
                ]);

                // Transition to god-advance sub-state with 2 steps total.
                // ChooseGodAdvancement::finish() reads god_advance_reason to
                // pick the return state — 'equipment_7' routes back to the
                // state stashed in `equipment_post_activation_state` (set by
                // the caller), or falls back to SelectAction.
                $this->globals->set('god_steps_remaining', 2);
                $this->globals->set('god_advance_reason', 'equipment_7');

                return \Bga\Games\theoracleofdelphigzed\States\ChooseGodAdvancement::class;

            case 16: {
                // Reinforced Hull (mixed). The permanent +1 storage stays
                // active as long as the card is in the player's hand — see
                // getCargoCapacity, which reads playerOwnsEquipment with
                // unusedOnly=false so the storage bonus survives is_used=1.
                // The one-time component fires now: +1 Shield (capped at 5).
                $currentShield = (int)$this->getUniqueValueFromDB(
                    "SELECT shield_value FROM player WHERE player_id = $playerId"
                );
                $newShield = min(5, $currentShield + 1);
                if ($newShield > $currentShield) {
                    $this->DbQuery(
                        "UPDATE player SET shield_value = $newShield WHERE player_id = $playerId"
                    );
                    $this->statInc(1, 'shield_raised', $playerId);
                }

                $this->DbQuery(
                    "UPDATE card SET is_used = 1 WHERE card_id = $cardId"
                );

                $this->notify->all('equipmentActivated',
                    clienttranslate('${player_name} activates ${equipment_name} (+1 Shield, +1 permanent storage)'),
                    [
                        'player_id' => $playerId,
                        'player_name' => $this->getPlayerNameById($playerId),
                        'card_id' => $cardId,
                        'equipment_name' => $this->equipmentName(16),
                        'shield_value' => $newShield,
                    ]
                );
                $this->notify->all('equipmentUsed',
                    clienttranslate('${equipment_name} is now spent'), [
                    'player_id' => $playerId,
                    'card_id' => $cardId,
                    'equipment_name' => $this->equipmentName($cardTypeArg),
                ]);

                // Drive the shield UI update via the existing
                // shieldIncreased notif so the client's stock handler
                // renders the new value for the acting player.
                if ($newShield > $currentShield) {
                    $playerHexColor = $this->getUniqueValueFromDB(
                        "SELECT player_color FROM player WHERE player_id = $playerId"
                    );
                    $playerGameColor = MaterialDefs::HEX_TO_GAME_COLOR[$playerHexColor] ?? 'blue';
                    $this->notify->all('shieldIncreased',
                        clienttranslate('${player_name}\'s Shield rises to ${value}'), [
                        'player_id' => $playerId,
                        'player_name' => $this->getPlayerNameById($playerId),
                        'value' => $newShield,
                        'playerColor' => $playerGameColor,
                    ]);
                }
                return null;
            }

            case 17:
                // Warm Offering Hook — red/green/yellow.
                return $this->setupOfferingPick(
                    $playerId, $cardId, ['red', 'green', 'yellow'], 17
                );

            case 18:
                // Cool Offering Hook — mirror of 017 with cool colors. Reuses
                // the same SelectOfferingFromAnyIsland sub-state (color-generic).
                return $this->setupOfferingPick(
                    $playerId, $cardId, ['pink', 'blue', 'black'], 18
                );

            case 19:
                // Cool Statue Hook — pink/blue/black statue from its city.
                return $this->setupStatuePick(
                    $playerId, $cardId, ['pink', 'blue', 'black'], 19
                );

            case 20:
                // Warm Statue Hook — red/green/yellow statue from its city.
                return $this->setupStatuePick(
                    $playerId, $cardId, ['red', 'green', 'yellow'], 20
                );

            case 13: {
                // Island Scout: look at 2 face-down Island Tiles, put 1
                // back, uncover the other and take the corresponding
                // reward. Per rulebook: "If there are less than 2 face
                // down Island Tiles, this card cannot be used." Spend
                // inline in that case so we never enter a state with
                // nothing to pick.
                $faceDownCount = (int)$this->getUniqueValueFromDB(
                    "SELECT COUNT(*) FROM hex
                     WHERE island_content = 'shrine' AND is_revealed = 0"
                );
                if ($faceDownCount < 2) {
                    $this->DbQuery(
                        "UPDATE card SET is_used = 1 WHERE card_id = $cardId"
                    );
                    $this->notify->all('equipmentActivated',
                        clienttranslate('${player_name} receives ${equipment_name} but fewer than 2 islands remain face-down; card is spent'),
                        [
                            'player_id' => $playerId,
                            'player_name' => $this->getPlayerNameById($playerId),
                            'card_id' => $cardId,
                            'equipment_name' => $this->equipmentName(13),
                        ]
                    );
                    $this->notify->all('equipmentUsed',
                        clienttranslate('${equipment_name} is now spent'), [
                        'player_id' => $playerId,
                        'card_id' => $cardId,
                        'equipment_name' => $this->equipmentName(13),
                    ]);
                    return null;
                }

                $this->globals->set('eq13_card_id', $cardId);
                // Defensive: clear any stale peek globals before the
                // ScoutIslands state re-uses them for its preview phase.
                $this->globals->set('peek_viewing', null);
                $this->globals->set('peek_hexes', null);

                return \Bga\Games\theoracleofdelphigzed\States\ScoutIslands::class;
            }

            case 21: {
                // Divine Surge: advance 1 of Poseidon/Hermes/Artemis/Aphrodite
                // straight to the topmost row of the God Track. If all 4
                // eligible gods are already at the top, spend the card
                // inline so we never enter a state with no valid picks.
                $eligibleGods = ['poseidon', 'hermes', 'artemis', 'aphrodite'];
                if (!$this->hasAnyAdvanceableGod($playerId, $eligibleGods)) {
                    $this->DbQuery(
                        "UPDATE card SET is_used = 1 WHERE card_id = $cardId"
                    );
                    $this->notify->all('equipmentActivated',
                        clienttranslate('${player_name} activates ${equipment_name} (all eligible gods are already at the top; card is spent)'),
                        [
                            'player_id' => $playerId,
                            'player_name' => $this->getPlayerNameById($playerId),
                            'card_id' => $cardId,
                            'equipment_name' => $this->equipmentName(21),
                        ]
                    );
                    $this->notify->all('equipmentUsed',
                        clienttranslate('${equipment_name} is now spent'), [
                        'player_id' => $playerId,
                        'card_id' => $cardId,
                        'equipment_name' => $this->equipmentName(21),
                    ]);
                    return null;
                }

                $this->globals->set('eq21_card_id', $cardId);
                return \Bga\Games\theoracleofdelphigzed\States\SelectGodForTopRow::class;
            }

            default:
                return null;
        }
    }

    /**
     * Shared setup for the offering-hook cards (017/018). If no eligible
     * offering is on the board the card is spent inline per rulebook;
     * otherwise we stash scratch globals and return the sub-state class.
     *
     * Globals are named `eq17_*` for historical continuity with batch 1 —
     * the state logic is color-generic and shared by both cards.
     */
    private function setupOfferingPick(
        int $playerId, int $cardId, array $colors, int $equipmentCardNumber
    ): ?string {
        if (!$this->hasAnyOffering($colors)) {
            $this->DbQuery(
                "UPDATE card SET is_used = 1 WHERE card_id = $cardId"
            );
            $this->notify->all('equipmentActivated',
                clienttranslate('${player_name} receives ${equipment_name} but no eligible offering is on the board'),
                [
                    'player_id' => $playerId,
                    'player_name' => $this->getPlayerNameById($playerId),
                    'card_id' => $cardId,
                    'equipment_name' => $this->equipmentName($equipmentCardNumber),
                ]
            );
            $this->notify->all('equipmentUsed',
                clienttranslate('${equipment_name} is now spent'), [
                'player_id' => $playerId,
                'card_id' => $cardId,
                'equipment_name' => $this->equipmentName($equipmentCardNumber),
            ]);
            return null;
        }

        $this->globals->set('eq17_card_id', $cardId);
        $this->globals->set('eq17_color_options', json_encode($colors));

        return \Bga\Games\theoracleofdelphigzed\States\SelectOfferingFromAnyIsland::class;
    }

    /**
     * Shared setup for the statue-hook cards (019/020). Mirrors
     * setupOfferingPick: spend inline if nothing eligible, else stash
     * scratch globals and route to SelectStatueFromAnyCity.
     */
    private function setupStatuePick(
        int $playerId, int $cardId, array $colors, int $equipmentCardNumber
    ): ?string {
        if (!$this->hasAnyStatue($colors)) {
            $this->DbQuery(
                "UPDATE card SET is_used = 1 WHERE card_id = $cardId"
            );
            $this->notify->all('equipmentActivated',
                clienttranslate('${player_name} receives ${equipment_name} but no eligible statue is on the board'),
                [
                    'player_id' => $playerId,
                    'player_name' => $this->getPlayerNameById($playerId),
                    'card_id' => $cardId,
                    'equipment_name' => $this->equipmentName($equipmentCardNumber),
                ]
            );
            $this->notify->all('equipmentUsed',
                clienttranslate('${equipment_name} is now spent'), [
                'player_id' => $playerId,
                'card_id' => $cardId,
                'equipment_name' => $this->equipmentName($equipmentCardNumber),
            ]);
            return null;
        }

        $this->globals->set('eq_statue_card_id', $cardId);
        $this->globals->set('eq_statue_color_options', json_encode($colors));

        return \Bga\Games\theoracleofdelphigzed\States\SelectStatueFromAnyCity::class;
    }

    /**
     * Card 011 (Blessed Reward): advance 1 God by 1 step as a side effect
     * of completing an offering/statue/monster task.
     *
     * Must be called AFTER the main reward has resolved (task marked
     * complete, `taskCompleted` notif fired, any direct favor/companion
     * grant resolved). Transitions to ChooseGodAdvancement with
     * god_steps_remaining=1 and a return state stashed in
     * `equipment_post_activation_state`, so the sub-state's finish()
     * routes back to the caller's computed next state.
     *
     * Per-turn note: this is a reaction/permanent card — it fires every
     * time the condition is met, so we do NOT mark it is_used.
     *
     * @param int $playerId
     * @param string $returnStateClass  FQCN of the state to return to
     *                                  after the god step resolves (the
     *                                  caller's normal post-reward state,
     *                                  e.g. PlayerActions or ConsultOracle).
     * @param string $actionType  'offering' | 'statue' | 'monster' — for
     *                            the log message only.
     * @return string|null  ChooseGodAdvancement::class if the player owns
     *                      011 and the reaction should fire; null otherwise.
     */
    public function maybeGrantBlessedRewardGodStep(
        int $playerId,
        string $returnStateClass,
        string $actionType
    ): ?string {
        if (!$this->playerOwnsEquipment($playerId, 11, false)) {
            return null;
        }

        $cardRow = $this->getObjectFromDB(
            "SELECT card_id FROM card
             WHERE card_type = 'equipment' AND card_type_arg = 11
             AND card_location = 'hand' AND card_location_arg = $playerId
             LIMIT 1"
        );
        $cardId = $cardRow ? (int)$cardRow['card_id'] : 0;

        $actionLabel = [
            'offering' => clienttranslate('Making an Offering'),
            'statue'   => clienttranslate('Raising a Statue'),
            'monster'  => clienttranslate('Fighting a Monster'),
        ][$actionType] ?? $actionType;

        $this->notify->all(
            'equipmentReactionTriggered',
            clienttranslate('${player_name} may advance 1 God from ${equipment_name} (${action_label})'),
            [
                'player_id' => $playerId,
                'player_name' => $this->getPlayerNameById($playerId),
                'card_id' => $cardId,
                'equipment_name' => $this->equipmentName(11),
                'action_type' => $actionType,
                'action_label' => $actionLabel,
            ]
        );

        $this->globals->set('god_steps_remaining', 1);
        $this->globals->set('god_advance_reason', 'equipment_11');
        $this->globals->set('equipment_post_activation_state', $returnStateClass);

        return \Bga\Games\theoracleofdelphigzed\States\ChooseGodAdvancement::class;
    }

    /**
     * Advance the named god by one step on the God Track for a player.
     *
     * Shared by ChooseGodAdvancement::actAdvanceGod, SelectAction::actAdvanceGod,
     * and the alt-action amulet equipment cards (004/005/006). Handles the
     * row-0 case (first step jumps to the player-count row per the rulebook)
     * and emits the standard `godAdvanced` notif.
     *
     * Returns the new row (1..6). No-ops and returns the current row if the
     * god is already at the top (row 6) — the caller is responsible for
     * guarding that case with a `hasAnyAdvanceableGod` / `getAdvanceableGod`
     * check if it needs a hard error.
     */
    public function advanceGodOneStep(int $playerId, string $godName): int
    {
        $safeName = addslashes($godName);
        $currentRow = (int)$this->getUniqueValueFromDB(
            "SELECT track_row FROM player_god
             WHERE player_id = $playerId AND god_name = '$safeName'"
        );
        if ($currentRow >= 6) {
            return $currentRow;
        }

        if ($currentRow === 0) {
            $playerCount = (int)$this->getUniqueValueFromDB("SELECT COUNT(*) FROM player");
            $newRow = MaterialDefs::PLAYER_COUNT_ROW[$playerCount] ?? 1;
        } else {
            $newRow = $currentRow + 1;
        }

        $this->DbQuery(
            "UPDATE player_god SET track_row = $newRow
             WHERE player_id = $playerId AND god_name = '$safeName'"
        );
        $this->statInc($newRow - $currentRow, "{$godName}_advances", $playerId);

        $this->notify->all('godAdvanced', clienttranslate('${player_name} advances ${god_name}'), [
            'player_id' => $playerId,
            'player_name' => $this->getPlayerNameById($playerId),
            'god_name' => $godName,
            'new_row' => $newRow,
        ]);

        return $newRow;
    }

    /**
     * Draw the top oracle card from the deck into a player's hand inline.
     *
     * Shared by SelectAction::actDrawOracleCard, the card-007 one-time big
     * bonus, and the amulet alt-action cards (004/005/006). Emits the
     * standard private (`oracleCardDrawnPrivate`) + public (`oracleCardDrawn`)
     * notifs. Silently no-ops if the deck is empty — callers that need to
     * hard-fail (like the core Draw Oracle Card action) must pre-check.
     *
     * Returns the drawn card_id, or null if no cards remain.
     */
    public function drawOneOracleCardInline(int $playerId): ?int
    {
        $card = $this->getObjectFromDB(
            "SELECT card_id, card_type_arg FROM card
             WHERE card_type = 'oracle' AND card_location = 'deck'
             ORDER BY card_order ASC LIMIT 1"
        );
        if ($card === null) {
            return null;
        }
        $cardId = (int)$card['card_id'];
        $colorIdx = (int)$card['card_type_arg'];
        $cardColor = MaterialDefs::COLORS[$colorIdx] ?? 'red';

        $this->DbQuery(
            "UPDATE card SET card_location = 'hand', card_location_arg = $playerId
             WHERE card_id = $cardId"
        );
        $this->statInc(1, 'oracle_cards_drawn', $playerId);

        // Private: card identity goes only to the drawing player
        $this->notify->player($playerId, 'oracleCardDrawnPrivate', '', [
            'card_id' => $cardId,
            'card_color' => $cardColor,
        ]);

        // Public: card identity is now shared with all players for the panel.
        $this->notify->all('oracleCardDrawn', clienttranslate('${player_name} draws an Oracle card'), [
            'player_id' => $playerId,
            'player_name' => $this->getPlayerNameById($playerId),
            'card_id' => $cardId,
            'card_color' => $cardColor,
        ]);

        return $cardId;
    }

    /**
     * Get the color of the current action source (die, oracle card, or
     * equipment-003 bonus action). A non-null `bonus_action_color`
     * means the player is currently spending their bonus action, in
     * which case SelectAction queries behave like a die of that color.
     */
    public function getActionColor(int $playerId): ?string
    {
        $bonusColor = $this->globals->get('bonus_action_color');
        if ($bonusColor) {
            return $bonusColor;
        }

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
     * Activate Equipment card 003 (Bonus Action): validate the once-per-turn
     * + ≥3 Favor preconditions, spend the Favor, set the
     * equipment_bonus_action_available flag so the client renders the
     * wheel-centre ?-die token, and notify all players. Caller is
     * responsible for choosing the next state — SelectAction (when
     * activated mid-action with a die selected) or PlayerActions (when
     * activated between actions, no die selected).
     *
     * Hoisted from SelectAction's private activateEquipment003 so
     * PlayerActions::actActivateEquipment can share the same logic. The
     * rulebook says "spend 3 Favor for an additional action of any
     * colour" — that shouldn't require a die selection first, and the
     * Bonus Action card pulses gold in PlayerActions (per
     * computeActivatableEquipment) so the click has to land somewhere.
     */
    public function activateBonusActionEquipment(int $pid, int $cardId): void
    {
        $bonusUsed = (int)$this->globals->get('equipment_bonus_action_used');
        if ($bonusUsed !== 0) {
            throw new \Bga\GameFramework\UserException(clienttranslate('Bonus action already used this turn.'));
        }
        $favor = (int)$this->getUniqueValueFromDB(
            "SELECT favor_tokens FROM player WHERE player_id = $pid"
        );
        if ($favor < 3) {
            throw new \Bga\GameFramework\UserException(clienttranslate('Not enough Favor.'));
        }

        $this->DbQuery(
            "UPDATE player SET favor_tokens = favor_tokens - 3 WHERE player_id = $pid"
        );
        $this->statInc(3, 'favor_tokens_spent', $pid);
        $this->globals->set('equipment_bonus_action_used', 1);
        $this->globals->set('equipment_bonus_action_available', 1);

        $newFavor = $favor - 3;

        $this->notify->all('equipmentActivated',
            clienttranslate('${player_name} activates ${equipment_name} (spends 3 Favor for a bonus action)'),
            [
                'player_id' => $pid,
                'player_name' => $this->getPlayerNameById($pid),
                'card_id' => $cardId,
                'equipment_name' => $this->equipmentName(3),
                'favor_tokens' => $newFavor,
            ]
        );
    }

    /**
     * Build the activatable-equipment list for the given player, used by
     * the client to put the gold .activatable pulse on hand cards that
     * can be clicked right now.
     *
     * Two state args call into this:
     *   - SelectAction (a die / oracle card / bonus action is mid-action)
     *     — alt-action amulets 004/005/006 light up when the selected
     *       die's colour matches the amulet's gating colour.
     *   - PlayerActions (between dice / right after combat) — only the
     *     Bonus Action card 003 can light up here, since amulets need a
     *     selected die's colour to compare against. The amulet branches
     *     short-circuit naturally because $selectedDieColor stays null
     *     when no die is selected.
     *
     * Was previously a private helper on SelectAction; hoisted to Game so
     * PlayerActions can share it without a copy/paste.
     */
    public function computeActivatableEquipment(int $playerId, int $favor): array
    {
        $cards = $this->getObjectListFromDB(
            "SELECT card_id, card_type_arg, is_used FROM card
             WHERE card_type = 'equipment'
             AND card_location = 'hand'
             AND card_location_arg = $playerId"
        );

        $bonusUsed = (int)$this->globals->get('equipment_bonus_action_used');

        // Context for alt-action amulet cards (004/005/006): the card's
        // color must match the selected DIE's color. We intentionally gate
        // out oracle-card / bonus-action / Apollo-wild / Demigod-wild
        // sources — the rulebook says "use an Oracle Die of the X color",
        // so only a rolled die (or recolored die) of the literal color
        // qualifies. Apollo makes every die "any color" but does not
        // spoof the physical color check — keep the strict read for now.
        $oracleCardId = (int)$this->globals->get('selected_oracle_card_id');
        $isOracleCard = $oracleCardId > 0;
        $usingBonus = $this->globals->get('bonus_action_color') !== null;
        $apolloNeedsRecolor = $this->isApolloWildActive()
            && !$isOracleCard
            && !$usingBonus
            && (int)$this->globals->get('apollo_pending_recolor') === 1;
        $dieIndex = $this->globals->get('selected_die_index');
        $dieRow = (!$isOracleCard && !$usingBonus && $dieIndex !== null)
            ? $this->getObjectFromDB(
                "SELECT color FROM oracle_die WHERE player_id = $playerId AND die_index = $dieIndex"
            )
            : null;
        $selectedDieColor = $dieRow ? ($dieRow['color'] ?? null) : null;

        // 004/005/006 require: a rolled/recolored die of the matching
        // color is selected (not oracle card, not bonus action), and
        // Apollo isn't still waiting on its free recolor.
        $amuletColor = [4 => 'pink', 5 => 'green', 6 => 'blue'];

        $out = [];
        foreach ($cards as $c) {
            $arg = (int)$c['card_type_arg'];
            $activatable = false;
            switch ($arg) {
                case 3:
                    $activatable = ($bonusUsed === 0 && $favor >= 3);
                    break;
                case 4:
                case 5:
                case 6:
                    $activatable = (int)$c['is_used'] === 0
                        && !$isOracleCard
                        && !$usingBonus
                        && !$apolloNeedsRecolor
                        && $selectedDieColor !== null
                        && $selectedDieColor === $amuletColor[$arg];
                    break;
                // One-time cards (007, 017, etc.) auto-resolve on receipt
                // per rulebook — they are not activatable from the hand.
            }
            if ($activatable) {
                $out[] = ['card_id' => (int)$c['card_id'], 'card_type_arg' => $arg];
            }
        }
        return $out;
    }

    /**
     * Check whether the player has any action source left this turn.
     *
     * Returns true when every oracle die is used AND no equipment bonus
     * action is still pending. The equipment-003 bonus action is treated
     * as an alternative action source: while it's available the turn
     * continues.
     */
    public function allDiceUsed(int $playerId): bool
    {
        $unused = (int)$this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM oracle_die WHERE player_id = $playerId AND is_used = 0"
        );
        if ($unused > 0) return false;

        $bonusAvailable = (int)$this->globals->get('equipment_bonus_action_available');
        return $bonusAvailable === 0;
    }

    /**
     * True when the player has at least one non-die action they could
     * still take this turn — either an oracle card in hand that can be
     * played, or a god whose ability is unlocked (track row 6). Used
     * to keep the turn alive when dice are exhausted but the player
     * may still want to play one of those, instead of auto-ending.
     *
     * Doesn't validate every god ability's situational preconditions
     * (e.g. "must be adjacent to monster"); returning true here just
     * keeps the state in PlayerActions so the player decides whether
     * to use the option or click End Turn explicitly.
     */
    public function hasNonDieActionsRemaining(int $playerId): bool
    {
        // Oracle card still playable? Mirrors the canPlayOracleCard
        // logic in PlayerActions::getArgs.
        $oracleCardPlayed = (int)$this->globals->get('oracle_card_played');
        $apolloWildActive = $this->isApolloWildActive();
        if ($oracleCardPlayed === 0 || $apolloWildActive) {
            $wildClause = $apolloWildActive ? ' AND is_wild = 1' : '';
            $cardCount = (int)$this->getUniqueValueFromDB(
                "SELECT COUNT(*) FROM card
                 WHERE card_type = 'oracle' AND card_location = 'hand'
                 AND card_location_arg = $playerId" . $wildClause
            );
            if ($cardCount > 0) return true;
        }

        // Any unlocked god whose ability is currently *usable* (not just
        // unlocked at row 6). Mirrors the per-ability gates from
        // PlayerActions::getAvailableGods so we don't strand the player
        // in PlayerActions just because they unlocked a god whose
        // situational precondition (e.g. ship adjacent to monster) isn't
        // met right now.
        return $this->hasUsableGod($playerId);
    }

    /**
     * True when the player has at least one row-6 god whose ability
     * could be used right now. Mirrors PlayerActions::getAvailableGods'
     * usability gates (Hermes needs cargo + adjacent city, Ares needs
     * adjacent monster, Artemis needs unrevealed islands; the others
     * are unconditional once unlocked).
     */
    public function hasUsableGod(int $playerId): bool
    {
        $gods = $this->getObjectListFromDB(
            "SELECT god_name FROM player_god
             WHERE player_id = $playerId AND track_row = 6"
        );
        if (empty($gods)) return false;

        foreach ($gods as $god) {
            $ability = MaterialDefs::GODS[$god['god_name']]['ability'] ?? null;
            if (!$ability) continue;
            switch ($ability) {
                case 'grab_any_statue':
                    if ($this->playerHasCargoSpace($playerId)
                            && $this->playerShipAdjacentToCity($playerId)) {
                        return true;
                    }
                    break;
                case 'auto_defeat_monster':
                    if ($this->playerShipAdjacentToMonster($playerId)) {
                        return true;
                    }
                    break;
                case 'free_explore_island':
                    if ($this->boardHasUnrevealedShrines()) {
                        return true;
                    }
                    break;
                default:
                    // Aphrodite, Apollo, Poseidon: always usable once
                    // unlocked at row 6.
                    return true;
            }
        }
        return false;
    }

    /** Cargo capacity (ship tile + permanent equipment bonuses) minus
     *  current cargo. */
    public function playerHasCargoSpace(int $playerId): bool
    {
        $shipTileId = $this->getUniqueValueFromDB(
            "SELECT ship_tile_id FROM player WHERE player_id = $playerId"
        );
        $capacity = MaterialDefs::SHIP_TILES[(int)($shipTileId ?? 0)]['storage'] ?? 2;
        // Card 16 (Reinforced Hull) — permanent +1 storage.
        if ($this->playerOwnsEquipment($playerId, 16)) {
            $capacity += 1;
        }
        $offeringCount = (int)$this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM offering WHERE player_id = $playerId AND is_delivered = 0"
        );
        $statueCount = (int)$this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM statue WHERE player_id = $playerId AND is_raised = 0"
        );
        return ($offeringCount + $statueCount) < $capacity;
    }

    public function playerShipAdjacentToCity(int $playerId): bool
    {
        $player = $this->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];
        $cities = $this->getObjectListFromDB(
            "SELECT q, r FROM hex WHERE island_content = 'city'"
        );
        foreach ($cities as $city) {
            if (\HexUtils::hexDistance($shipQ, $shipR, (int)$city['q'], (int)$city['r']) === 1) {
                return true;
            }
        }
        return false;
    }

    public function playerShipAdjacentToMonster(int $playerId): bool
    {
        $player = $this->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];
        $monsters = $this->getObjectListFromDB(
            "SELECT hex_q, hex_r FROM monster WHERE is_defeated = 0"
        );
        foreach ($monsters as $m) {
            if (\HexUtils::hexDistance($shipQ, $shipR, (int)$m['hex_q'], (int)$m['hex_r']) === 1) {
                return true;
            }
        }
        return false;
    }

    public function boardHasUnrevealedShrines(): bool
    {
        $count = (int)$this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM hex WHERE island_content = 'shrine' AND is_revealed = 0"
        );
        return $count > 0;
    }

    /**
     * Single source of truth for "after a die-driven action ends, where
     * does the state machine go next?"
     *
     * Originally each consumer (spendActionSource, ExploreIsland,
     * SelectReward, ChooseInjuryColor, etc.) inlined the same check:
     *   allDiceUsed → ConsultOracle (auto-end turn)
     *                else → PlayerActions
     * Now we additionally keep the turn alive when the player still
     * has an oracle card in hand or an unlocked god ability — so we
     * don't auto-end on them when one of those non-die options remains.
     */
    public function nextStateAfterDieAction(int $playerId): string
    {
        if ($this->allDiceUsed($playerId) && !$this->hasNonDieActionsRemaining($playerId)) {
            // Mirror the manual actEndTurn notif so client-side
            // notif_endTurn fires on the auto-end path too. Without this
            // a played oracle card consumed as the last action of the
            // turn never received the deferred fly-to-deck signal — the
            // card stayed visible in #delphi-played-oracle-card until
            // the next turn refreshed the area.
            $this->notify->all("endTurn", clienttranslate('${player_name} ends their turn'), [
                "player_id" => $playerId,
                "player_name" => $this->getPlayerNameById($playerId),
            ]);
            return \Bga\Games\theoracleofdelphigzed\States\ConsultOracle::class;
        }
        return \Bga\Games\theoracleofdelphigzed\States\PlayerActions::class;
    }

    /**
     * Reset the per-round "which colors have already triggered an
     * equipment reaction" set for the given player. Called from
     * ConsultOracle.onEnteringState before applying the rolled colors —
     * each round starts with no colors fired, then accumulates as
     * colors come in (via roll OR via recolor).
     */
    public function resetEquipmentColorReactionsThisRound(int $playerId): void
    {
        $this->globals->set('equipment_color_reactions_' . $playerId, []);
    }

    /**
     * Trigger color-shown equipment reactions for $playerId at the
     * given $color. Currently covers the three Charm cards (Yellow=000,
     * Red=001, Black=002) — each grants 2 Favor the first time its
     * color appears on the wheel during a round, whether the colour
     * came from the initial roll or a later recolor (per the user's
     * "after recolouring a die check the equipment etc." rule).
     *
     * Idempotent within a round: re-firing for the same colour is a
     * no-op so a recolor to a colour already shown at consult time
     * doesn't double-grant. The fired-set is reset per round in
     * ConsultOracle via resetEquipmentColorReactionsThisRound.
     */
    public function applyEquipmentColorReaction(int $playerId, string $color): void
    {
        static $colorToCardArg = ['yellow' => 0, 'red' => 1, 'black' => 2];
        if (!isset($colorToCardArg[$color])) return;

        $firedKey = 'equipment_color_reactions_' . $playerId;
        $fired = $this->globals->get($firedKey) ?? [];
        if (in_array($color, $fired, true)) return;

        $cardTypeArg = $colorToCardArg[$color];
        if (!$this->playerOwnsEquipment($playerId, $cardTypeArg)) {
            // Don't mark as fired — the player might acquire the matching
            // charm mid-turn (e.g. winning Equipment 000 in combat) and
            // then recolor a die to this colour. Stamping the fired set
            // here would silently swallow that legitimate grant.
            return;
        }

        $fired[] = $color;
        $this->globals->set($firedKey, $fired);

        $this->DbQuery(
            "UPDATE player SET favor_tokens = favor_tokens + 2 WHERE player_id = $playerId"
        );

        $cardRow = $this->getObjectFromDB(
            "SELECT card_id FROM card
             WHERE card_type = 'equipment' AND card_type_arg = $cardTypeArg
             AND card_location = 'hand' AND card_location_arg = $playerId
             LIMIT 1"
        );
        $cardId = $cardRow ? (int)$cardRow['card_id'] : 0;

        $newFavor = (int)$this->getUniqueValueFromDB(
            "SELECT favor_tokens FROM player WHERE player_id = $playerId"
        );

        $this->notify->all('equipmentReactionTriggered',
            clienttranslate('${player_name} gains 2 Favor from ${equipment_name} (${color} shown)'), [
            'player_id'      => $playerId,
            'player_name'    => $this->getPlayerNameById($playerId),
            'card_id'        => $cardId,
            'equipment_name' => $this->equipmentName($cardTypeArg),
            'color'          => $color,
            'favor_delta'    => 2,
            'favor_tokens'   => $newFavor,
        ]);
    }

    /**
     * Pick a Zeus tile to complete for ($taskType, $value), mark it
     * completed, stamp its completion_value, and bump tasks_completed
     * + score. Caller is responsible for any task-type-specific notifs
     * (e.g. taskCompleted).
     *
     * Selection rules:
     *  - Prefer a tile whose task_color exactly matches $value.
     *  - Fall back to a white tile (task_color IS NULL), but only if
     *    $value isn't already represented by a sibling tile of the same
     *    type — either as that sibling's task_color OR as a sibling
     *    white tile's already-recorded completion_value. This enforces
     *    "white tiles must use a colour distinct from every other tile
     *    of their type" (e.g. all 3 statues must use different colours;
     *    a white offering can't reuse the colour of its blue/red sibling).
     *
     * @param string $taskType  'offering' | 'statue' | 'monster'
     * @param string $value     Actual color/type used (e.g. 'red', 'minotaur')
     * @return int|null         Tile id completed, or null if no eligible tile.
     */
    public function completeZeusTileForType(int $playerId, string $taskType, string $value): ?int
    {
        $safeType = addslashes($taskType);
        $safeValue = addslashes($value);

        $tile = $this->getObjectFromDB(
            "SELECT tile_id, task_color FROM zeus_tile
             WHERE player_id = $playerId AND task_type = '$safeType'
             AND task_color = '$safeValue' AND is_completed = 0
             LIMIT 1"
        );

        if (!$tile) {
            $excluded = [];
            $siblings = $this->getObjectListFromDB(
                "SELECT task_color, completion_value FROM zeus_tile
                 WHERE player_id = $playerId AND task_type = '$safeType'"
            );
            foreach ($siblings as $row) {
                if ($row['task_color']) $excluded[] = $row['task_color'];
                if ($row['completion_value']) $excluded[] = $row['completion_value'];
            }
            if (in_array($value, $excluded, true)) return null;

            $tile = $this->getObjectFromDB(
                "SELECT tile_id, task_color FROM zeus_tile
                 WHERE player_id = $playerId AND task_type = '$safeType'
                 AND task_color IS NULL AND is_completed = 0
                 LIMIT 1"
            );
        }

        if (!$tile) return null;

        $tileId = (int)$tile['tile_id'];
        $this->DbQuery(
            "UPDATE zeus_tile SET is_completed = 1, completion_value = '$safeValue'
             WHERE tile_id = $tileId"
        );
        $this->DbQuery(
            "UPDATE player SET tasks_completed = tasks_completed + 1, player_score = player_score + 1
             WHERE player_id = $playerId"
        );
        $this->statInc(1, 'tasks_completed', $playerId);
        $this->statInc(1, $taskType . '_tasks_completed', $playerId);
        return $tileId;
    }

    /**
     * Place a shrine on the given hex for $playerId, then complete the
     * matching shrine Zeus tile. Emits shrineBuilt + (when a tile is
     * cleared) taskCompleted. Returns the completed tile id, or null if
     * the player had no matching open shrine task. Shared by the explore
     * path (own-shrine reveal) and the build-on-discovered path
     * (shrine that another player revealed earlier).
     */
    public function markShrineBuiltAndComplete(int $playerId, int $hexQ, int $hexR, string $shrineLetter): ?int
    {
        $playerColor = $this->getUniqueValueFromDB(
            "SELECT player_color FROM player WHERE player_id = $playerId"
        );
        $gameColor = MaterialDefs::HEX_TO_GAME_COLOR[$playerColor] ?? null;
        $shrineIndex = MaterialDefs::shrineIndexFor($gameColor, $shrineLetter);
        if ($shrineIndex === null) return null;

        $this->DbQuery(
            "UPDATE shrine SET is_built = 1, built_at_hex_q = $hexQ, built_at_hex_r = $hexR
             WHERE player_id = $playerId AND shrine_index = $shrineIndex"
        );

        $this->notify->all("shrineBuilt", clienttranslate('${player_name} builds a shrine!'), [
            "player_id" => $playerId,
            "player_name" => $this->getPlayerNameById($playerId),
            "hex_q" => $hexQ,
            "hex_r" => $hexR,
            "shrine_index" => $shrineIndex,
            "shrine_letter" => $shrineLetter,
        ]);

        $safeLetter = addslashes($shrineLetter);
        $zeusTile = $this->getObjectFromDB(
            "SELECT tile_id FROM zeus_tile
             WHERE player_id = $playerId AND task_type = 'shrine'
             AND task_letter = '$safeLetter' AND is_completed = 0
             LIMIT 1"
        );
        if (!$zeusTile) return null;

        $tileId = (int)$zeusTile['tile_id'];
        $this->DbQuery("UPDATE zeus_tile SET is_completed = 1 WHERE tile_id = $tileId");
        $this->DbQuery(
            "UPDATE player SET tasks_completed = tasks_completed + 1, player_score = player_score + 1
             WHERE player_id = $playerId"
        );
        $this->statInc(1, 'tasks_completed', $playerId);
        $this->statInc(1, 'shrine_tasks_completed', $playerId);

        $playerRow = $this->getObjectFromDB(
            "SELECT tasks_completed, player_score FROM player WHERE player_id = $playerId"
        );
        $this->notify->all("taskCompleted", clienttranslate('${player_name} completes a Zeus tile!'), [
            "player_id" => $playerId,
            "player_name" => $this->getPlayerNameById($playerId),
            "tile_id" => $tileId,
            "tasks_completed" => (int)$playerRow['tasks_completed'],
            "player_score" => (int)$playerRow['player_score'],
            "task_type" => "shrine",
            "shrine_letter" => $shrineLetter,
        ]);

        return $tileId;
    }

    /**
     * Spend the current action source (die, oracle card, or equipment
     * bonus action) after an action completes.
     *
     * Returns the next state class: ConsultOracle if the turn is over,
     * else PlayerActions so the player can pick their next source.
     */
    public function spendActionSource(int $playerId): string
    {
        $usingBonus = $this->globals->get('bonus_action_color') !== null;
        $oracleCardId = (int)$this->globals->get('selected_oracle_card_id');

        if ($usingBonus) {
            // `equipment_bonus_action_available` was cleared when the
            // player committed (actUseBonusAction); just drop the color.
            $this->globals->set('bonus_action_color', null);
        } elseif ($oracleCardId > 0) {
            // Discard the oracle card
            $this->DbQuery(
                "UPDATE card SET card_location = 'discard', card_location_arg = 0
                 WHERE card_id = $oracleCardId"
            );
            $this->globals->set('selected_oracle_card_id', 0);
            $this->statInc(1, 'oracle_cards_used', $playerId);

            $this->notify->all("oracleCardDiscarded",
                clienttranslate('${player_name}\'s Oracle Card is spent'), [
                "player_id" => $playerId,
                "player_name" => $this->getPlayerNameById($playerId),
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
            // Die action is committed — clear the demigod-wild
            // resolution flag so the next die-selection on this turn
            // can offer the wild choice fresh.
            $this->globals->set('demigod_wild_resolved', 0);

            $this->notify->all("dieUsed",
                clienttranslate('${player_name}\'s Oracle Die is spent'), [
                "player_id" => $playerId,
                "player_name" => $this->getPlayerNameById($playerId),
                "die_index" => $dieIndex,
            ]);
        }

        return $this->nextStateAfterDieAction($playerId);
    }

    /**
     * Reshuffle the injury discard pile back into the deck.
     *
     * Called when a draw finds the deck empty. Moves every discarded
     * injury card back to card_location = 'deck' with fresh random
     * card_order values so the next draw pulls from a newly shuffled
     * pool. No-op if the discard pile is also empty.
     *
     * Returns the number of cards moved.
     */
    public function reshuffleInjuryDeck(): int
    {
        $discarded = $this->getObjectListFromDB(
            "SELECT card_id FROM card
             WHERE card_type = 'injury' AND card_location = 'discard'"
        );
        $count = count($discarded);
        if ($count === 0) {
            return 0;
        }

        // Assign a fresh random card_order to each card. bga_rand gives
        // deterministic-per-seed values for replay support.
        $ids = array_map(static fn($row) => (int)$row['card_id'], $discarded);
        $orders = range(0, $count - 1);
        self::bgaShuffle($orders);

        foreach ($ids as $i => $cardId) {
            $order = (int)$orders[$i];
            static::DbQuery(
                "UPDATE card SET card_location = 'deck',
                                 card_location_arg = 0,
                                 card_order = $order
                 WHERE card_id = $cardId"
            );
        }

        $this->notify->all(
            "injuryDeckReshuffled",
            clienttranslate('The injury discard pile is reshuffled into the deck (${count} cards)'),
            ["count" => $count]
        );

        return $count;
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
        $this->globals->set('equipment_bonus_action_used', 0);
        $this->globals->set('equipment_bonus_action_available', 0);
        $this->globals->set('bonus_action_color', null);

        // Init game statistics. Definitions live in stats.json.
        $this->tableStats->init('rounds_played', 0);

        $playerStatNames = [
            'tasks_completed', 'shrine_tasks_completed', 'statue_tasks_completed',
            'offering_tasks_completed', 'monster_tasks_completed',
            'monsters_fought', 'monster_combat_rounds',
            'favor_tokens_spent', 'equipment_cards_acquired',
            'hero_companion_cards_acquired', 'demigod_companion_cards_acquired',
            'creature_companion_cards_acquired',
            'injuries_received', 'recovery_turns',
            'poseidon_advances', 'apollo_advances', 'artemis_advances',
            'aphrodite_advances', 'ares_advances', 'hermes_advances',
            'islands_explored', 'islands_peeked',
            'oracle_cards_drawn', 'oracle_cards_used',
            'ship_movement_hexes', 'shield_raised',
            'discarded_injury_cards', 'die_colored', 'titan_attacks_no_damage',
        ];
        foreach ($playerStatNames as $statName) {
            $this->playerStats->init($statName, 0);
        }

        // Ensure player table has our custom columns (idempotent)
        $this->ensurePlayerColumns();

        // DEV: Drop and recreate custom tables to ensure schema is current.
        // dbmodel.sql uses CREATE TABLE IF NOT EXISTS which won't update existing tables.
        // Remove this block before production release.
        $this->resetCustomTables();

        // Card columns must be added AFTER resetCustomTables since that drops
        // and recreates the `card` table from dbmodel.sql (which lacks is_used
        // until pre-release cleanup folds it into the base schema).
        $this->ensureCardColumns();
        $this->ensureZeusTileColumns();

        // Generate the game board (with seeded RNG for replay support)
        require_once(__DIR__ . '/BoardGenerator.php');
        require_once(__DIR__ . '/SeededRandom.php');
        $boardSeed = (int)bga_rand(0, 2147483647);
        $rng = new \SeededRandom($boardSeed);
        $generator = new \BoardGenerator(['randFn' => [$rng, 'rand']]);
        $result = $generator->generate();

        if (!$result['valid']) {
            throw new \BgaSystemException('Board generation failed');
        }

        $this->setGameStateValue('board_seed_decimal', $boardSeed);
        $this->setGameStateValue('board_algorithm_version', \BoardGenerator::ALGORITHM_VERSION);
        $this->statInc($boardSeed, 'board_seed_decimal');
        $this->statInc(\BoardGenerator::ALGORITHM_VERSION, 'board_algorithm_version');

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

    /**
     * DEV: Grant one equipment card (by card_type_arg 0-21) to the active
     * player. Invoke via the BGA Studio debug button. Delegates to DevTools.
     */
    public function debug_giveEquipment(int $cardTypeArg = 0): void
    {
        require_once(__DIR__ . '/DevTools.php');
        $tools = new DevTools($this);
        $tools->giveEquipment($cardTypeArg);
    }
}
