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

    private function getMaxMovementRange(int $playerId): int
    {
        $baseRange = $this->getMovementRange($playerId);
        $favor = (int)$this->game->getUniqueValueFromDB(
            "SELECT favor_tokens FROM player WHERE player_id = $playerId"
        );
        return $baseRange + $favor;
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
        return $this->game->getActionColor($playerId) ?? '';
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
        $maxRange = $this->getMaxMovementRange($playerId);
        $dieColor = $this->getSelectedDieColor($playerId);

        $pathfinder = $this->getPathfinder();
        $reachable = $pathfinder->getReachableHexes($shipQ, $shipR, $maxRange);

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
            'baseRange' => $range,
            'maxRange' => $maxRange,
            'dieColor' => $dieColor,
            'reachableHexes' => $reachableList,
            'playerFavor' => (int)$this->game->getUniqueValueFromDB(
                "SELECT favor_tokens FROM player WHERE player_id = $playerId"
            ),
        ];
    }

    #[PossibleAction]
    public function actConfirmMove(int $q, int $r, int $activePlayerId) {
        $player = $this->game->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $activePlayerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];
        $baseRange = $this->getMovementRange($activePlayerId);
        $maxRange = $this->getMaxMovementRange($activePlayerId);

        $pathfinder = $this->getPathfinder();
        $reachable = $pathfinder->getReachableHexes($shipQ, $shipR, $maxRange);
        $targetKey = "$q,$r";
        if (!isset($reachable[$targetKey])) {
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

        // Check if favor is needed for extended range
        $distance = $reachable[$targetKey];
        $favorCost = max(0, $distance - $baseRange);

        if ($favorCost > 0) {
            $currentFavor = (int)$this->game->getUniqueValueFromDB(
                "SELECT favor_tokens FROM player WHERE player_id = $activePlayerId"
            );
            if ($currentFavor < $favorCost) {
                throw new UserException(clienttranslate('Not enough Favor Tokens for that distance'));
            }
            $this->game->DbQuery(
                "UPDATE player SET favor_tokens = favor_tokens - $favorCost WHERE player_id = $activePlayerId"
            );
            $newFavor = $currentFavor - $favorCost;

            $this->notify->all("favorSpentForMovement",
                clienttranslate('${player_name} spends ${cost} Favor to extend movement'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
                "cost" => $favorCost,
                "favor_tokens" => $newFavor,
            ]);
        }

        // Update ship position
        $this->game->DbQuery(
            "UPDATE player SET ship_q = $q, ship_r = $r WHERE player_id = $activePlayerId"
        );

        $this->notify->all("shipMoved", clienttranslate('${player_name} moves their ship'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "q" => $q,
            "r" => $r,
        ]);

        return $this->game->spendActionSource($activePlayerId);
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
