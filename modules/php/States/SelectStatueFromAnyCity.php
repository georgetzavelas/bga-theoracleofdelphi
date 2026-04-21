<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

/**
 * Sub-state for Equipment Cards 019 (Cool Statue Hook) and 020
 * (Warm Statue Hook).
 *
 * Rule: "One-time: Take 1 of the [color set] Statues from the
 * corresponding City Tile and store it in your Ship." — card 019 uses
 * cool colors (pink/blue/black), card 020 uses warm colors
 * (red/green/yellow). "Corresponding City Tile" is simply the statue's
 * origin hex (statues don't move off their city tile until loaded).
 *
 * Entry: Game::applyOneTimeEquipmentEffect (case 19 / case 20) sets:
 *   - globals 'eq_statue_card_id'       = card_id of the activating card
 *   - globals 'eq_statue_color_options' = json_encode([colors...])
 *   - globals 'equipment_post_activation_state' = exit state FQCN
 *     (set by CombatVictory::actSelectEquipment — normal post-combat
 *     next state: PlayerActions or ConsultOracle; or by PlayerTurnStart
 *     for setup-dealt cards to loop back for additional pending cards).
 *
 * Exit: popExitState() — returns the stashed post-activation state,
 * falls back to SelectAction for any legacy click-activation path.
 */
class SelectStatueFromAnyCity extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 48,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} must pick a statue'),
            descriptionMyTurn: clienttranslate('${you}: pick a statue to take from its city tile'),
        );
    }

    public function getArgs(): array
    {
        $cardId = (int)$this->game->globals->get('eq_statue_card_id');
        $colorOptions = $this->getColorOptions();

        $statues = $this->getEligibleStatues($colorOptions);

        return [
            'card_id' => $cardId,
            'color_options' => $colorOptions,
            'statues' => $statues,
        ];
    }

    private function getColorOptions(): array
    {
        $raw = $this->game->globals->get('eq_statue_color_options');
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded) && !empty($decoded)) {
                return array_values(array_filter($decoded, 'is_string'));
            }
        }
        return ['red', 'green', 'yellow'];
    }

    /**
     * Statues still sitting on their city tile (not in cargo, not raised),
     * filtered to the allowed color set. origin_hex_q/r is the city tile.
     */
    private function getEligibleStatues(array $colors): array
    {
        if (empty($colors)) return [];
        $list = "'" . implode("','", array_map('addslashes', $colors)) . "'";
        $rows = $this->game->getObjectListFromDB(
            "SELECT statue_id, color, origin_hex_q, origin_hex_r
             FROM statue
             WHERE color IN ($list)
             AND player_id IS NULL
             AND is_raised = 0"
        );
        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'id' => (int)$r['statue_id'],
                'statue_id' => (int)$r['statue_id'],
                'type' => 'statue',
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
        return $this->game->getCargoCapacity($playerId);
    }

    private function clearScratchGlobals(): void
    {
        $this->game->globals->set('eq_statue_card_id', 0);
        $this->game->globals->set('eq_statue_color_options', '');
    }

    /**
     * Pop the post-activation exit state set by whoever routed us here.
     * Mirrors SelectOfferingFromAnyIsland::popExitState.
     */
    private function popExitState(): string
    {
        $post = (string)$this->game->globals->get('equipment_post_activation_state');
        $this->game->globals->set('equipment_post_activation_state', null);
        if ($post !== '') {
            return $post;
        }
        return SelectAction::class;
    }

    #[PossibleAction]
    public function actConfirmStatue(int $statueId, int $activePlayerId): string
    {
        $cardId = (int)$this->game->globals->get('eq_statue_card_id');
        if ($cardId <= 0) {
            throw new UserException(clienttranslate('Equipment activation expired.'));
        }

        $colorOptions = $this->getColorOptions();

        // Validate the statue — must exist, match an allowed color, and
        // still be sitting on its city tile (not in any player's cargo, not
        // yet raised).
        $row = $this->game->getObjectFromDB(
            "SELECT statue_id, color, origin_hex_q, origin_hex_r, player_id, is_raised
             FROM statue WHERE statue_id = $statueId"
        );
        if (!$row) {
            throw new UserException(clienttranslate('Statue not found.'));
        }
        if ($row['player_id'] !== null || (int)$row['is_raised'] !== 0) {
            throw new UserException(clienttranslate('That statue is no longer on its city tile.'));
        }
        if (!in_array($row['color'], $colorOptions, true)) {
            throw new UserException(clienttranslate('That statue is not an allowed color.'));
        }

        // Ship capacity must have room BEFORE transferring.
        if ($this->getCargoCount($activePlayerId) >= $this->getCargoCapacity($activePlayerId)) {
            throw new UserException(clienttranslate('Your cargo hold is full.'));
        }

        $color = $row['color'];
        $hexQ = (int)$row['origin_hex_q'];
        $hexR = (int)$row['origin_hex_r'];

        // Transfer: city → ship. Matches LoadCargo::actConfirmLoad semantics
        // for statues (player_id = active player, is_raised stays 0).
        $this->game->DbQuery(
            "UPDATE statue SET player_id = $activePlayerId WHERE statue_id = $statueId"
        );

        // Mark the activating card (019 or 020) one-time used.
        $this->game->DbQuery(
            "UPDATE card SET is_used = 1 WHERE card_id = $cardId"
        );

        // Resolve the activating card's type_arg so we label the notif with
        // the correct equipment name (019 Cool vs 020 Warm).
        $cardTypeArg = (int)$this->game->getUniqueValueFromDB(
            "SELECT card_type_arg FROM card WHERE card_id = $cardId"
        );
        $playerName = $this->game->getPlayerNameById($activePlayerId);
        $equipmentName = $this->game->equipmentName($cardTypeArg > 0 ? $cardTypeArg : 19);

        $this->game->notify->all('equipmentActivated',
            clienttranslate('${player_name} activates ${equipment_name} (takes a ${color} Statue from its city)'),
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

        // Reuse the existing loadCargo visual flow: removes the statue from
        // the board and adds it to the active player's ship storage.
        $this->game->notify->all('loadCargo',
            clienttranslate('${player_name} loads a ${color} ${item_type}'),
            [
                'player_id' => $activePlayerId,
                'player_name' => $playerName,
                'item_id' => $statueId,
                'item_type' => 'statue',
                'color' => $color,
                'hex_q' => $hexQ,
                'hex_r' => $hexR,
            ]
        );

        $this->clearScratchGlobals();

        return $this->popExitState();
    }

    #[PossibleAction]
    public function actCancelStatue(int $activePlayerId): string
    {
        // Card was never marked is_used yet (that only happens on confirm),
        // so cancel is a clean "go back" — just wipe the scratch globals.
        $this->clearScratchGlobals();
        return $this->popExitState();
    }

    function zombie(int $playerId) {
        $colorOptions = $this->getColorOptions();
        $statues = $this->getEligibleStatues($colorOptions);
        if (empty($statues)) {
            $this->clearScratchGlobals();
            return $this->popExitState();
        }
        return $this->actConfirmStatue((int)$statues[0]['statue_id'], $playerId);
    }
}
