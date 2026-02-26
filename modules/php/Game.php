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

use Bga\Games\theoracleofdelphigzed\States\PlayerTurn;
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
                shuffle($colors);
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
     * Populate hex grid and place game pieces after board generation.
     */
    private function populateBoard(array $boardResult, array $clusterPlacementIds, int $playerCount): void
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
        shuffle($colors);
        foreach ($twoMonsterHexes as $i => $hex) {
            for ($j = 0; $j < 2; $j++) {
                $color = $colors[$i * 2 + $j];
                // Find monster type by color
                $type = '';
                foreach (MaterialDefs::MONSTERS as $monsterType => $data) {
                    if ($data['color'] === $color) {
                        $type = $monsterType;
                        break;
                    }
                }
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
                    $type = '';
                    foreach (MaterialDefs::MONSTERS as $monsterType => $data) {
                        if ($data['color'] === $color) {
                            $type = $monsterType;
                            break;
                        }
                    }
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
        shuffle($colors);

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
            "SELECT `player_id` `id`, `player_score` `score` FROM `player`"
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
                && !$hex['isRevealed']
                && !isset($peekedSet["{$hex['q']},{$hex['r']}"])) {
                $hex['islandContent'] = null;
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

        return $result;
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

        // Init game statistics.
        //
        // NOTE: statistics used in this file must be defined in your `stats.inc.php` file.

        // Dummy content.
        // $this->tableStats->init('table_teststat1', 0);
        // $this->playerStats->init('player_teststat1', 0);

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

        // Populate hex grid and game pieces
        $this->populateBoard($result, $clusterPlacementIds, count($players));

        // Save zeus position as a global
        $this->globals->set('zeus_position', $result['zeusPosition']);

        // Activate first player once everything has been initialized and ready.
        $this->activeNextPlayer();

        return PlayerTurn::class;
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
