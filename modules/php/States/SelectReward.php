<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class SelectReward extends \Bga\GameFramework\States\GameState
{
    private const COLOR_INDEX = [
        'red' => 0, 'yellow' => 1, 'green' => 2,
        'blue' => 3, 'pink' => 4, 'black' => 5,
    ];

    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 39,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} selects reward'),
            descriptionMyTurn: clienttranslate('Select your reward'),
        );
    }

    public function getArgs(): array
    {
        $rewardType = $this->game->globals->get('reward_type');
        $rewardColor = $this->game->globals->get('reward_color');

        if ($rewardType === 'companion' && $rewardColor) {
            return [
                'rewardType' => 'companion',
                'rewardColor' => $rewardColor,
                'availableCards' => $this->getAvailableCompanions($rewardColor),
            ];
        }

        return [
            'rewardType' => $rewardType,
            'rewardColor' => $rewardColor,
            'availableCards' => [],
        ];
    }

    private function getAvailableCompanions(string $color): array
    {
        $colorIndex = self::COLOR_INDEX[$color] ?? -1;
        if ($colorIndex < 0) return [];

        $minArg = $colorIndex * 3;
        $maxArg = $minArg + 2;

        $cards = $this->game->getObjectListFromDB(
            "SELECT card_id, card_type_arg FROM card
             WHERE card_type = 'companion' AND card_location = 'deck'
             AND card_type_arg >= $minArg AND card_type_arg <= $maxArg"
        );

        $result = [];
        foreach ($cards as $card) {
            $typeIndex = (int)$card['card_type_arg'] - $minArg;
            $companionType = MaterialDefs::COMPANION_TYPES[$typeIndex] ?? null;
            $result[] = [
                'card_id' => (int)$card['card_id'],
                'card_type_arg' => (int)$card['card_type_arg'],
                'subtype' => $companionType ? $companionType['subtype'] : 'unknown',
                'description' => $companionType ? $companionType['description'] : '',
                'color' => $color,
            ];
        }
        return $result;
    }

    #[PossibleAction]
    public function actSelectReward(int $card_id, int $activePlayerId) {
        $rewardType = $this->game->globals->get('reward_type');

        if ($rewardType === 'companion') {
            return $this->selectCompanion($card_id, $activePlayerId);
        }

        throw new UserException(clienttranslate('Unknown reward type'));
    }

    private function selectCompanion(int $cardId, int $activePlayerId): string
    {
        $rewardColor = $this->game->globals->get('reward_color');
        $availableCards = $this->getAvailableCompanions($rewardColor);

        $selectedCard = null;
        foreach ($availableCards as $card) {
            if ($card['card_id'] === $cardId) {
                $selectedCard = $card;
                break;
            }
        }
        if (!$selectedCard) {
            throw new UserException(clienttranslate('That companion card is not available'));
        }

        $this->game->DbQuery(
            "UPDATE card SET card_location = 'hand', card_location_arg = $activePlayerId
             WHERE card_id = $cardId"
        );

        $this->notify->all("companionSelected", clienttranslate('${player_name} takes a ${subtype} companion'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "card_id" => $cardId,
            "card_type_arg" => $selectedCard['card_type_arg'],
            "subtype" => $selectedCard['subtype'],
            "color" => $rewardColor,
        ]);

        $this->game->globals->set('reward_type', null);
        $this->game->globals->set('reward_color', null);

        if ($this->game->allDiceUsed($activePlayerId)) {
            return ConsultOracle::class;
        }
        return PlayerActions::class;
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->game->globals->set('reward_type', null);
        $this->game->globals->set('reward_color', null);

        if ($this->game->allDiceUsed($activePlayerId)) {
            return ConsultOracle::class;
        }
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        $rewardColor = $this->game->globals->get('reward_color');
        if ($rewardColor) {
            $availableCards = $this->getAvailableCompanions($rewardColor);
            if (!empty($availableCards)) {
                return $this->selectCompanion($availableCards[0]['card_id'], $playerId);
            }
        }
        return $this->actPass($playerId);
    }
}
