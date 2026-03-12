<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class ConsultOracle extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 40, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId) {
        // Re-roll oracle dice for the next player's turn
        $colors = MaterialDefs::COLORS;
        $colorCount = count($colors);
        $newColors = [];
        for ($d = 0; $d < 3; $d++) {
            $color = $colors[bga_rand(0, $colorCount - 1)];
            $newColors[] = $color;
            $safeColor = addslashes($color);
            $this->game->DbQuery(
                "UPDATE oracle_die SET color = '$safeColor', original_color = '$safeColor', is_used = 0
                 WHERE player_id = $activePlayerId AND die_index = $d"
            );
        }

        $this->notify->all("consultOracle", clienttranslate('${player_name} consults the oracle'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);

        $this->notify->all("diceRolled", '', [
            "player_id" => $activePlayerId,
            "colors" => $newColors,
        ]);

        return NextPlayer::class;
    }
}
