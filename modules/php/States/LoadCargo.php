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
 * Auto-resolving cargo-load state. Was previously an ACTIVE_PLAYER picker
 * that showed the player a list of valid items, but in practice every
 * load is dispatched from a direct click on the board offering/statue —
 * the player has already named the item by the time we enter this
 * state. SelectAction's actLoadOffering / actLoadStatue stash the
 * clicked item id in `cargo_item_id`; onEnteringState reads it,
 * validates against the live valid set, performs the DB update, fires
 * the loadCargo notif, and transitions via spendActionSource. No
 * client-facing UI for this state (GAME type, no descriptionMyTurn).
 *
 * Replaces the prior actConfirmLoad PossibleAction. The previous
 * client-side setTimeout auto-confirm hack (~100ms after state entry)
 * violated the BGA framework rule that bgaPerformAction be triggered
 * only by user clicks; moving the work into onEnteringState resolves
 * the auto-resolve server-side instead.
 */
class LoadCargo extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 34, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId): string
    {
        $actionType = $this->game->globals->get('cargo_action_type');
        $itemId = (int)$this->game->globals->get('cargo_item_id');
        if (!is_string($actionType) || $itemId <= 0) {
            // Stale entry (caller didn't stash) — bail back to SelectAction.
            $this->clearScratchGlobals();
            return SelectAction::class;
        }

        $dieColor = $this->game->getActionColor($activePlayerId);
        $validItems = $this->getValidItems($activePlayerId, $actionType, $dieColor);

        $selectedItem = null;
        foreach ($validItems as $item) {
            if ($item['id'] === $itemId) {
                $selectedItem = $item;
                break;
            }
        }
        if (!$selectedItem) {
            // Stale-client itemId — graceful fallback to SelectAction so
            // the player can pick again. Throwing UserException would be
            // jarring since the click already committed.
            $this->clearScratchGlobals();
            return SelectAction::class;
        }

        if ($this->getCargoCount($activePlayerId) >= $this->getCargoCapacity($activePlayerId)) {
            throw new UserException(clienttranslate('Your cargo hold is full'));
        }

        // Defensive: re-check the per-type same-color rule. getValidItems
        // already excluded duplicates, so reaching here with a duplicate
        // means the player's cargo changed mid-flow — surface it rather
        // than silently double-loading.
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

        $this->clearScratchGlobals();

        $loadMsg = $actionType === 'statue'
            ? clienttranslate('${player_name} loads a ${statue_tok}')
            : clienttranslate('${player_name} loads a ${offering_tok}');
        $this->notify->all("loadCargo", $loadMsg, [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "item_id" => $itemId,
            "item_type" => $actionType,
            "color" => $selectedItem['color'],
            "offering_tok" => $actionType === 'offering' ? $selectedItem['color'] : null,
            "statue_tok" => $actionType === 'statue' ? $selectedItem['color'] : null,
            "hex_q" => $selectedItem['hex_q'],
            "hex_r" => $selectedItem['hex_r'],
        ]);

        return $this->game->spendActionSource($activePlayerId);
    }

    private function clearScratchGlobals(): void
    {
        $this->game->globals->set('cargo_action_type', null);
        $this->game->globals->set('cargo_item_id', null);
    }

    private function getValidItems(int $playerId, ?string $actionType, ?string $dieColor): array
    {
        if (!$dieColor || !$actionType) return [];

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
            $hasRangeExt = $this->game->playerOwnsEquipment($playerId, 12, false);
        } else {
            $rows = $this->game->getObjectListFromDB(
                "SELECT statue_id, color, origin_hex_q, origin_hex_r
                 FROM statue WHERE player_id IS NULL AND is_raised = 0 AND color = '$safeColor'"
            );
            $idCol = 'statue_id';
            $hasRangeExt = $this->game->playerOwnsEquipment($playerId, 9, false);
        }

        $result = [];
        foreach ($rows as $row) {
            $oq = (int)$row['origin_hex_q'];
            $or = (int)$row['origin_hex_r'];
            $reachable = $hasRangeExt
                ? $this->game->isReachableForEquipmentRange($shipQ, $shipR, $oq, $or)
                : (\HexUtils::hexDistance($shipQ, $shipR, $oq, $or) === 1);
            if (!$reachable) continue;
            if (!$this->game->wouldCompleteZeusTileForType(
                $playerId, $actionType, $row['color']
            )) continue;
            $result[] = [
                'id' => (int)$row[$idCol],
                'type' => $actionType,
                'color' => $row['color'],
                'hex_q' => $oq,
                'hex_r' => $or,
            ];
        }
        return $result;
    }

    // Equipment 009/012 range extension lives on Game now
    // (Game::isReachableForEquipmentRange).

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
}
