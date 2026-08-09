<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphi\Game;
use Bga\Games\theoracleofdelphi\InjuryRules;

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
        $ownsPainTolerance = $this->game->playerOwnsEquipment(
            $activePlayerId, InjuryRules::PAIN_TOLERANCE_EQUIPMENT_ID
        );

        $countsByColor = [];
        foreach ($injuries as $row) {
            $countsByColor[(int)$row['card_type_arg']] = (int)$row['cnt'];
        }
        $totalInjuries = InjuryRules::totalInjuries($countsByColor);

        // Threshold exceeded → forced recovery (see Pain Tolerance above).
        if (InjuryRules::mustRecover($countsByColor, $ownsPainTolerance)) {
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
