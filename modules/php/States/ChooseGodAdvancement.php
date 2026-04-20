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

        if ($currentRow === 0) {
            $playerCount = (int)$this->game->getUniqueValueFromDB("SELECT COUNT(*) FROM player");
            $newRow = MaterialDefs::PLAYER_COUNT_ROW[$playerCount] ?? 1;
        } else {
            $newRow = $currentRow + 1;
        }

        $this->game->DbQuery(
            "UPDATE player_god SET track_row = $newRow
             WHERE player_id = $activePlayerId AND god_name = '$safeName'"
        );

        $stepsRemaining--;
        $this->game->globals->set('god_steps_remaining', $stepsRemaining);

        $this->notify->all("godAdvanced", clienttranslate('${player_name} advances ${god_name}'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "god_name" => $godName,
            "new_row" => $newRow,
        ]);

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

        // Equipment 007 now auto-resolves when the card is selected after a
        // combat victory. After the 2 god steps, return to whichever state
        // CombatVictory stashed in `equipment_post_activation_state` (the
        // normal post-combat next state — PlayerActions or ConsultOracle).
        // The legacy fallback to SelectAction covers any lingering
        // click-activation path (e.g. starting-equipment setup, future use).
        if ($reason === 'equipment_7') {
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
