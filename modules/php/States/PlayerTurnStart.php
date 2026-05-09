<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class PlayerTurnStart extends \Bga\GameFramework\States\GameState
{
    /**
     * Equipment card_type_args that have a working handler in
     * Game::applyOneTimeEquipmentEffect. Anything else — even if flagged
     * `one_time` or `mixed` in MaterialDefs — is left alone here so an
     * unimplemented card never forces the pending-resolve loop into an
     * infinite cycle. Extend this list when new one-time handlers ship.
     */
    private const IMPLEMENTED_ONE_TIME_CARDS = [7, 13, 16, 17, 18, 19, 20, 21];

    function __construct(protected Game $game) {
        parent::__construct($game, id: 10, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId) {
        // Pending one-time equipment from setup (starting_equipment ship tile).
        // Under the rulebook, one-time cards fire immediately on receipt; the
        // CombatVictory path handles that, but setup-dealt cards land in the
        // player's hand before any state machine is running. Resolve them now
        // on the first time the player enters their turn.
        $pending = $this->resolveNextPendingOneTimeEquipment($activePlayerId);
        if ($pending !== null) {
            return $pending;
        }

        $this->game->giveExtraTime($activePlayerId);
        $this->game->globals->set('oracle_card_played', 0);
        $this->game->globals->set('selected_oracle_card_id', 0);
        $this->game->globals->set('equipment_bonus_action_used', 0);
        $this->game->globals->set('equipment_bonus_action_available', 0);
        $this->game->globals->set('bonus_action_color', null);
        // Demigod-wild resolution is per-die-action; per-die clears
        // happen in actSelectDie / actCancelDieSelection / spendActionSource,
        // and a turn-start clear keeps the flag from ever leaking
        // across turns even if one of those paths is missed.
        $this->game->globals->set('demigod_wild_resolved', 0);

        $this->notify->all("playerTurnStart", clienttranslate('${player_name} starts their turn'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        // Check for pending god advancement opportunities
        $pending = $this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM god_advancement_queue WHERE player_id = $activePlayerId"
        );
        if ((int)$pending > 0) {
            return CheckGodAdvancement::class;
        }
        return CheckInjuries::class;
    }

    /**
     * Look for any one-time equipment card sitting in the active player's
     * hand with is_used=0 whose card_type_arg has an implemented handler in
     * Game::applyOneTimeEquipmentEffect. Fire that effect; if it returns a
     * sub-state class, stash PlayerTurnStart itself as the return path so we
     * re-enter and check for more pending cards once the sub-state finishes.
     * Cards that inline-resolve (e.g. card 17 with no eligible offering)
     * keep the loop running here until everything is resolved.
     *
     * Returns the sub-state class string to transition to, or null if no
     * pending work remains.
     */
    private function resolveNextPendingOneTimeEquipment(int $playerId): ?string
    {
        $cards = $this->game->getObjectListFromDB(
            "SELECT card_id, card_type_arg FROM card
             WHERE card_type = 'equipment'
             AND card_location = 'hand'
             AND card_location_arg = $playerId
             AND is_used = 0"
        );

        foreach ($cards as $c) {
            $cardTypeArg = (int)$c['card_type_arg'];
            $def = MaterialDefs::EQUIPMENT_CARDS[$cardTypeArg] ?? null;
            if (!$def) continue;
            $type = $def['type'] ?? null;
            if ($type !== 'one_time' && $type !== 'mixed') continue;

            // Skip cards whose handler isn't implemented yet — leaving them
            // matched-but-unresolved here would infinite-loop this state.
            if (!in_array($cardTypeArg, self::IMPLEMENTED_ONE_TIME_CARDS, true)) {
                continue;
            }

            $cardId = (int)$c['card_id'];
            $subState = $this->game->applyOneTimeEquipmentEffect(
                $playerId, $cardId, $cardTypeArg
            );

            if ($subState !== null) {
                // Re-enter PlayerTurnStart after the sub-state completes,
                // so we can resolve any remaining pending cards before
                // proceeding with normal turn logic.
                $this->game->globals->set(
                    'equipment_post_activation_state',
                    PlayerTurnStart::class
                );
                return $subState;
            }
            // Inline-resolved (e.g. card 17 with no eligible offering):
            // continue the loop to check for more pending cards.
        }
        return null;
    }
}
