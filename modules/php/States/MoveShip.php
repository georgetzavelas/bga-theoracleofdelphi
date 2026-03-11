<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\HexPathfinder;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class MoveShip extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 30,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} moves ship'),
            descriptionMyTurn: clienttranslate('Select destination hex'),
        );
    }

    private function getMovementRange(int $playerId): int
    {
        $shipTileId = $this->game->getUniqueValueFromDB(
            "SELECT ship_tile_id FROM player WHERE player_id = $playerId"
        );
        $range = 3;
        if ($shipTileId !== null) {
            $tile = MaterialDefs::SHIP_TILES[(int)$shipTileId] ?? null;
            if ($tile && $tile['ability'] === 'range_plus_2') {
                $range = 5;
            }
        }
        return $range;
    }

    private function getPathfinder(): HexPathfinder
    {
        $pathfinder = new HexPathfinder();
        $waterHexes = $this->game->getObjectListFromDB(
            "SELECT q, r FROM hex WHERE tile_type = 'water'"
        );
        $pathfinder->loadWaterHexes($waterHexes);
        return $pathfinder;
    }

    private function getSelectedDieColor(int $playerId): string
    {
        $dieIndex = $this->game->globals->get('selected_die_index');
        $die = $this->game->getObjectFromDB(
            "SELECT color FROM oracle_die WHERE player_id = $playerId AND die_index = $dieIndex"
        );
        return $die ? $die['color'] : '';
    }

    /** @return array<string, string> Map of "q,r" => color for all water hexes */
    private function getWaterHexColors(): array
    {
        $rows = $this->game->getObjectListFromDB(
            "SELECT q, r, color FROM hex WHERE tile_type = 'water'"
        );
        $map = [];
        foreach ($rows as $row) {
            $map[(int)$row['q'] . ',' . (int)$row['r']] = $row['color'] ?? '';
        }
        return $map;
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $player = $this->game->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];
        $range = $this->getMovementRange($playerId);
        $dieColor = $this->getSelectedDieColor($playerId);

        $pathfinder = $this->getPathfinder();
        $reachable = $pathfinder->getReachableHexes($shipQ, $shipR, $range);

        // Filter: can only stop on hexes matching the die color
        $hexColors = $this->getWaterHexColors();
        $reachableList = [];
        foreach ($reachable as $key => $dist) {
            $hexColor = $hexColors[$key] ?? '';
            if ($hexColor === $dieColor) {
                [$q, $r] = explode(',', $key);
                $reachableList[] = ['q' => (int)$q, 'r' => (int)$r, 'distance' => $dist];
            }
        }

        return [
            'shipQ' => $shipQ,
            'shipR' => $shipR,
            'range' => $range,
            'dieColor' => $dieColor,
            'reachableHexes' => $reachableList,
        ];
    }

    #[PossibleAction]
    public function actConfirmMove(int $q, int $r, int $activePlayerId) {
        $player = $this->game->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $activePlayerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];
        $range = $this->getMovementRange($activePlayerId);

        $pathfinder = $this->getPathfinder();
        if (!$pathfinder->isReachable($shipQ, $shipR, $q, $r, $range)) {
            throw new UserException(clienttranslate('You cannot move there'));
        }

        // Destination must match die color
        $dieColor = $this->getSelectedDieColor($activePlayerId);
        $destColor = $this->game->getUniqueValueFromDB(
            "SELECT color FROM hex WHERE q = $q AND r = $r AND tile_type = 'water'"
        );
        if ($destColor !== $dieColor) {
            throw new UserException(clienttranslate('Destination must match die color'));
        }

        // Update ship position
        $this->game->DbQuery(
            "UPDATE player SET ship_q = $q, ship_r = $r WHERE player_id = $activePlayerId"
        );

        // Mark die as used
        $dieIndex = $this->game->globals->get('selected_die_index');
        $this->game->DbQuery(
            "UPDATE oracle_die SET is_used = 1
             WHERE player_id = $activePlayerId AND die_index = $dieIndex"
        );

        // Clear selected die
        $this->game->globals->set('selected_die_index', null);

        $this->notify->all("shipMoved", clienttranslate('${player_name} moves their ship'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "q" => $q,
            "r" => $r,
        ]);

        return PlayerActions::class;
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->game->globals->set('selected_die_index', null);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
