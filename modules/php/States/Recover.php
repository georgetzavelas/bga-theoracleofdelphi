<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class Recover extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 12,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} must discard 3 injury cards'),
            descriptionMyTurn: clienttranslate('${you} must select 3 injury cards to discard'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $injuries = $this->game->getObjectListFromDB(
            "SELECT card_id, card_type_arg FROM card
             WHERE card_type = 'injury' AND card_location = 'hand'
             AND card_location_arg = $playerId"
        );

        $injuryCards = [];
        foreach ($injuries as $card) {
            $colorIndex = (int)$card['card_type_arg'];
            $injuryCards[] = [
                'card_id' => (int)$card['card_id'],
                'color' => MaterialDefs::COLORS[$colorIndex],
            ];
        }

        return [
            'injuryCards' => $injuryCards,
            'totalInjuries' => count($injuryCards),
        ];
    }

    #[PossibleAction]
    public function actDiscardInjuries(string $cardIdsJson, int $activePlayerId) {
        $cardIds = json_decode($cardIdsJson, true);
        if (!is_array($cardIds) || count($cardIds) !== 3) {
            throw new UserException(clienttranslate('You must select exactly 3 injury cards'));
        }

        // Validate all cards belong to this player and are injury cards
        foreach ($cardIds as $cardId) {
            $cardId = (int)$cardId;
            $card = $this->game->getObjectFromDB(
                "SELECT card_id FROM card
                 WHERE card_id = $cardId AND card_type = 'injury'
                 AND card_location = 'hand' AND card_location_arg = $activePlayerId"
            );
            if (!$card) {
                throw new UserException(clienttranslate('Invalid injury card selection'));
            }
        }

        // Capture the colors of each discarded card so the client can update its stacks
        $idList = implode(',', array_map('intval', $cardIds));
        $colorRows = $this->game->getObjectListFromDB(
            "SELECT card_type_arg FROM card WHERE card_id IN ($idList)"
        );
        $colors = array_map(function($row) {
            return MaterialDefs::COLORS[(int)$row['card_type_arg']];
        }, $colorRows);

        // Discard the selected cards
        $this->game->DbQuery(
            "UPDATE card SET card_location = 'discard', card_location_arg = 0
             WHERE card_id IN ($idList)"
        );
        $this->game->statInc(1, 'recovery_turns', $activePlayerId);
        $this->game->statInc(count($cardIds), 'discarded_injury_cards', $activePlayerId);

        $this->notify->all("injuriesRecovered", clienttranslate('${player_name} discards 3 injury cards to recover'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "card_ids" => array_map('intval', $cardIds),
            "colors" => $colors,
        ]);

        // Recovery turn ends — skip actions and oracle consultation
        return NextPlayer::class;
    }

    function zombie(int $playerId) {
        // Auto-discard first 3 injury cards
        $cards = $this->game->getObjectListFromDB(
            "SELECT card_id FROM card
             WHERE card_type = 'injury' AND card_location = 'hand'
             AND card_location_arg = $playerId
             LIMIT 3"
        );
        $ids = array_column($cards, 'card_id');
        if (count($ids) >= 3) {
            return $this->actDiscardInjuries(json_encode($ids), $playerId);
        }
        return NextPlayer::class;
    }
}
