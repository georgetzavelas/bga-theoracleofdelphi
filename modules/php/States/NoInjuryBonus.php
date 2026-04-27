<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class NoInjuryBonus extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 13,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} has no injuries — take bonus'),
            descriptionMyTurn: clienttranslate('No injuries! Take 2 Favor or advance 1 God'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();

        // Find all gods that can be advanced (any god not at max row 6)
        $gods = $this->game->getObjectListFromDB(
            "SELECT god_name, track_row FROM player_god
             WHERE player_id = $playerId AND track_row < 6"
        );

        $advanceableGods = [];
        foreach ($gods as $god) {
            $advanceableGods[] = [
                'god_name' => $god['god_name'],
                'current_row' => (int)$god['track_row'],
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

        $this->notify->all("favorTokensTaken", clienttranslate('${player_name} takes ${amount} Favor (no-injury bonus)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "amount" => $amount,
            "favor_tokens" => $newFavor,
        ]);

        return PlayerActions::class;
    }

    #[PossibleAction]
    public function actAdvanceGod(string $godName, int $activePlayerId) {
        // Validate: god must exist and not be at max row
        $safeName = addslashes($godName);
        $currentRow = $this->game->getUniqueValueFromDB(
            "SELECT track_row FROM player_god
             WHERE player_id = $activePlayerId AND god_name = '$safeName'"
        );
        if ($currentRow === null) {
            throw new UserException(clienttranslate('Invalid god'));
        }
        $currentRow = (int)$currentRow;
        if ($currentRow >= 6) {
            throw new UserException(clienttranslate('That god is already at the top of the track'));
        }

        // Row 0 → player-count row, otherwise +1
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
        $this->game->statInc($newRow - $currentRow, "{$godName}_advances", $activePlayerId);

        $this->notify->all("godAdvanced", clienttranslate('${player_name} advances ${god_name} (no-injury bonus)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "god_name" => $godName,
            "new_row" => $newRow,
        ]);

        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actTakeFavor($playerId);
    }
}
