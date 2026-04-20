<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

/**
 * Sub-state for Equipment Card 017 (Warm Offering Hook).
 *
 * Rule: "One-time: Take 1 of the red, green or yellow Offerings from any
 * Island Tile and store it in your Ship."
 *
 * Entry: SelectAction::activateEquipment017 sets:
 *   - globals 'eq17_card_id'       = card_id of the activating 017
 *   - globals 'eq17_color_options' = json_encode(['red','green','yellow'])
 *
 * Exit: return to SelectAction (free activation — die/card still live).
 */
class SelectOfferingFromAnyIsland extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 47,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} must pick an offering'),
            descriptionMyTurn: clienttranslate('${you}: pick an offering to take from any island'),
        );
    }

    public function getArgs(): array
    {
        $cardId = (int)$this->game->globals->get('eq17_card_id');
        $colorOptions = $this->getColorOptions();

        $offerings = $this->getEligibleOfferings($colorOptions);

        return [
            'card_id' => $cardId,
            'color_options' => $colorOptions,
            'offerings' => $offerings,
        ];
    }

    private function getColorOptions(): array
    {
        $raw = $this->game->globals->get('eq17_color_options');
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded) && !empty($decoded)) {
                return array_values(array_filter($decoded, 'is_string'));
            }
        }
        return ['red', 'green', 'yellow'];
    }

    /**
     * Offerings still sitting on an island (not in cargo, not delivered),
     * filtered to the allowed color set.
     */
    private function getEligibleOfferings(array $colors): array
    {
        if (empty($colors)) return [];
        $list = "'" . implode("','", array_map('addslashes', $colors)) . "'";
        $rows = $this->game->getObjectListFromDB(
            "SELECT offering_id, color, origin_hex_q, origin_hex_r
             FROM offering
             WHERE color IN ($list)
             AND player_id IS NULL
             AND is_delivered = 0"
        );
        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'id' => (int)$r['offering_id'],
                'offering_id' => (int)$r['offering_id'],
                'type' => 'offering',
                'color' => $r['color'],
                'hex_q' => (int)$r['origin_hex_q'],
                'hex_r' => (int)$r['origin_hex_r'],
            ];
        }
        return $out;
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
        $shipTileId = $this->game->getUniqueValueFromDB(
            "SELECT ship_tile_id FROM player WHERE player_id = $playerId"
        );
        if ($shipTileId === null) return 2;
        return MaterialDefs::SHIP_TILES[(int)$shipTileId]['storage'] ?? 2;
    }

    private function clearScratchGlobals(): void
    {
        $this->game->globals->set('eq17_card_id', 0);
        $this->game->globals->set('eq17_color_options', '');
    }

    #[PossibleAction]
    public function actConfirmOffering(int $offeringId, int $activePlayerId): string
    {
        $cardId = (int)$this->game->globals->get('eq17_card_id');
        if ($cardId <= 0) {
            throw new UserException(clienttranslate('Equipment activation expired.'));
        }

        $colorOptions = $this->getColorOptions();

        // Validate the offering — must exist, match an allowed color, and
        // still be sitting on an island (not in any player's cargo, not
        // delivered).
        $row = $this->game->getObjectFromDB(
            "SELECT offering_id, color, origin_hex_q, origin_hex_r, player_id, is_delivered
             FROM offering WHERE offering_id = $offeringId"
        );
        if (!$row) {
            throw new UserException(clienttranslate('Offering not found.'));
        }
        if ($row['player_id'] !== null || (int)$row['is_delivered'] !== 0) {
            throw new UserException(clienttranslate('That offering is no longer on an island.'));
        }
        if (!in_array($row['color'], $colorOptions, true)) {
            throw new UserException(clienttranslate('That offering is not an allowed color.'));
        }

        // Ship capacity must have room BEFORE transferring.
        if ($this->getCargoCount($activePlayerId) >= $this->getCargoCapacity($activePlayerId)) {
            throw new UserException(clienttranslate('Your cargo hold is full.'));
        }

        $color = $row['color'];
        $hexQ = (int)$row['origin_hex_q'];
        $hexR = (int)$row['origin_hex_r'];

        // Transfer: island → ship. Matches LoadCargo::actConfirmLoad semantics
        // (player_id = active player, is_delivered stays 0).
        $this->game->DbQuery(
            "UPDATE offering SET player_id = $activePlayerId WHERE offering_id = $offeringId"
        );

        // Mark card 017 one-time used.
        $this->game->DbQuery(
            "UPDATE card SET is_used = 1 WHERE card_id = $cardId"
        );

        $playerName = $this->game->getPlayerNameById($activePlayerId);
        $equipmentName = $this->game->equipmentName(17);

        $this->game->notify->all('equipmentActivated',
            clienttranslate('${player_name} activates ${equipment_name} (takes a ${color} Offering from an island)'),
            [
                'player_id' => $activePlayerId,
                'player_name' => $playerName,
                'card_id' => $cardId,
                'equipment_name' => $equipmentName,
                'color' => $color,
                'i18n' => ['color'],
            ]
        );
        $this->game->notify->all('equipmentUsed', '', [
            'player_id' => $activePlayerId,
            'card_id' => $cardId,
        ]);

        // Reuse the existing loadCargo visual flow: removes the offering from
        // the board and adds it to the active player's ship storage.
        $this->game->notify->all('loadCargo',
            clienttranslate('${player_name} loads a ${color} ${item_type}'),
            [
                'player_id' => $activePlayerId,
                'player_name' => $playerName,
                'item_id' => $offeringId,
                'item_type' => 'offering',
                'color' => $color,
                'hex_q' => $hexQ,
                'hex_r' => $hexR,
            ]
        );

        $this->clearScratchGlobals();

        return SelectAction::class;
    }

    #[PossibleAction]
    public function actCancelOffering(int $activePlayerId): string
    {
        // Card 017 was never marked is_used yet (that only happens on confirm),
        // so cancel is a clean "go back" — just wipe the scratch globals.
        $this->clearScratchGlobals();
        return SelectAction::class;
    }

    function zombie(int $playerId) {
        $colorOptions = $this->getColorOptions();
        $offerings = $this->getEligibleOfferings($colorOptions);
        if (empty($offerings)) {
            $this->clearScratchGlobals();
            return SelectAction::class;
        }
        return $this->actConfirmOffering((int)$offerings[0]['offering_id'], $playerId);
    }
}
