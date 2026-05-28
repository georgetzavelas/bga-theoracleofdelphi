<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphi\Game;

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

        // Equipment 015 (Pain Tolerance): thresholds bump from 3/6 to 4/8.
        $ownsPainTolerance = $this->game->playerOwnsEquipment($activePlayerId, 15);
        $sameColorThreshold = $ownsPainTolerance ? 4 : 3;
        $totalThreshold = $ownsPainTolerance ? 8 : 6;

        $totalInjuries = 0;
        $hasSameColorThreshold = false;
        foreach ($injuries as $row) {
            $count = (int)$row['cnt'];
            $totalInjuries += $count;
            if ($count >= $sameColorThreshold) {
                $hasSameColorThreshold = true;
            }
        }

        // Threshold exceeded → forced recovery (see Pain Tolerance above).
        if ($hasSameColorThreshold || $totalInjuries >= $totalThreshold) {
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
