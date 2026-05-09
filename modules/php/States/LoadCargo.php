<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

require_once(__DIR__ . '/../HexUtils.php');
require_once(__DIR__ . '/../ClusterDefinitions.php');

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

        // House rule: cannot load a second cargo of the same type AND
        // color. Bail early so the picker shows nothing rather than
        // letting the player select an item the act handler will reject.
        if ($this->game->playerHasCargoOfTypeAndColor($playerId, $actionType, $dieColor)) {
            return [];
        }

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
            // 012 Altar Caller extends Load Offering range.
            $hasRangeExt = $this->game->playerOwnsEquipment($playerId, 12, false);
        } else {
            $rows = $this->game->getObjectListFromDB(
                "SELECT statue_id, color, origin_hex_q, origin_hex_r
                 FROM statue WHERE player_id IS NULL AND is_raised = 0 AND color = '$safeColor'"
            );
            $idCol = 'statue_id';
            // 009 Long Hook extends Load Statue range.
            $hasRangeExt = $this->game->playerOwnsEquipment($playerId, 9, false);
        }

        $result = [];
        foreach ($rows as $row) {
            $oq = (int)$row['origin_hex_q'];
            $or = (int)$row['origin_hex_r'];
            $reachable = $hasRangeExt
                ? $this->isReachableForEquipmentRange($shipQ, $shipR, $oq, $or)
                : (\HexUtils::hexDistance($shipQ, $shipR, $oq, $or) === 1);
            if ($reachable) {
                $result[] = [
                    'id' => (int)$row[$idCol],
                    'type' => $actionType,
                    'color' => $row['color'],
                    'hex_q' => $oq,
                    'hex_r' => $or,
                ];
            }
        }
        return $result;
    }

    /**
     * Equipment 009/012 range extension — mirror of
     * SelectAction::isReachableForEquipmentRange. Duplicated here so the
     * act handler on this state can independently re-validate targets
     * without a cross-state helper. Keep logic identical.
     */
    private function isReachableForEquipmentRange(int $shipQ, int $shipR, int $targetQ, int $targetR): bool
    {
        $dist = \HexUtils::hexDistance($shipQ, $shipR, $targetQ, $targetR);
        if ($dist === 1) return true;
        if ($dist !== 2) return false;
        foreach (\ClusterDefinitions::DIRECTION_LIST as $dir) {
            $nq = $shipQ + (int)$dir['dq'];
            $nr = $shipR + (int)$dir['dr'];
            if (\HexUtils::hexDistance($nq, $nr, $targetQ, $targetR) !== 1) continue;
            $tileType = $this->game->getUniqueValueFromDB(
                "SELECT tile_type FROM hex WHERE q = $nq AND r = $nr"
            );
            if ($tileType === 'water') return true;
        }
        return false;
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

        // Defensive: re-check the per-type same-color rule at action time.
        // getValidItems already excluded duplicates, so a request that
        // gets here with a duplicate is from a stale client or tampering.
        if ($this->game->playerHasCargoOfTypeAndColor(
            $activePlayerId, $actionType, $selectedItem['color']
        )) {
            throw new UserException(clienttranslate(
                'You already have a cargo of that type and color on your ship'
            ));
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
