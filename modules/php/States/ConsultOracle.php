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
        // Clear Apollo wild flag from previous turn
        $this->game->globals->set('apollo_wild_active', null);
        $this->game->globals->set('apollo_pending_recolor', null);
        $this->game->globals->set('wild_card_chosen_color', null);

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

        $this->grantOracleColorReactions($activePlayerId, $newColors);

        // Create god advancement queue entries for all other players
        $allPlayers = $this->game->getObjectListFromDB(
            "SELECT player_id FROM player WHERE player_id != $activePlayerId"
        );
        foreach ($allPlayers as $p) {
            $pid = (int)$p['player_id'];
            $this->game->DbQuery(
                "INSERT INTO god_advancement_queue (player_id, source_player_id)
                 VALUES ($pid, $activePlayerId)"
            );
        }

        return NextPlayer::class;
    }

    /**
     * Grant Favor reactions for oracle-color equipment cards (cards 000/001/002)
     * when a matching die color is rolled during Consult Oracle.
     */
    private function grantOracleColorReactions(int $playerId, array $rolledColors): void
    {
        $reactionMap = [0 => 'yellow', 1 => 'red', 2 => 'black'];
        foreach ($reactionMap as $cardTypeArg => $requiredColor) {
            if (!$this->game->playerOwnsEquipment($playerId, $cardTypeArg)) {
                continue;
            }
            if (!in_array($requiredColor, $rolledColors, true)) {
                continue;
            }

            $this->game->DbQuery(
                "UPDATE player SET favor_tokens = favor_tokens + 2 WHERE player_id = $playerId"
            );

            $cardRow = $this->game->getObjectFromDB(
                "SELECT card_id FROM card
                 WHERE card_type = 'equipment' AND card_type_arg = $cardTypeArg
                 AND card_location = 'hand' AND card_location_arg = $playerId
                 LIMIT 1"
            );
            $cardId = $cardRow ? (int)$cardRow['card_id'] : 0;

            $newFavor = (int)$this->game->getUniqueValueFromDB(
                "SELECT favor_tokens FROM player WHERE player_id = $playerId"
            );

            $this->notify->all('equipmentReactionTriggered', clienttranslate('${player_name} gains 2 Favor from ${equipment_name} (${color} shown)'), [
                'player_id' => $playerId,
                'player_name' => $this->game->getPlayerNameById($playerId),
                'card_id' => $cardId,
                'equipment_name' => $this->game->equipmentName($cardTypeArg),
                'color' => $requiredColor,
                'favor_delta' => 2,
                'favor_tokens' => $newFavor,
            ]);
        }
    }
}
