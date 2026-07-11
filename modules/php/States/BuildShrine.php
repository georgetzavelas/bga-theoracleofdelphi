<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphi\Game;

class BuildShrine extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 37,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} builds a shrine'),
            descriptionMyTurn: clienttranslate('Place shrine on island'),
        );
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("cancelShrine", clienttranslate('${player_name} cancels shrine placement'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        // Release the (uncommitted) action source so a card source isn't
        // stranded — see Game::releaseSelectedSource.
        $this->game->releaseSelectedSource($activePlayerId);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
