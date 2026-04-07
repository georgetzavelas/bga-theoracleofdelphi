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
            'availableGods' => $this->getAvailableGods($playerId),
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

            // Filter by usability conditions
            switch ($ability) {
                case 'grab_any_statue':
                    // Hermes: need cargo space AND ship adjacent to any city
                    if (!$this->hasCargoSpace($playerId)) continue 2;
                    if (!$this->isAdjacentToAnyCity($playerId)) continue 2;
                    break;
                case 'auto_defeat_monster':
                    // Ares: need adjacent monster
                    if (!$this->hasAdjacentMonster($playerId)) continue 2;
                    break;
                case 'free_explore_island':
                    // Artemis: need unrevealed islands
                    if (!$this->hasUnrevealedIslands()) continue 2;
                    break;
                // Aphrodite, Apollo, Poseidon: always available at row 6
            }

            $available[] = [
                'god_name' => $godName,
                'ability' => $ability,
            ];
        }
        return $available;
    }

    private function hasCargoSpace(int $playerId): bool
    {
        $shipTileId = $this->game->getUniqueValueFromDB(
            "SELECT ship_tile_id FROM player WHERE player_id = $playerId"
        );
        $capacity = \Bga\Games\theoracleofdelphigzed\MaterialDefs::SHIP_TILES[(int)($shipTileId ?? 0)]['storage'] ?? 2;
        $offeringCount = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM offering WHERE player_id = $playerId AND is_delivered = 0"
        );
        $statueCount = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM statue WHERE player_id = $playerId AND is_raised = 0"
        );
        return ($offeringCount + $statueCount) < $capacity;
    }

    private function isAdjacentToAnyCity(int $playerId): bool
    {
        $player = $this->game->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];

        $cities = $this->game->getObjectListFromDB(
            "SELECT q, r FROM hex WHERE tile_type = 'city'"
        );
        foreach ($cities as $city) {
            if (\HexUtils::hexDistance($shipQ, $shipR, (int)$city['q'], (int)$city['r']) === 1) {
                return true;
            }
        }
        return false;
    }

    private function hasAdjacentMonster(int $playerId): bool
    {
        $player = $this->game->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];

        $monsters = $this->game->getObjectListFromDB(
            "SELECT hex_q, hex_r FROM monster WHERE is_defeated = 0"
        );
        foreach ($monsters as $m) {
            if (\HexUtils::hexDistance($shipQ, $shipR, (int)$m['hex_q'], (int)$m['hex_r']) === 1) {
                return true;
            }
        }
        return false;
    }

    private function hasUnrevealedIslands(): bool
    {
        $count = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM hex WHERE island_content = 'shrine' AND is_revealed = 0"
        );
        return $count > 0;
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
        }

        $this->notify->all("godAbilityUsed", clienttranslate('${player_name} uses Apollo — all dice become wild and draws a wild Oracle Card'), [
            "player_id" => $playerId,
            "player_name" => $this->game->getPlayerNameById($playerId),
            "god_name" => "apollo",
            "ability" => "dice_wild",
            "wild_card_id" => $wildCardId,
            "wild_card_color" => $wildCardColor,
        ]);

        $this->game->resetGod($playerId, 'apollo');
        return PlayerActions::class;
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
