<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphi\Game;
use Bga\Games\theoracleofdelphi\MaterialDefs;

class SelectReward extends \Bga\GameFramework\States\GameState
{
    use UndoableState;

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
            return array_merge([
                'rewardType' => 'companion',
                'rewardColor' => $rewardColor,
                'availableCards' => $this->getAvailableCompanions($rewardColor),
            ], $this->undoArgs());
        }

        return array_merge([
            'rewardType' => $rewardType,
            'rewardColor' => $rewardColor,
            'availableCards' => [],
        ], $this->undoArgs());
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
        $this->game->sealUndo();  // companion reward committed
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
        $this->game->statInc(1, "{$selectedCard['subtype']}_companion_cards_acquired", $activePlayerId);

        $companionName = MaterialDefs::COMPANION_NAMES[(int)$selectedCard['card_type_arg']] ?? '';
        // Top card of the companion deck after the pick — sent so the
        // supply-strip companion slot can flip to the new face-up card
        // without an extra round-trip. Null when the deck is now empty.
        $newTopCard = $this->game->getObjectFromDB(
            "SELECT card_id AS id, card_type_arg AS cardTypeArg
             FROM card WHERE card_type = 'companion' AND card_location = 'deck'
             ORDER BY card_order ASC LIMIT 1"
        );
        $this->notify->all("companionSelected", clienttranslate('${player_name} takes ${companion_name} (${color} ${subtype})'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "card_id" => $cardId,
            "card_type_arg" => $selectedCard['card_type_arg'],
            "subtype" => $selectedCard['subtype'],
            "color" => $rewardColor,
            "companion_name" => $companionName,
            "new_top_card" => $newTopCard,
        ]);

        // Demigod companion: draw 1 Oracle card on acquire.
        if ($selectedCard['subtype'] === 'demigod') {
            // Lazy safety net: reshuffle the discard pile in if the deck is empty.
            $this->game->replenishOracleDeckIfEmpty();
            $oracleCard = $this->game->getObjectFromDB(
                "SELECT card_id, card_type_arg FROM card
                 WHERE card_type = 'oracle' AND card_location = 'deck'
                 ORDER BY card_order ASC LIMIT 1"
            );
            if ($oracleCard !== null) {
                $drawnId = (int)$oracleCard['card_id'];
                $drawnColor = MaterialDefs::COLORS[(int)$oracleCard['card_type_arg']] ?? 'red';
                $this->game->DbQuery(
                    "UPDATE card SET card_location = 'hand', card_location_arg = $activePlayerId
                     WHERE card_id = $drawnId"
                );
                $this->game->statInc(1, 'oracle_cards_drawn', $activePlayerId);
                $this->notify->player($activePlayerId, "oracleCardDrawnPrivate", '', [
                    "card_id" => $drawnId,
                    "card_color" => $drawnColor,
                ]);
                $this->notify->all("oracleCardDrawn",
                    clienttranslate('${player_name} draws an oracle card from ${companion_name}, the ${color} demigod'), [
                    "player_id" => $activePlayerId,
                    "player_name" => $this->game->getPlayerNameById($activePlayerId),
                    "companion_name" => $companionName,
                    "color" => $rewardColor,
                ]);
                // Eager: if that drew the last card, refill from the discard now.
                $this->game->replenishOracleDeckIfEmpty();
            }
        }

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
                $this->game->statInc(1, 'shield_raised', $activePlayerId);
                $playerHexColor = $this->game->getUniqueValueFromDB(
                    "SELECT player_color FROM player WHERE player_id = $activePlayerId"
                );
                $playerGameColor = MaterialDefs::HEX_TO_GAME_COLOR[$playerHexColor] ?? 'blue';
                $this->notify->all("shieldIncreased",
                    clienttranslate('${player_name} increases shield to ${value} (${companion_name}, the ${color} Hero)'), [
                    "player_id" => $activePlayerId,
                    "player_name" => $this->game->getPlayerNameById($activePlayerId),
                    "value" => $newShield,
                    "playerColor" => $playerGameColor,
                    "companion_name" => $companionName,
                    "color" => $rewardColor,
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
                    $this->game->statInc($existing, 'discarded_injury_cards', $activePlayerId);
                    $this->notify->all("heroAutoDiscarded",
                        clienttranslate('${companion_name} discards ${count} ${color} injury already in ${player_name}\'s hand'), [
                        "player_id" => $activePlayerId,
                        "player_name" => $this->game->getPlayerNameById($activePlayerId),
                        "color" => $rewardColor,
                        "count" => $existing,
                        "source" => "acquire",
                        "companion_name" => $companionName,
                    ]);
                }
            }
        }

        $this->game->globals->set('reward_type', null);
        $this->game->globals->set('reward_color', null);

        $nextState = $this->game->nextStateAfterDieAction($activePlayerId);

        // Card 011 (Blessed Reward): companion received for raising a
        // statue → advance 1 god.
        $reaction = $this->game->maybeGrantBlessedRewardGodStep(
            $activePlayerId, $nextState, 'statue'
        );
        if ($reaction !== null) {
            return $reaction;
        }
        return $nextState;
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->game->globals->set('reward_type', null);
        $this->game->globals->set('reward_color', null);

        return $this->game->nextStateAfterDieAction($activePlayerId);
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
