<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;

class PlayerActions extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 20,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} must select an Oracle die'),
            descriptionMyTurn: clienttranslate('${you} must select an Oracle die'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $dice = $this->game->getObjectListFromDB(
            "SELECT die_index, color, is_used FROM oracle_die WHERE player_id = $playerId ORDER BY die_index"
        );
        return [
            'dice' => $dice,
        ];
    }

    #[PossibleAction]
    public function actSelectDie(int $die_index, int $activePlayerId) {
        $die = $this->game->getObjectFromDB(
            "SELECT die_id, color, is_used FROM oracle_die
             WHERE player_id = $activePlayerId AND die_index = $die_index"
        );
        if ($die === null) {
            throw new UserException('Invalid die');
        }
        if ((int)$die['is_used'] === 1) {
            throw new UserException('This die has already been used');
        }

        $this->game->globals->set('selected_die_index', $die_index);

        $this->notify->all("dieSelected", clienttranslate('${player_name} selects a ${die_color} die'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "die_color" => $die['color'],
            "die_index" => $die_index,
        ]);

        return SelectAction::class;
    }

    #[PossibleAction]
    public function actEndTurn(int $activePlayerId) {
        $this->notify->all("endTurn", clienttranslate('${player_name} ends their turn'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return ConsultOracle::class;
    }

    function zombie(int $playerId) {
        return $this->actEndTurn($playerId);
    }
}
