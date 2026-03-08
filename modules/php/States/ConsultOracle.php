<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;

class ConsultOracle extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 40, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId) {
        $this->notify->all("consultOracle", clienttranslate('${player_name} consults the oracle'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return NextPlayer::class;
    }
}
