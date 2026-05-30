<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphi\Game;
use Bga\Games\theoracleofdelphi\MaterialDefs;

require_once(__DIR__ . '/../HexUtils.php');
require_once(__DIR__ . '/../ClusterDefinitions.php');

/**
 * Auto-resolving cargo-deliver state. Was previously an ACTIVE_PLAYER
 * picker; in practice every delivery is dispatched from a direct click
 * on the destination hex via SelectAction (actMakeOffering for
 * temples, actRaiseStatue for statue islands). The cargo item is
 * uniquely determined by the die's colour + action type (house rule:
 * no two cargos of the same type+colour on board), so the server can
 * resolve the item server-side without an explicit itemId from the
 * client. raise_statue_dest_q/r is stashed by SelectAction when the
 * player picked among multiple statue islands.
 *
 * Replaces the prior actConfirmDeliver PossibleAction. The previous
 * client-side setTimeout auto-confirm violated the BGA framework rule
 * that bgaPerformAction be triggered only by user clicks; the resolve
 * now happens server-side via onEnteringState.
 */
class DeliverCargo extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 35, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId): string
    {
        $actionType = $this->game->globals->get('cargo_action_type');
        if (!is_string($actionType)) {
            $this->clearScratchGlobals();
            return SelectAction::class;
        }

        $dieColor = $this->game->getActionColor($activePlayerId);
        $deliverable = $this->getDeliverableItems($activePlayerId, $actionType, $dieColor);

        // Pick the item that matches the player's chosen destination
        // (raise_statue_dest for statues) or the unique deliverable for
        // offerings. Multi-island statue ambiguity is resolved by the
        // hex stashed in SelectAction.actRaiseStatue; for offerings the
        // temple is unique per colour so the list collapses to one
        // entry.
        $selectedItem = $this->pickDeliverableItem($deliverable);
        if (!$selectedItem) {
            // Stale-client state (cargo changed, no longer deliverable).
            $this->clearScratchGlobals();
            return SelectAction::class;
        }

        $itemId = $selectedItem['id'];
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

        $completedTileId = $this->game->completeZeusTileForType(
            $activePlayerId, $actionType, $selectedItem['color']
        );

        $logMsg = $actionType === 'offering'
            ? clienttranslate('${player_name} delivers a ${color} offering to the temple')
            : clienttranslate('${player_name} raises a ${color} statue');

        // For statues, compute pedestal_index + cluster_rotation so the
        // client knows which pedestal slot on the island cluster the
        // statue lands on.
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

        $this->game->spendActionSource($activePlayerId);

        if ($completedTileId !== null) {
            $tasksCompleted = (int)$this->game->getUniqueValueFromDB(
                "SELECT tasks_completed FROM player WHERE player_id = $activePlayerId"
            );
            $this->notify->all("taskCompleted", clienttranslate('${player_name} completes ${zeus_tok}'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
                "tile_id" => $completedTileId,
                "tasks_completed" => $tasksCompleted,
                "task_type" => $actionType,
                "color" => $selectedItem['color'],
                "completion_value" => $selectedItem['color'],
                "zeus_tok" => "a Zeus tile",
                "zeus_img" => $this->game->zeusTileImgKey($completedTileId),
                "preserve" => ["zeus_img"],
            ]);
        }

        if ($actionType === 'offering') {
            $this->game->DbQuery(
                "UPDATE player SET favor_tokens = favor_tokens + 3 WHERE player_id = $activePlayerId"
            );
            $newFavor = (int)$this->game->getUniqueValueFromDB(
                "SELECT favor_tokens FROM player WHERE player_id = $activePlayerId"
            );
            $this->notify->all("favorTokensChanged", clienttranslate('${player_name} receives 3 ${favor_tok}'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
                "favor_tok" => "favor",
                "favor_tokens" => $newFavor,
                "delta" => 3,
            ]);

            $this->clearScratchGlobals();

            $nextState = $this->game->nextStateAfterDieAction($activePlayerId);

            // Card 011 (Blessed Reward) — offering delivered → advance 1 god.
            $reaction = $this->game->maybeGrantBlessedRewardGodStep(
                $activePlayerId, $nextState, 'offering'
            );
            if ($reaction !== null) {
                return $reaction;
            }
            return $nextState;
        }

        // Statue raised: reward is the companion chosen in SelectReward.
        // Card 011 fires at the END of SelectReward::selectCompanion,
        // after the companion is in hand, so the "reward received"
        // semantics match the rulebook.
        $this->game->globals->set('reward_type', 'companion');
        $this->game->globals->set('reward_color', $selectedItem['color']);
        $this->clearScratchGlobals();
        return SelectReward::class;
    }

    private function clearScratchGlobals(): void
    {
        $this->game->globals->set('cargo_action_type', null);
        $this->game->globals->set('cargo_item_id', null);
        $this->game->globals->set('raise_statue_dest_q', null);
        $this->game->globals->set('raise_statue_dest_r', null);
    }

    /**
     * Resolve which deliverable item (and which destination, for the
     * multi-island statue case) to apply. For offerings the temple is
     * unique per colour so the list collapses to one. For statues the
     * client stashes raise_statue_dest_q/r when the player clicked one
     * of multiple eligible islands; we filter to that island. Returns
     * null when no deliverable matches (cargo went stale).
     */
    private function pickDeliverableItem(array $deliverable): ?array
    {
        if (empty($deliverable)) return null;
        $chosenQ = $this->game->globals->get('raise_statue_dest_q');
        $chosenR = $this->game->globals->get('raise_statue_dest_r');
        if ($chosenQ !== null && $chosenR !== null) {
            foreach ($deliverable as $item) {
                if ((int)$item['dest_q'] === (int)$chosenQ
                        && (int)$item['dest_r'] === (int)$chosenR) {
                    return $item;
                }
            }
            return null;
        }
        return $deliverable[0];
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
        }
        return $this->getDeliverableStatuesForPlayer($playerId, $safeColor, $shipQ, $shipR, $dieColor);
    }

    private function getDeliverableOfferingsForPlayer(int $playerId, string $safeColor, int $shipQ, int $shipR): array
    {
        $temple = $this->game->getObjectFromDB(
            "SELECT hex_q, hex_r FROM temple WHERE color = '$safeColor'"
        );
        if (!$temple) return [];
        $tq = (int)$temple['hex_q'];
        $tr = (int)$temple['hex_r'];
        $hasRangeExt = $this->game->playerOwnsEquipment($playerId, 12, false);
        $reachable = $hasRangeExt
            ? $this->game->isReachableForEquipmentRange($shipQ, $shipR, $tq, $tr)
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
        $hasRangeExt = $this->game->playerOwnsEquipment($playerId, 9, false);

        $statues = $this->game->getObjectListFromDB(
            "SELECT statue_id, color FROM statue
             WHERE player_id = $playerId AND is_raised = 0 AND color = '$safeColor'"
        );
        if (empty($statues)) return [];

        $result = [];
        foreach ($statues as $s) {
            foreach ($statueIslands as $island) {
                $iq = (int)$island['q'];
                $ir = (int)$island['r'];
                $reachable = $hasRangeExt
                    ? $this->game->isReachableForEquipmentRange($shipQ, $shipR, $iq, $ir)
                    : (\HexUtils::hexDistance($shipQ, $shipR, $iq, $ir) === 1);
                if (!$reachable) continue;
                $clusterId = $island['cluster_type'] ?? '';
                $acceptedColors = MaterialDefs::STATUE_ISLAND_COLORS[$clusterId] ?? [];
                if (!in_array($dieColor, $acceptedColors, true)) continue;
                $result[] = [
                    'id' => (int)$s['statue_id'],
                    'type' => 'statue',
                    'color' => $s['color'],
                    'dest_q' => $iq,
                    'dest_r' => $ir,
                ];
            }
        }
        return $result;
    }

    // Equipment 009/012 range extension lives on Game now
    // (Game::isReachableForEquipmentRange).
}
