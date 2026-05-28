<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphi\Game;
use Bga\Games\theoracleofdelphi\MaterialDefs;

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
                $this->game->statInc(1, 'titan_attacks_no_damage', $playerId);
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

        // Titan token stays with the last player for the entire game
        // (Oracle of Delphi rule) — no rotation, no notification.

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
        $autoDiscardedByColor = [];
        for ($i = 0; $i < $count; $i++) {
            $card = $this->game->getObjectFromDB(
                "SELECT card_id, card_type_arg FROM card
                 WHERE card_type = 'injury' AND card_location = 'deck'
                 ORDER BY card_order ASC LIMIT 1"
            );
            if ($card === null) {
                // Deck exhausted — reshuffle the discard pile and retry.
                $moved = $this->game->reshuffleInjuryDeck();
                if ($moved === 0) {
                    // Discard pile was also empty — truly out of cards.
                    break;
                }
                $card = $this->game->getObjectFromDB(
                    "SELECT card_id, card_type_arg FROM card
                     WHERE card_type = 'injury' AND card_location = 'deck'
                     ORDER BY card_order ASC LIMIT 1"
                );
                if ($card === null) {
                    break;
                }
            }

            $cardId = (int)$card['card_id'];
            $colorIdx = (int)$card['card_type_arg'];
            $color = MaterialDefs::COLORS[$colorIdx] ?? 'red';

            if ($this->game->playerOwnsHero($playerId, $color)) {
                // Hero auto-discard: injury goes straight to discard.
                $this->game->DbQuery(
                    "UPDATE card SET card_location = 'discard', card_location_arg = 0
                     WHERE card_id = $cardId"
                );
                if (!isset($autoDiscardedByColor[$color])) $autoDiscardedByColor[$color] = 0;
                $autoDiscardedByColor[$color]++;
                continue;
            }

            $this->game->DbQuery(
                "UPDATE card SET card_location = 'hand', card_location_arg = $playerId
                 WHERE card_id = $cardId"
            );
            $this->game->statInc(1, 'injuries_received', $playerId);

            $drawnCards[] = ['card_id' => $cardId, 'color' => $color];

            // Private: exact card to the affected player for hand update.
            $this->notify->player($playerId, "titanInjuryPrivate", '', [
                "card_id" => $cardId,
                "color" => $color,
            ]);
        }

        // Hero auto-discards: one public log line per color negated.
        if (!empty($autoDiscardedByColor)) {
            foreach ($autoDiscardedByColor as $color => $count) {
                $this->notify->all("heroAutoDiscarded",
                    clienttranslate('${companion_name} auto-discards ${count} ${color} Titan injury for ${player_name}'), [
                    "player_id" => $playerId,
                    "player_name" => $this->game->getPlayerNameById($playerId),
                    "color" => $color,
                    "count" => $count,
                    "source" => "titan",
                    "companion_name" => MaterialDefs::companionName($color, 2),
                ]);
            }
        }

        // Always emit a per-player titanInjury so the client's Titan
        // popup cell fills regardless of outcome — earlier this returned
        // when every drawn card was hero-auto-discarded, leaving the
        // cell stuck in "Awaiting roll…" forever and blocking the modal.
        $colors = array_map(static fn($c) => $c['color'], $drawnCards);
        $autoColors = [];
        foreach ($autoDiscardedByColor as $color => $cnt) {
            for ($i = 0; $i < $cnt; $i++) $autoColors[] = $color;
        }

        if (count($colors) > 0) {
            $msg = count($colors) === 1
                ? clienttranslate('${player_name} takes ${count} injury (${colors_text}) from the Titan')
                : clienttranslate('${player_name} takes ${count} injuries (${colors_text}) from the Titan');
        } else {
            // All draws were auto-discarded (or deck was empty). The
            // heroAutoDiscarded notifs above already wrote the per-color
            // log lines; this notif is just a dialog-fill signal so its
            // log message stays empty to avoid duplication.
            $msg = '';
        }

        $this->notify->all("titanInjury", $msg, [
            "player_id" => $playerId,
            "player_name" => $this->game->getPlayerNameById($playerId),
            "count" => count($colors),
            "colors" => $colors,
            "colors_text" => implode(', ', $colors),
            "auto_discarded_colors" => $autoColors,
            "roll" => $roll,
        ]);
    }
}
