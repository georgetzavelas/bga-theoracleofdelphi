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

        // Oracle cards in hand, grouped by color
        $oracleCardPlayed = (int)$this->game->globals->get('oracle_card_played');
        $oracleCardsInHand = [];
        if ($oracleCardPlayed === 0) {
            $rows = $this->game->getObjectListFromDB(
                "SELECT card_id, card_type_arg FROM card
                 WHERE card_type = 'oracle' AND card_location = 'hand' AND card_location_arg = $playerId
                 ORDER BY card_id"
            );
            $colors = \Bga\Games\theoracleofdelphigzed\MaterialDefs::COLORS;
            foreach ($rows as $row) {
                $oracleCardsInHand[] = [
                    'cardId' => (int)$row['card_id'],
                    'color' => $colors[(int)$row['card_type_arg']] ?? 'red',
                ];
            }
        }

        return [
            'dice' => $dice,
            'oracleCardsInHand' => $oracleCardsInHand,
            'canPlayOracleCard' => $oracleCardPlayed === 0 && count($oracleCardsInHand) > 0,
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
    public function actPlayOracleCard(int $card_id, int $activePlayerId) {
        // Validate card is in player's hand
        $card = $this->game->getObjectFromDB(
            "SELECT card_id, card_type_arg FROM card
             WHERE card_id = $card_id AND card_type = 'oracle'
             AND card_location = 'hand' AND card_location_arg = $activePlayerId"
        );
        if ($card === null) {
            throw new UserException('Invalid oracle card');
        }

        // Validate no oracle card already played this turn
        if ((int)$this->game->globals->get('oracle_card_played') !== 0) {
            throw new UserException('You have already played an oracle card this turn');
        }

        $this->game->globals->set('oracle_card_played', 1);
        $this->game->globals->set('selected_oracle_card_id', (int)$card['card_id']);

        $colors = \Bga\Games\theoracleofdelphigzed\MaterialDefs::COLORS;
        $color = $colors[(int)$card['card_type_arg']] ?? 'red';

        $this->notify->all("oracleCardPlayed", clienttranslate('${player_name} plays a ${card_color} oracle card'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "card_id" => (int)$card['card_id'],
            "card_color" => $color,
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
