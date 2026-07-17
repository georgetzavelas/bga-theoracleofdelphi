<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphi\Game;
use Bga\Games\theoracleofdelphi\MaterialDefs;

/**
 * Sub-state for Equipment Cards 017 (Warm Offering Hook) and 018
 * (Cool Offering Hook).
 *
 * Rule: "One-time: Take 1 of the [color set] Offerings from any Island
 * Tile and store it in your Ship." — card 017 uses warm colors
 * (red/green/yellow), card 018 uses cool colors (pink/blue/black).
 *
 * Entry: Game::applyOneTimeEquipmentEffect (case 17 / case 18) sets:
 *   - globals 'eq17_card_id'       = card_id of the activating card
 *     (name kept as eq17_* for historical continuity with batch 1; the
 *     state logic is color-generic and shared by 017 and 018)
 *   - globals 'eq17_color_options' = json_encode([colors...])
 *   - globals 'equipment_post_activation_state' = exit state FQCN
 *     (set by CombatVictory::actSelectEquipment — normal post-combat
 *     next state: PlayerActions or ConsultOracle).
 *
 * Exit: popExitState() — returns the stashed post-activation state,
 * falls back to SelectAction for any legacy click-activation path.
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
        $playerId = (int)$this->game->getActivePlayerId();

        $offerings = $this->getEligibleOfferings($colorOptions);
        // Two filters at the args layer so the picker never offers an
        // option the act handler would reject:
        //   1. House rule: cannot load a second offering of a color the
        //      player already has on board.
        //   2. FAQ: "Can I... load Offerings that I don't need to complete
        //      for a task? No". Applies to Hook equipment loads too.
        $game = $this->game;
        $offerings = array_values(array_filter($offerings, function ($o) use ($game, $playerId) {
            return !$game->playerHasCargoOfTypeAndColor($playerId, 'offering', $o['color'])
                && $game->wouldCompleteZeusTileForType($playerId, 'offering', $o['color']);
        }));

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
        return $this->game->getCargoCapacity($playerId);
    }

    private function clearScratchGlobals(): void
    {
        $this->game->globals->set('eq17_card_id', 0);
        $this->game->globals->set('eq17_color_options', '');
    }

    /**
     * Pop the post-activation exit state set by whoever routed us here.
     * CombatVictory stashes the normal post-combat next state there so the
     * player ends up in PlayerActions / ConsultOracle as expected.
     * Falls back to SelectAction for any lingering legacy path.
     */
    private function popExitState(): string
    {
        $post = (string)$this->game->globals->get('equipment_post_activation_state');
        $this->game->globals->set('equipment_post_activation_state', null);
        // Route through resolvePostActivationExit (rather than returning $post
        // directly) so a deferred Blessed Reward god step chains after this
        // one-time effect. It also handles the '' -> SelectAction fallback.
        return $this->game->resolvePostActivationExit(
            (int)$this->game->getActivePlayerId(), $post
        );
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

        // House rule: no two offerings of the same color (defensive — the
        // args filter already excludes same-color options).
        if ($this->game->playerHasCargoOfTypeAndColor($activePlayerId, 'offering', $row['color'])) {
            throw new UserException(clienttranslate(
                'You already have an offering of that color on your ship.'
            ));
        }

        // FAQ: cannot load an offering that wouldn't complete a task.
        // Defence-in-depth — the args filter already excludes colours
        // with no remaining task, so a request reaching here with an
        // un-needed colour is from a stale client.
        if (!$this->game->wouldCompleteZeusTileForType(
            $activePlayerId, 'offering', $row['color']
        )) {
            throw new UserException(clienttranslate(
                'You do not need that offering colour for any remaining task'
            ));
        }

        $color = $row['color'];
        $hexQ = (int)$row['origin_hex_q'];
        $hexR = (int)$row['origin_hex_r'];

        // Transfer: island → ship. Matches LoadCargo::actConfirmLoad semantics
        // (player_id = active player, is_delivered stays 0).
        $this->game->DbQuery(
            "UPDATE offering SET player_id = $activePlayerId WHERE offering_id = $offeringId"
        );

        // Mark the activating card (017 or 018) one-time used.
        $this->game->DbQuery(
            "UPDATE card SET is_used = 1 WHERE card_id = $cardId"
        );

        // Resolve the activating card's type_arg so we label the notif with
        // the correct equipment name (017 Warm vs 018 Cool).
        $cardTypeArg = (int)$this->game->getUniqueValueFromDB(
            "SELECT card_type_arg FROM card WHERE card_id = $cardId"
        );
        $playerName = $this->game->getPlayerNameById($activePlayerId);
        $equipmentName = $this->game->equipmentName($cardTypeArg > 0 ? $cardTypeArg : 17);

        $this->game->notify->all('equipmentActivated',
            clienttranslate('${player_name} activates ${equipment_name} (takes a ${color} offering from an island)'),
            [
                'player_id' => $activePlayerId,
                'player_name' => $playerName,
                'card_id' => $cardId,
                'equipment_name' => $equipmentName,
                'color' => $color,
                'i18n' => ['color'],
            ]
        );
        $this->game->notify->all('equipmentUsed',
            clienttranslate('${equipment_name} is now spent'), [
            'player_id' => $activePlayerId,
            'card_id' => $cardId,
            'equipment_name' => $equipmentName,
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

        return $this->popExitState();
    }

    #[PossibleAction]
    public function actPassOffering(int $activePlayerId): string
    {
        // One-time (instant) equipment is carried out immediately when
        // received (rulebook flash symbol) — it can't be saved for later.
        // Passing therefore FORFEITS the card. forfeitInstantEquipmentCard
        // marks it spent so PlayerTurnStart's pending-one-time scan won't
        // re-fire it next turn (the prior cancel path left is_used = 0,
        // which re-triggered the card on the player's following turn — the
        // bug this change fixes).
        $this->game->forfeitInstantEquipmentCard(
            $activePlayerId, (int)$this->game->globals->get('eq17_card_id'), 17
        );
        $this->clearScratchGlobals();
        return $this->popExitState();
    }

    function zombie(int $playerId) {
        $colorOptions = $this->getColorOptions();
        $offerings = $this->getEligibleOfferings($colorOptions);
        if (empty($offerings)) {
            $this->clearScratchGlobals();
            return $this->popExitState();
        }
        return $this->actConfirmOffering((int)$offerings[0]['offering_id'], $playerId);
    }
}
