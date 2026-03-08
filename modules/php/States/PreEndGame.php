<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;

class PreEndGame extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 90, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId) {
        $this->notify->all("preEndGame", clienttranslate('The game is ending — final scoring'), []);
        return EndScore::class;
    }
}
