<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class Recover extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 12,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} must recover'),
            descriptionMyTurn: clienttranslate('${you} must discard injury cards'),
        );
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("recover", clienttranslate('${player_name} recovers (placeholder)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return NextPlayer::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
