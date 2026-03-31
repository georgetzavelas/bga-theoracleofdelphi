<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;

class CheckInjuries extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 11, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId) {
        // Count injuries by color
        $injuries = $this->game->getObjectListFromDB(
            "SELECT card_type_arg, COUNT(*) AS cnt FROM card
             WHERE card_type = 'injury' AND card_location = 'hand'
             AND card_location_arg = $activePlayerId
             GROUP BY card_type_arg"
        );

        $totalInjuries = 0;
        $hasThreeSameColor = false;
        foreach ($injuries as $row) {
            $count = (int)$row['cnt'];
            $totalInjuries += $count;
            if ($count >= 3) {
                $hasThreeSameColor = true;
            }
        }

        // 3 same color OR 6+ total → forced recovery
        if ($hasThreeSameColor || $totalInjuries >= 6) {
            $this->notify->all("recoveryRequired", clienttranslate('${player_name} must recover from injuries'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
                "total_injuries" => $totalInjuries,
            ]);
            return Recover::class;
        }

        // 0 injuries → no-injury bonus
        if ($totalInjuries === 0) {
            return NoInjuryBonus::class;
        }

        // Otherwise → normal turn
        return PlayerActions::class;
    }
}
