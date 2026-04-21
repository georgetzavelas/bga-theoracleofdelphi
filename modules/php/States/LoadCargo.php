<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

require_once(__DIR__ . '/../HexUtils.php');

class LoadCargo extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 34,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} loads cargo'),
            descriptionMyTurn: clienttranslate('Select item to load'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $actionType = $this->game->globals->get('cargo_action_type');
        $dieColor = $this->game->getActionColor($playerId);

        return [
            'actionType' => $actionType,
            'dieColor' => $dieColor,
            'validItems' => $this->getValidItems($playerId, $actionType, $dieColor),
        ];
    }

    private function getValidItems(int $playerId, ?string $actionType, ?string $dieColor): array
    {
        if (!$dieColor || !$actionType) return [];

        $player = $this->game->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];
        $safeColor = addslashes($dieColor);

        if ($actionType === 'offering') {
            $rows = $this->game->getObjectListFromDB(
                "SELECT offering_id, color, origin_hex_q, origin_hex_r
                 FROM offering WHERE player_id IS NULL AND is_delivered = 0 AND color = '$safeColor'"
            );
            $idCol = 'offering_id';
        } else {
            $rows = $this->game->getObjectListFromDB(
                "SELECT statue_id, color, origin_hex_q, origin_hex_r
                 FROM statue WHERE player_id IS NULL AND is_raised = 0 AND color = '$safeColor'"
            );
            $idCol = 'statue_id';
        }

        $result = [];
        foreach ($rows as $row) {
            $dist = \HexUtils::hexDistance($shipQ, $shipR, (int)$row['origin_hex_q'], (int)$row['origin_hex_r']);
            if ($dist === 1) {
                $result[] = [
                    'id' => (int)$row[$idCol],
                    'type' => $actionType,
                    'color' => $row['color'],
                    'hex_q' => (int)$row['origin_hex_q'],
                    'hex_r' => (int)$row['origin_hex_r'],
                ];
            }
        }
        return $result;
    }

    private function getCargoCount(int $playerId): int
    {
        $offerings = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM offering WHERE player_id = $playerId AND is_delivered = 0"
        );
        $statues = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM statue WHERE player_id = $playerId AND is_raised = 0"
        );
        return $offerings + $statues;
    }

    private function getCargoCapacity(int $playerId): int
    {
        return $this->game->getCargoCapacity($playerId);
    }

    #[PossibleAction]
    public function actConfirmLoad(int $itemId, int $activePlayerId) {
        $actionType = $this->game->globals->get('cargo_action_type');
        $validItems = $this->getArgs()['validItems'];

        $selectedItem = null;
        foreach ($validItems as $item) {
            if ($item['id'] === $itemId) {
                $selectedItem = $item;
                break;
            }
        }
        if (!$selectedItem) {
            throw new UserException(clienttranslate('You cannot load that item'));
        }

        if ($this->getCargoCount($activePlayerId) >= $this->getCargoCapacity($activePlayerId)) {
            throw new UserException(clienttranslate('Your cargo hold is full'));
        }

        if ($actionType === 'offering') {
            $this->game->DbQuery(
                "UPDATE offering SET player_id = $activePlayerId WHERE offering_id = $itemId"
            );
        } else {
            $this->game->DbQuery(
                "UPDATE statue SET player_id = $activePlayerId WHERE statue_id = $itemId"
            );
        }

        $this->game->globals->set('cargo_action_type', null);

        $this->notify->all("loadCargo", clienttranslate('${player_name} loads a ${color} ${item_type}'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "item_id" => $itemId,
            "item_type" => $actionType,
            "color" => $selectedItem['color'],
            "hex_q" => $selectedItem['hex_q'],
            "hex_r" => $selectedItem['hex_r'],
        ]);

        return $this->game->spendActionSource($activePlayerId);
    }

    #[PossibleAction]
    public function actCancel(int $activePlayerId) {
        $this->game->globals->set('cargo_action_type', null);
        return SelectAction::class;
    }

    function zombie(int $playerId) {
        return $this->actCancel($playerId);
    }
}
