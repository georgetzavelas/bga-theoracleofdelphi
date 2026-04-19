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

        // Hero companion: +2 shield (capped at 5) on acquire, plus retroactive
        // discard of any matching-color injuries already in the player's hand.
        if ($selectedCard['subtype'] === 'hero') {
            $currentShield = (int)$this->game->getUniqueValueFromDB(
                "SELECT shield_value FROM player WHERE player_id = $activePlayerId"
            );
            $newShield = min(5, $currentShield + 2);
            if ($newShield > $currentShield) {
                $this->game->DbQuery(
                    "UPDATE player SET shield_value = $newShield WHERE player_id = $activePlayerId"
                );
                $playerHexColor = $this->game->getUniqueValueFromDB(
                    "SELECT player_color FROM player WHERE player_id = $activePlayerId"
                );
                $playerGameColor = MaterialDefs::HEX_TO_GAME_COLOR[$playerHexColor] ?? 'blue';
                $this->notify->all("shieldIncreased",
                    clienttranslate('${player_name} increases shield to ${value} (Hero companion)'), [
                    "player_id" => $activePlayerId,
                    "player_name" => $this->game->getPlayerNameById($activePlayerId),
                    "value" => $newShield,
                    "playerColor" => $playerGameColor,
                ]);
            }

            $colorIdx = MaterialDefs::COLOR_INDEX[$rewardColor] ?? -1;
            if ($colorIdx >= 0) {
                $existing = (int)$this->game->getUniqueValueFromDB(
                    "SELECT COUNT(*) FROM card WHERE card_type = 'injury'
                     AND card_location = 'hand' AND card_location_arg = $activePlayerId
                     AND card_type_arg = $colorIdx"
                );
                if ($existing > 0) {
                    $this->game->DbQuery(
                        "UPDATE card SET card_location = 'discard', card_location_arg = 0
                         WHERE card_type = 'injury' AND card_location = 'hand'
                         AND card_location_arg = $activePlayerId AND card_type_arg = $colorIdx"
                    );
                    $this->notify->all("heroAutoDiscarded",
                        clienttranslate('${player_name}\'s new ${color} Hero discards ${count} ${color} injury already in hand'), [
                        "player_id" => $activePlayerId,
                        "player_name" => $this->game->getPlayerNameById($activePlayerId),
                        "color" => $rewardColor,
                        "count" => $existing,
                        "source" => "acquire",
                    ]);
                }
            }
        }

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
