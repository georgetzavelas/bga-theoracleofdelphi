<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphi\Game;
use Bga\Games\theoracleofdelphi\MaterialDefs;

class NoInjuryBonus extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 13,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} has no injuries - taking bonus'),
            descriptionMyTurn: clienttranslate('You have no injuries! Take 2 Favor or advance 1 God as a reward'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();

        // Find all gods that can be advanced (any god not at max step 6)
        $gods = $this->game->getObjectListFromDB(
            "SELECT god_name, track_step FROM player_god
             WHERE player_id = $playerId AND track_step < 6"
        );

        $advanceableGods = [];
        foreach ($gods as $god) {
            $advanceableGods[] = [
                'god_name' => $god['god_name'],
                'current_step' => (int)$god['track_step'],
            ];
        }

        return [
            'advanceableGods' => $advanceableGods,
        ];
    }

    #[PossibleAction]
    public function actTakeFavor(int $activePlayerId) {
        $amount = 2;
        $this->game->DbQuery(
            "UPDATE player SET favor_tokens = favor_tokens + $amount WHERE player_id = $activePlayerId"
        );
        $newFavor = (int)$this->game->getUniqueValueFromDB(
            "SELECT favor_tokens FROM player WHERE player_id = $activePlayerId"
        );

        $this->notify->all("favorTokensTaken", clienttranslate('${player_name} takes ${amount} favor (no-injury bonus)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "amount" => $amount,
            "favor_tokens" => $newFavor,
        ]);

        return PlayerActions::class;
    }

    #[PossibleAction]
    public function actAdvanceGod(string $godName, int $activePlayerId) {
        // Validate: god must exist and not be at max step
        $safeName = addslashes($godName);
        $currentStep = $this->game->getUniqueValueFromDB(
            "SELECT track_step FROM player_god
             WHERE player_id = $activePlayerId AND god_name = '$safeName'"
        );
        if ($currentStep === null) {
            throw new UserException(clienttranslate('Invalid god'));
        }
        $currentStep = (int)$currentStep;
        if ($currentStep >= 6) {
            throw new UserException(clienttranslate('That god is already at the top of the track'));
        }

        // Step 0 → player-count step, otherwise +1
        if ($currentStep === 0) {
            $playerCount = (int)$this->game->getUniqueValueFromDB("SELECT COUNT(*) FROM player");
            $newStep = MaterialDefs::PLAYER_COUNT_STEP[$playerCount] ?? 1;
        } else {
            $newStep = $currentStep + 1;
        }

        $this->game->DbQuery(
            "UPDATE player_god SET track_step = $newStep
             WHERE player_id = $activePlayerId AND god_name = '$safeName'"
        );
        $this->game->statInc($newStep - $currentStep, "{$godName}_advances", $activePlayerId);

        $this->notify->all("godAdvanced", clienttranslate('${player_name} advances ${god_name} (no-injury bonus)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "god_name" => $godName,
            "new_step" => $newStep,
        ]);

        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actTakeFavor($playerId);
    }
}
