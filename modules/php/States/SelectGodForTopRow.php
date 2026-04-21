<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

/**
 * Sub-state for Equipment Card 021 (Divine Surge).
 *
 * Rule: "One-time: Advance 1 of the following Gods to the topmost row of
 * the God Track: Poseidon, Hermes, Artemis or Aphrodite."
 *
 * Unlike ChooseGodAdvancement (which iterates one step at a time against a
 * per-step budget), this is a single atomic pick: choose one eligible god
 * and it jumps straight to row MAX_ROW. There is no Pass — once the sub-
 * state runs, the card is spent. If all 4 eligible gods are already at max
 * row before entry, the activation resolves inline in
 * Game::applyOneTimeEquipmentEffect case 21 and we never enter this state.
 *
 * Entry: Game::applyOneTimeEquipmentEffect (case 21) sets:
 *   - globals 'eq21_card_id' = card_id of the activating card
 *   - globals 'equipment_post_activation_state' = exit state FQCN (set by
 *     CombatVictory::actSelectEquipment for normal post-combat, or by
 *     PlayerTurnStart for setup-dealt cards looping back through
 *     resolveNextPendingOneTimeEquipment).
 *
 * Exit: popExitState() — returns the stashed post-activation state, falls
 * back to SelectAction for any legacy click-activation path.
 */
class SelectGodForTopRow extends \Bga\GameFramework\States\GameState
{
    /** Gods named on card 021 (excludes Zeus and Apollo). */
    private const ELIGIBLE_GODS = ['poseidon', 'hermes', 'artemis', 'aphrodite'];

    /**
     * Topmost row of the God Track. Matches the `$row < 6` / `$row >= 6`
     * guards in ChooseGodAdvancement::actAdvanceGod — the track has 6
     * on-track rows (1..6), with 0 meaning "off track".
     */
    private const MAX_ROW = 6;

    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 49,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} must choose a god to advance to the top'),
            descriptionMyTurn: clienttranslate('${you}: choose a god to advance to the topmost row'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $cardId = (int)$this->game->globals->get('eq21_card_id');

        $list = "'" . implode("','", self::ELIGIBLE_GODS) . "'";
        $rows = $this->game->getObjectListFromDB(
            "SELECT god_name, track_row FROM player_god
             WHERE player_id = $playerId AND god_name IN ($list)"
        );
        $rowByGod = [];
        foreach ($rows as $r) {
            $rowByGod[$r['god_name']] = (int)$r['track_row'];
        }

        $gods = [];
        foreach (self::ELIGIBLE_GODS as $godName) {
            $row = $rowByGod[$godName] ?? 0;
            $godInfo = MaterialDefs::GODS[$godName] ?? ['color' => 'red'];
            $gods[] = [
                'god_name' => $godName,
                'color' => $godInfo['color'],
                'current_row' => $row,
                'steps_needed' => max(0, self::MAX_ROW - $row),
                'can_advance' => $row < self::MAX_ROW,
            ];
        }

        return [
            'card_id' => $cardId,
            'eligible_gods' => $gods,
            'max_row' => self::MAX_ROW,
        ];
    }

    #[PossibleAction]
    public function actSelectGod(string $godName, int $activePlayerId): string
    {
        $cardId = (int)$this->game->globals->get('eq21_card_id');
        if ($cardId <= 0) {
            throw new UserException(clienttranslate('Equipment activation expired.'));
        }

        if (!in_array($godName, self::ELIGIBLE_GODS, true)) {
            throw new UserException(clienttranslate('This god is not eligible for Divine Surge.'));
        }

        $safeName = addslashes($godName);
        $currentRow = (int)$this->game->getUniqueValueFromDB(
            "SELECT track_row FROM player_god
             WHERE player_id = $activePlayerId AND god_name = '$safeName'"
        );

        if ($currentRow >= self::MAX_ROW) {
            throw new UserException(clienttranslate('This god is already at the topmost row.'));
        }

        $newRow = self::MAX_ROW;

        // Single jump to the top. ChooseGodAdvancement handles the
        // row-0 → PLAYER_COUNT_ROW edge case for first-step advancement,
        // but that only matters for incremental step counts. Going
        // straight to MAX_ROW is row-independent of the starting point.
        $this->game->DbQuery(
            "UPDATE player_god SET track_row = $newRow
             WHERE player_id = $activePlayerId AND god_name = '$safeName'"
        );

        // Mark the activating card one-time used (stays in hand, greyed out).
        $this->game->DbQuery(
            "UPDATE card SET is_used = 1 WHERE card_id = $cardId"
        );

        $playerName = $this->game->getPlayerNameById($activePlayerId);
        $equipmentName = $this->game->equipmentName(21);

        $this->game->notify->all('equipmentActivated',
            clienttranslate('${player_name} activates ${equipment_name} (advances ${god_name} to the top of the God Track)'),
            [
                'player_id' => $activePlayerId,
                'player_name' => $playerName,
                'card_id' => $cardId,
                'equipment_name' => $equipmentName,
                'god_name' => $godName,
                'i18n' => ['god_name'],
            ]
        );
        $this->game->notify->all('equipmentUsed', '', [
            'player_id' => $activePlayerId,
            'card_id' => $cardId,
        ]);

        // Drive the god token UI via the existing godAdvanced notif so the
        // client's notif_godAdvanced handler (components.positionGodToken)
        // renders the new row for every player.
        $this->game->notify->all('godAdvanced',
            clienttranslate('${player_name} advances ${god_name}'),
            [
                'player_id' => $activePlayerId,
                'player_name' => $playerName,
                'god_name' => $godName,
                'new_row' => $newRow,
                'i18n' => ['god_name'],
            ]
        );

        $this->clearScratchGlobals();
        return $this->popExitState();
    }

    private function clearScratchGlobals(): void
    {
        $this->game->globals->set('eq21_card_id', 0);
    }

    /**
     * Pop the post-activation exit state set by whoever routed us here.
     * Mirrors SelectStatueFromAnyCity::popExitState / SelectOfferingFromAnyIsland::popExitState.
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

    function zombie(int $playerId)
    {
        // Auto-pick: advance the lowest-row eligible god to the top. If all
        // four are already maxed we should never be here (entry guard in
        // applyOneTimeEquipmentEffect case 21 handles that), but defend
        // anyway by clearing state and exiting.
        $args = $this->getArgs();
        $best = null;
        $bestRow = self::MAX_ROW;
        foreach ($args['eligible_gods'] as $g) {
            if ($g['can_advance'] && $g['current_row'] < $bestRow) {
                $bestRow = $g['current_row'];
                $best = $g['god_name'];
            }
        }

        if ($best === null) {
            $this->clearScratchGlobals();
            return $this->popExitState();
        }
        return $this->actSelectGod($best, $playerId);
    }
}
