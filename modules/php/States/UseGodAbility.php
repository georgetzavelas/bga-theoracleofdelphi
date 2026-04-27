<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

require_once(__DIR__ . '/../HexUtils.php');

class UseGodAbility extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 38,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} uses ${god_name}\'s ability'),
            descriptionMyTurn: clienttranslate('${god_ability_instruction}'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $godName = $this->game->globals->get('active_god_ability');
        $ability = MaterialDefs::GODS[$godName]['ability'] ?? null;

        $args = [
            'god_name' => ucfirst($godName ?? ''),
            'god_ability_instruction' => $this->getInstruction($godName),
            'ability' => $ability,
            'godNameRaw' => $godName,
        ];

        switch ($ability) {
            case 'teleport_ship':
                $args['validHexes'] = $this->getWaterHexes();
                break;
            case 'free_explore_island':
                $args['validHexes'] = $this->getUnrevealedIslands();
                break;
            case 'auto_defeat_monster':
                $args['adjacentMonsters'] = $this->getAdjacentMonsters($playerId);
                break;
            case 'grab_any_statue':
                $args['validCities'] = $this->getCitiesWithStatues();
                break;
        }

        return $args;
    }

    private function getInstruction(?string $godName): string
    {
        return match ($godName) {
            'poseidon' => clienttranslate('Select a water hex to teleport your ship'),
            'artemis' => clienttranslate('Select an island to explore'),
            'ares' => clienttranslate('Select a monster to defeat'),
            'hermes' => clienttranslate('Select a city to take a statue from'),
            default => clienttranslate('Select a target'),
        };
    }

    private function getWaterHexes(): array
    {
        return $this->game->getObjectListFromDB(
            "SELECT q, r FROM hex WHERE tile_type = 'water'"
        );
    }

    private function getUnrevealedIslands(): array
    {
        return $this->game->getObjectListFromDB(
            "SELECT q, r, color FROM hex
             WHERE island_content = 'shrine' AND is_revealed = 0"
        );
    }

    private function getAdjacentMonsters(int $playerId): array
    {
        $player = $this->game->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];

        $monsters = $this->game->getObjectListFromDB(
            "SELECT monster_id, color, monster_type, hex_q, hex_r
             FROM monster WHERE is_defeated = 0"
        );

        $adjacent = [];
        foreach ($monsters as $m) {
            $dist = \HexUtils::hexDistance($shipQ, $shipR, (int)$m['hex_q'], (int)$m['hex_r']);
            if ($dist === 1) {
                $adjacent[] = [
                    'monster_id' => (int)$m['monster_id'],
                    'monster_type' => $m['monster_type'],
                    'color' => $m['color'],
                    'hex_q' => (int)$m['hex_q'],
                    'hex_r' => (int)$m['hex_r'],
                ];
            }
        }
        return $adjacent;
    }

    private function getCitiesWithStatues(): array
    {
        return $this->game->getObjectListFromDB(
            "SELECT MIN(s.statue_id) AS statue_id, s.color AS statue_color
             FROM hex h
             JOIN statue s ON s.origin_hex_q = h.q AND s.origin_hex_r = h.r
             WHERE h.island_content = 'city' AND s.player_id IS NULL AND s.is_raised = 0
             GROUP BY s.color
             ORDER BY s.color"
        );
    }

    // --- Poseidon: Teleport Ship ---

    #[PossibleAction]
    public function actTeleportShip(int $hexQ, int $hexR, int $activePlayerId) {
        $godName = $this->game->globals->get('active_god_ability');
        if ($godName !== 'poseidon') {
            throw new UserException(clienttranslate('Invalid action for current god ability'));
        }

        // Validate target is a water hex
        $hex = $this->game->getObjectFromDB(
            "SELECT q, r FROM hex WHERE q = $hexQ AND r = $hexR AND tile_type = 'water'"
        );
        if (!$hex) {
            throw new UserException(clienttranslate('Invalid destination'));
        }

        // Move ship
        $this->game->DbQuery(
            "UPDATE player SET ship_q = $hexQ, ship_r = $hexR WHERE player_id = $activePlayerId"
        );

        $this->notify->all("shipMoved", clienttranslate('${player_name} uses Poseidon to teleport ship'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "q" => $hexQ,
            "r" => $hexR,
        ]);

        $this->game->resetGod($activePlayerId, 'poseidon');
        $this->game->globals->set('active_god_ability', null);
        return PlayerActions::class;
    }

    // --- Artemis: Free Explore Island ---

    #[PossibleAction]
    public function actExploreIsland(int $hexQ, int $hexR, int $activePlayerId) {
        $godName = $this->game->globals->get('active_god_ability');
        if ($godName !== 'artemis') {
            throw new UserException(clienttranslate('Invalid action for current god ability'));
        }

        // Validate target is an unrevealed island
        $hex = $this->game->getObjectFromDB(
            "SELECT q, r FROM hex
             WHERE q = $hexQ AND r = $hexR AND island_content = 'shrine' AND is_revealed = 0"
        );
        if (!$hex) {
            throw new UserException(clienttranslate('Invalid island'));
        }

        // Set globals for ExploreIsland state
        $this->game->globals->set('explore_hex_q', $hexQ);
        $this->game->globals->set('explore_hex_r', $hexR);
        $this->game->globals->set('god_explore_source', 1);  // Flag: don't spend die

        $this->game->resetGod($activePlayerId, 'artemis');
        $this->game->globals->set('active_god_ability', null);
        return ExploreIsland::class;
    }

    // --- Ares: Auto-Defeat Adjacent Monster ---

    #[PossibleAction]
    public function actDefeatMonster(int $monster_id, int $activePlayerId) {
        $godName = $this->game->globals->get('active_god_ability');
        if ($godName !== 'ares') {
            throw new UserException(clienttranslate('Invalid action for current god ability'));
        }

        // Validate monster is adjacent
        $adjacentMonsters = $this->getAdjacentMonsters($activePlayerId);
        $valid = false;
        $monster = null;
        foreach ($adjacentMonsters as $m) {
            if ($m['monster_id'] === $monster_id) {
                $valid = true;
                $monster = $m;
                break;
            }
        }
        if (!$valid || !$monster) {
            throw new UserException(clienttranslate('That monster is not adjacent to your ship'));
        }

        // Auto-defeat: set combat globals for CombatVictory to handle rewards
        $this->game->globals->set('combat_monster_id', $monster_id);
        $this->game->globals->set('combat_strength', 0);
        $this->game->globals->set('combat_roll', 10); // auto-win
        $this->game->globals->set('ares_auto_defeat', 1);

        // Mark monster defeated in DB + notify clients (Ares skips CombatResult,
        // which is where non-Ares victories fire this).
        $this->game->DbQuery(
            "UPDATE monster SET is_defeated = 1, defeated_by_player_id = $activePlayerId
             WHERE monster_id = $monster_id"
        );

        $this->notify->all("godAbilityUsed", clienttranslate('${player_name} uses Ares to auto-defeat ${monster_type}!'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "god_name" => "ares",
            "ability" => "auto_defeat_monster",
            "monster_type" => $monster['monster_type'],
            "monster_id" => $monster_id,
        ]);

        $this->notify->all("monsterDefeated", clienttranslate('${player_name} defeats the ${monster_type}!'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "monster_id" => $monster_id,
            "monster_type" => $monster['monster_type'],
            "monster_color" => $monster['color'],
        ]);

        $this->game->resetGod($activePlayerId, 'ares');
        $this->game->globals->set('active_god_ability', null);

        // Go directly to CombatVictory for equipment selection and Zeus tile
        return CombatVictory::class;
    }

    // --- Hermes: Grab Any Statue From Any City ---

    #[PossibleAction]
    public function actGrabStatue(int $statue_id, int $activePlayerId) {
        $godName = $this->game->globals->get('active_god_ability');
        if ($godName !== 'hermes') {
            throw new UserException(clienttranslate('Invalid action for current god ability'));
        }

        // Validate ship is adjacent to ANY city
        $player = $this->game->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $activePlayerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];

        $cities = $this->game->getObjectListFromDB(
            "SELECT q, r FROM hex WHERE island_content = 'city'"
        );
        $adjacentToCity = false;
        foreach ($cities as $city) {
            if (\HexUtils::hexDistance($shipQ, $shipR, (int)$city['q'], (int)$city['r']) === 1) {
                $adjacentToCity = true;
                break;
            }
        }
        if (!$adjacentToCity) {
            throw new UserException(clienttranslate('Your ship must be adjacent to a city'));
        }

        // Validate statue exists and is available
        $statue = $this->game->getObjectFromDB(
            "SELECT statue_id, color, origin_hex_q, origin_hex_r FROM statue
             WHERE statue_id = $statue_id AND player_id IS NULL AND is_raised = 0"
        );
        if (!$statue) {
            throw new UserException(clienttranslate('Invalid statue'));
        }

        // Validate cargo space
        $shipTileId = $this->game->getUniqueValueFromDB(
            "SELECT ship_tile_id FROM player WHERE player_id = $activePlayerId"
        );
        $capacity = MaterialDefs::SHIP_TILES[(int)($shipTileId ?? 0)]['storage'] ?? 2;
        $offeringCount = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM offering WHERE player_id = $activePlayerId AND is_delivered = 0"
        );
        $statueCount = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM statue WHERE player_id = $activePlayerId AND is_raised = 0"
        );
        if (($offeringCount + $statueCount) >= $capacity) {
            throw new UserException(clienttranslate('No cargo space available'));
        }

        // Load statue onto ship
        $this->game->DbQuery(
            "UPDATE statue SET player_id = $activePlayerId WHERE statue_id = $statue_id"
        );

        $this->notify->all("godAbilityUsed", clienttranslate('${player_name} uses Hermes to grab a ${statue_color} statue'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "god_name" => "hermes",
            "ability" => "grab_any_statue",
            "statue_id" => (int)$statue['statue_id'],
            "statue_color" => $statue['color'],
            "from_hex_q" => (int)$statue['origin_hex_q'],
            "from_hex_r" => (int)$statue['origin_hex_r'],
        ]);

        $this->notify->all("loadCargo",
            clienttranslate('${player_name} loads the ${color} statue onto their ship'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "item_type" => "statue",
            "item_id" => (int)$statue['statue_id'],
            "color" => $statue['color'],
            "hex_q" => (int)$statue['origin_hex_q'],
            "hex_r" => (int)$statue['origin_hex_r'],
            "i18n" => ['color'],
        ]);

        $this->game->resetGod($activePlayerId, 'hermes');
        $this->game->globals->set('active_god_ability', null);
        return PlayerActions::class;
    }

    // --- Cancel ---

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("cancelGodAbility", clienttranslate('${player_name} cancels god ability'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        $this->game->globals->set('active_god_ability', null);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
