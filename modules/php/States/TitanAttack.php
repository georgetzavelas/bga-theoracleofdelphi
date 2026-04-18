<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class TitanAttack extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 51, type: StateType::GAME);
    }

    /**
     * End-of-round Titan attack.
     *
     * - Roll a regular d6.
     * - On 6: every player draws 2 injuries from the top of the deck.
     * - On 1-5: every player whose shield_value is strictly less than the
     *   roll draws 1 injury from the top of the deck.
     *
     * Injury colors are determined by the pre-shuffled deck order (the
     * Titan die carries no color). Players are processed in turn order
     * (player_no ASC) so the deck is consumed deterministically.
     */
    function onEnteringState(int $activePlayerId) {
        $roll = bga_rand(1, 6);
        $this->game->globals->set('titan_die_value', $roll);

        $this->notify->all("titanRoll", clienttranslate('The Titan attacks! Die rolls ${value}.'), [
            "value" => $roll,
        ]);

        $players = $this->game->getObjectListFromDB(
            "SELECT player_id, player_no, shield_value FROM player ORDER BY player_no ASC"
        );

        foreach ($players as $player) {
            $playerId = (int)$player['player_id'];
            $shield = (int)$player['shield_value'];
            $drawCount = 0;

            if ($roll === 6) {
                $drawCount = 2;
            } elseif ($shield < $roll) {
                $drawCount = 1;
            }

            if ($drawCount === 0) {
                // Shield held — public log only
                $this->notify->all("titanNoInjury", clienttranslate('${player_name}\'s Shield (${shield}) holds against the Titan'), [
                    "player_id" => $playerId,
                    "player_name" => $this->game->getPlayerNameById($playerId),
                    "shield" => $shield,
                ]);
                continue;
            }

            $this->drawTitanInjuries($playerId, $drawCount, $roll);
        }

        return RoundStart::class;
    }

    /**
     * Draw up to $count injury cards from the top of the deck for a player.
     * Emits one private notif per card (card_id + color for hand update)
     * and one public summary notif with count only. Silent on deck depletion.
     */
    private function drawTitanInjuries(int $playerId, int $count, int $roll): void
    {
        $drawnCards = [];
        for ($i = 0; $i < $count; $i++) {
            $card = $this->game->getObjectFromDB(
                "SELECT card_id, card_type_arg FROM card
                 WHERE card_type = 'injury' AND card_location = 'deck'
                 ORDER BY card_order ASC LIMIT 1"
            );
            if ($card === null) {
                // Deck exhausted; skip remaining draws for this player.
                break;
            }

            $cardId = (int)$card['card_id'];
            $colorIdx = (int)$card['card_type_arg'];
            $color = MaterialDefs::COLORS[$colorIdx] ?? 'red';

            $this->game->DbQuery(
                "UPDATE card SET card_location = 'hand', card_location_arg = $playerId
                 WHERE card_id = $cardId"
            );

            $drawnCards[] = ['card_id' => $cardId, 'color' => $color];

            // Private: exact card to the affected player for hand update.
            $this->notify->player($playerId, "titanInjuryPrivate", '', [
                "card_id" => $cardId,
                "color" => $color,
            ]);
        }

        if (count($drawnCards) === 0) {
            return;
        }

        // Public: summarize count + colors; card_ids already reached the
        // owner privately above, so they're omitted here.
        $colors = array_map(static fn($c) => $c['color'], $drawnCards);
        $msg = count($drawnCards) === 1
            ? clienttranslate('${player_name} takes ${count} injury (${colors_text}) from the Titan')
            : clienttranslate('${player_name} takes ${count} injuries (${colors_text}) from the Titan');
        $this->notify->all("titanInjury", $msg, [
            "player_id" => $playerId,
            "player_name" => $this->game->getPlayerNameById($playerId),
            "count" => count($drawnCards),
            "colors" => $colors,
            "colors_text" => implode(', ', $colors),
            "roll" => $roll,
        ]);
    }
}
