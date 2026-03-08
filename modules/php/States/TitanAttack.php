<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;

class TitanAttack extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 51, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId) {
        $this->notify->all("titanAttack", clienttranslate('The Titan attacks!'), []);
        // Happy path: go to next round
        return RoundStart::class;
    }
}
