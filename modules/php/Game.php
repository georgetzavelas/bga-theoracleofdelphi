<?php
/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * theoracleofdelphi implementation : © George Tzavelas
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

namespace Bga\Games\theoracleofdelphi;

use Bga\Games\theoracleofdelphi\States\RoundStart;
use Bga\Games\theoracleofdelphi\States\DraftShipTile;
use Bga\Games\theoracleofdelphi\MaterialDefs;
use Bga\Games\theoracleofdelphi\DraftLogic;

// HexUtils sits in the global namespace and is required by various
// state classes; pull it in here so Game's own adjacency helpers can
// use \HexUtils::hexDistance regardless of which state loaded first.
require_once(__DIR__ . '/HexUtils.php');

// Pure JSON serialization contract for the undo buffer (Task 2). The table
// + globals manifests it exposes (UndoState::SNAPSHOT_TABLES / GLOBAL_KEYS)
// are the single source of truth for what the undo engine below captures.
require_once(__DIR__ . '/UndoState.php');

class Game extends \Bga\GameFramework\Table
{
    /**
     * Ship-tile assignment option (gameoptions.json id 100). RANDOM deals
     * one tile to each player at setup (base game); DRAFT lays out N+1
     * tiles face up and players choose in reverse turn order.
     */
    private const OPT_SHIP_TILE_MODE = 100;
    private const SHIP_TILE_MODE_RANDOM = 1;
    private const SHIP_TILE_MODE_DRAFT = 2;

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
     * Detect a stale custom-table schema in studio and resync if needed.
     *
     * BGA Studio keeps custom tables across game creations, and CREATE
     * TABLE IF NOT EXISTS in dbmodel.sql silently no-ops on existing
     * tables — so columns added later never land on pre-existing
     * studio tables. upgradeTableDb covers the in-progress-game path
     * but does not fire on createGame, so this is the createGame-side
     * equivalent.
     *
     * The check is one SHOW COLUMNS query for a known-recent column
     * (hex.tile_type). On fresh tables it returns immediately; only a
     * stale schema triggers the full resync. Release-build smoke tests
     * always start with fresh tables and pay only the cost of the one
     * sentinel query.
     */
    private function ensureCustomSchema(): void
    {
        $hasTileType = !empty(self::getObjectListFromDB(
            "SHOW COLUMNS FROM `hex` LIKE 'tile_type'"
        ));
        if (!$hasTileType) {
            $this->resyncStudioSchema_2605131800();
        }
    }

    /**
     * Player-table columns this game owns and mutates during play. Single
     * source of truth for both ensurePlayerColumns (schema) and the undo
     * restore allowlist (restoreUndoState). The undo buffer restores ONLY
     * these columns via raw UPDATE and never framework-managed ones:
     * restoring e.g. player_remaining_reflexion_time or player_zombie is
     * wrong, and restoring player_beginner overflowed the column once
     * JSON_INVALID_UTF8_SUBSTITUTE widened its non-UTF-8 value ("Data too
     * long").
     *
     * Score is deliberately NOT listed here: the score columns are owned by
     * the BGA counters (playerScore / playerScoreAux) and are captured and
     * restored through those counters, never by reading or writing the columns
     * directly. Add a new owned column here and both paths pick it up.
     */
    private const OWNED_PLAYER_COLUMNS = [
        'ship_q' => 'INT DEFAULT NULL',
        'ship_r' => 'INT DEFAULT NULL',
        'shield_value' => 'INT NOT NULL DEFAULT 0',
        'favor_tokens' => 'INT NOT NULL DEFAULT 0',
        'ship_tile_id' => 'INT DEFAULT NULL',
        'oracle_card_used_this_turn' => 'TINYINT(1) DEFAULT 0',
        'tasks_completed' => 'INT NOT NULL DEFAULT 0',
    ];

    /**
     * Ensure custom columns exist on the player table.
     * Uses a column check to avoid "Duplicate column" errors on re-creation.
     */
    private function ensurePlayerColumns(): void
    {
        $existing = array_column(
            self::getObjectListFromDB("SHOW COLUMNS FROM `player`"),
            'Field'
        );

        foreach (self::OWNED_PLAYER_COLUMNS as $name => $definition) {
            if (!in_array($name, $existing, true)) {
                static::DbQuery("ALTER TABLE `player` ADD `$name` $definition");
            }
        }
    }

    /**
     * Insert the "artificial shallows" — the enclosed holes between the
     * assembled cluster tiles — as tile_type='shallows' hex rows. They carry
     * no cluster, colour, or content. INSERT IGNORE against the UNIQUE(q,r)
     * key makes this idempotent (safe to re-run and safe if setup and the
     * backfill migration both touch the same board).
     *
     * @param list<array{q: int|string, r: int|string}> $occupiedHexes every
     *        hex already placed on the board (all cluster hexes)
     */
    private function insertGapShallows(array $occupiedHexes): void
    {
        $gaps = \HexUtils::findEnclosedGapHexes($occupiedHexes);
        foreach ($gaps as $gap) {
            $q = (int)$gap['q'];
            $r = (int)$gap['r'];
            static::DbQuery(
                "INSERT IGNORE INTO hex (q, r, tile_type, color, island_content,
                    is_revealed, cluster_id, cluster_type, cluster_rotation)
                 VALUES ($q, $r, 'shallows', NULL, NULL, 0, NULL, NULL, 0)"
            );
        }
    }

    /**
     * Backfill gap shallows onto an in-progress board that predates
     * insertGapShallows (upgradeTableDb path). Recomputes the enclosed holes
     * from whatever hexes the board already has and inserts the missing ones.
     */
    private function backfillGapShallows(): void
    {
        $rows = self::getObjectListFromDB("SELECT q, r FROM hex");
        if (empty($rows)) {
            return;  // no board yet — nothing to enclose
        }
        $this->insertGapShallows($rows);
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

        // Step 1b: Artificial shallows. Only cluster hexes are inserted
        // above; the holes between the assembled cluster tiles have no hex
        // of their own. Model them as tile_type='shallows' so a Shallow
        // Runner (Equipment 014) can cross them (and a normal ship cannot),
        // exactly like the cluster-centre shallows.
        $this->insertGapShallows($boardResult['hexes']);

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
    private function initPlayers(array $players, array $zeusPosition, bool $draftMode = false): void
    {
        $zeusQ = (int)$zeusPosition['q'];
        $zeusR = (int)$zeusPosition['r'];

        // Random mode deals tiles here (shuffle [0..7], deal first N). Draft
        // mode leaves ship_tile_id NULL: the pool is laid out in
        // setupNewGame and players choose in DraftShipTile.
        $shipTileIds = array_keys(MaterialDefs::SHIP_TILES);
        self::bgaShuffle($shipTileIds);

        $playerIndex = 0;
        foreach ($players as $player) {
            $playerId = (int)$player['player_id'];
            $playerNo = (int)$player['player_no'];

            // Base resources (tile-independent). Golden Touch's +1 favor and
            // Bronze Aegis's +2 shield are tile bonuses: applied inline below
            // in random mode, or at pick time (applyImmediateTileBonuses) in
            // draft mode.
            $favorTokens = 2 + $playerNo; // Player 1 gets 3, Player 2 gets 4, etc.
            $shieldValue = 0;

            $shipTileId = null;
            $ability = null;
            if (!$draftMode) {
                // Random mode applies the tile's immediate bonuses inline here
                // (the row is written below in one UPDATE). Draft mode applies
                // the same three rules via applyImmediateTileBonuses at pick
                // time — keep the two in sync if a tile's bonus changes.
                $shipTileId = $shipTileIds[$playerIndex];
                $ability = MaterialDefs::SHIP_TILES[$shipTileId]['ability'];
                if ($ability === 'shield_start') {
                    $shieldValue += 2;
                }
                // Golden Touch (+1) on starting favor — same rule as every
                // other favor gain, applied inline here because the tile row
                // isn't queryable yet during setup.
                $favorTokens = MaterialDefs::favorGainWithTile($ability, $favorTokens);
            }

            // Update player row
            $shipTileSql = $shipTileId === null ? 'NULL' : (int)$shipTileId;
            static::DbQuery("UPDATE player SET
                ship_q = $zeusQ,
                ship_r = $zeusR,
                shield_value = $shieldValue,
                favor_tokens = $favorTokens,
                ship_tile_id = $shipTileSql,
                tasks_completed = 0
                WHERE player_id = $playerId");

            // Insert 3 shrines
            for ($s = 0; $s < 3; $s++) {
                static::DbQuery("INSERT INTO shrine (player_id, shrine_index, is_built)
                    VALUES ($playerId, $s, 0)");
            }

            // Insert 6 gods. In random mode a god_track_high tile starts them
            // at the player-count step; in draft mode they start at 0 and
            // god_track_high is applied when that tile is drafted.
            $godStartStep = (!$draftMode && $ability === 'god_track_high')
                ? MaterialDefs::PLAYER_COUNT_STEP[count($players)]
                : 0;
            foreach (MaterialDefs::GODS as $godName => $godData) {
                $godName = addslashes($godName);
                static::DbQuery("INSERT INTO player_god (player_id, god_name, track_step)
                    VALUES ($playerId, '$godName', $godStartStep)");
            }

            // Public log: ship tile + starting resources. Draft mode defers
            // both to the DraftShipTile pick (shipTileDrafted notif), since
            // the tile and its favor/shield bonuses aren't known yet.
            if (!$draftMode) {
                $tileDescription = MaterialDefs::SHIP_TILES[$shipTileId]['description'];
                $shipTileName = MaterialDefs::SHIP_TILES[$shipTileId]['name'] ?? ('Ship Tile #' . $shipTileId);
                $this->notify->all("startingShipTile", clienttranslate('${player_name} receives ship tile ${shiptile}'), [
                    "player_id" => $playerId,
                    "player_name" => $this->getPlayerNameById($playerId),
                    "ship_tile_id" => $shipTileId,
                    "tile_description" => $tileDescription,
                    "shiptile" => $shipTileName,
                    "shiptile_id" => $shipTileId,
                    "preserve" => ["shiptile_id"],
                ]);

                if ($shieldValue > 0) {
                    $this->notify->all("startingResources", clienttranslate('${player_name} starts with ${favor_tokens} ${favor_tok} and ${shield_value} shield'), [
                        "player_id" => $playerId,
                        "player_name" => $this->getPlayerNameById($playerId),
                        "favor_tok" => "favor",
                        "favor_tokens" => $favorTokens,
                        "shield_value" => $shieldValue,
                    ]);
                } else {
                    $this->notify->all("startingResources", clienttranslate('${player_name} starts with ${favor_tokens} ${favor_tok}'), [
                        "player_id" => $playerId,
                        "player_name" => $this->getPlayerNameById($playerId),
                        "favor_tok" => "favor",
                        "favor_tokens" => $favorTokens,
                        "shield_value" => 0,
                    ]);
                }
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
     * God advances from step 0 to the player-count step.
     *
     * @param array<int, array{player_id: int}> $players
     */
    private function drawStartingInjuries(array $players): void
    {
        $playerCount = count($players);
        $playerCountStep = MaterialDefs::PLAYER_COUNT_STEP[$playerCount];

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
                // Advance this player's matching god from step 0 to player-count step
                $safeGodName = addslashes($godName);
                static::DbQuery("UPDATE player_god SET track_step = $playerCountStep
                    WHERE player_id = $playerId AND god_name = '$safeGodName' AND track_step = 0");
            }

            // Private: exact card goes to drawing player's hand
            $this->notify->player($playerId, "startingInjuryDrawnPrivate", '', [
                "card_id" => $cardId,
                "card_type_arg" => $colorIdx,
                "color" => $colorName,
            ]);

            // Public: injury color is revealed by the matching god advancement
            if ($godName !== null) {
                $this->notify->all("startingInjuryDrawn", clienttranslate('${player_name} draws a starting ${injury_tok} injury and advances ${god_tok} to step ${god_step}'), [
                    "player_id" => $playerId,
                    "player_name" => $this->getPlayerNameById($playerId),
                    "color" => $colorName,
                    "injury_tok" => $colorName,
                    "god_name" => $godName,
                    "god_tok" => ucfirst($godName),
                    "god_step" => $playerCountStep,
                ]);
            } else {
                $this->notify->all("startingInjuryDrawn", clienttranslate('${player_name} draws a starting ${injury_tok} injury'), [
                    "player_id" => $playerId,
                    "player_name" => $this->getPlayerNameById($playerId),
                    "color" => $colorName,
                    "injury_tok" => $colorName,
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
                $this->notify->all("startingBonusCards", clienttranslate('${player_name} draws 1 oracle card and will pick a starting equipment card'), [
                    "player_id" => $playerId,
                    "player_name" => $this->getPlayerNameById($playerId),
                    "equipment" => null,
                    "refilled_equipment" => null,
                ]);
            }
        }
    }

    /**
     * Whether this game uses the Ship Tile draft variant (gameoptions.json
     * option 100). Falls back to Random if the option can't be read, so the
     * base-game path is the safe default.
     */
    private function isDraftMode(): bool
    {
        try {
            return (int)$this->tableOptions->get(self::OPT_SHIP_TILE_MODE) === self::SHIP_TILE_MODE_DRAFT;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * Apply a ship tile's immediate, no-choice bonuses to an already-
     * initialised player row: Bronze Aegis (+2 shield), Golden Touch (+1
     * favor), Divine Patronage (all gods to the player-count step). The
     * draft pick calls this.
     *
     * NOTE: random-mode setup applies the SAME three rules inline in
     * initPlayers (while the row is first written). Keep the two in sync —
     * if a tile's bonus changes, update both here and initPlayers. The
     * Golden Touch magnitude is deliberately sourced from the shared
     * MaterialDefs::favorGainWithTile seam in both places so it can't drift.
     */
    private function applyImmediateTileBonuses(int $playerId, int $tileId): void
    {
        $ability = MaterialDefs::SHIP_TILES[$tileId]['ability'] ?? null;
        if ($ability === 'shield_start') {
            static::DbQuery("UPDATE player SET shield_value = shield_value + 2 WHERE player_id = $playerId");
        } elseif ($ability === 'favor_plus_1') {
            // Golden Touch (+1) on the starting favor grant, via the same
            // helper random mode uses (and every in-game favor gain), so the
            // boost amount stays defined in exactly one place.
            $current = (int)self::getUniqueValueFromDB("SELECT favor_tokens FROM player WHERE player_id = $playerId");
            $boosted = MaterialDefs::favorGainWithTile($ability, $current);
            static::DbQuery("UPDATE player SET favor_tokens = $boosted WHERE player_id = $playerId");
        } elseif ($ability === 'god_track_high') {
            $playerCount = (int)self::getUniqueValueFromDB("SELECT COUNT(*) FROM player");
            $step = (int)MaterialDefs::PLAYER_COUNT_STEP[$playerCount];
            static::DbQuery("UPDATE player_god SET track_step = $step WHERE player_id = $playerId");
        }
    }

    /**
     * Assign a drafted ship tile to a player and resolve its setup effects.
     * Called from DraftShipTile::actDraftTile. Applies the immediate bonuses,
     * mirrors the starting_equipment handling random-mode setup performs
     * (pending flag + oracle draw), leaves the extra Zeus tile in place so
     * RoundStart's DiscardZeusTile detour fires for Head Start, and announces
     * the pick.
     */
    public function assignDraftedShipTile(int $playerId, int $tileId): void
    {
        static::DbQuery("UPDATE player SET ship_tile_id = $tileId WHERE player_id = $playerId");

        $this->applyImmediateTileBonuses($playerId, $tileId);

        $ability = MaterialDefs::SHIP_TILES[$tileId]['ability'] ?? null;
        if ($ability === 'starting_equipment') {
            // Same deferral as random-mode setup: flag the equipment pick for
            // RoundStart's SelectStartingEquipment detour. The oracle draw
            // fires mid-game here, so use the live draw path (renders into the
            // hand) rather than the log-only starting-bonus notif.
            $this->globals->set('pending_starting_equipment_' . $playerId, 1);
            $this->drawOneOracleCardInline($playerId);
        }

        $resources = self::getObjectFromDB("SELECT favor_tokens, shield_value FROM player WHERE player_id = $playerId");
        $favor = (int)$resources['favor_tokens'];
        $shield = (int)$resources['shield_value'];
        $storage = (int)(MaterialDefs::SHIP_TILES[$tileId]['storage'] ?? 2);
        $tileName = MaterialDefs::SHIP_TILES[$tileId]['name'] ?? ('Ship Tile #' . $tileId);

        $this->notify->all("shipTileDrafted", clienttranslate('${player_name} selects ship tile ${shiptile}'), [
            "player_id" => $playerId,
            "player_name" => $this->getPlayerNameById($playerId),
            "ship_tile_id" => $tileId,
            "shiptile" => $tileName,
            "shiptile_id" => $tileId,
            "favor_tokens" => $favor,
            "shield_value" => $shield,
            "expanded_storage" => $storage > 2 ? 1 : 0,
            "preserve" => ["shiptile_id"],
        ]);
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
            $this->notify->all("startingDiceRolled", clienttranslate('${player_name} consults the oracle for 3 starting oracle dice: ${dice}'), [
                "player_id" => $playerId,
                "player_name" => $this->getPlayerNameById($playerId),
                "colors" => $rolled,
                "dice" => implode(', ', $rolled),
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
        // Game ends when one player completes all 12 Zeus tiles, so the
        // leader's task count drives the bar. min(100,…) caps the rare
        // overshoot from the Zeus-reach +1 score bonus.
        $max = (int)self::getUniqueValueFromDB(
            "SELECT IFNULL(MAX(tasks_completed), 0) FROM player"
        );
        return min(100, (int)floor($max * 100 / 12));
    }

    /**
     * Resolve a disconnected / zombified player's turn.
     *
     * Every active-player state class in modules/php/States ships its own
     * zombie(int $playerId) method that picks a safe default action (pass,
     * auto-pick, end-turn, etc.). We dispatch through
     * runStateClassZombie so the framework re-enters the state machine
     * exactly as if the player had submitted the action themselves.
     *
     * No multiactive states exist today; the multipleactiveplayer branch
     * is defensive in case one is added later.
     */
    public function zombieTurn(array $state, int $active_player): void
    {
        $type = $state['type'] ?? '';

        if ($type === 'activeplayer') {
            $this->gamestate->runStateClassZombie(
                $this->gamestate->getCurrentState($active_player),
                $active_player
            );
            return;
        }

        if ($type === 'multipleactiveplayer') {
            $this->gamestate->setPlayerNonMultiactive($active_player, '');
            return;
        }

        throw new \BgaVisibleSystemException(
            "Zombie mode not supported at this game state: " . ($state['name'] ?? '?')
        );
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
        // SCHEMA-CHANGE WORKFLOW (studio + production)
        //
        // 1. Edit dbmodel.sql so fresh tables get the new schema.
        // 2. Add a versioned block below using YYMMDDHHMM for the cutoff.
        //    BGA persists the migration version per game; in-progress
        //    games with a stored version <= the cutoff run the block
        //    exactly once on next load, then bump to the latest.
        // 3. New games created after the bump skip every block.
        //
        // Release-build creates fresh tables matching dbmodel.sql, so
        // $from_version >= max migration version on a fresh install
        // and every block below is skipped.

        if ($from_version <= 2605131800) {  // 2026-05-13 18:00 — initial schema resync
            // Some studio tables predate columns now declared in
            // dbmodel.sql (e.g. hex.tile_type). CREATE TABLE IF NOT
            // EXISTS at framework setup is a no-op on existing tables,
            // so the columns never land and setupNewGame fails on the
            // first INSERT against the stale schema.
            //
            // The fix is one-shot: drop + recreate every custom table
            // from the inline schema below. Fires once per affected
            // game then never again.
            $this->resyncStudioSchema_2605131800();
        }

        if ($from_version <= 2607111200) {  // 2026-07-11 12:00 — add undo buffer
            // Brand-new disposable table. IF NOT EXISTS genuinely creates it
            // on in-progress games (no stale-column trap since it is a new
            // table, not a new column). Losing an in-flight undo is harmless.
            static::DbQuery(
                "CREATE TABLE IF NOT EXISTS `undo_snapshot` (
                    `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
                    `payload` MEDIUMTEXT DEFAULT NULL,
                    `available` TINYINT(1) NOT NULL DEFAULT 0,
                    `action_label` VARCHAR(64) DEFAULT NULL,
                    PRIMARY KEY (`id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8"
            );
        }

        if ($from_version <= 2607131200) {  // 2026-07-13 12:00 — gap shallows
            // Older boards inserted only cluster hexes, so the holes between
            // assembled clusters ("artificial shallows") had no hex rows and
            // Shallow Runner (Equipment 014) could not route through them.
            // Backfill them for in-progress games. Idempotent (INSERT IGNORE
            // on UNIQUE(q,r); a board whose gaps are already filled yields no
            // new enclosed holes).
            $this->backfillGapShallows();
        }
    }

    /**
     * One-shot schema resync invoked from upgradeTableDb. Inlined SQL
     * mirrors dbmodel.sql verbatim — keep in sync if either changes
     * before this migration is squashed.
     */
    private function resyncStudioSchema_2605131800(): void
    {
        $tables = [
            'god_advancement_queue', 'player_island_knowledge', 'oracle_die', 'player_god',
            'zeus_tile', 'shrine', 'card', 'offering', 'statue', 'temple', 'monster',
            'hex', 'board_placement',
        ];
        foreach ($tables as $t) {
            static::DbQuery("DROP TABLE IF EXISTS `$t`");
        }

        $schema = <<<'SQL'
CREATE TABLE `board_placement` (
    `placement_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `cluster_id` VARCHAR(30) NOT NULL,
    `anchor_q` INT NOT NULL,
    `anchor_r` INT NOT NULL,
    `rotation` TINYINT NOT NULL DEFAULT 0,
    PRIMARY KEY (`placement_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `hex` (
    `hex_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `q` INT NOT NULL,
    `r` INT NOT NULL,
    `tile_type` VARCHAR(20) NOT NULL,
    `color` VARCHAR(10) DEFAULT NULL,
    `island_content` VARCHAR(50) DEFAULT NULL,
    `is_revealed` TINYINT(1) DEFAULT 0,
    `shrine_player_id` INT DEFAULT NULL,
    `shrine_letter` VARCHAR(10) DEFAULT NULL,
    `shrine_game_color` VARCHAR(10) DEFAULT NULL,
    `revealed_by_player_id` INT DEFAULT NULL,
    `cluster_id` INT DEFAULT NULL,
    `cluster_type` VARCHAR(30) DEFAULT NULL,
    `cluster_rotation` INT DEFAULT 0,
    PRIMARY KEY (`hex_id`),
    UNIQUE KEY `coords` (`q`, `r`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `monster` (
    `monster_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `color` VARCHAR(10) NOT NULL,
    `monster_type` VARCHAR(20) NOT NULL,
    `hex_q` INT NOT NULL,
    `hex_r` INT NOT NULL,
    `is_defeated` TINYINT(1) NOT NULL DEFAULT 0,
    `defeated_by_player_id` INT DEFAULT NULL,
    PRIMARY KEY (`monster_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `offering` (
    `offering_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `color` VARCHAR(10) NOT NULL,
    `origin_hex_q` INT NOT NULL,
    `origin_hex_r` INT NOT NULL,
    `player_id` INT DEFAULT NULL,
    `is_delivered` TINYINT(1) NOT NULL DEFAULT 0,
    `delivered_to_hex_q` INT DEFAULT NULL,
    `delivered_to_hex_r` INT DEFAULT NULL,
    `delivered_by_player_id` INT DEFAULT NULL,
    PRIMARY KEY (`offering_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `statue` (
    `statue_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `color` VARCHAR(10) NOT NULL,
    `origin_hex_q` INT NOT NULL,
    `origin_hex_r` INT NOT NULL,
    `player_id` INT DEFAULT NULL,
    `is_raised` TINYINT(1) NOT NULL DEFAULT 0,
    `raised_at_hex_q` INT DEFAULT NULL,
    `raised_at_hex_r` INT DEFAULT NULL,
    `raised_by_player_id` INT DEFAULT NULL,
    PRIMARY KEY (`statue_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `temple` (
    `temple_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `color` VARCHAR(10) NOT NULL,
    `hex_q` INT NOT NULL,
    `hex_r` INT NOT NULL,
    PRIMARY KEY (`temple_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `shrine` (
    `shrine_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `player_id` INT NOT NULL,
    `shrine_index` TINYINT NOT NULL,
    `is_built` TINYINT(1) NOT NULL DEFAULT 0,
    `built_at_hex_q` INT DEFAULT NULL,
    `built_at_hex_r` INT DEFAULT NULL,
    PRIMARY KEY (`shrine_id`),
    KEY `player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `player_island_knowledge` (
    `player_id` INT NOT NULL,
    `hex_q` INT NOT NULL,
    `hex_r` INT NOT NULL,
    PRIMARY KEY (`player_id`, `hex_q`, `hex_r`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `god_advancement_queue` (
    `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `player_id` INT NOT NULL,
    `source_player_id` INT NOT NULL,
    PRIMARY KEY (`id`),
    KEY `player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `oracle_die` (
    `die_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `player_id` INT NOT NULL,
    `die_index` TINYINT NOT NULL,
    `color` VARCHAR(10) NOT NULL,
    `original_color` VARCHAR(10) NOT NULL,
    `is_used` TINYINT(1) DEFAULT 0,
    PRIMARY KEY (`die_id`),
    KEY `player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `player_god` (
    `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `player_id` INT NOT NULL,
    `god_name` VARCHAR(20) NOT NULL,
    `track_step` INT NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    KEY `player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `zeus_tile` (
    `tile_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `player_id` INT NOT NULL,
    `task_type` VARCHAR(20) NOT NULL,
    `task_color` VARCHAR(10) DEFAULT NULL,
    `task_letter` VARCHAR(10) DEFAULT NULL,
    `completion_value` VARCHAR(20) DEFAULT NULL,
    `is_completed` TINYINT(1) DEFAULT 0,
    `sort_order` INT NOT NULL,
    PRIMARY KEY (`tile_id`),
    KEY `player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `card` (
    `card_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `card_type` VARCHAR(16) NOT NULL,
    `card_type_arg` INT(11) NOT NULL,
    `card_location` VARCHAR(16) NOT NULL,
    `card_location_arg` INT(11) NOT NULL DEFAULT 0,
    `card_order` INT NOT NULL DEFAULT 0,
    `is_wild` TINYINT(1) NOT NULL DEFAULT 0,
    `is_used` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (`card_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 AUTO_INCREMENT=1;
SQL;

        foreach (explode(';', $schema) as $stmt) {
            $stmt = trim($stmt);
            if ($stmt !== '') {
                static::DbQuery($stmt);
            }
        }
    }

    /*
     * Gather all information about current game situation (visible by the current player).
     *
     * The method is called each time the game interface is displayed to a player, i.e.:
     *
     * - when the game starts
     * - when a player refreshes the game page (F5)
     */
    protected function getAllDatas(int $currentPlayerId): array
    {
        $result = [];

        // BGA framework auto-fills $currentPlayerId. Local alias kept
        // for readability against the rest of this function's queries.
        $current_player_id = $currentPlayerId;

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

        // Bulk-load god track steps for all players.
        $godsByPlayer = [];
        foreach (self::getObjectListFromDB(
            "SELECT player_id AS pid, god_name AS god, track_step AS trackStep
             FROM player_god"
        ) as $row) {
            $godsByPlayer[(int)$row['pid']][$row['god']] = ['god' => $row['god'], 'step' => (int)$row['trackStep']];
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

        // Bulk-load oracle hand cards for all players. The colour we emit
        // is the card's CURRENT colour — recolored via the on-wheel chips
        // and retained across cancel + re-play via oracle_card_play_colors.
        // Falls back to the native colour from card_type_arg when no
        // retention is on record. Mirrors how oracle_die.color persists
        // the recolored colour on the die row.
        $playColors = $this->globals->get('oracle_card_play_colors') ?? [];
        $handByPlayer = [];
        foreach (self::getObjectListFromDB(
            "SELECT card_location_arg AS pid, card_id AS id, card_type_arg AS colorIdx
             FROM card WHERE card_type = 'oracle' AND card_location = 'hand'"
        ) as $row) {
            $cardId = (int)$row['id'];
            $nativeColor = MaterialDefs::COLORS[(int)$row['colorIdx']] ?? null;
            $color = $playColors[$cardId] ?? $nativeColor;
            $handByPlayer[(int)$row['pid']][] = [
                'id'    => $cardId,
                'color' => $color,
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
            $taskTotal = 12; // discarded fewer_tasks tile counts as completed (always 12)
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
                // Equipment cap: 4 for the Quartermaster (starting_equipment)
                // ship tile — 1 starting card + 3 monster rewards, legal per
                // errata — else 3. Drives the panel slot count so a
                // Quartermaster holder's 4th card has a slot to render in.
                'equipmentCapacity'   => MaterialDefs::equipmentCapacityForAbility($ability),
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
            "SELECT id, player_id AS playerId, god_name AS godName, track_step AS trackStep
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
        // Attach static equipment metadata + per-card retained-recolor
        // overlay so mid-turn reload paths render each card at its current
        // colour rather than the immutable card_type_arg native colour.
        $playColors = $this->globals->get('oracle_card_play_colors') ?? [];
        foreach ($result['hand'] as &$handCard) {
            if (($handCard['cardType'] ?? '') === 'equipment') {
                $typeArg = (int)($handCard['cardTypeArg'] ?? -1);
                $def = MaterialDefs::EQUIPMENT_CARDS[$typeArg] ?? null;
                $handCard['description'] = $def['description'] ?? '';
            } elseif (($handCard['cardType'] ?? '') === 'oracle') {
                $cardId = (int)($handCard['id'] ?? 0);
                $nativeColor = MaterialDefs::COLORS[(int)($handCard['cardTypeArg'] ?? -1)] ?? null;
                $handCard['currentColor'] = $playColors[$cardId] ?? $nativeColor;
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
        $result['bonusActionSpentColor'] = $this->globals->get('bonus_action_spent_color');

        // Private reload payload: card ids of the local player's setup one-
        // time equipment awaiting their first turn (drives the "Resolves on
        // your first turn" badge). Empties once PlayerTurnStart resolves them.
        $result['myPendingOneTimeEquipment'] = $this->pendingOneTimeEquipmentCardIds($current_player_id);

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

        // Persistent "who has looked at which hex" surfaced to every
        // viewer EXCEPT for the entries about themselves (their own
        // peeks already show as the flipped shrine letter, so adding
        // 'you have looked at this' to the tooltip is redundant). The
        // is_revealed=0 join drops entries for hexes that have since
        // been explored — once revealed, the tooltip switches to the
        // 'Explored Shrine Island' variant and the past peek is
        // visually irrelevant.
        $result['islandKnowledge'] = self::getObjectListFromDB(
            "SELECT pik.player_id AS playerId, pik.hex_q AS q, pik.hex_r AS r
             FROM player_island_knowledge pik
             INNER JOIN hex h ON h.q = pik.hex_q AND h.r = pik.hex_r
             WHERE h.is_revealed = 0 AND pik.player_id != $current_player_id"
        );

        // Live "someone is actively looking" reload payload — only
        // populated for non-active viewers when peek_viewing is set,
        // so a reconnect mid-look picks up the pulsing eye markers
        // immediately. Hex contents stay private; only the coords go
        // to opponents (mirror of the playerPeekedIslands public
        // notif).
        $result['activeLook'] = null;
        if ($this->globals->get('peek_viewing')) {
            $activePlayerId = (int)$this->getActivePlayerId();
            if ($current_player_id !== $activePlayerId) {
                $peekHexes = json_decode(
                    $this->globals->get('peek_hexes') ?? '[]',
                    true
                );
                $coords = [];
                foreach (is_array($peekHexes) ? $peekHexes : [] as $h) {
                    $coords[] = ['q' => (int)$h['q'], 'r' => (int)$h['r']];
                }
                $result['activeLook'] = [
                    'player_id' => $activePlayerId,
                    'hexes' => $coords,
                ];
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

        // Static lookup for ship-tile tooltips (game log + player panel) and
        // for the live panel refresh on a mid-game draft: name, storage,
        // ability key, and full ability text per tile id. 8 entries, cached
        // client-side. The ability key lets notif_shipTileDrafted re-derive a
        // drafter's movement hex (range_plus_2) without a reload.
        $result['shipTileDefs'] = [];
        foreach (MaterialDefs::SHIP_TILES as $tid => $def) {
            $result['shipTileDefs'][(int)$tid] = [
                'name' => $def['name'] ?? ('Ship Tile #' . $tid),
                'storage' => (int)($def['storage'] ?? 2),
                'ability' => $def['ability'] ?? null,
                'detail' => $def['detail'] ?? ($def['description'] ?? ''),
            ];
        }

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

        // End-of-game (final round) banner state, so a player who refreshes
        // mid-final-round still sees the announcement. winner_player_id is set
        // to the first player who reached Zeus (see registerZeusReach); its
        // presence means the final round is under way.
        $winnerId = (int)$this->globals->get('winner_player_id');
        $result['finalRound'] = $winnerId > 0
            ? ['reacher_id' => $winnerId, 'reacher_name' => $this->getPlayerNameById($winnerId)]
            : null;

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
     * Whether the player's current ship tile grants the named ability.
     * Lifted here so both the die-recolor (SelectAction) and card-recolor
     * (PlayerActions) paths can read ship-tile modifiers identically.
     */
    public function hasShipTileAbility(int $playerId, string $ability): bool
    {
        $shipTileId = $this->getUniqueValueFromDB(
            "SELECT ship_tile_id FROM player WHERE player_id = $playerId"
        );
        if ($shipTileId === null) return false;
        $tile = MaterialDefs::SHIP_TILES[(int)$shipTileId] ?? null;
        return $tile !== null && $tile['ability'] === $ability;
    }

    /**
     * Spend Favor for a wheel-distance recolor. Computes the cost from
     * fromColor → toColor (clockwise by default, cheaper of CW/CCW with
     * reverse_recolor, -1 with recolor_discount, floor 0), checks the
     * player can afford it, deducts the favor, and increments the
     * favor_tokens_spent stat. Returns ['cost' => int, 'newFavor' => int].
     * Throws UserException on same-colour target or insufficient favor —
     * paid-recolor callers (actRecolorDie, actRecolorCard) hit this
     * only after they've branched away from free-recolor paths.
     */
    public function applyRecolorCost(int $playerId, string $fromColor, string $targetColor, bool $allowDiscount = true): array
    {
        if ($fromColor === $targetColor) {
            throw new UserException(clienttranslate('Invalid recolor target'));
        }
        $bothDirections = $this->hasShipTileAbility($playerId, 'reverse_recolor');
        $baseCost = $this->getRecolorCost($fromColor, $targetColor, $bothDirections);
        if ($baseCost === 0) {
            throw new UserException(clienttranslate('Invalid recolor target'));
        }
        // Thrifty Wheel (recolor_discount) only discounts the FIRST recolor of
        // a source per turn ($allowDiscount, set by the caller). Applying it to
        // every recolor let a player chain free single-step recolors all the
        // way around the wheel; gating it makes incremental recoloring cost the
        // same as one multi-step recolor.
        $cost = ($allowDiscount && $this->hasShipTileAbility($playerId, 'recolor_discount'))
            ? max(0, $baseCost - 1)
            : $baseCost;
        $favor = (int)$this->getUniqueValueFromDB(
            "SELECT favor_tokens FROM player WHERE player_id = $playerId"
        );
        if ($favor < $cost) {
            throw new UserException(clienttranslate('Not enough Favor Tokens'));
        }
        if ($cost > 0) {
            $this->DbQuery(
                "UPDATE player SET favor_tokens = favor_tokens - $cost WHERE player_id = $playerId"
            );
            $this->statInc($cost, 'favor_tokens_spent', $playerId);
        }
        return ['cost' => $cost, 'newFavor' => $favor - $cost];
    }

    /**
     * Wheel-distance recolor cost from one oracle colour to another.
     * Clockwise only by default; with the reverse_recolor ship tile the
     * cheaper of CW/CCW is returned. 0 for same-colour, capped at the
     * wheel's half-distance via the min().
     */
    public function getRecolorCost(string $fromColor, string $targetColor, bool $bothDirections = false): int
    {
        if ($fromColor === $targetColor) return 0;
        $order = MaterialDefs::ORACLE_WHEEL_ORDER;
        $fromIdx = array_search($fromColor, $order);
        $toIdx = array_search($targetColor, $order);
        if ($fromIdx === false || $toIdx === false) return 0;
        $n = count($order);
        $cw = ($toIdx - $fromIdx + $n) % $n;
        if (!$bothDirections) return $cw;
        $ccw = $n - $cw;
        return min($cw, $ccw);
    }

    /**
     * Whether the Thrifty Wheel (recolor_discount) -1 is still available for
     * the player's currently-selected source (die or oracle card).
     *
     * The discount may apply only to the FIRST recolor of a source per turn.
     * A source that has already moved off its starting colour (die.color !=
     * original_color, or a regular card's current colour != its native colour)
     * has spent its discount; further steps pay full wheel cost. This is what
     * stops a Thrifty owner from chaining free single-step recolors around the
     * whole wheel. Returns false when the player lacks the ability, and for
     * wild cards (which recolor free via Apollo, not Thrifty). Drives both the
     * client's cost display (recolorDiscount arg) and the server cost gate, so
     * the two always agree.
     */
    public function recolorDiscountAvailable(int $playerId): bool
    {
        if (!$this->hasShipTileAbility($playerId, 'recolor_discount')) {
            return false;
        }
        $oracleCardId = (int)$this->globals->get('selected_oracle_card_id');
        if ($oracleCardId > 0) {
            $card = $this->getObjectFromDB(
                "SELECT card_type_arg, is_wild FROM card WHERE card_id = $oracleCardId"
            );
            if (!$card || (int)$card['is_wild'] === 1) {
                return false;
            }
            $native = MaterialDefs::COLORS[(int)$card['card_type_arg']] ?? null;
            return $native !== null && $this->getActionColor($playerId) === $native;
        }
        $dieIndex = $this->globals->get('selected_die_index');
        if ($dieIndex === null) {
            return false;
        }
        $die = $this->getObjectFromDB(
            "SELECT color, original_color FROM oracle_die
             WHERE player_id = $playerId AND die_index = $dieIndex"
        );
        return $die !== null && $die['color'] === $die['original_color'];
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
     * Grant favor tokens to a player, applying the Golden Touch
     * (favor_plus_1) ship-tile bonus exactly once.
     *
     * Returns ['delta' => favor actually added, 'total' => new favor total]
     * so callers log the real amount without a second SELECT — the ship
     * tile and current favor are read in one query.
     *
     * Use this for EVERY in-game favor gain so the tile is honored
     * consistently. The lone exception is the starting favor in
     * initPlayers(), which is added before the tile row is queryable; it
     * shares the rule via MaterialDefs::favorGainWithTile() instead.
     *
     * @return array{delta: int, total: int}
     */
    public function grantFavor(int $playerId, int $baseAmount): array
    {
        $row = $this->getObjectFromDB(
            "SELECT ship_tile_id, favor_tokens FROM player WHERE player_id = $playerId"
        );
        $tileId = $row['ship_tile_id'] ?? null;
        $ability = ($tileId === null || $tileId === '')
            ? null
            : (MaterialDefs::SHIP_TILES[(int)$tileId]['ability'] ?? null);
        $granted = MaterialDefs::favorGainWithTile($ability, $baseAmount);
        if ($granted > 0) {
            $this->DbQuery(
                "UPDATE player SET favor_tokens = favor_tokens + $granted WHERE player_id = $playerId"
            );
        }
        return ['delta' => $granted, 'total' => (int)($row['favor_tokens'] ?? 0) + $granted];
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
     * True when the player has already raised (delivered to a temple) a
     * statue of the given color. Used by Hermes' actGrabStatue to skip
     * colors the player can no longer usefully complete — once a color
     * is raised, the matching statue task slot is full and grabbing
     * another of the same color from a city would be wasteful.
     */
    public function playerHasRaisedStatueOfColor(int $playerId, string $color): bool
    {
        $safeColor = addslashes($color);
        $count = (int)$this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM statue
             WHERE player_id = $playerId AND is_raised = 1 AND color = '$safeColor'"
        );
        return $count > 0;
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
     * True if any of the named gods is below the topmost step for this
     * player (i.e. Divine Surge / card 021 could actually advance one).
     * Matches the `$row < 6` guard used throughout ChooseGodAdvancement.
     */
    public function hasAnyAdvanceableGod(int $playerId, array $godNames, int $maxStep = 6): bool
    {
        if (empty($godNames)) return false;
        $list = "'" . implode("','", array_map('addslashes', $godNames)) . "'";
        return (int)$this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM player_god
             WHERE player_id = $playerId
             AND god_name IN ($list)
             AND track_step < $maxStep"
        ) > 0;
    }

    /**
     * Card ids of the player's unused one-time (or mixed) equipment that
     * PlayerTurnStart will auto-resolve on their next turn — i.e. cards
     * dealt at setup (Quartermaster) that landed in hand before any state
     * machine was running.
     *
     * Drives the "Resolves on your first turn" badge. Mirrors the detection
     * in PlayerTurnStart::resolveNextPendingOneTimeEquipment (same hand /
     * is_used / type / IMPLEMENTED_ONE_TIME_CARDS filter) so the hint only
     * appears for cards that state will actually resolve.
     *
     * @return int[]
     */
    public function pendingOneTimeEquipmentCardIds(int $playerId): array
    {
        $cards = $this->getObjectListFromDB(
            "SELECT card_id, card_type_arg FROM card
             WHERE card_type = 'equipment' AND card_location = 'hand'
             AND card_location_arg = $playerId AND is_used = 0"
        );
        $ids = [];
        foreach ($cards as $c) {
            $cardTypeArg = (int)$c['card_type_arg'];
            $type = MaterialDefs::EQUIPMENT_CARDS[$cardTypeArg]['type'] ?? null;
            if ($type !== 'one_time' && $type !== 'mixed') continue;
            if (!in_array($cardTypeArg, \Bga\Games\theoracleofdelphi\States\PlayerTurnStart::IMPLEMENTED_ONE_TIME_CARDS, true)) continue;
            $ids[] = (int)$c['card_id'];
        }
        return $ids;
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
                // +3 Favor (+1 more with the Golden Touch ship tile)
                ['delta' => $favorDelta, 'total' => $newFavor] = $this->grantFavor($playerId, 3);

                // +1 Oracle Card from the top of the oracle deck (if any remain).
                // Shared with actDrawOracleCard / Phi shrine bonus / card 4/5/6
                // amulet activations via drawOneOracleCardInline.
                $this->drawOneOracleCardInline($playerId);
                $this->sealUndo();  // card draw is a hard commit (equipment 007)

                // Mark card 007 used (one-time; stays in hand as greyed out)
                $this->DbQuery(
                    "UPDATE card SET is_used = 1 WHERE card_id = $cardId"
                );

                // Notify activation
                $this->notify->all('equipmentActivated',
                    clienttranslate('${player_name} activates ${equipment_name} (+${favor_delta} favor, +1 oracle card, advance gods 2 steps)'),
                    [
                        'player_id' => $playerId,
                        'player_name' => $this->getPlayerNameById($playerId),
                        'card_id' => $cardId,
                        'equipment_name' => $this->equipmentName(7),
                        'favor_delta' => $favorDelta,
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

                return \Bga\Games\theoracleofdelphi\States\ChooseGodAdvancement::class;

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
                    clienttranslate('${player_name} activates ${equipment_name} (+1 shield, +1 permanent storage)'),
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
                //
                // No sealUndo() here: this branch never reveals anything
                // itself, it only stashes globals and routes to
                // ScoutIslands. The actual shrine-content reveal (and its
                // seal) lives in ScoutIslands::actConfirmPeek — see
                // task-5-report.md for why this deviates from the
                // originally-briefed location.
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

                return \Bga\Games\theoracleofdelphi\States\ScoutIslands::class;
            }

            case 21: {
                // Divine Surge: advance 1 of Poseidon/Hermes/Artemis/Aphrodite
                // straight to the topmost step of the God Track. If all 4
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
                return \Bga\Games\theoracleofdelphi\States\SelectGodForTopStep::class;
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

        return \Bga\Games\theoracleofdelphi\States\SelectOfferingFromAnyIsland::class;
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

        return \Bga\Games\theoracleofdelphi\States\SelectStatueFromAnyCity::class;
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

        return \Bga\Games\theoracleofdelphi\States\ChooseGodAdvancement::class;
    }

    /**
     * Advance the named god by one step on the God Track for a player.
     *
     * Shared by ChooseGodAdvancement::actAdvanceGod, SelectAction::actAdvanceGod,
     * and the alt-action amulet equipment cards (004/005/006). Handles the
     * step-0 case (first step jumps to the player-count step per the rulebook)
     * and emits the standard `godAdvanced` notif.
     *
     * Returns the new row (1..6). No-ops and returns the current row if the
     * god is already at the top (step 6) — the caller is responsible for
     * guarding that case with a `hasAnyAdvanceableGod` / `getAdvanceableGod`
     * check if it needs a hard error.
     */
    public function advanceGodOneStep(int $playerId, string $godName): int
    {
        $safeName = addslashes($godName);
        $currentStep = (int)$this->getUniqueValueFromDB(
            "SELECT track_step FROM player_god
             WHERE player_id = $playerId AND god_name = '$safeName'"
        );
        if ($currentStep >= 6) {
            return $currentStep;
        }

        if ($currentStep === 0) {
            $playerCount = (int)$this->getUniqueValueFromDB("SELECT COUNT(*) FROM player");
            $newStep = MaterialDefs::PLAYER_COUNT_STEP[$playerCount] ?? 1;
        } else {
            $newStep = $currentStep + 1;
        }

        $this->DbQuery(
            "UPDATE player_god SET track_step = $newStep
             WHERE player_id = $playerId AND god_name = '$safeName'"
        );
        $this->statInc($newStep - $currentStep, "{$godName}_advances", $playerId);

        $this->notify->all('godAdvanced', clienttranslate('${player_name} advances ${god_tok}'), [
            'player_id' => $playerId,
            'player_name' => $this->getPlayerNameById($playerId),
            'god_name' => $godName,
            'god_tok' => ucfirst($godName),
            'new_step' => $newStep,
            'preserve' => ['god_name'],
        ]);

        return $newStep;
    }

    /**
     * Eligibility filter used by the god-advancement queue: which of
     * $playerId's gods could they advance off of $sourcePlayerId's
     * current oracle dice colors. A god is eligible iff its color
     * appears on at least one of the source player's dice AND its
     * track_step is strictly between 0 (lowest row) and 6 (max).
     *
     * Shared by CheckGodAdvancement (for the active prompt) and by
     * drainAutoSkippableGodAdvancements (for the silent pre-drain).
     */
    public function computeEligibleGodsForOracleConsult(int $playerId, int $sourcePlayerId): array
    {
        $dice = $this->getObjectListFromDB(
            "SELECT color FROM oracle_die WHERE player_id = $sourcePlayerId"
        );
        $sourceColors = array_unique(array_column($dice, 'color'));
        $eligible = [];
        foreach ($sourceColors as $color) {
            foreach (MaterialDefs::GODS as $godName => $god) {
                if ($god['color'] !== $color) continue;
                $safeName = addslashes($godName);
                $step = (int)$this->getUniqueValueFromDB(
                    "SELECT track_step FROM player_god
                     WHERE player_id = $playerId AND god_name = '$safeName'"
                );
                if ($step > 0 && $step < 6) {
                    $eligible[] = [
                        'god_name' => $godName,
                        'color' => $color,
                        'current_step' => $step,
                    ];
                }
            }
        }
        return $eligible;
    }

    /**
     * Pop and silently auto-resolve every queue entry at the head of
     * $playerId's god_advancement_queue that has zero eligible gods.
     * Each drained entry emits a `skipGodAdvancement` notif citing the
     * source player so the game log stays informative.
     *
     * Called twice per turn:
     *   1. PlayerTurnStart, before routing to CheckGodAdvancement, so
     *      empties never produce a "no options here, click pass" UI
     *      prompt at the top of the turn.
     *   2. CheckGodAdvancement::checkForMore, after each in-state
     *      advancement, so a step-to-6 promotion that strips eligibility
     *      from a later queue entry doesn't surface as an empty prompt.
     *
     * Stops at the first entry with at least one eligible god so that
     * entry can be presented normally by CheckGodAdvancement.
     */
    public function drainAutoSkippableGodAdvancements(int $playerId): void
    {
        while (true) {
            $entry = $this->getObjectFromDB(
                "SELECT id, source_player_id FROM god_advancement_queue
                 WHERE player_id = $playerId ORDER BY id ASC LIMIT 1"
            );
            if (!$entry) return;

            $sourcePlayerId = (int)$entry['source_player_id'];
            $eligible = $this->computeEligibleGodsForOracleConsult($playerId, $sourcePlayerId);
            if (!empty($eligible)) return;

            $queueId = (int)$entry['id'];
            $this->DbQuery("DELETE FROM god_advancement_queue WHERE id = $queueId");

            $this->notify->all("skipGodAdvancement",
                clienttranslate('${player_name} had no god eligible to advance from ${source_player_name}\'s Oracle Consultation'), [
                "player_id" => $playerId,
                "player_name" => $this->getPlayerNameById($playerId),
                "source_player_id" => $sourcePlayerId,
                "source_player_name" => $this->getPlayerNameById($sourcePlayerId),
            ]);
        }
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
    public function drawOneOracleCardInline(int $playerId, ?string $publicLog = null): ?int
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
        // Callers that already log the draw in a combined line (e.g. trading a
        // god) pass $publicLog = '' to keep the card animation + panel update
        // while suppressing a redundant second log line.
        $this->notify->all('oracleCardDrawn', $publicLog ?? clienttranslate('${player_name} draws an oracle card'), [
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
            // Override-first: skip the per-call card DB lookup when the
            // colour was already seeded at play time. Regular cards write
            // selected_oracle_card_color in actPlayOracleCard; wild cards
            // write wild_card_chosen_color in actPlayWildOracleCard.
            // actRecolorCard updates whichever applies.
            $override = $this->globals->get('selected_oracle_card_color');
            if ($override) return $override;
            $wildColor = $this->globals->get('wild_card_chosen_color');
            if ($wildColor) return $wildColor;
            // Fallback for old saves predating the override globals.
            $card = $this->getObjectFromDB(
                "SELECT card_type_arg, is_wild FROM card WHERE card_id = $oracleCardId"
            );
            if (!$card) return null;
            if ((int)$card['is_wild'] === 1) return null;
            return MaterialDefs::COLORS[(int)$card['card_type_arg']] ?? null;
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
            clienttranslate('${player_name} activates ${equipment_name} (spends 3 favor for a bonus action)'),
            [
                'player_id' => $pid,
                'player_name' => $this->getPlayerNameById($pid),
                'card_id' => $cardId,
                'card_type_arg' => 3,
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
     * played, or a god whose ability is unlocked (track step 6). Used
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

        // Bonus Action card (003) still eligible? Mirrors the
        // activateBonusActionEquipment guards: card in hand, not yet
        // used this turn, and >= 3 favor.
        if ((int)$this->globals->get('equipment_bonus_action_used') === 0) {
            $hasBonusCard = (int)$this->getUniqueValueFromDB(
                "SELECT COUNT(*) FROM card
                 WHERE card_type = 'equipment' AND card_type_arg = 3
                 AND card_location = 'hand' AND card_location_arg = $playerId"
            );
            if ($hasBonusCard > 0) {
                $favor = (int)$this->getUniqueValueFromDB(
                    "SELECT favor_tokens FROM player WHERE player_id = $playerId"
                );
                if ($favor >= 3) return true;
            }
        }

        // Any unlocked god whose ability is currently *usable* (not just
        // unlocked at step 6). Mirrors the per-ability gates from
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
             WHERE player_id = $playerId AND track_step = 6"
        );
        if (empty($gods)) return false;

        foreach ($gods as $god) {
            $ability = MaterialDefs::GODS[$god['god_name']]['ability'] ?? null;
            if (!$ability) continue;
            switch ($ability) {
                case 'grab_any_statue':
                    // Hermes: cargo space + ship adjacent to a city +
                    // at least one available statue colour that would
                    // complete a task (FAQ rule, mirrors the filter in
                    // UseGodAbility::getCitiesWithStatues).
                    if ($this->playerHasCargoSpace($playerId)
                            && $this->playerShipAdjacentToCity($playerId)
                            && $this->playerHasGrabbableStatueColorForTask($playerId)) {
                        return true;
                    }
                    break;
                case 'auto_defeat_monster':
                    // Ares: at least one adjacent monster whose type
                    // completes a remaining task (FAQ rule). Ship-
                    // adjacency alone isn't sufficient since the act
                    // would reject the defeat anyway.
                    if ($this->playerHasAdjacentMonsterForTask($playerId)) {
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
                    // unlocked at step 6.
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

    /**
     * Equipment 009/010/012 range extension: target is reachable from
     * ship at distance 1 (edge-adjacent) OR distance 2 via a single
     * water hex in between. Mirrors the private helpers in
     * SelectAction / LoadCargo / DeliverCargo so god-ability paths
     * (Ares' auto-defeat, Hermes' grab-any-statue adjacency gate)
     * can honour the same equipment cards as the regular Fight /
     * Load / Deliver actions.
     *
     * Per the rulebook, "1 water space away" means a water hex
     * (not shallows — Equipment 014 overrides ship movement but
     * doesn't extend the "1 water space" range qualifier).
     */
    public function isReachableForEquipmentRange(int $shipQ, int $shipR, int $targetQ, int $targetR): bool
    {
        $dist = \HexUtils::hexDistance($shipQ, $shipR, $targetQ, $targetR);
        if ($dist === 1) return true;
        if ($dist !== 2) return false;
        foreach (\ClusterDefinitions::DIRECTION_LIST as $dir) {
            $nq = $shipQ + (int)$dir['dq'];
            $nr = $shipR + (int)$dir['dr'];
            if (\HexUtils::hexDistance($nq, $nr, $targetQ, $targetR) !== 1) continue;
            $tileType = $this->getUniqueValueFromDB(
                "SELECT tile_type FROM hex WHERE q = $nq AND r = $nr"
            );
            if ($tileType === 'water') return true;
        }
        return false;
    }

    /**
     * Ship is "in range" of a city per the Load adjacency rule —
     * dist 1 normally, dist 2 (with a water hex between) when the
     * player owns Equipment 009 (Long Hook). Used by Hermes'
     * grab_any_statue precondition AND by actGrabStatue's
     * validation so the rulebook line "If your Ship is adjacent
     * to a City Tile" honours card 009 the same way the regular
     * Load Statue action does.
     */
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
        $extended = $this->playerOwnsEquipment($playerId, 9, false);
        foreach ($cities as $city) {
            $cq = (int)$city['q'];
            $cr = (int)$city['r'];
            $reachable = $extended
                ? $this->isReachableForEquipmentRange($shipQ, $shipR, $cq, $cr)
                : (\HexUtils::hexDistance($shipQ, $shipR, $cq, $cr) === 1);
            if ($reachable) return true;
        }
        return false;
    }

    /**
     * Ship is "in range" of an undefeated monster per the Fight
     * adjacency rule — dist 1 normally, dist 2 (with a water hex
     * between) when the player owns Equipment 010 (Seafarer Charm).
     * Used by Ares' auto_defeat_monster availability gate so the
     * "must be adjacent to a monster" precondition extends with
     * card 010 the same way regular Fight does.
     */
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
        $extended = $this->playerOwnsEquipment($playerId, 10, false);
        foreach ($monsters as $m) {
            $mq = (int)$m['hex_q'];
            $mr = (int)$m['hex_r'];
            $reachable = $extended
                ? $this->isReachableForEquipmentRange($shipQ, $shipR, $mq, $mr)
                : (\HexUtils::hexDistance($shipQ, $shipR, $mq, $mr) === 1);
            if ($reachable) return true;
        }
        return false;
    }

    /**
     * True iff at least one monster adjacent to the player's ship has a
     * monster_type that would complete an open Zeus tile for this player.
     * Stricter than playerShipAdjacentToMonster — adjacency alone isn't
     * enough since the FAQ blocks defeating monsters with no task. Used
     * by the Ares usability check so the god doesn't show as available
     * when every adjacent monster's type is already done or excluded.
     */
    public function playerHasAdjacentMonsterForTask(int $playerId): bool
    {
        $player = $this->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];
        $monsters = $this->getObjectListFromDB(
            "SELECT monster_type, hex_q, hex_r FROM monster WHERE is_defeated = 0"
        );
        // Honour Equipment 010 (Seafarer Charm) the same way regular
        // Fight does — distance 2 via a water hex counts as reachable.
        $extended = $this->playerOwnsEquipment($playerId, 10, false);
        foreach ($monsters as $m) {
            $mq = (int)$m['hex_q'];
            $mr = (int)$m['hex_r'];
            $reachable = $extended
                ? $this->isReachableForEquipmentRange($shipQ, $shipR, $mq, $mr)
                : (\HexUtils::hexDistance($shipQ, $shipR, $mq, $mr) === 1);
            if (!$reachable) continue;
            if ($this->wouldCompleteZeusTileForType($playerId, 'monster', $m['monster_type'])) {
                return true;
            }
        }
        return false;
    }

    /**
     * True iff at least one statue currently sitting on a city tile has a
     * colour the player could meaningfully grab right now — i.e. would
     * complete an open Zeus tile, isn't already on board, and isn't
     * already raised. Mirrors the filter on UseGodAbility's
     * getCitiesWithStatues so the Hermes usability flag stays consistent
     * with what the picker actually offers.
     */
    /**
     * Whether the player still needs to take MORE cargo of a given type
     * ('statue' or 'offering'): they hold fewer such items in their ship than
     * they have incomplete Zeus tiles of that type. Enforces the FAQ rule
     * "you cannot load/grab items you don't need for a task" in the COUNT
     * sense — once your cargo already covers your remaining tasks of that
     * type, you can't take more. The per-colour checks
     * (playerHasCargoOfTypeAndColor, wouldCompleteZeusTileForType) decide
     * WHICH colours are valid; this decides WHETHER any more are needed at
     * all. That was the missing piece: statue tasks are "any colour", so a
     * player already carrying enough statues was still offered another (e.g.
     * Hermes showed usable with two statues aboard for two open tasks).
     */
    public function playerStillNeedsCargoOfType(int $playerId, string $type): bool
    {
        $inCargo = $type === 'offering'
            ? (int)$this->getUniqueValueFromDB(
                "SELECT COUNT(*) FROM offering WHERE player_id = $playerId AND is_delivered = 0")
            : (int)$this->getUniqueValueFromDB(
                "SELECT COUNT(*) FROM statue WHERE player_id = $playerId AND is_raised = 0");
        $safeType = addslashes($type);
        $openTasks = (int)$this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM zeus_tile
             WHERE player_id = $playerId AND task_type = '$safeType' AND is_completed = 0"
        );
        return $openTasks > $inCargo;
    }

    public function playerHasGrabbableStatueColorForTask(int $playerId): bool
    {
        // Already carrying enough statues for the remaining statue tasks →
        // Hermes can't usefully grab another (FAQ: don't take what you don't
        // need).
        if (!$this->playerStillNeedsCargoOfType($playerId, 'statue')) {
            return false;
        }
        $rows = $this->getObjectListFromDB(
            "SELECT DISTINCT s.color FROM hex h
             JOIN statue s ON s.origin_hex_q = h.q AND s.origin_hex_r = h.r
             WHERE h.island_content = 'city'
             AND s.player_id IS NULL AND s.is_raised = 0"
        );
        foreach ($rows as $r) {
            $color = $r['color'];
            if ($this->playerHasCargoOfTypeAndColor($playerId, 'statue', $color)) continue;
            if ($this->playerHasRaisedStatueOfColor($playerId, $color)) continue;
            if (!$this->wouldCompleteZeusTileForType($playerId, 'statue', $color)) continue;
            return true;
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
     * Every consumer (spendActionSource, ExploreIsland, SelectReward,
     * ChooseInjuryColor, etc.) routes through here instead of inlining its
     * own check. Turns never auto-advance: this always returns to the
     * PlayerActions hub, even when all dice are used and no non-die action
     * (oracle card, god ability, bonus action) remains — see
     * nextStateAfterDieAction below. The turn only actually ends via the
     * explicit actEndTurn (or zombie(), which delegates to it), which is
     * also where undo gets sealed for the turn boundary.
     */
    /**
     * Drop a god token from row 6 to the bottom row once an in-flight
     * ability has finished its reward chain. Per the rulebook:
     * "Only after it is completed does the God move down to the bottom
     * row from where it may advance up again." The Artemis / Ares
     * action handlers used to call resetGod immediately, which let a
     * sigma-shrine bonus (Artemis) or card 007 Big Bonus (Ares) re-
     * advance the same god while the reward chain was still resolving.
     * They now stash the god name in `pending_god_reset` and the
     * canonical action-completion site (nextStateAfterDieAction)
     * calls this helper to finish the reset.
     */
    public function consumePendingGodReset(int $playerId): void
    {
        $godName = $this->globals->get('pending_god_reset');
        if (!is_string($godName) || $godName === '') return;
        $this->globals->set('pending_god_reset', null);
        $this->resetGod($playerId, $godName);
    }

    public function nextStateAfterDieAction(int $playerId): string
    {
        // Drop any in-flight god from row 6 to the bottom now that the
        // reward chain has completed. Has to run BEFORE the actual
        // state branch so the next state's args (e.g. PlayerActions'
        // availableGods list) see the post-reset track position.
        $this->consumePendingGodReset($playerId);
        // Turns never auto-advance: even when all dice are used and no
        // non-die actions remain, we return to the hub so the player sees
        // End Turn (and Undo, if still available) and can take back their
        // last action before committing. The turn ends ONLY via the
        // explicit actEndTurn (or zombie(), which delegates to it) — that
        // is what actually transitions to ConsultOracle and seals undo.
        return \Bga\Games\theoracleofdelphi\States\PlayerActions::class;
    }

    /**
     * Resolve the exit state stashed in `equipment_post_activation_state`
     * when a one-time equipment sub-state finishes.
     *
     * CombatVictory computes that stash (via nextStateAfterDieAction) BEFORE
     * the sub-state runs. A god-promoting effect (Divine Surge → top row, or
     * a Blessed-Reward step that reaches row 6) resolved after the player's
     * last die can make a Special Action newly available — so a stash of
     * ConsultOracle (turn end) may be stale. Re-evaluate in that case:
     * nextStateAfterDieAction now always returns PlayerActions; a stale
     * ConsultOracle stash re-enters it and is routed to PlayerActions. Turns
     * end only via actEndTurn. An empty stash falls back to SelectAction
     * (legacy click-activation path).
     */
    public function resolvePostActivationExit(int $playerId, string $stashed): string
    {
        if ($stashed === \Bga\Games\theoracleofdelphi\States\ConsultOracle::class) {
            return $this->nextStateAfterDieAction($playerId);
        }
        if ($stashed !== '') {
            return $stashed;
        }
        return \Bga\Games\theoracleofdelphi\States\SelectAction::class;
    }

    /**
     * Count the equipment cards a player currently holds in hand. Shared by
     * the two monster-defeat cap checks (CombatResult dice path and Ares'
     * auto-defeat in UseGodAbility) so the cap query lives in one place.
     */
    public function countEquipmentInHand(int $playerId): int
    {
        return (int)$this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM card
             WHERE card_type = 'equipment' AND card_location = 'hand'
             AND card_location_arg = $playerId"
        );
    }

    /**
     * Maximum Equipment cards this player may hold: 4 for the Quartermaster
     * (starting_equipment) ship tile, 3 for everyone else. Drives the
     * monster-victory reward guards and the player-panel slot count so both
     * agree on the same cap.
     */
    public function equipmentCapacityFor(int $playerId): int
    {
        $tileId = $this->getUniqueValueFromDB(
            "SELECT ship_tile_id FROM player WHERE player_id = $playerId"
        );
        $ability = $tileId !== null
            ? (MaterialDefs::SHIP_TILES[(int)$tileId]['ability'] ?? null)
            : null;
        return MaterialDefs::equipmentCapacityForAbility($ability);
    }

    /**
     * Forfeit an unused instant (one-time) equipment card when the player
     * passes on it: mark it spent (so PlayerTurnStart's pending-one-time
     * scan won't re-fire it next turn) and log that it was discarded unused.
     * Shared by the offering/statue hook Pass handlers. $fallbackCardNumber
     * labels the notification if the card's type_arg can't be read.
     */
    public function forfeitInstantEquipmentCard(int $playerId, int $cardId, int $fallbackCardNumber): void
    {
        if ($cardId <= 0) return;
        $this->DbQuery("UPDATE card SET is_used = 1 WHERE card_id = $cardId");
        $cardTypeArg = (int)$this->getUniqueValueFromDB(
            "SELECT card_type_arg FROM card WHERE card_id = $cardId"
        );
        $equipmentName = $this->equipmentName($cardTypeArg > 0 ? $cardTypeArg : $fallbackCardNumber);
        $this->notify->all('equipmentUsed',
            clienttranslate('${player_name} passes on ${equipment_name}; it is discarded unused'), [
            'player_id' => $playerId,
            'player_name' => $this->getPlayerNameById($playerId),
            'card_id' => $cardId,
            'equipment_name' => $equipmentName,
        ]);
    }

    /**
     * Resolve a monster-defeat victory when the victor is already at their
     * equipment capacity (equipmentCapacityFor: 4 with the Quartermaster
     * ship tile, else 3): no card is taken, but the Zeus tile still
     * completes and the action source / deferred Ares god reset still
     * resolve. Shared by BOTH combat paths — CombatResult (dice roll) and
     * Ares' auto-defeat (UseGodAbility::actDefeatMonster) — so the cap is
     * enforced identically. In normal play this never fires (a player can
     * earn at most 3 monster rewards + 1 Quartermaster card = capacity); it
     * is a safety net. $monster needs monster_type + color.
     * Returns the next-state class.
     */
    public function resolveMonsterVictoryAtEquipmentCap(int $playerId, array $monster): string
    {
        $completedTileId = $this->completeZeusTileForType(
            $playerId, 'monster', $monster['monster_type']
        );

        $cap = $this->equipmentCapacityFor($playerId);
        $this->notify->all("equipmentCapReached",
            clienttranslate('${player_name} is at their Equipment limit (${cap} cards) and does not gain a card from this victory'), [
                "player_id" => $playerId,
                "player_name" => $this->getPlayerNameById($playerId),
                "cap" => $cap,
            ]
        );

        if ($completedTileId !== null) {
            $tasksCompleted = (int)$this->getUniqueValueFromDB(
                "SELECT tasks_completed FROM player WHERE player_id = $playerId"
            );
            $this->notify->all("taskCompleted", clienttranslate('${player_name} completes ${zeus_tok}, ${tasks_completed}/12 Zeus tiles completed'), [
                "player_id" => $playerId,
                "player_name" => $this->getPlayerNameById($playerId),
                "tile_id" => $completedTileId,
                "tasks_completed" => $tasksCompleted,
                "task_type" => "monster",
                "color" => $monster['color'],
                "completion_value" => $monster['color'],
                "zeus_tok" => "a Zeus tile",
                "zeus_img" => $this->zeusTileImgKey($completedTileId),
                "preserve" => ["zeus_img"],
            ]);
        }

        // Spend the die/oracle source (dice path) or clear the Ares flag
        // (god-power path), then route through nextStateAfterDieAction —
        // which consumes the deferred Ares god reset (pending_god_reset)
        // and picks the correct next state / turn end.
        $isAresDefeat = (int)$this->globals->get('ares_auto_defeat');
        if ($isAresDefeat) {
            $this->globals->set('ares_auto_defeat', null);
        } else {
            $oracleCardId = (int)$this->globals->get('combat_oracle_card_id');
            if ($oracleCardId > 0) {
                $this->globals->set('selected_oracle_card_id', $oracleCardId);
            } else {
                $this->globals->set('selected_die_index', $this->globals->get('combat_die_index'));
            }
            $this->spendActionSource($playerId);
        }

        // Clear combat globals (mirrors the states' private clearCombatGlobals).
        $this->globals->set('combat_monster_id', null);
        $this->globals->set('combat_strength', null);
        $this->globals->set('combat_roll', null);
        $this->globals->set('combat_die_index', null);
        $this->globals->set('combat_oracle_card_id', null);

        return $this->nextStateAfterDieAction($playerId);
    }

    /**
     * Reset the per-round "which colors have already triggered an
     * equipment reaction" set for the given player. Called from
     * ConsultOracle.onEnteringState before applying the rolled colors —
     * each Consult starts with no colors fired, then accumulates as the
     * freshly-rolled dice colors are processed.
     */
    public function resetEquipmentColorReactionsThisRound(int $playerId): void
    {
        $this->globals->set('equipment_color_reactions_' . $playerId, []);
    }

    /**
     * Trigger color-shown equipment reactions for $playerId at the
     * given $color. Currently covers the three Charm cards (Yellow=000,
     * Red=001, Black=002) — each grants 2 Favor when the player Consults
     * the Oracle and at least one of the rolled dice shows its color.
     * Fired only from ConsultOracle over the freshly-rolled dice; a later
     * recolor does NOT re-trigger the charm (it is a Consult-only ability).
     *
     * Idempotent within a Consult: the fired-set dedups the (up to three)
     * rolled colors so the same color on multiple dice grants 2 Favor
     * once, not per die. The set is reset each Consult in ConsultOracle
     * via resetEquipmentColorReactionsThisRound.
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
            // Player doesn't own the matching charm — nothing to grant.
            return;
        }

        $fired[] = $color;
        $this->globals->set($firedKey, $fired);

        ['delta' => $favorDelta, 'total' => $newFavor] = $this->grantFavor($playerId, 2);

        $cardRow = $this->getObjectFromDB(
            "SELECT card_id FROM card
             WHERE card_type = 'equipment' AND card_type_arg = $cardTypeArg
             AND card_location = 'hand' AND card_location_arg = $playerId
             LIMIT 1"
        );
        $cardId = $cardRow ? (int)$cardRow['card_id'] : 0;

        $this->notify->all('equipmentReactionTriggered',
            clienttranslate('${player_name} gains ${favor_delta} favor from ${equipment_name} (${color} shown)'), [
            'player_id'      => $playerId,
            'player_name'    => $this->getPlayerNameById($playerId),
            'card_id'        => $cardId,
            'equipment_name' => $this->equipmentName($cardTypeArg),
            'color'          => $color,
            'favor_delta'    => $favorDelta,
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
    /**
     * Build the "type:extra" image key for a Zeus tile (for the game-log image
     * token). Reads the tile's OWN descriptor: extra is the shrine letter, or
     * the task_color which holds the offering colour / monster TYPE (see the
     * monster note at getZeusTilesForPlayer). The triggering monster/offering
     * colour is NOT the tile's filename key, so always resolve from the tile.
     */
    public function zeusTileImgKey(int $tileId): string
    {
        $t = $this->getObjectFromDB(
            "SELECT task_type, task_color, task_letter FROM zeus_tile WHERE tile_id = $tileId"
        );
        if (!$t) return '';
        $extra = $t['task_type'] === 'shrine'
            ? ($t['task_letter'] ?? '')
            : ($t['task_color'] ?? 'any');
        return $t['task_type'] . ':' . $extra;
    }

    public function completeZeusTileForType(int $playerId, string $taskType, string $value): ?int
    {
        $tile = $this->findCompletableZeusTileForType($playerId, $taskType, $value);
        if (!$tile) return null;

        $tileId = (int)$tile['tile_id'];
        $safeValue = addslashes($value);
        $this->DbQuery(
            "UPDATE zeus_tile SET is_completed = 1, completion_value = '$safeValue'
             WHERE tile_id = $tileId"
        );
        $this->DbQuery(
            "UPDATE player SET tasks_completed = tasks_completed + 1
             WHERE player_id = $playerId"
        );
        $this->playerScore->inc($playerId, 1);
        $this->statInc(1, 'tasks_completed', $playerId);
        $this->statInc(1, $taskType . '_tasks_completed', $playerId);
        return $tileId;
    }

    /**
     * Read-only twin of completeZeusTileForType: returns the Zeus tile row
     * that WOULD be completed for ($taskType, $value) without mutating it.
     * Used by SelectAction / LoadCargo / UseGodAbility filters and the
     * one-time Hook equipment sub-states to enforce the FAQ rule "Can I
     * fight Monsters or load Statues or Offerings that I don't need to
     * complete for a task? No". Same selection rules as the mutating
     * version (specific match first, then white-tile fallback gated by
     * sibling exclusion).
     */
    public function findCompletableZeusTileForType(int $playerId, string $taskType, string $value): ?array
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

        return $tile ?: null;
    }

    /**
     * Boolean form of findCompletableZeusTileForType — true iff fighting/
     * loading the target would land on an uncompleted Zeus tile (specific
     * or white) for this player. Cheap wrapper for filter call sites.
     */
    public function wouldCompleteZeusTileForType(int $playerId, string $taskType, string $value): bool
    {
        return $this->findCompletableZeusTileForType($playerId, $taskType, $value) !== null;
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

        $this->notify->all("shrineBuilt", clienttranslate('${player_name} builds a shrine'), [
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
            "UPDATE player SET tasks_completed = tasks_completed + 1
             WHERE player_id = $playerId"
        );
        $this->playerScore->inc($playerId, 1);
        $this->statInc(1, 'tasks_completed', $playerId);
        $this->statInc(1, 'shrine_tasks_completed', $playerId);

        $tasksCompleted = (int)$this->getUniqueValueFromDB(
            "SELECT tasks_completed FROM player WHERE player_id = $playerId"
        );
        $this->notify->all("taskCompleted", clienttranslate('${player_name} completes ${zeus_tok}, ${tasks_completed}/12 Zeus tiles completed'), [
            "player_id" => $playerId,
            "player_name" => $this->getPlayerNameById($playerId),
            "tile_id" => $tileId,
            "tasks_completed" => $tasksCompleted,
            "task_type" => "shrine",
            "shrine_letter" => $shrineLetter,
            "zeus_tok" => "a Zeus tile",
            "zeus_img" => $this->zeusTileImgKey($tileId),
            "preserve" => ["zeus_img"],
        ]);

        return $tileId;
    }

    /**
     * Zeus's board position (the central start/destination space, which
     * is treated as a shallow during play), or null before setup stores
     * it. Shared by every path that can reach Zeus.
     * @return array{q: int, r: int}|null
     */
    public function getZeusPosition(): ?array
    {
        $pos = $this->globals->get('zeus_position');
        if (!$pos) return null;
        return ['q' => (int)$pos['q'], 'r' => (int)$pos['r']];
    }

    public function isZeusHex(int $q, int $r): bool
    {
        $zeus = $this->getZeusPosition();
        return $zeus !== null && $zeus['q'] === $q && $zeus['r'] === $r;
    }

    /**
     * A player qualifies for the end-game dash to Zeus once every one of
     * their Zeus tiles is completed (normally 12; 11 with the fewer_tasks
     * ship tile, which returns one tile to the box at setup).
     */
    public function isEligibleForZeus(int $playerId): bool
    {
        $incomplete = (int)$this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM zeus_tile
             WHERE player_id = $playerId AND is_completed = 0"
        );
        return $incomplete === 0;
    }

    /**
     * Record that a player's ship has landed on Zeus, triggering the
     * final round. Shared by every path that can reach Zeus: a normal
     * ship move (MoveShip) and Poseidon's Special Action teleport
     * (UseGodAbility, per rulebook p.12). The first reacher is locked in
     * as the pending winner; NextPlayer watches winner_player_id and
     * transitions to the end game once the rotation returns to them.
     * Later reachers in the same final round are added for EndScore's
     * tie-break. Adding a player is idempotent.
     */
    public function registerZeusReach(int $playerId): void
    {
        // Landing on Zeus is a public, game-ending commit: it announces the
        // final round to every player and its win globals (zeus_reachers /
        // winner_player_id) are intentionally not part of the undo
        // snapshot. Seal immediately so it can never be undone.
        $this->sealUndo();
        $reachers = $this->globals->get('zeus_reachers') ?? [];
        if (!in_array($playerId, $reachers, true)) {
            $reachers[] = $playerId;
            $this->globals->set('zeus_reachers', $reachers);
        }

        if (count($reachers) === 1) {
            // First player to reach — trigger the final-round rotation.
            $this->globals->set('winner_player_id', $playerId);
            $this->notify->all("reachedZeus", clienttranslate('${player_name} reaches Zeus! Final round — remaining players take one more turn.'), [
                "player_id" => $playerId,
                "player_name" => $this->getPlayerNameById($playerId),
            ]);
        } else {
            // Another Zeus-reach in the same final round — tie-break territory.
            $this->notify->all("reachedZeus", clienttranslate('${player_name} also reaches Zeus! Tie-breaker will decide the winner.'), [
                "player_id" => $playerId,
                "player_name" => $this->getPlayerNameById($playerId),
            ]);
        }
    }

    /**
     * Release the player's currently-selected (but not yet committed) action
     * source back to unselected: reset the matching globals and emit the
     * matching cancel notif so the client restores that source's visuals.
     *
     * Shared by SelectAction::actCancelDieSelection and every sub-action that
     * aborts back to PlayerActions without committing the source (MoveShip,
     * BuildShrine, ConfirmRecolor). Those paths previously cleared only the
     * die, so an oracle-card source was stranded — oracle_card_played stuck
     * at 1 — and the card could not be re-played until an unrelated die
     * cancel happened to run the card branch. Keying every release off
     * selected_oracle_card_id fixes that at the source.
     *
     * oracle_card_played is cleared ONLY in the card branch, so a card
     * committed earlier this turn (played=1, selected_oracle_card_id=0) keeps
     * the one-card-per-turn rule intact when a later die selection is released.
     */
    public function releaseSelectedSource(int $playerId): void
    {
        // Releasing a source WITHOUT spending it means the player backed out
        // of an action they had only STARTED (cancel from SelectAction /
        // MoveShip / ConfirmRecolor / BuildShrine). undoCheckpoint arms the
        // slot optimistically at source selection, so drop it here — nothing
        // committed, so no Undo button should appear back at the hub.
        // INVARIANT: any path that abandons an initiated action before it
        // commits must sealUndo() (see also UseGodAbility::actPass).
        $this->sealUndo();
        $oracleCardId = (int)$this->globals->get('selected_oracle_card_id');
        if ($oracleCardId > 0) {
            // Cancel oracle card — the card's paid recolor survives (mirrors
            // how oracle_die.color persists), so report the retained colour.
            $colors = MaterialDefs::COLORS;
            $card = $this->getObjectFromDB(
                "SELECT card_type_arg, is_wild FROM card WHERE card_id = $oracleCardId"
            );
            $nativeColor = $card ? ($colors[(int)$card['card_type_arg']] ?? 'red') : 'red';
            $isWild = $card ? (int)($card['is_wild'] ?? 0) === 1 : false;
            $playColors = $this->globals->get('oracle_card_play_colors') ?? [];
            $color = $playColors[$oracleCardId] ?? $nativeColor;

            $this->globals->set('selected_oracle_card_id', 0);
            $this->globals->set('selected_oracle_card_color', null);
            $this->globals->set('oracle_card_played', 0);
            $this->globals->set('demigod_wild_resolved', 0);

            $colorLabel = MaterialDefs::COLOR_NAMES[$color] ?? $color;
            $this->notify->all("oracleCardCancelled", clienttranslate('${player_name} cancels ${color_name} oracle card'), [
                "player_id" => $playerId,
                "player_name" => $this->getPlayerNameById($playerId),
                "card_id" => $oracleCardId,
                "card_color" => $color,
                "color_name" => $colorLabel,
                "is_wild" => $isWild,
            ]);
        } else {
            $this->globals->set('selected_die_index', null);
            // Next die selection restarts the Apollo recolor step, and the
            // demigod-wild one-shot resolves per-selection.
            $this->globals->set('apollo_pending_recolor', 0);
            $this->globals->set('demigod_wild_resolved', 0);
            $this->notify->all("dieCancelled", clienttranslate('${player_name} cancels die selection'), [
                "player_id" => $playerId,
                "player_name" => $this->getPlayerNameById($playerId),
            ]);
        }
    }

    /**
     * Spend the current action source (die, oracle card, or equipment
     * bonus action) after an action completes.
     *
     * Returns whatever nextStateAfterDieAction returns, which is now always
     * PlayerActions; the turn ends only via explicit actEndTurn.
     */
    public function spendActionSource(int $playerId): string
    {
        $usingBonus = $this->globals->get('bonus_action_color') !== null;
        $oracleCardId = (int)$this->globals->get('selected_oracle_card_id');

        if ($usingBonus) {
            // `equipment_bonus_action_available` was cleared when the
            // player committed (actUseBonusAction). Save the color into
            // bonus_action_spent_color so the client can render the
            // "spent" die overlay on the equipment card until end of
            // turn (cleared in actEndTurn / PlayerTurnStart).
            $spentColor = $this->globals->get('bonus_action_color');
            $this->globals->set('bonus_action_color', null);
            $this->globals->set('bonus_action_spent_color', $spentColor);
            // The bonus action committed successfully — drop the
            // stashed pre-bonus die index (used only by the cancel-
            // restore path in SelectAction::actCancelDieSelection).
            $this->globals->set('pre_bonus_die_index', null);
            $this->notify->all("bonusActionEnded", '', [
                "player_id" => $playerId,
                "color" => $spentColor,
            ]);
        } elseif ($oracleCardId > 0) {
            // Discard the oracle card
            $this->DbQuery(
                "UPDATE card SET card_location = 'discard', card_location_arg = 0
                 WHERE card_id = $oracleCardId"
            );
            $this->globals->set('selected_oracle_card_id', 0);
            $this->globals->set('selected_oracle_card_color', null);
            // Card spent — drop the retained-recolor hash entry so the
            // next time this card_id is dealt out, it starts at native.
            $playColors = $this->globals->get('oracle_card_play_colors') ?? [];
            if (isset($playColors[$oracleCardId])) {
                unset($playColors[$oracleCardId]);
                $this->globals->set('oracle_card_play_colors', $playColors);
            }
            $this->statInc(1, 'oracle_cards_used', $playerId);

            // No log line — the action's own line already conveys the play;
            // the notif still fires to drive the card-discard visual. Mirrors
            // bonusActionEnded (also silent) and dieUsed below.
            $this->notify->all("oracleCardDiscarded", '', [
                "player_id" => $playerId,
                "player_name" => $this->getPlayerNameById($playerId),
                "card_id" => $oracleCardId,
            ]);
        } else {
            // Spend the die
            $dieIndex = $this->globals->get('selected_die_index');
            // Read the die's current colour BEFORE the is_used flip
            // so the log message names the colour the player just
            // committed (post-Apollo / demigod recolor, if any).
            $dieColor = (string)$this->getUniqueValueFromDB(
                "SELECT color FROM oracle_die WHERE player_id = $playerId AND die_index = $dieIndex"
            );
            $this->DbQuery(
                "UPDATE oracle_die SET is_used = 1
                 WHERE player_id = $playerId AND die_index = $dieIndex"
            );
            $this->globals->set('selected_die_index', null);
            // Die action is committed — clear the demigod-wild
            // resolution flag so the next die-selection on this turn
            // can offer the wild choice fresh.
            $this->globals->set('demigod_wild_resolved', 0);

            // No log line — the action's own line already conveys the use;
            // the notif still fires to grey out the spent die in the tray.
            $this->notify->all("dieUsed", '', [
                "player_id" => $playerId,
                "player_name" => $this->getPlayerNameById($playerId),
                "die_index" => $dieIndex,
                "die" => ucfirst($dieColor),
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
     * Reset a god to step 0 after using its ability.
     */
    public function resetGod(int $playerId, string $godName, ?string $logOverride = null): void
    {
        $safeName = addslashes($godName);

        // Divine Patronage (god_track_high): after a Special Action the god
        // returns to the player-count row, not the bottom of the track. Every
        // other player resets to step 0. PLAYER_COUNT_STEP is the same mapping
        // part 1 (the starting boost) uses, so reset and start agree.
        $resetStep = 0;
        if ($this->hasShipTileAbility($playerId, 'god_track_high')) {
            $playerCount = (int)$this->getUniqueValueFromDB("SELECT COUNT(*) FROM player");
            // Player count is always 2-4, so the lookup always hits;
            // ?? 0 is just a defensive floor (treats a stray count as bottom).
            $resetStep = MaterialDefs::PLAYER_COUNT_STEP[$playerCount] ?? 0;
        }

        $this->DbQuery(
            "UPDATE player_god SET track_step = $resetStep
             WHERE player_id = $playerId AND god_name = '$safeName'"
        );

        // Callers that reset a god for a reason other than using its power
        // (e.g. trading it for an Oracle Card) pass their own log line via
        // $logOverride; the animation (disc slide to $resetStep) is the same.
        $logMsg = $logOverride ?? ($resetStep > 0
            ? clienttranslate('${player_name} uses ${god_name}\'s power (Divine Patronage: returns to the player-count row, not the bottom)')
            : clienttranslate('${player_name} uses ${god_name}\'s power (god returns to bottom of track)'));

        $this->notify->all("godReset", $logMsg, [
            "player_id" => $playerId,
            "player_name" => $this->getPlayerNameById($playerId),
            "god_name" => $godName,
            // god_tok renders the god as an icon token in log lines that
            // reference ${god_tok} (e.g. the trade-for-card override).
            "god_tok" => strtolower($godName),
            "reset_step" => $resetStep,
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
            // player_canal / player_avatar are no longer populated by the
            // framework (per BGA 2026 deprecations), so we don't insert them.
            $query_values[] = vsprintf("('%s', '%s', '%s')", [
                $player_id,
                array_shift($default_colors),
                addslashes($player["player_name"]),
            ]);
        }

        // Create players based on generic information.
        //
        // NOTE: You can add extra field on player table in the database (see dbmodel.sql) and initialize
        // additional fields directly here.
        static::DbQuery(
            sprintf(
                "INSERT INTO player (player_id, player_color, player_name) VALUES %s",
                implode(",", $query_values)
            )
        );

        $this->reattributeColorsBasedOnPreferences($players, $gameinfos["player_colors"]);
        $this->reloadPlayersBasicInfos();

        // Init global values with their initial values.
        $this->globals->set('selected_die_index', null);
        $this->globals->set('oracle_card_played', 0);
        $this->globals->set('selected_oracle_card_id', 0);
        $this->globals->set('selected_oracle_card_color', null);
        $this->globals->set('oracle_card_play_colors', []);
        $this->globals->set('equipment_bonus_action_used', 0);
        $this->globals->set('equipment_bonus_action_available', 0);
        $this->globals->set('bonus_action_color', null);
        $this->globals->set('bonus_action_spent_color', null);
        $this->globals->set('pre_bonus_die_index', null);
        $this->globals->set('cargo_action_type', null);
        $this->globals->set('cargo_item_id', null);

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
            // End-game flags written from EndScore: returned_to_zeus is
            // a binary 1/0 mirror of the BGA primary score, remaining_favors
            // captures the favor balance at game end so the post-game
            // scoreboard can answer "who hoarded favor?".
            'returned_to_zeus', 'remaining_favors',
        ];
        foreach ($playerStatNames as $statName) {
            $this->playerStats->init($statName, 0);
        }

        // Add custom columns to the BGA-managed player table.
        $this->ensurePlayerColumns();

        // Resync custom-table schema if the studio still holds a stale
        // copy that predates a column now in dbmodel.sql. Cheap no-op
        // on fresh tables (one SHOW COLUMNS query); full drop+recreate
        // only when drift is detected.
        $this->ensureCustomSchema();

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

        // Board-generation telemetry. The four table stats written below are
        // debugging breadcrumbs for a specific game: read board_seed_decimal and
        // board_algorithm_version from the game's stats, then reproduce the exact
        // board offline with:
        //     php tests/regenerate_board.php <board_seed_decimal>
        // (that tool refuses on an algorithm-version mismatch, so check out code
        // at the matching board_algorithm_version first). The attempts/ops stats
        // tell you whether a seed was "interesting" — a retry or a near-cap
        // strain — and so worth reproducing in the first place.
        $this->setGameStateValue('board_seed_decimal', $boardSeed);
        $this->setGameStateValue('board_algorithm_version', \BoardGenerator::ALGORITHM_VERSION);
        $this->statInc($boardSeed, 'board_seed_decimal');
        $this->statInc(\BoardGenerator::ALGORITHM_VERSION, 'board_algorithm_version');
        // How many backtracking attempts this seed needed (1 for ~96% of games;
        // 2-3 when the work budget abandoned a pathological attempt and retried).
        // Surfaced as a table stat so the abandon-and-retry rate is observable.
        $this->statInc($result['attempts'], 'board_generation_attempts');
        // Total work units spent across all attempts. Finer-grained than the
        // attempt count: shows a seed straining toward the per-attempt cap even
        // when it succeeds on the first try, so creeping difficulty is visible
        // before it turns into retries.
        $this->statInc($result['ops'], 'board_generation_ops');

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

        // Initialize players: ships, tiles, favor, shrines, gods (Phase 3c).
        // Draft mode leaves ship_tile_id NULL and applies no tile bonuses yet.
        $draftMode = $this->isDraftMode();
        $this->initPlayers($playerRows, $result['zeusPosition'], $draftMode);

        // Draw starting injuries + advance matching god (Phase 3c)
        $this->drawStartingInjuries($playerRows);

        // Apply ship tile bonuses that require card decks (Phase 3c). Draft
        // mode applies these per-tile at pick time (assignDraftedShipTile).
        if (!$draftMode) {
            $this->applyShipTileBonuses($playerRows);
        }

        // Roll initial oracle dice (Phase 3f)
        $this->rollInitialDice($playerRows);

        if ($draftMode) {
            // Lay out one more tile than players, face up, and let players
            // choose in reverse turn order. Immediate bonuses and the
            // interactive follow-ups (equipment / Zeus tile) resolve from
            // DraftShipTile and the existing RoundStart detours.
            $shipTileIds = array_keys(MaterialDefs::SHIP_TILES);
            self::bgaShuffle($shipTileIds);
            $pool = array_slice($shipTileIds, 0, DraftLogic::poolSize(count($playerRows)));
            $this->globals->set('draft_pool', array_values($pool));
            // Last player (highest player_no, the titan holder) drafts first.
            $this->gamestate->changeActivePlayer((int)$this->globals->get('titan_holder_id'));
            return DraftShipTile::class;
        }

        // Activate first player once everything has been initialized and ready.
        $this->activeNextPlayer();

        return RoundStart::class;
    }

    // =====================================================================
    // UNDO ENGINE
    //
    // Single-level, in-turn undo. `undoCheckpoint` snapshots game-content
    // tables + turn-scoped globals before a clean action point; `performUndo`
    // restores that snapshot and consumes the slot (no chaining). Table and
    // global manifests live on UndoState (Task 2) so they stay unit-testable
    // without a DB. See UndoState::SNAPSHOT_TABLES / UndoState::GLOBAL_KEYS.
    // =====================================================================

    /** @return array{tables: array, globals: array, scores: array} */
    public function captureUndoState(): array
    {
        $tables = [];
        foreach (UndoState::SNAPSHOT_TABLES as $t) {
            $tables[$t] = $this->getObjectListFromDB("SELECT * FROM `$t`");
        }
        // player + stats captured as full rows; restored by column UPDATE
        // (player limited to game-owned columns — see OWNED_PLAYER_COLUMNS).
        $tables['player'] = $this->getObjectListFromDB("SELECT * FROM player");
        $tables['stats']  = $this->getObjectListFromDB("SELECT * FROM stats");

        // Score is owned by the BGA counters, not a column we write: read it
        // through the counter API here and restore it through the same API,
        // so the score columns are never touched directly. Keyed by player id.
        $scores = [];
        foreach ($tables['player'] as $r) {
            $pid = (int)$r['player_id'];
            $scores[$pid] = [
                'primary' => (int)$this->playerScore->get($pid),
                'aux'     => (int)$this->playerScoreAux->get($pid),
            ];
        }

        $globals = [];
        foreach (UndoState::GLOBAL_KEYS as $k) {
            $globals[$k] = $this->globals->get($k);
        }
        return ['tables' => $tables, 'globals' => $globals, 'scores' => $scores];
    }

    // Atomicity note: this method is only ever called from performUndo(),
    // which runs inside a BGA action request. The framework wraps each
    // action in a single DB transaction and rolls back on any uncaught
    // exception, so a failure partway through the DELETE+reinsert loop
    // rolls back the whole restore (no partial wipe). An explicit
    // START TRANSACTION here would be wrong: MySQL implicitly commits the
    // framework's outer transaction, committing partial prior work.
    public function restoreUndoState(array $state): void
    {
        $tables  = $state['tables'] ?? [];
        $globals = $state['globals'] ?? [];

        // Game-content tables: wipe + reinsert this game's rows.
        foreach (UndoState::SNAPSHOT_TABLES as $t) {
            $this->DbQuery("DELETE FROM `$t`");
            foreach (($tables[$t] ?? []) as $row) {
                $this->insertRow($t, $row);
            }
        }
        // player: never delete framework rows. Restore ONLY game-owned columns
        // via raw UPDATE (see OWNED_PLAYER_COLUMNS). Framework columns
        // (player_beginner, reflexion-time, zombie/eliminated, ...) are left
        // untouched: restoring them is wrong, and player_beginner overflowed
        // once UTF-8 substitution widened its value. Score is handled below
        // through the counter API, never as a column here.
        $playerCols = array_keys(self::OWNED_PLAYER_COLUMNS);
        foreach (($tables['player'] ?? []) as $row) {
            $this->updateRowByKey('player', 'player_id', $row, $playerCols);
        }
        // Score: restore through the BGA counters that own it (captured the
        // same way). null on the aux set skips the auto-notif — a synthetic
        // tiebreaker, not a human-readable score (matches EndScore). Older
        // snapshots predate this section and simply skip score restore.
        foreach (($state['scores'] ?? []) as $pid => $s) {
            $pid = (int)$pid;
            if ($pid <= 0) continue;
            $this->playerScore->set($pid, (int)($s['primary'] ?? 0));
            $this->playerScoreAux->set($pid, (int)($s['aux'] ?? 0), null);
        }
        foreach (($tables['stats'] ?? []) as $row) {
            // stats PK is (stats_type, stats_player_id); update by both.
            $this->updateStatsRow($row);
        }
        foreach ($globals as $k => $v) {
            $this->globals->set($k, $v);
        }
    }

    private function insertRow(string $table, array $row): void
    {
        $cols = array_map(fn($c) => "`$c`", array_keys($row));
        $vals = array_map(fn($v) => $v === null ? 'NULL' : "'" . addslashes((string)$v) . "'", array_values($row));
        $this->DbQuery("INSERT INTO `$table` (" . implode(',', $cols) . ") VALUES (" . implode(',', $vals) . ")");
    }

    private function updateRowByKey(string $table, string $keyCol, array $row, ?array $onlyCols = null): void
    {
        if (!isset($row[$keyCol])) return;
        $sets = [];
        foreach ($row as $c => $v) {
            if ($c === $keyCol) continue;
            // When an allowlist is given, restore only those columns (undo must
            // not write framework-managed player columns). null = all columns.
            if ($onlyCols !== null && !in_array($c, $onlyCols, true)) continue;
            $sets[] = "`$c` = " . ($v === null ? 'NULL' : "'" . addslashes((string)$v) . "'");
        }
        if (!$sets) return;
        $key = addslashes((string)$row[$keyCol]);
        $this->DbQuery("UPDATE `$table` SET " . implode(',', $sets) . " WHERE `$keyCol` = '$key'");
    }

    /**
     * BGA-standard `stats` columns: stats_type, stats_player_id, stats_value.
     * Confirm against Studio (`SHOW COLUMNS FROM stats;`) if this build's
     * schema differs — see task-3-report.md.
     */
    private function updateStatsRow(array $row): void
    {
        if (!isset($row['stats_type'], $row['stats_player_id'])) return;
        $type = addslashes((string)$row['stats_type']);
        $pid  = addslashes((string)$row['stats_player_id']);
        $val  = $row['stats_value'] === null ? 'NULL' : "'" . addslashes((string)$row['stats_value']) . "'";
        $this->DbQuery(
            "UPDATE stats SET stats_value = $val WHERE stats_type = '$type' AND stats_player_id = '$pid'"
        );
    }

    private function undoTableExists(): bool
    {
        $row = $this->getObjectFromDB("SHOW TABLES LIKE 'undo_snapshot'");
        return $row !== null;
    }

    /**
     * Snapshot the current game state into the single-row undo buffer.
     * Fails closed: if capture or encoding throws for any reason (e.g. a
     * row holding invalid UTF-8 breaks json_encode under strict_types), no
     * checkpoint is written and undo simply stays unavailable. We never
     * want a partial/empty payload on disk — restoreUndoState would treat
     * an empty tables array as "delete everything, insert nothing."
     */
    public function undoCheckpoint(string $label): void
    {
        // New action-unit: no recolor has happened yet. This marker gates the
        // SelectAction Undo button so it appears only after a recolor.
        $this->globals->set('undo_recolor_marked', null);
        if (!$this->undoTableExists()) return;

        try {
            $payload = UndoState::encode($this->captureUndoState());
        } catch (\Throwable $e) {
            // Fail closed (skip the checkpoint) but never silently: a swallowed
            // exception here once left undo dead for an entire game — a single
            // non-UTF-8 cell in the snapshot made json_encode fail, and nothing
            // recorded it. Leave a trace so the next capture/encode failure is
            // visible instead of invisible. See UndoState::encode.
            $this->trace('undoCheckpoint capture/encode failed: ' . $e->getMessage());
            return;
        }

        $safe = addslashes($payload);
        $safeLabel = addslashes(substr($label, 0, 64));
        // Single-row upsert (id = 1 always).
        $this->DbQuery(
            "INSERT INTO undo_snapshot (id, payload, available, action_label)
             VALUES (1, '$safe', 1, '$safeLabel')
             ON DUPLICATE KEY UPDATE payload = '$safe', available = 1, action_label = '$safeLabel'"
        );
    }

    public function sealUndo(): void
    {
        if (!$this->undoTableExists()) return;
        $this->DbQuery("UPDATE undo_snapshot SET available = 0 WHERE id = 1");
    }

    public function undoAvailable(): bool
    {
        if (!$this->undoTableExists()) return false;  // not-yet-migrated game
        return (int)$this->getUniqueValueFromDB(
            "SELECT available FROM undo_snapshot WHERE id = 1"
        ) === 1;
    }

    public function performUndo(): string
    {
        if (!$this->undoAvailable()) {
            // Defensive: nothing to undo. Return to the hub unchanged.
            return \Bga\Games\theoracleofdelphi\States\PlayerActions::class;
        }
        $json = $this->getUniqueValueFromDB("SELECT payload FROM undo_snapshot WHERE id = 1");
        $decoded = UndoState::decode((string)$json);

        // Defensive: a corrupt/empty payload must never wipe the game.
        // Every legitimate checkpoint captures at least one player row, so
        // an empty/missing 'player' table means the payload is bad — seal
        // the slot (it's unusable either way) and bail without touching data.
        if (empty($decoded['tables']['player'])) {
            $this->sealUndo();
            return \Bga\Games\theoracleofdelphi\States\PlayerActions::class;
        }

        $this->restoreUndoState($decoded);
        $this->sealUndo();  // consume the slot: depth-1, no chaining
        // The recolor (if any) is now reverted, so drop its SelectAction marker.
        $this->globals->set('undo_recolor_marked', null);

        $activePlayerId = (int)$this->getActivePlayerId();
        $playerName = $this->getPlayerNameById($activePlayerId);
        // Per-player perspective (privacy): getAllDatas() bakes in the
        // RECIPIENT's private slices — peeked island/shrine contents
        // (player_island_knowledge WHERE player_id = current), Apollo wild
        // card flags, pending one-time equipment, and the recipient's own
        // hand. A single notify->all carrying the active player's getAllDatas
        // would leak that player's private info to every opponent AND clobber
        // each opponent's own private gamedatas. Send one targeted notif per
        // player, each scoped to THEIR OWN view, so the log line shows once
        // for everyone and no private data crosses players.
        foreach ($this->getObjectListFromDB("SELECT player_id FROM player") as $row) {
            $pid = (int)$row['player_id'];
            $this->notify->player($pid, "undoRestore",
                clienttranslate('${player_name} takes back their last action'), [
                "player_id"   => $activePlayerId,
                "player_name" => $playerName,
                "state"       => $this->getAllDatas($pid),
            ]);
        }
        return \Bga\Games\theoracleofdelphi\States\PlayerActions::class;
    }
}
