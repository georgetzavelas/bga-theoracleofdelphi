<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class SelectAction extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 21,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} selects action'),
            descriptionMyTurn: clienttranslate('Select action for die'),
        );
    }

    public function getArgs(): array
    {
        $dieIndex = $this->game->globals->get('selected_die_index');
        $playerId = (int)$this->game->getActivePlayerId();
        $die = $this->game->getObjectFromDB(
            "SELECT color FROM oracle_die WHERE player_id = $playerId AND die_index = $dieIndex"
        );
        return [
            'dieIndex' => $dieIndex,
            'dieColor' => $die ? $die['color'] : null,
        ];
    }

    #[PossibleAction]
    public function actMoveShip(int $activePlayerId) {
        return MoveShip::class;
    }

    #[PossibleAction]
    public function actCancelDieSelection(int $activePlayerId) {
        $this->game->globals->set('selected_die_index', null);
        $this->notify->all("dieCancelled", clienttranslate('${player_name} cancels die selection'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actCancelDieSelection($playerId);
    }
}
