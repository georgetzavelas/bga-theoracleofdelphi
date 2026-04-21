<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class ChooseGodAdvancement extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 45,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} may advance a god'),
            descriptionMyTurn: clienttranslate('${you}: advance a god (${steps_remaining} step(s) remaining)'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $stepsRemaining = (int)$this->game->globals->get('god_steps_remaining');
        $reason = $this->game->globals->get('god_advance_reason') ?? 'reward';

        $gods = [];
        foreach (MaterialDefs::GODS as $godName => $god) {
            $safeName = addslashes($godName);
            $row = (int)$this->game->getUniqueValueFromDB(
                "SELECT track_row FROM player_god
                 WHERE player_id = $playerId AND god_name = '$safeName'"
            );
            $gods[] = [
                'god_name' => $godName,
                'color' => $god['color'],
                'current_row' => $row,
                'can_advance' => $row < 6,
            ];
        }

        return [
            'gods' => $gods,
            'steps_remaining' => $stepsRemaining,
            'reason' => $reason,
        ];
    }

    #[PossibleAction]
    public function actAdvanceGod(string $godName, int $activePlayerId) {
        $stepsRemaining = (int)$this->game->globals->get('god_steps_remaining');
        if ($stepsRemaining <= 0) {
            throw new UserException(clienttranslate('No steps remaining'));
        }

        if (!isset(MaterialDefs::GODS[$godName])) {
            throw new UserException(clienttranslate('Invalid god'));
        }

        $safeName = addslashes($godName);
        $currentRow = (int)$this->game->getUniqueValueFromDB(
            "SELECT track_row FROM player_god
             WHERE player_id = $activePlayerId AND god_name = '$safeName'"
        );

        if ($currentRow >= 6) {
            throw new UserException(clienttranslate('This god is already at maximum level'));
        }

        $this->game->advanceGodOneStep($activePlayerId, $godName);

        $stepsRemaining--;
        $this->game->globals->set('god_steps_remaining', $stepsRemaining);

        if ($stepsRemaining > 0) {
            return ChooseGodAdvancement::class;
        }
        return $this->finish($activePlayerId);
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("skipGodAdvancement", clienttranslate('${player_name} finishes advancing gods'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return $this->finish($activePlayerId);
    }

    private function finish(int $playerId): string
    {
        $reason = $this->game->globals->get('god_advance_reason');

        $this->game->globals->set('god_steps_remaining', 0);
        $this->game->globals->set('god_advance_reason', null);
        $this->game->globals->set('explore_hex_q', null);
        $this->game->globals->set('explore_hex_r', null);

        // Equipment card sub-state routing: any `equipment_N` reason
        // reads the caller-stashed `equipment_post_activation_state` and
        // returns there. Covers:
        //   - equipment_7  (big bonus one-time): back to post-combat state
        //   - equipment_11 (Blessed Reward reaction): back to caller's
        //                  normal post-reward state (PlayerActions /
        //                  ConsultOracle / SelectReward)
        //   - future equipment cards that use this sub-state (e.g. 021).
        // The legacy fallback to SelectAction covers any lingering
        // click-activation path (e.g. starting-equipment setup, future use).
        if (is_string($reason) && str_starts_with($reason, 'equipment_')) {
            $post = (string)$this->game->globals->get('equipment_post_activation_state');
            $this->game->globals->set('equipment_post_activation_state', null);
            if ($post !== '') {
                return $post;
            }
            return SelectAction::class;
        }

        if ($this->game->allDiceUsed($playerId)) {
            return ConsultOracle::class;
        }
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
