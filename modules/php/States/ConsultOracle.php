<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphi\Game;
use Bga\Games\theoracleofdelphi\MaterialDefs;

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

        // Any wild oracle card the active player drew this turn but
        // never played reverts to a regular card of its original
        // colour. Tells the client which card_ids reverted so the hand
        // UI can merge them back into their colour stacks.
        $revertedRows = $this->game->getObjectListFromDB(
            "SELECT card_id FROM card
             WHERE card_type = 'oracle' AND card_location = 'hand'
             AND card_location_arg = $activePlayerId AND is_wild = 1"
        );
        if (!empty($revertedRows)) {
            $this->game->DbQuery(
                "UPDATE card SET is_wild = 0
                 WHERE card_type = 'oracle' AND card_location = 'hand'
                 AND card_location_arg = $activePlayerId AND is_wild = 1"
            );
            $ids = array_map('intval', array_column($revertedRows, 'card_id'));
            // Private notif — wild-card identity is private to the
            // holder, and only the holder's hand UI needs to react.
            $this->notify->player($activePlayerId, "oracleWildCardReverted", '', [
                "card_ids" => $ids,
            ]);
        }

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

        $this->notify->all("diceRolled",
            clienttranslate('${player_name}\'s Oracle Dice show: ${dice}'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "colors" => $newColors,
            "dice" => implode(', ', $newColors),
            "preserve" => ["colors"],
        ]);

        $this->game->resetEquipmentColorReactionsThisRound($activePlayerId);
        foreach ($newColors as $color) {
            $this->game->applyEquipmentColorReaction($activePlayerId, $color);
        }

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

}
