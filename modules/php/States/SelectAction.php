<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

require_once(__DIR__ . '/../HexUtils.php');

class SelectAction extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 21,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} selects action for ${die_color} die'),
            descriptionMyTurn: clienttranslate('${you} must select action for ${die_color} die'),
        );
    }

    private function getActionColor(int $playerId): ?string
    {
        return $this->game->getActionColor($playerId);
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $dieIndex = $this->game->globals->get('selected_die_index');
        $oracleCardId = (int)$this->game->globals->get('selected_oracle_card_id');
        $isOracleCard = $oracleCardId > 0;
        $dieColor = $this->getActionColor($playerId);
        $apolloWild = $this->game->isApolloWildActive();
        $apolloNeedsRecolor = $apolloWild
            && !$isOracleCard
            && (int)$this->game->globals->get('apollo_pending_recolor') === 1;

        $cargoCount = $this->getCargoCount($playerId);
        $cargoCapacity = $this->getCargoCapacity($playerId);
        $canLoad = $cargoCount < $cargoCapacity;
        $playerFavor = (int)$this->game->getUniqueValueFromDB(
            "SELECT favor_tokens FROM player WHERE player_id = $playerId"
        );

        // Apollo: the selected die must be recolored (free, any color)
        // before actions become available — return an empty action set.
        if ($apolloNeedsRecolor) {
            return [
                'dieIndex' => $dieIndex,
                'dieColor' => $dieColor,
                'fightableMonsters' => [],
                'loadableOfferings' => [],
                'loadableStatues' => [],
                'deliverableOfferings' => [],
                'deliverableStatues' => [],
                'explorableIslands' => [],
                'peekableIslands' => [],
                'discardableInjuryCount' => 0,
                'advanceableGod' => null,
                'apolloNeedsRecolor' => true,
                'playerFavor' => $playerFavor,
                'isOracleCard' => $isOracleCard,
                'recolorDiscount' => false,
                'die_color' => $dieColor ? (MaterialDefs::COLOR_NAMES[$dieColor] ?? $dieColor) : '',
                'cargoCount' => $cargoCount,
                'cargoCapacity' => $cargoCapacity,
            ];
        }

        return [
            'dieIndex' => $dieIndex,
            'dieColor' => $dieColor,
            'fightableMonsters' => $this->getFightableMonsters($playerId, $dieColor),
            'loadableOfferings' => $canLoad ? $this->getLoadableOfferings($playerId, $dieColor) : [],
            'loadableStatues' => $canLoad ? $this->getLoadableStatues($playerId, $dieColor) : [],
            'deliverableOfferings' => $this->getDeliverableOfferings($playerId, $dieColor),
            'deliverableStatues' => $this->getDeliverableStatues($playerId, $dieColor),
            'explorableIslands' => $this->getExplorableIslands($playerId, $dieColor),
            'peekableIslands' => $this->getPeekableIslands($playerId),
            'discardableInjuryCount' => $this->getDiscardableInjuries($playerId, $dieColor),
            'advanceableGod' => $this->getAdvanceableGod($playerId, $dieColor),
            'apolloNeedsRecolor' => false,
            'playerFavor' => $playerFavor,
            'isOracleCard' => $isOracleCard,
            'recolorDiscount' => $this->hasRecolorDiscount($playerId),
            'die_color' => $dieColor ? (MaterialDefs::COLOR_NAMES[$dieColor] ?? $dieColor) : '',
            'cargoCount' => $cargoCount,
            'cargoCapacity' => $cargoCapacity,
        ];
    }

    private function hasRecolorDiscount(int $playerId): bool
    {
        $shipTileId = $this->game->getUniqueValueFromDB(
            "SELECT ship_tile_id FROM player WHERE player_id = $playerId"
        );
        if ($shipTileId === null) return false;
        $tile = MaterialDefs::SHIP_TILES[(int)$shipTileId] ?? null;
        return $tile !== null && $tile['ability'] === 'recolor_discount';
    }

    private function getFightableMonsters(int $playerId, ?string $dieColor): array
    {
        if (!$dieColor) return [];

        $player = $this->game->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];

        $safeColor = addslashes($dieColor);
        $colorClause = "AND color = '$safeColor'";
        $monsters = $this->game->getObjectListFromDB(
            "SELECT monster_id, color, monster_type, hex_q, hex_r
             FROM monster WHERE is_defeated = 0 $colorClause"
        );

        $fightable = [];
        foreach ($monsters as $m) {
            $dist = \HexUtils::hexDistance($shipQ, $shipR, (int)$m['hex_q'], (int)$m['hex_r']);
            if ($dist === 1) {
                $fightable[] = [
                    'monster_id' => (int)$m['monster_id'],
                    'monster_type' => $m['monster_type'],
                    'color' => $m['color'],
                    'hex_q' => (int)$m['hex_q'],
                    'hex_r' => (int)$m['hex_r'],
                ];
            }
        }
        return $fightable;
    }

    private function getShipPosition(int $playerId): array
    {
        $player = $this->game->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
        );
        return [(int)$player['ship_q'], (int)$player['ship_r']];
    }

    private function getLoadableOfferings(int $playerId, ?string $dieColor): array
    {
        if (!$dieColor) return [];

        [$shipQ, $shipR] = $this->getShipPosition($playerId);
        $safeColor = addslashes($dieColor);
        $colorClause = "AND color = '$safeColor'";
        $offerings = $this->game->getObjectListFromDB(
            "SELECT offering_id, color, origin_hex_q, origin_hex_r FROM offering
             WHERE player_id IS NULL AND is_delivered = 0 $colorClause"
        );

        $loadable = [];
        foreach ($offerings as $o) {
            $dist = \HexUtils::hexDistance($shipQ, $shipR, (int)$o['origin_hex_q'], (int)$o['origin_hex_r']);
            if ($dist === 1) {
                $loadable[] = [
                    'id' => (int)$o['offering_id'],
                    'type' => 'offering',
                    'color' => $o['color'],
                    'hex_q' => (int)$o['origin_hex_q'],
                    'hex_r' => (int)$o['origin_hex_r'],
                ];
            }
        }
        return $loadable;
    }

    private function getLoadableStatues(int $playerId, ?string $dieColor): array
    {
        if (!$dieColor) return [];

        [$shipQ, $shipR] = $this->getShipPosition($playerId);
        $safeColor = addslashes($dieColor);
        $colorClause = "AND color = '$safeColor'";
        $statues = $this->game->getObjectListFromDB(
            "SELECT statue_id, color, origin_hex_q, origin_hex_r FROM statue
             WHERE player_id IS NULL AND is_raised = 0 $colorClause"
        );

        $loadable = [];
        foreach ($statues as $s) {
            $dist = \HexUtils::hexDistance($shipQ, $shipR, (int)$s['origin_hex_q'], (int)$s['origin_hex_r']);
            if ($dist === 1) {
                $loadable[] = [
                    'id' => (int)$s['statue_id'],
                    'type' => 'statue',
                    'color' => $s['color'],
                    'hex_q' => (int)$s['origin_hex_q'],
                    'hex_r' => (int)$s['origin_hex_r'],
                ];
            }
        }
        return $loadable;
    }

    private function getDeliverableOfferings(int $playerId, ?string $dieColor): array
    {
        if (!$dieColor) return [];

        [$shipQ, $shipR] = $this->getShipPosition($playerId);
        $safeColor = addslashes($dieColor);
        $offerings = $this->game->getObjectListFromDB(
            "SELECT offering_id, color FROM offering
             WHERE player_id = $playerId AND is_delivered = 0 AND color = '$safeColor'"
        );

        if (empty($offerings)) return [];

        // Find matching-color temple
        $temple = $this->game->getObjectFromDB(
            "SELECT hex_q, hex_r FROM temple WHERE color = '$safeColor'"
        );
        if (!$temple) return [];
        $dist = \HexUtils::hexDistance($shipQ, $shipR, (int)$temple['hex_q'], (int)$temple['hex_r']);
        if ($dist !== 1) return [];

        $deliverable = [];
        foreach ($offerings as $o) {
            $deliverable[] = [
                'id' => (int)$o['offering_id'],
                'type' => 'offering',
                'color' => $o['color'],
                'dest_q' => (int)$temple['hex_q'],
                'dest_r' => (int)$temple['hex_r'],
            ];
        }
        return $deliverable;
    }

    private function getDeliverableStatues(int $playerId, ?string $dieColor): array
    {
        if (!$dieColor) return [];

        [$shipQ, $shipR] = $this->getShipPosition($playerId);
        $safeColor = addslashes($dieColor);
        $statues = $this->game->getObjectListFromDB(
            "SELECT statue_id, color FROM statue
             WHERE player_id = $playerId AND is_raised = 0 AND color = '$safeColor'"
        );

        if (empty($statues)) return [];

        // Find statue islands and check if they accept the die color
        $islands = $this->game->getObjectListFromDB(
            "SELECT q, r, cluster_type FROM hex WHERE tile_type = 'island' AND island_content = 'statue'"
        );

        $deliverable = [];
        foreach ($statues as $s) {
            foreach ($islands as $island) {
                $clusterId = $island['cluster_type'];
                $islandColors = MaterialDefs::STATUE_ISLAND_COLORS[$clusterId] ?? [];
                if (!in_array($dieColor, $islandColors)) continue;

                $dist = \HexUtils::hexDistance($shipQ, $shipR, (int)$island['q'], (int)$island['r']);
                if ($dist === 1) {
                    $deliverable[] = [
                        'id' => (int)$s['statue_id'],
                        'type' => 'statue',
                        'color' => $s['color'],
                        'dest_q' => (int)$island['q'],
                        'dest_r' => (int)$island['r'],
                    ];
                    break;
                }
            }
        }
        return $deliverable;
    }

    private function getPeekableIslands(int $playerId): array
    {
        $hexes = $this->game->getObjectListFromDB(
            "SELECT h.q, h.r FROM hex h
             WHERE h.island_content = 'shrine' AND h.is_revealed = 0
             AND NOT EXISTS (
                 SELECT 1 FROM player_island_knowledge pik
                 WHERE pik.player_id = $playerId AND pik.hex_q = h.q AND pik.hex_r = h.r
             )"
        );
        $result = [];
        foreach ($hexes as $hex) {
            $result[] = [
                'q' => (int)$hex['q'],
                'r' => (int)$hex['r'],
            ];
        }
        return $result;
    }

    private function getExplorableIslands(int $playerId, ?string $dieColor): array
    {
        if (!$dieColor) return [];

        [$shipQ, $shipR] = $this->getShipPosition($playerId);
        $safeColor = addslashes($dieColor);
        $colorClause = "AND color = '$safeColor'";

        $shrineHexes = $this->game->getObjectListFromDB(
            "SELECT q, r, color FROM hex
             WHERE island_content = 'shrine' AND is_revealed = 0 $colorClause"
        );

        $explorable = [];
        foreach ($shrineHexes as $hex) {
            $dist = \HexUtils::hexDistance($shipQ, $shipR, (int)$hex['q'], (int)$hex['r']);
            if ($dist !== 1) continue;

            $explorable[] = [
                'hex_q' => (int)$hex['q'],
                'hex_r' => (int)$hex['r'],
                'explorationColor' => $hex['color'],
            ];
        }
        return $explorable;
    }

    private function getDiscardableInjuries(int $playerId, ?string $dieColor): int
    {
        if (!$dieColor) return 0;
        $colorIndex = MaterialDefs::COLOR_INDEX[$dieColor] ?? -1;
        return (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM card
             WHERE card_type = 'injury' AND card_location = 'hand'
             AND card_location_arg = $playerId AND card_type_arg = $colorIndex"
        );
    }

    private function getAdvanceableGod(int $playerId, ?string $dieColor): ?string
    {
        if (!$dieColor) return null;

        $godName = null;
        foreach (MaterialDefs::GODS as $name => $god) {
            if ($god['color'] === $dieColor) {
                $godName = $name;
                break;
            }
        }
        if (!$godName) return null;

        $safeName = addslashes($godName);
        $row = (int)$this->game->getUniqueValueFromDB(
            "SELECT track_row FROM player_god
             WHERE player_id = $playerId AND god_name = '$safeName'"
        );

        if ($row >= 6) return null;

        return $godName;
    }

    /**
     * Calculate clockwise recolor cost from current color to target color.
     * Returns 0 if same color, 1-5 for clockwise steps.
     */
    private function getRecolorCost(string $fromColor, string $targetColor): int
    {
        if ($fromColor === $targetColor) return 0;
        $order = MaterialDefs::ORACLE_WHEEL_ORDER;
        $fromIdx = array_search($fromColor, $order);
        $toIdx = array_search($targetColor, $order);
        if ($fromIdx === false || $toIdx === false) return 0;
        return ($toIdx - $fromIdx + count($order)) % count($order);
    }

    private function getCargoCount(int $playerId): int
    {
        $offeringCount = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM offering WHERE player_id = $playerId AND is_delivered = 0"
        );
        $statueCount = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM statue WHERE player_id = $playerId AND is_raised = 0"
        );
        return $offeringCount + $statueCount;
    }

    private function getCargoCapacity(int $playerId): int
    {
        $shipTileId = $this->game->getUniqueValueFromDB(
            "SELECT ship_tile_id FROM player WHERE player_id = $playerId"
        );
        if ($shipTileId === null) return 2;
        return MaterialDefs::SHIP_TILES[(int)$shipTileId]['storage'] ?? 2;
    }

    #[PossibleAction]
    public function actMoveShip(int $activePlayerId) {
        return MoveShip::class;
    }

    #[PossibleAction]
    public function actFightMonster(int $monster_id, int $activePlayerId) {
        $dieColor = $this->getActionColor($activePlayerId);
        $fightable = $this->getFightableMonsters($activePlayerId, $dieColor);

        $valid = false;
        foreach ($fightable as $m) {
            if ($m['monster_id'] === $monster_id) {
                $valid = true;
                break;
            }
        }
        if (!$valid) {
            throw new UserException(clienttranslate('You cannot fight that monster'));
        }

        $this->game->globals->set('combat_monster_id', $monster_id);
        return FightMonsterStart::class;
    }

    #[PossibleAction]
    public function actCancelDieSelection(int $activePlayerId) {
        $oracleCardId = (int)$this->game->globals->get('selected_oracle_card_id');

        if ($oracleCardId > 0) {
            // Cancel oracle card — return it to hand
            $colors = MaterialDefs::COLORS;
            $card = $this->game->getObjectFromDB(
                "SELECT card_type_arg FROM card WHERE card_id = $oracleCardId"
            );
            $color = $card ? ($colors[(int)$card['card_type_arg']] ?? 'red') : 'red';

            $this->game->globals->set('selected_oracle_card_id', 0);
            $this->game->globals->set('oracle_card_played', 0);

            $this->notify->all("oracleCardCancelled", clienttranslate('${player_name} cancels oracle card'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
                "card_id" => $oracleCardId,
                "card_color" => $color,
            ]);
        } else {
            $this->game->globals->set('selected_die_index', null);
            // Next die selection should restart the Apollo recolor step.
            $this->game->globals->set('apollo_pending_recolor', 0);
            $this->notify->all("dieCancelled", clienttranslate('${player_name} cancels die selection'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
            ]);
        }

        return PlayerActions::class;
    }

    #[PossibleAction]
    public function actLoadOffering(int $activePlayerId) {
        $this->game->globals->set('cargo_action_type', 'offering');
        return LoadCargo::class;
    }

    #[PossibleAction]
    public function actLoadStatue(int $activePlayerId) {
        $this->game->globals->set('cargo_action_type', 'statue');
        return LoadCargo::class;
    }

    #[PossibleAction]
    public function actMakeOffering(int $activePlayerId) {
        $this->game->globals->set('cargo_action_type', 'offering');
        return DeliverCargo::class;
    }

    #[PossibleAction]
    public function actRaiseStatue(int $activePlayerId) {
        $this->game->globals->set('cargo_action_type', 'statue');
        return DeliverCargo::class;
    }

    #[PossibleAction]
    public function actExploreIsland(int $hexQ, int $hexR, int $activePlayerId) {
        $dieColor = $this->getActionColor($activePlayerId);
        $explorable = $this->getExplorableIslands($activePlayerId, $dieColor);

        $valid = false;
        foreach ($explorable as $island) {
            if ($island['hex_q'] === $hexQ && $island['hex_r'] === $hexR) {
                $valid = true;
                break;
            }
        }
        if (!$valid) {
            throw new UserException(clienttranslate('You cannot explore that island'));
        }

        $this->game->globals->set('explore_hex_q', $hexQ);
        $this->game->globals->set('explore_hex_r', $hexR);
        return ExploreIsland::class;
    }

    #[PossibleAction]
    public function actDiscardInjuries(int $activePlayerId) {
        $dieColor = $this->getActionColor($activePlayerId);

        $count = $this->getDiscardableInjuries($activePlayerId, $dieColor);
        if ($count === 0) {
            throw new UserException(clienttranslate('You have no injuries of that color to discard'));
        }

        $colorIndex = MaterialDefs::COLOR_INDEX[$dieColor] ?? -1;
        $this->game->DbQuery(
            "UPDATE card SET card_location = 'discard', card_location_arg = 0
             WHERE card_type = 'injury' AND card_location = 'hand'
             AND card_location_arg = $activePlayerId AND card_type_arg = $colorIndex"
        );

        $this->notify->all("injuriesDiscarded", clienttranslate('${player_name} discards ${count} ${color} injury cards'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "count" => $count,
            "color" => $dieColor,
        ]);

        return $this->game->spendActionSource($activePlayerId);
    }

    #[PossibleAction]
    public function actAdvanceGod(string $godName, int $activePlayerId) {
        $dieColor = $this->getActionColor($activePlayerId);

        $advanceable = $this->getAdvanceableGod($activePlayerId, $dieColor);
        if ($advanceable !== $godName) {
            throw new UserException(clienttranslate('You cannot advance that god'));
        }

        $safeName = addslashes($godName);
        $currentRow = (int)$this->game->getUniqueValueFromDB(
            "SELECT track_row FROM player_god
             WHERE player_id = $activePlayerId AND god_name = '$safeName'"
        );

        if ($currentRow === 0) {
            $playerCount = (int)$this->game->getUniqueValueFromDB("SELECT COUNT(*) FROM player");
            $newRow = MaterialDefs::PLAYER_COUNT_ROW[$playerCount] ?? 1;
        } else {
            $newRow = $currentRow + 1;
        }

        $this->game->DbQuery(
            "UPDATE player_god SET track_row = $newRow
             WHERE player_id = $activePlayerId AND god_name = '$safeName'"
        );

        $this->notify->all("godAdvanced", clienttranslate('${player_name} advances ${god_name}'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "god_name" => $godName,
            "new_row" => $newRow,
        ]);

        return $this->game->spendActionSource($activePlayerId);
    }

    #[PossibleAction]
    public function actDrawOracleCard(int $activePlayerId) {
        // Draw top oracle card from deck
        $card = $this->game->getObjectFromDB(
            "SELECT card_id, card_type_arg FROM card
             WHERE card_type = 'oracle' AND card_location = 'deck'
             ORDER BY card_order ASC LIMIT 1"
        );
        if ($card === null) {
            throw new UserException(clienttranslate('No oracle cards left in the deck'));
        }

        $cardId = (int)$card['card_id'];
        $colorIndex = (int)$card['card_type_arg'];
        $cardColor = MaterialDefs::COLORS[$colorIndex];

        $this->game->DbQuery(
            "UPDATE card SET card_location = 'hand', card_location_arg = $activePlayerId
             WHERE card_id = $cardId"
        );

        // Private: card identity goes only to the drawing player
        $this->notify->player($activePlayerId, "oracleCardDrawnPrivate", '', [
            "card_id" => $cardId,
            "card_color" => $cardColor,
        ]);

        // Public: the fact that a card was drawn (no color — oracle cards are hidden)
        $this->notify->all("oracleCardDrawn", clienttranslate('${player_name} draws an Oracle card'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);

        return $this->game->spendActionSource($activePlayerId);
    }

    #[PossibleAction]
    public function actTakeFavorTokens(int $activePlayerId) {
        $amount = 2;

        $this->game->DbQuery(
            "UPDATE player SET favor_tokens = favor_tokens + $amount WHERE player_id = $activePlayerId"
        );
        $newFavor = (int)$this->game->getUniqueValueFromDB(
            "SELECT favor_tokens FROM player WHERE player_id = $activePlayerId"
        );

        $this->notify->all("favorTokensTaken", clienttranslate('${player_name} takes ${amount} Favor Tokens'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "amount" => $amount,
            "favor_tokens" => $newFavor,
        ]);

        return $this->game->spendActionSource($activePlayerId);
    }

    #[PossibleAction]
    public function actLookAtIslands(int $activePlayerId) {
        $peekable = $this->getPeekableIslands($activePlayerId);
        if (count($peekable) === 0) {
            throw new UserException(clienttranslate('No unrevealed islands to look at'));
        }
        return PeekIslands::class;
    }

    #[PossibleAction]
    public function actRecolorDie(string $targetColor, int $activePlayerId) {
        if ((int)$this->game->globals->get('selected_oracle_card_id') > 0) {
            throw new UserException(clienttranslate('Cannot recolor an oracle card'));
        }

        $dieIndex = $this->game->globals->get('selected_die_index');
        $die = $this->game->getObjectFromDB(
            "SELECT color FROM oracle_die WHERE player_id = $activePlayerId AND die_index = $dieIndex"
        );
        $currentColor = $die ? $die['color'] : null;
        if (!$currentColor) {
            throw new UserException(clienttranslate('Invalid recolor target'));
        }

        // Validate target color exists
        if (!in_array($targetColor, MaterialDefs::ORACLE_WHEEL_ORDER)) {
            throw new UserException(clienttranslate('Invalid color'));
        }

        $apolloWild = $this->game->isApolloWildActive();

        if ($apolloWild) {
            // Apollo: free recolor to any color (same color is a no-op confirm).
            $cost = 0;
            $newFavor = (int)$this->game->getUniqueValueFromDB(
                "SELECT favor_tokens FROM player WHERE player_id = $activePlayerId"
            );
        } else {
            if ($currentColor === $targetColor) {
                throw new UserException(clienttranslate('Invalid recolor target'));
            }
            $baseCost = $this->getRecolorCost($currentColor, $targetColor);
            if ($baseCost === 0) {
                throw new UserException(clienttranslate('Invalid recolor target'));
            }
            $cost = $this->hasRecolorDiscount($activePlayerId)
                ? max(0, $baseCost - 1)
                : $baseCost;
            $favor = (int)$this->game->getUniqueValueFromDB(
                "SELECT favor_tokens FROM player WHERE player_id = $activePlayerId"
            );
            if ($favor < $cost) {
                throw new UserException(clienttranslate('Not enough Favor Tokens'));
            }
            if ($cost > 0) {
                $this->game->DbQuery(
                    "UPDATE player SET favor_tokens = favor_tokens - $cost WHERE player_id = $activePlayerId"
                );
            }
            $newFavor = $favor - $cost;
        }

        // Update die color (keep original_color unchanged)
        $safeTarget = addslashes($targetColor);
        $this->game->DbQuery(
            "UPDATE oracle_die SET color = '$safeTarget'
             WHERE player_id = $activePlayerId AND die_index = $dieIndex"
        );

        if ($apolloWild) {
            $this->game->globals->set('apollo_pending_recolor', 0);
            $logMsg = clienttranslate('${player_name} uses Apollo to recolor die to ${target_color}');
        } else {
            $logMsg = clienttranslate('${player_name} recolors die to ${target_color} (${cost} Favor)');
        }

        $this->notify->all("dieRecolored", $logMsg, [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "die_index" => $dieIndex,
            "target_color" => $targetColor,
            "cost" => $cost,
            "favor_tokens" => $newFavor,
        ]);

        // Return to SelectAction — die is NOT spent, player still picks an action
        return SelectAction::class;
    }

    function zombie(int $playerId) {
        return $this->actCancelDieSelection($playerId);
    }
}
