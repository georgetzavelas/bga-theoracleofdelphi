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
            "SELECT DISTINCT h.q, h.r, s.statue_id, s.color AS statue_color
             FROM hex h
             JOIN statue s ON s.origin_hex_q = h.q AND s.origin_hex_r = h.r
             WHERE h.tile_type = 'city' AND s.player_id IS NULL AND s.is_raised = 0
             ORDER BY h.q, h.r"
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
