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

class DeliverCargo extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 35,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} delivers cargo'),
            descriptionMyTurn: clienttranslate('Select item to deliver'),
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
            'deliverableItems' => $this->getDeliverableItems($playerId, $actionType, $dieColor),
        ];
    }

    private function getDeliverableItems(int $playerId, ?string $actionType, ?string $dieColor): array
    {
        if (!$dieColor || !$actionType) return [];

        $player = $this->game->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];
        $safeColor = addslashes($dieColor);

        if ($actionType === 'offering') {
            return $this->getDeliverableOfferingsForPlayer($playerId, $safeColor, $shipQ, $shipR);
        } else {
            return $this->getDeliverableStatuesForPlayer($playerId, $safeColor, $shipQ, $shipR, $dieColor);
        }
    }

    private function getDeliverableOfferingsForPlayer(int $playerId, string $safeColor, int $shipQ, int $shipR): array
    {
        $temple = $this->game->getObjectFromDB(
            "SELECT hex_q, hex_r FROM temple WHERE color = '$safeColor'"
        );
        if (!$temple) return [];
        $tq = (int)$temple['hex_q'];
        $tr = (int)$temple['hex_r'];
        // 012 Altar Caller extends Make Offering range to 1 water space.
        $hasRangeExt = $this->game->playerOwnsEquipment($playerId, 12, false);
        $reachable = $hasRangeExt
            ? $this->isReachableForEquipmentRange($shipQ, $shipR, $tq, $tr)
            : (\HexUtils::hexDistance($shipQ, $shipR, $tq, $tr) === 1);
        if (!$reachable) return [];

        $offerings = $this->game->getObjectListFromDB(
            "SELECT offering_id, color FROM offering
             WHERE player_id = $playerId AND is_delivered = 0 AND color = '$safeColor'"
        );

        $result = [];
        foreach ($offerings as $o) {
            $result[] = [
                'id' => (int)$o['offering_id'],
                'type' => 'offering',
                'color' => $o['color'],
                'dest_q' => $tq,
                'dest_r' => $tr,
            ];
        }
        return $result;
    }

    private function getDeliverableStatuesForPlayer(int $playerId, string $safeColor, int $shipQ, int $shipR, string $dieColor): array
    {
        $statueIslands = $this->game->getObjectListFromDB(
            "SELECT q, r, cluster_type FROM hex WHERE tile_type = 'island' AND island_content = 'statue'"
        );
        // 009 Long Hook extends Raise Statue range to 1 water space.
        $hasRangeExt = $this->game->playerOwnsEquipment($playerId, 9, false);
        $adjacentIsland = null;
        foreach ($statueIslands as $island) {
            $iq = (int)$island['q'];
            $ir = (int)$island['r'];
            $reachable = $hasRangeExt
                ? $this->isReachableForEquipmentRange($shipQ, $shipR, $iq, $ir)
                : (\HexUtils::hexDistance($shipQ, $shipR, $iq, $ir) === 1);
            if (!$reachable) continue;
            $clusterId = $island['cluster_type'] ?? '';
            $acceptedColors = MaterialDefs::STATUE_ISLAND_COLORS[$clusterId] ?? [];
            if (!in_array($dieColor, $acceptedColors, true)) continue;
            $adjacentIsland = $island;
            break;
        }
        if (!$adjacentIsland) return [];

        $statues = $this->game->getObjectListFromDB(
            "SELECT statue_id, color FROM statue
             WHERE player_id = $playerId AND is_raised = 0 AND color = '$safeColor'"
        );

        $result = [];
        foreach ($statues as $s) {
            $result[] = [
                'id' => (int)$s['statue_id'],
                'type' => 'statue',
                'color' => $s['color'],
                'dest_q' => (int)$adjacentIsland['q'],
                'dest_r' => (int)$adjacentIsland['r'],
            ];
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

    private function completeZeusTile(int $playerId, string $actionType, string $itemColor): ?int
    {
        if ($actionType === 'offering') {
            $safeColor = addslashes($itemColor);
            $zeusTile = $this->game->getObjectFromDB(
                "SELECT tile_id FROM zeus_tile
                 WHERE player_id = $playerId AND task_type = 'offering'
                 AND task_color = '$safeColor' AND is_completed = 0
                 LIMIT 1"
            );
            if (!$zeusTile) {
                $zeusTile = $this->game->getObjectFromDB(
                    "SELECT tile_id FROM zeus_tile
                     WHERE player_id = $playerId AND task_type = 'offering'
                     AND task_color IS NULL AND is_completed = 0
                     LIMIT 1"
                );
            }
        } else {
            $zeusTile = $this->game->getObjectFromDB(
                "SELECT tile_id FROM zeus_tile
                 WHERE player_id = $playerId AND task_type = 'statue'
                 AND is_completed = 0
                 LIMIT 1"
            );
        }

        if (!$zeusTile) return null;

        $tileId = (int)$zeusTile['tile_id'];
        $this->game->DbQuery("UPDATE zeus_tile SET is_completed = 1 WHERE tile_id = $tileId");
        $this->game->DbQuery(
            "UPDATE player SET tasks_completed = tasks_completed + 1, player_score = player_score + 1
             WHERE player_id = $playerId"
        );
        return $tileId;
    }

    #[PossibleAction]
    public function actConfirmDeliver(int $itemId, int $activePlayerId) {
        $actionType = $this->game->globals->get('cargo_action_type');
        $deliverableItems = $this->getArgs()['deliverableItems'];

        $selectedItem = null;
        foreach ($deliverableItems as $item) {
            if ($item['id'] === $itemId) {
                $selectedItem = $item;
                break;
            }
        }
        if (!$selectedItem) {
            throw new UserException(clienttranslate('You cannot deliver that item'));
        }

        $destQ = $selectedItem['dest_q'];
        $destR = $selectedItem['dest_r'];

        if ($actionType === 'offering') {
            $this->game->DbQuery(
                "UPDATE offering SET is_delivered = 1,
                        delivered_to_hex_q = $destQ, delivered_to_hex_r = $destR,
                        delivered_by_player_id = $activePlayerId
                 WHERE offering_id = $itemId"
            );
        } else {
            $this->game->DbQuery(
                "UPDATE statue SET is_raised = 1,
                        raised_at_hex_q = $destQ, raised_at_hex_r = $destR,
                        raised_by_player_id = $activePlayerId
                 WHERE statue_id = $itemId"
            );
        }

        $completedTileId = $this->completeZeusTile($activePlayerId, $actionType, $selectedItem['color']);

        $logMsg = $actionType === 'offering'
            ? clienttranslate('${player_name} delivers a ${color} offering to the temple')
            : clienttranslate('${player_name} raises a ${color} statue');

        // For statues, include pedestal position info for client rendering
        $pedestalIndex = null;
        $clusterRotation = null;
        if ($actionType !== 'offering') {
            $hex = $this->game->getObjectFromDB(
                "SELECT cluster_type, cluster_rotation FROM hex WHERE q = $destQ AND r = $destR"
            );
            if ($hex) {
                $clusterId = $hex['cluster_type'];
                $clusterRotation = (int)$hex['cluster_rotation'];
                $islandColors = MaterialDefs::STATUE_ISLAND_COLORS[$clusterId] ?? [];
                $pedestalIndex = array_search($selectedItem['color'], $islandColors);
                if ($pedestalIndex === false) $pedestalIndex = 0;
            }
        }

        $this->notify->all("deliverCargo", $logMsg, [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "item_id" => $itemId,
            "item_type" => $actionType,
            "color" => $selectedItem['color'],
            "dest_q" => $destQ,
            "dest_r" => $destR,
            "pedestal_index" => $pedestalIndex,
            "cluster_rotation" => $clusterRotation,
        ]);

        // Spend the die (sends dieUsed notification)
        $this->game->spendActionSource($activePlayerId);

        if ($completedTileId !== null) {
            $playerRow = $this->game->getObjectFromDB(
                "SELECT tasks_completed, player_score FROM player WHERE player_id = $activePlayerId"
            );
            $this->notify->all("taskCompleted", clienttranslate('${player_name} completes a Zeus tile!'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
                "tile_id" => $completedTileId,
                "tasks_completed" => (int)$playerRow['tasks_completed'],
                "player_score" => (int)$playerRow['player_score'],
                "task_type" => $actionType,
                "color" => $selectedItem['color'],
            ]);
        }

        if ($actionType === 'offering') {
            $this->game->DbQuery(
                "UPDATE player SET favor_tokens = favor_tokens + 3 WHERE player_id = $activePlayerId"
            );
            $newFavor = (int)$this->game->getUniqueValueFromDB(
                "SELECT favor_tokens FROM player WHERE player_id = $activePlayerId"
            );
            $this->notify->all("favorTokensChanged", clienttranslate('${player_name} receives 3 Favor Tokens'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
                "favor_tokens" => $newFavor,
                "delta" => 3,
            ]);

            $this->game->globals->set('cargo_action_type', null);

            $nextState = $this->game->allDiceUsed($activePlayerId)
                ? ConsultOracle::class
                : PlayerActions::class;

            // Card 011 (Blessed Reward): offering delivered → advance 1 god.
            $reaction = $this->game->maybeGrantBlessedRewardGodStep(
                $activePlayerId, $nextState, 'offering'
            );
            if ($reaction !== null) {
                return $reaction;
            }
            return $nextState;
        } else {
            // Statue raised: reward is the companion chosen in SelectReward.
            // Card 011 fires at the END of SelectReward::selectCompanion,
            // after the companion is in hand, so the "reward received"
            // semantics match the rulebook.
            $this->game->globals->set('reward_type', 'companion');
            $this->game->globals->set('reward_color', $selectedItem['color']);
            $this->game->globals->set('cargo_action_type', null);
            return SelectReward::class;
        }
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
