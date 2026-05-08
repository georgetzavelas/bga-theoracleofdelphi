<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
require_once(__DIR__ . '/../HexUtils.php');

class PlayerActions extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 20,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} must select an Oracle die'),
            // Imperative form (no ${you}) so that if the framework
            // renders descriptionMyTurn for non-active viewers it still
            // reads sensibly. Active player sees "Select an Oracle die"
            // instead of "You must select an Oracle die".
            descriptionMyTurn: clienttranslate('Select an Oracle die'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $dice = $this->game->getObjectListFromDB(
            "SELECT die_index, color, is_used FROM oracle_die WHERE player_id = $playerId ORDER BY die_index"
        );

        $apolloWildActive = $this->game->isApolloWildActive();

        // Oracle cards in hand, grouped by color.
        // While Apollo is active, we still expose the hand so the wild card
        // stays clickable — even if a regular card was already played.
        $oracleCardPlayed = (int)$this->game->globals->get('oracle_card_played');
        $oracleCardsInHand = [];
        $apolloWildCardInHand = false;
        if ($oracleCardPlayed === 0 || $apolloWildActive) {
            $rows = $this->game->getObjectListFromDB(
                "SELECT card_id, card_type_arg, is_wild FROM card
                 WHERE card_type = 'oracle' AND card_location = 'hand' AND card_location_arg = $playerId
                 ORDER BY card_id"
            );
            $colors = \Bga\Games\theoracleofdelphigzed\MaterialDefs::COLORS;
            foreach ($rows as $row) {
                $isWild = (int)$row['is_wild'] === 1;
                if ($isWild) $apolloWildCardInHand = $apolloWildCardInHand || $apolloWildActive;
                $oracleCardsInHand[] = [
                    'cardId' => (int)$row['card_id'],
                    'color' => $colors[(int)$row['card_type_arg']] ?? 'red',
                    'isWild' => $isWild,
                ];
            }
        }

        $canPlayOracleCard = count($oracleCardsInHand) > 0
            && ($oracleCardPlayed === 0 || $apolloWildCardInHand);

        $bonusActionAvailable =
            (int)$this->game->globals->get('equipment_bonus_action_available') === 1;
        // bonusActionUsed: the bonus has already been committed this turn
        // (an action of any colour was taken). The client uses this to
        // render the spent ?-die in the wheel-centre pyramid alongside
        // any spent oracle dice (Phase 4b of the wild-source UX).
        $bonusActionUsed =
            (int)$this->game->globals->get('equipment_bonus_action_used') === 1;

        return [
            'dice' => $dice,
            'oracleCardsInHand' => $oracleCardsInHand,
            'canPlayOracleCard' => $canPlayOracleCard,
            'availableGods' => $this->getAvailableGods($playerId),
            'apolloWildActive' => $apolloWildActive,
            'apolloWildCardInHand' => $apolloWildCardInHand,
            'bonusActionAvailable' => $bonusActionAvailable,
            'bonusActionUsed' => $bonusActionUsed,
        ];
    }

    private function getAvailableGods(int $playerId): array
    {
        $gods = $this->game->getObjectListFromDB(
            "SELECT god_name, track_row FROM player_god
             WHERE player_id = $playerId AND track_row = 6"
        );

        $available = [];
        foreach ($gods as $god) {
            $godName = $god['god_name'];
            $ability = \Bga\Games\theoracleofdelphigzed\MaterialDefs::GODS[$godName]['ability'] ?? null;
            if (!$ability) continue;

            $usable = true;
            $reason = '';

            // Check usability conditions — delegate to Game helpers so
            // hasUsableGod (used by Game::nextStateAfterDieAction) and
            // this args output stay in lockstep.
            switch ($ability) {
                case 'grab_any_statue':
                    // Hermes: need cargo space AND ship adjacent to any city
                    if (!$this->game->playerHasCargoSpace($playerId)) {
                        $usable = false;
                        $reason = clienttranslate('No cargo space available');
                    } elseif (!$this->game->playerShipAdjacentToCity($playerId)) {
                        $usable = false;
                        $reason = clienttranslate('Ship must be adjacent to a city');
                    }
                    break;
                case 'auto_defeat_monster':
                    // Ares: need adjacent monster
                    if (!$this->game->playerShipAdjacentToMonster($playerId)) {
                        $usable = false;
                        $reason = clienttranslate('Ship must be adjacent to a monster');
                    }
                    break;
                case 'free_explore_island':
                    // Artemis: need unrevealed islands
                    if (!$this->game->boardHasUnrevealedShrines()) {
                        $usable = false;
                        $reason = clienttranslate('No unrevealed islands remaining');
                    }
                    break;
                // Aphrodite, Apollo, Poseidon: always available at row 6
            }

            $available[] = [
                'god_name' => $godName,
                'ability' => $ability,
                'usable' => $usable,
                'reason' => $reason,
            ];
        }
        return $available;
    }

    // Cargo / adjacency / shrine helpers moved to Game so the
    // hasUsableGod check on the turn-end path uses the same logic.

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

        // Apollo: each newly-selected die must be recolored (free, any color)
        // before the player can take an action with it.
        if ($this->game->isApolloWildActive()) {
            $this->game->globals->set('apollo_pending_recolor', 1);
        }

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
        // While Apollo is active, only the wild oracle card may be played —
        // regular cards are gated off (see actPlayWildOracleCard).
        if ($this->game->isApolloWildActive()) {
            throw new UserException(clienttranslate('You must play the wild oracle card drawn by Apollo'));
        }

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
    public function actUseGodAbility(string $godName, int $activePlayerId) {
        // Validate god exists and is at row 6
        $safeName = addslashes($godName);
        $row = $this->game->getUniqueValueFromDB(
            "SELECT track_row FROM player_god
             WHERE player_id = $activePlayerId AND god_name = '$safeName'"
        );
        if ($row === null || (int)$row !== 6) {
            throw new UserException(clienttranslate('That god is not at the top of the track'));
        }

        $ability = \Bga\Games\theoracleofdelphigzed\MaterialDefs::GODS[$godName]['ability'] ?? null;
        if (!$ability) {
            throw new UserException(clienttranslate('Invalid god'));
        }

        // Validate god is in available list (checks usability conditions)
        $available = $this->getAvailableGods($activePlayerId);
        $found = false;
        foreach ($available as $g) {
            if ($g['god_name'] === $godName) {
                $found = true;
                break;
            }
        }
        if (!$found) {
            throw new UserException(clienttranslate('That god ability cannot be used right now'));
        }

        switch ($ability) {
            case 'discard_all_injuries':
                return $this->useAphrodite($activePlayerId);
            case 'dice_wild':
                return $this->useApollo($activePlayerId);
            default:
                // Targeting abilities: store god name and go to UseGodAbility state
                $this->game->globals->set('active_god_ability', $godName);
                return UseGodAbility::class;
        }
    }

    private function useAphrodite(int $playerId): string
    {
        // Discard all injury cards
        $injuries = $this->game->getObjectListFromDB(
            "SELECT card_id, card_type_arg FROM card
             WHERE card_type = 'injury' AND card_location = 'hand' AND card_location_arg = $playerId"
        );
        $count = count($injuries);

        if ($count > 0) {
            $this->game->DbQuery(
                "UPDATE card SET card_location = 'discard', card_location_arg = 0
                 WHERE card_type = 'injury' AND card_location = 'hand' AND card_location_arg = $playerId"
            );
            $this->game->statInc($count, 'discarded_injury_cards', $playerId);
        }

        $this->notify->all("godAbilityUsed", clienttranslate('${player_name} uses Aphrodite to discard all ${count} injuries'), [
            "player_id" => $playerId,
            "player_name" => $this->game->getPlayerNameById($playerId),
            "god_name" => "aphrodite",
            "ability" => "discard_all_injuries",
            "count" => $count,
        ]);

        $this->game->resetGod($playerId, 'aphrodite');
        return PlayerActions::class;
    }

    private function useApollo(int $playerId): string
    {
        // Set wild flag for rest of turn
        $this->game->globals->set('apollo_wild_active', 1);

        // Draw a wild oracle card
        $card = $this->game->getObjectFromDB(
            "SELECT card_id, card_type_arg FROM card
             WHERE card_type = 'oracle' AND card_location = 'deck'
             ORDER BY card_order ASC LIMIT 1"
        );

        $wildCardId = null;
        $wildCardColor = null;
        if ($card) {
            $wildCardId = (int)$card['card_id'];
            $colors = \Bga\Games\theoracleofdelphigzed\MaterialDefs::COLORS;
            $wildCardColor = $colors[(int)$card['card_type_arg']] ?? 'red';
            $this->game->DbQuery(
                "UPDATE card SET card_location = 'hand', card_location_arg = $playerId, is_wild = 1
                 WHERE card_id = $wildCardId"
            );
            $this->game->statInc(1, 'oracle_cards_drawn', $playerId);
        }

        // Private: drawn wild oracle card details only to the acting player
        if ($wildCardId !== null) {
            $this->notify->player($playerId, "apolloWildCardPrivate", '', [
                "wild_card_id" => $wildCardId,
                "wild_card_color" => $wildCardColor,
            ]);
        }

        // Public: Apollo was invoked and made all dice wild (no card identity)
        $this->notify->all("godAbilityUsed", clienttranslate('${player_name} uses Apollo — all dice become wild and draws a wild Oracle Card'), [
            "player_id" => $playerId,
            "player_name" => $this->game->getPlayerNameById($playerId),
            "god_name" => "apollo",
            "ability" => "dice_wild",
        ]);

        $this->game->resetGod($playerId, 'apollo');
        return PlayerActions::class;
    }

    #[PossibleAction]
    public function actPlayWildOracleCard(int $card_id, string $chosen_color, int $activePlayerId) {
        $card = $this->game->getObjectFromDB(
            "SELECT card_id, card_type_arg, is_wild FROM card
             WHERE card_id = $card_id AND card_type = 'oracle'
             AND card_location = 'hand' AND card_location_arg = $activePlayerId"
        );
        if ($card === null || (int)$card['is_wild'] !== 1) {
            throw new UserException(clienttranslate('Invalid wild oracle card'));
        }

        // Validate color
        $colors = \Bga\Games\theoracleofdelphigzed\MaterialDefs::COLORS;
        if (!in_array($chosen_color, $colors, true)) {
            throw new UserException(clienttranslate('Invalid color'));
        }

        // While Apollo is active, the wild card may be played even if a
        // regular card was already used this turn.
        if ((int)$this->game->globals->get('oracle_card_played') !== 0
            && !$this->game->isApolloWildActive()) {
            throw new UserException(clienttranslate('You have already played an oracle card this turn'));
        }

        $this->game->globals->set('oracle_card_played', 1);
        $this->game->globals->set('selected_oracle_card_id', (int)$card['card_id']);
        $this->game->globals->set('wild_card_chosen_color', $chosen_color);

        $this->notify->all("oracleCardPlayed", clienttranslate('${player_name} plays a wild oracle card as ${card_color}'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "card_id" => (int)$card['card_id'],
            "card_color" => $chosen_color,
            "is_wild" => true,
        ]);

        return SelectAction::class;
    }

    /**
     * Commit to spending the equipment-003 bonus action of a chosen
     * color. Subsequent SelectAction queries resolve the color through
     * Game::getActionColor, which reads `bonus_action_color`.
     */
    #[PossibleAction]
    public function actUseBonusAction(string $chosen_color, int $activePlayerId) {
        if ((int)$this->game->globals->get('equipment_bonus_action_available') !== 1) {
            throw new UserException(clienttranslate('No bonus action available'));
        }
        if (!in_array($chosen_color, \Bga\Games\theoracleofdelphigzed\MaterialDefs::COLORS, true)) {
            throw new UserException(clienttranslate('Invalid color'));
        }

        $this->game->globals->set('equipment_bonus_action_available', 0);
        $this->game->globals->set('bonus_action_color', $chosen_color);
        $this->game->globals->set('selected_die_index', null);

        $this->notify->all("bonusActionStarted", clienttranslate('${player_name} takes a ${color} bonus action'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "color" => $chosen_color,
        ]);

        return SelectAction::class;
    }

    #[PossibleAction]
    public function actEndTurn(int $activePlayerId) {
        if ($this->game->isApolloWildActive()) {
            $wildInHand = (int)$this->game->getUniqueValueFromDB(
                "SELECT COUNT(*) FROM card
                 WHERE card_type = 'oracle' AND card_location = 'hand'
                 AND card_location_arg = $activePlayerId AND is_wild = 1"
            );
            if ($wildInHand > 0) {
                throw new UserException(clienttranslate('You must play the wild oracle card drawn by Apollo before ending your turn'));
            }
        }

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
