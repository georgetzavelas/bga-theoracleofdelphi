<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

require_once(__DIR__ . '/../HexUtils.php');
require_once(__DIR__ . '/../ClusterDefinitions.php');

class SelectAction extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 21,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} selects action for ${die_color} die'),
            // Imperative form so non-active viewers don't see "You
            // must..." if the framework renders descriptionMyTurn for
            // everyone.
            descriptionMyTurn: clienttranslate('Select an action for ${die_color} die'),
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
        $usingBonus = $this->game->globals->get('bonus_action_color') !== null;
        $apolloNeedsRecolor = $apolloWild
            && !$isOracleCard
            && !$usingBonus
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
                'buildableShrines' => [],
                'peekableIslands' => [],
                'discardableInjuryCount' => 0,
                'advanceableGod' => null,
                'apolloNeedsRecolor' => true,
                'playerFavor' => $playerFavor,
                'isOracleCard' => $isOracleCard,
                'usingBonusAction' => $usingBonus,
                'recolorDiscount' => false,
                'reverseRecolor' => false,
                'demigodWild' => false,
                'die_color' => $dieColor ? (MaterialDefs::COLOR_NAMES[$dieColor] ?? $dieColor) : '',
                'cargoCount' => $cargoCount,
                'cargoCapacity' => $cargoCapacity,
            ];
        }

        // Demigod companion: a die of the Demigod's color may be used as any
        // color. Only applies when a DIE (not oracle card, not bonus
        // action) is selected and Apollo isn't already making every die
        // wild. Once the player has confirmed their wild choice via
        // actRecolorDie (whether to a different colour or to the same
        // colour as a "use it as itself" confirm), the demigod_wild_resolved
        // global flips to 1 so the recolor arrows don't re-render on
        // re-entry — without that gate, picking the same-colour stay
        // arrow looped right back into the wild prompt.
        $demigodWild = !$isOracleCard
            && !$usingBonus
            && !$apolloWild
            && $dieColor !== null
            && (int)$this->game->globals->get('demigod_wild_resolved') !== 1
            && $this->game->playerOwnsCompanion($playerId, $dieColor, 1);

        $activatableEquipment = $this->game->computeActivatableEquipment($playerId, $playerFavor);

        return [
            'dieIndex' => $dieIndex,
            'dieColor' => $dieColor,
            'fightableMonsters' => $this->getFightableMonsters($playerId, $dieColor),
            'loadableOfferings' => $canLoad ? $this->getLoadableOfferings($playerId, $dieColor) : [],
            'loadableStatues' => $canLoad ? $this->getLoadableStatues($playerId, $dieColor) : [],
            'deliverableOfferings' => $this->getDeliverableOfferings($playerId, $dieColor),
            'deliverableStatues' => $this->getDeliverableStatues($playerId, $dieColor),
            'explorableIslands' => $this->getExplorableIslands($playerId, $dieColor),
            'buildableShrines' => $this->getBuildableShrines($playerId, $dieColor),
            'peekableIslands' => $this->getPeekableIslands($playerId),
            'discardableInjuryCount' => $this->getDiscardableInjuries($playerId, $dieColor),
            'advanceableGod' => $this->getAdvanceableGod($playerId, $dieColor),
            'apolloNeedsRecolor' => false,
            'playerFavor' => $playerFavor,
            'isOracleCard' => $isOracleCard,
            'usingBonusAction' => $usingBonus,
            'recolorDiscount' => $this->hasShipTileAbility($playerId, 'recolor_discount'),
            'reverseRecolor' => $this->hasShipTileAbility($playerId, 'reverse_recolor'),
            'demigodWild' => $demigodWild,
            'demigodName' => $demigodWild ? MaterialDefs::companionName($dieColor, 1) : '',
            'die_color' => $dieColor ? (MaterialDefs::COLOR_NAMES[$dieColor] ?? $dieColor) : '',
            'cargoCount' => $cargoCount,
            'cargoCapacity' => $cargoCapacity,
            'activatableEquipment' => $activatableEquipment,
        ];
    }

    private function hasShipTileAbility(int $playerId, string $ability): bool
    {
        $shipTileId = $this->game->getUniqueValueFromDB(
            "SELECT ship_tile_id FROM player WHERE player_id = $playerId"
        );
        if ($shipTileId === null) return false;
        $tile = MaterialDefs::SHIP_TILES[(int)$shipTileId] ?? null;
        return $tile !== null && $tile['ability'] === $ability;
    }

    /**
     * Equipment 009/010/012 range extension: target is reachable from ship
     * if it is either adjacent (distance 1) OR exactly 1 water space away
     * (distance 2 with an intervening water-type hex on a valid path).
     *
     * "1 water space" per the rulebook means water (not shallows) — shallows
     * are impassable for most ships (Equipment 014 overrides movement but
     * NOT the "1 water space" range qualifier), so we strictly require
     * tile_type = 'water' on the intermediate hex.
     */
    private function isReachableForEquipmentRange(int $shipQ, int $shipR, int $targetQ, int $targetR): bool
    {
        $dist = \HexUtils::hexDistance($shipQ, $shipR, $targetQ, $targetR);
        if ($dist === 1) return true;
        if ($dist !== 2) return false;
        foreach (\ClusterDefinitions::DIRECTION_LIST as $dir) {
            $nq = $shipQ + (int)$dir['dq'];
            $nr = $shipR + (int)$dir['dr'];
            // Must be adjacent to the target too (forms the "1 water hop" path)
            if (\HexUtils::hexDistance($nq, $nr, $targetQ, $targetR) !== 1) continue;
            $tileType = $this->game->getUniqueValueFromDB(
                "SELECT tile_type FROM hex WHERE q = $nq AND r = $nr"
            );
            if ($tileType === 'water') return true;
        }
        return false;
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

        // Equipment 010 (Seafarer Charm): monster fight range extends to
        // "1 water space" (distance 2 with intervening water).
        $hasRangeExt = $this->game->playerOwnsEquipment($playerId, 10, false);

        $fightable = [];
        foreach ($monsters as $m) {
            $mq = (int)$m['hex_q'];
            $mr = (int)$m['hex_r'];
            $reachable = $hasRangeExt
                ? $this->isReachableForEquipmentRange($shipQ, $shipR, $mq, $mr)
                : (\HexUtils::hexDistance($shipQ, $shipR, $mq, $mr) === 1);
            if ($reachable) {
                $fightable[] = [
                    'monster_id' => (int)$m['monster_id'],
                    'monster_type' => $m['monster_type'],
                    'color' => $m['color'],
                    'hex_q' => $mq,
                    'hex_r' => $mr,
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

        // Equipment 012 (Altar Caller): Load Offering range extends to
        // "1 water space" (distance 2 with intervening water).
        $hasRangeExt = $this->game->playerOwnsEquipment($playerId, 12, false);

        // House rule: cannot load a second offering of a color the player
        // already has on board. Skip same-color offerings up front so the
        // adjacent-island affordance and Load Offering button correctly
        // disappear when no new color is available.
        if ($this->game->playerHasCargoOfTypeAndColor($playerId, 'offering', $dieColor)) {
            return [];
        }

        $loadable = [];
        foreach ($offerings as $o) {
            $oq = (int)$o['origin_hex_q'];
            $or = (int)$o['origin_hex_r'];
            $reachable = $hasRangeExt
                ? $this->isReachableForEquipmentRange($shipQ, $shipR, $oq, $or)
                : (\HexUtils::hexDistance($shipQ, $shipR, $oq, $or) === 1);
            if ($reachable) {
                $loadable[] = [
                    'id' => (int)$o['offering_id'],
                    'type' => 'offering',
                    'color' => $o['color'],
                    'hex_q' => $oq,
                    'hex_r' => $or,
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

        // Equipment 009 (Long Hook): Load Statue range extends to
        // "1 water space" (distance 2 with intervening water).
        $hasRangeExt = $this->game->playerOwnsEquipment($playerId, 9, false);

        // House rule: cannot load a second statue of a color the player
        // already has on board. Same per-type filter as offerings.
        if ($this->game->playerHasCargoOfTypeAndColor($playerId, 'statue', $dieColor)) {
            return [];
        }

        $loadable = [];
        foreach ($statues as $s) {
            $sq = (int)$s['origin_hex_q'];
            $sr = (int)$s['origin_hex_r'];
            $reachable = $hasRangeExt
                ? $this->isReachableForEquipmentRange($shipQ, $shipR, $sq, $sr)
                : (\HexUtils::hexDistance($shipQ, $shipR, $sq, $sr) === 1);
            if ($reachable) {
                $loadable[] = [
                    'id' => (int)$s['statue_id'],
                    'type' => 'statue',
                    'color' => $s['color'],
                    'hex_q' => $sq,
                    'hex_r' => $sr,
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

        // Equipment 012 (Altar Caller): Make Offering range extends to
        // "1 water space" (distance 2 with intervening water).
        $tq = (int)$temple['hex_q'];
        $tr = (int)$temple['hex_r'];
        $hasRangeExt = $this->game->playerOwnsEquipment($playerId, 12, false);
        $reachable = $hasRangeExt
            ? $this->isReachableForEquipmentRange($shipQ, $shipR, $tq, $tr)
            : (\HexUtils::hexDistance($shipQ, $shipR, $tq, $tr) === 1);
        if (!$reachable) return [];

        $deliverable = [];
        foreach ($offerings as $o) {
            $deliverable[] = [
                'id' => (int)$o['offering_id'],
                'type' => 'offering',
                'color' => $o['color'],
                'dest_q' => $tq,
                'dest_r' => $tr,
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

        // Equipment 009 (Long Hook): Raise Statue range extends to
        // "1 water space" (distance 2 with intervening water).
        $hasRangeExt = $this->game->playerOwnsEquipment($playerId, 9, false);

        // Emit one entry per (statue × reachable matching island) pair —
        // a player adjacent to two statue islands that both accept the
        // chosen color needs both hex options highlighted in the SelectAction
        // UI so they can pick which island to raise at. The earlier "break
        // on first match" collapsed the second island and made it unclickable.
        $deliverable = [];
        foreach ($statues as $s) {
            foreach ($islands as $island) {
                $clusterId = $island['cluster_type'];
                $islandColors = MaterialDefs::STATUE_ISLAND_COLORS[$clusterId] ?? [];
                if (!in_array($dieColor, $islandColors)) continue;

                $iq = (int)$island['q'];
                $ir = (int)$island['r'];
                $reachable = $hasRangeExt
                    ? $this->isReachableForEquipmentRange($shipQ, $shipR, $iq, $ir)
                    : (\HexUtils::hexDistance($shipQ, $shipR, $iq, $ir) === 1);
                if ($reachable) {
                    $deliverable[] = [
                        'id' => (int)$s['statue_id'],
                        'type' => 'statue',
                        'color' => $s['color'],
                        'dest_q' => $iq,
                        'dest_r' => $ir,
                    ];
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

        // Equipment 010 (Seafarer Charm): Explore Island (and by extension
        // Build Shrine, which fires during ExploreIsland) range extends to
        // "1 water space" (distance 2 with intervening water).
        $hasRangeExt = $this->game->playerOwnsEquipment($playerId, 10, false);

        $explorable = [];
        foreach ($shrineHexes as $hex) {
            $hq = (int)$hex['q'];
            $hr = (int)$hex['r'];
            $reachable = $hasRangeExt
                ? $this->isReachableForEquipmentRange($shipQ, $shipR, $hq, $hr)
                : (\HexUtils::hexDistance($shipQ, $shipR, $hq, $hr) === 1);
            if (!$reachable) continue;

            $explorable[] = [
                'hex_q' => $hq,
                'hex_r' => $hr,
                'explorationColor' => $hex['color'],
            ];
        }
        return $explorable;
    }

    /**
     * Shrines this player can build right now: their shrine row has
     * built_at_hex_q/r set (an opponent already explored the island and
     * stamped it as discovered) but is_built is still 0, the destination
     * hex matches the selected die color, and the ship is within explore
     * range (1, or 2 with Equipment 010 over a water bridge).
     */
    private function getBuildableShrines(int $playerId, ?string $dieColor): array
    {
        if (!$dieColor) return [];

        [$shipQ, $shipR] = $this->getShipPosition($playerId);
        $hasRangeExt = $this->game->playerOwnsEquipment($playerId, 10, false);

        $rows = $this->game->getObjectListFromDB(
            "SELECT s.shrine_index AS idx, s.built_at_hex_q AS q, s.built_at_hex_r AS r,
                    h.color AS exploration_color
             FROM shrine s
             JOIN hex h ON h.q = s.built_at_hex_q AND h.r = s.built_at_hex_r
             WHERE s.player_id = $playerId
               AND s.is_built = 0
               AND s.built_at_hex_q IS NOT NULL"
        );

        $buildable = [];
        foreach ($rows as $row) {
            if (($row['exploration_color'] ?? '') !== $dieColor) continue;
            $hq = (int)$row['q'];
            $hr = (int)$row['r'];
            $reachable = $hasRangeExt
                ? $this->isReachableForEquipmentRange($shipQ, $shipR, $hq, $hr)
                : (\HexUtils::hexDistance($shipQ, $shipR, $hq, $hr) === 1);
            if (!$reachable) continue;
            $buildable[] = [
                'hex_q' => $hq,
                'hex_r' => $hr,
                'shrine_index' => (int)$row['idx'],
                'explorationColor' => $row['exploration_color'],
            ];
        }
        return $buildable;
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
            "SELECT track_step FROM player_god
             WHERE player_id = $playerId AND god_name = '$safeName'"
        );

        if ($row >= 6) return null;

        return $godName;
    }

    /**
     * Calculate recolor cost from current color to target color. Clockwise
     * only by default; when the reverse_recolor ship tile is active the
     * player may also recolor counterclockwise, so the cost is the cheaper
     * of the two directions (cap at floor(n/2)). Returns 0 if same color.
     */
    private function getRecolorCost(string $fromColor, string $targetColor, bool $bothDirections = false): int
    {
        if ($fromColor === $targetColor) return 0;
        $order = MaterialDefs::ORACLE_WHEEL_ORDER;
        $fromIdx = array_search($fromColor, $order);
        $toIdx = array_search($targetColor, $order);
        if ($fromIdx === false || $toIdx === false) return 0;
        $n = count($order);
        $cw = ($toIdx - $fromIdx + $n) % $n;
        if (!$bothDirections) return $cw;
        $ccw = $n - $cw;
        return min($cw, $ccw);
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
        return $this->game->getCargoCapacity($playerId);
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

        if ($this->game->globals->get('bonus_action_color') !== null) {
            // Return the bonus to the pending pool so the player can
            // re-commit from PlayerActions with a different color.
            $this->game->globals->set('bonus_action_color', null);
            $this->game->globals->set('equipment_bonus_action_available', 1);
            $this->notify->all("bonusActionCancelled",
                clienttranslate('${player_name} cancels bonus action'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
            ]);
            return PlayerActions::class;
        }

        if ($oracleCardId > 0) {
            // Cancel oracle card — return it to hand
            $colors = MaterialDefs::COLORS;
            $card = $this->game->getObjectFromDB(
                "SELECT card_type_arg, is_wild FROM card WHERE card_id = $oracleCardId"
            );
            $color = $card ? ($colors[(int)$card['card_type_arg']] ?? 'red') : 'red';
            $isWild = $card ? (int)($card['is_wild'] ?? 0) === 1 : false;

            $this->game->globals->set('selected_oracle_card_id', 0);
            $this->game->globals->set('oracle_card_played', 0);

            $this->notify->all("oracleCardCancelled", clienttranslate('${player_name} cancels oracle card'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
                "card_id" => $oracleCardId,
                "card_color" => $color,
                "is_wild" => $isWild,
            ]);
        } else {
            $this->game->globals->set('selected_die_index', null);
            // Next die selection should restart the Apollo recolor step.
            $this->game->globals->set('apollo_pending_recolor', 0);
            // Demigod-wild resolution is also per-die-selection — reset
            // so a re-selected die can offer the wild choice again.
            $this->game->globals->set('demigod_wild_resolved', 0);
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
    public function actRaiseStatue(int $activePlayerId, ?int $hexQ = null, ?int $hexR = null) {
        $this->game->globals->set('cargo_action_type', 'statue');
        // Click-to-raise on a specific island hex stashes that destination
        // here so DeliverCargo can honor the player's choice between two
        // adjacent eligible islands. If the player hit the action-bar
        // button instead (no hex), DeliverCargo falls back to whichever
        // matching island is reachable first — fine when there's only one.
        if ($hexQ !== null && $hexR !== null) {
            $this->game->globals->set('raise_statue_dest_q', $hexQ);
            $this->game->globals->set('raise_statue_dest_r', $hexR);
        } else {
            $this->game->globals->set('raise_statue_dest_q', null);
            $this->game->globals->set('raise_statue_dest_r', null);
        }
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
    public function actBuildShrine(int $hexQ, int $hexR, int $activePlayerId) {
        $dieColor = $this->getActionColor($activePlayerId);
        $buildable = $this->getBuildableShrines($activePlayerId, $dieColor);

        $valid = false;
        foreach ($buildable as $b) {
            if ($b['hex_q'] === $hexQ && $b['hex_r'] === $hexR) {
                $valid = true;
                break;
            }
        }
        if (!$valid) {
            throw new UserException(clienttranslate('You cannot build a shrine there'));
        }

        $hex = $this->game->getObjectFromDB(
            "SELECT shrine_letter FROM hex WHERE q = $hexQ AND r = $hexR"
        );
        $shrineLetter = $hex['shrine_letter'] ?? '';

        $this->game->spendActionSource($activePlayerId);

        $completedTileId = $this->game->markShrineBuiltAndComplete(
            $activePlayerId, $hexQ, $hexR, $shrineLetter
        );

        if ($completedTileId !== null) {
            $this->game->globals->set('god_steps_remaining', 1);
            $this->game->globals->set('god_advance_reason', 'shrine_reward');
            return ChooseGodAdvancement::class;
        }

        return $this->game->nextStateAfterDieAction($activePlayerId);
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
        $this->game->statInc($count, 'discarded_injury_cards', $activePlayerId);

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

        $this->game->advanceGodOneStep($activePlayerId, $godName);

        return $this->game->spendActionSource($activePlayerId);
    }

    #[PossibleAction]
    public function actDrawOracleCard(int $activePlayerId) {
        $cardId = $this->game->drawOneOracleCardInline($activePlayerId);
        if ($cardId === null) {
            throw new UserException(clienttranslate('No oracle cards left in the deck'));
        }
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
        if ($this->game->globals->get('bonus_action_color') !== null) {
            throw new UserException(clienttranslate('Cannot recolor a bonus action'));
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
        // Demigod wild: free recolor when the die's color matches a Demigod
        // the player owns (and Apollo isn't already making everything wild).
        $demigodWild = !$apolloWild
            && $this->game->playerOwnsCompanion($activePlayerId, $currentColor, 1);

        if ($apolloWild || $demigodWild) {
            // Free recolor (Apollo or Demigod). Same color is a no-op confirm.
            $cost = 0;
            $newFavor = (int)$this->game->getUniqueValueFromDB(
                "SELECT favor_tokens FROM player WHERE player_id = $activePlayerId"
            );
            // Demigod side: mark the wild choice resolved so the recolor
            // arrows don't re-render on the next SelectAction entry. The
            // Apollo side has the matching apollo_pending_recolor flip a
            // few lines below; demigod gets the same treatment via this
            // dedicated flag (cleared on actSelectDie / actCancelDieSelection
            // / spendActionSource so a fresh die or a cancel resets it).
            if ($demigodWild) {
                $this->game->globals->set('demigod_wild_resolved', 1);
            }
        } else {
            if ($currentColor === $targetColor) {
                throw new UserException(clienttranslate('Invalid recolor target'));
            }
            $bothDirections = $this->hasShipTileAbility($activePlayerId, 'reverse_recolor');
            $baseCost = $this->getRecolorCost($currentColor, $targetColor, $bothDirections);
            if ($baseCost === 0) {
                throw new UserException(clienttranslate('Invalid recolor target'));
            }
            $cost = $this->hasShipTileAbility($activePlayerId, 'recolor_discount')
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
                $this->game->statInc($cost, 'favor_tokens_spent', $activePlayerId);
            }
            $newFavor = $favor - $cost;
        }

        // Update die color (keep original_color unchanged)
        $safeTarget = addslashes($targetColor);
        $this->game->DbQuery(
            "UPDATE oracle_die SET color = '$safeTarget'
             WHERE player_id = $activePlayerId AND die_index = $dieIndex"
        );
        $this->game->statInc(1, 'die_colored', $activePlayerId);

        $demigodName = $demigodWild ? MaterialDefs::companionName($currentColor, 1) : '';
        if ($apolloWild) {
            $this->game->globals->set('apollo_pending_recolor', 0);
            $logMsg = clienttranslate('${player_name} uses Apollo to recolor die to ${target_color}');
        } elseif ($demigodWild) {
            $logMsg = clienttranslate('${companion_name} treats ${player_name}\'s ${origin_color} die as ${target_color}');
        } else {
            $logMsg = clienttranslate('${player_name} recolors die to ${target_color} (${cost} Favor)');
        }

        $this->notify->all("dieRecolored", $logMsg, [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "die_index" => $dieIndex,
            "target_color" => $targetColor,
            "origin_color" => $currentColor,
            "cost" => $cost,
            "favor_tokens" => $newFavor,
            "demigod_wild" => $demigodWild,
            "companion_name" => $demigodName,
        ]);

        // Trigger any per-colour equipment reactions for the new colour.
        // Idempotent within the round so a recolor to a colour that was
        // already shown at Consult Oracle doesn't double-grant.
        $this->game->applyEquipmentColorReaction($activePlayerId, $targetColor);

        // Return to SelectAction — die is NOT spent, player still picks an action
        return SelectAction::class;
    }

    #[PossibleAction]
    public function actActivateEquipment(int $card_id, int $activePlayerId): string
    {
        $row = $this->game->getObjectFromDB(
            "SELECT card_id, card_type, card_type_arg, card_location, card_location_arg, is_used
             FROM card WHERE card_id = $card_id"
        );
        if (!$row
            || $row['card_type'] !== 'equipment'
            || $row['card_location'] !== 'hand'
            || (int)$row['card_location_arg'] !== $activePlayerId) {
            throw new UserException(clienttranslate('Invalid equipment card.'));
        }

        $cardTypeArg = (int)$row['card_type_arg'];

        switch ($cardTypeArg) {
            case 3:
                return $this->activateEquipment003($activePlayerId, $card_id);
            case 4:
                return $this->activateAmuletEquipment($activePlayerId, $card_id, 4, 'pink', 'hermes');
            case 5:
                return $this->activateAmuletEquipment($activePlayerId, $card_id, 5, 'green', 'artemis');
            case 6:
                return $this->activateAmuletEquipment($activePlayerId, $card_id, 6, 'blue', 'poseidon');
            default:
                // One-time cards auto-resolve on receipt (see CombatVictory);
                // they are not activatable from the hand.
                throw new UserException(clienttranslate('Equipment card not activatable.'));
        }
    }

    private function activateEquipment003(int $pid, int $cardId): string
    {
        // Validate + spend + notify lives on Game so PlayerActions can
        // share it without code duplication. Return state stays
        // SelectAction here because the caller already had a die
        // selected; PlayerActions's actActivateEquipment uses the same
        // helper but stays in PlayerActions so the wheel-centre ?-die
        // token surfaces immediately for the colour pick.
        $this->game->activateBonusActionEquipment($pid, $cardId);
        return SelectAction::class;
    }

    /**
     * Shared activation for the alt-action amulet cards 004/005/006.
     *
     * Rulebook ("You may use an Oracle Die of the X color as an action to
     * take 1 Favor Token, draw 1 Oracle Card, and advance <God> by 1 step
     * on the God Track.")
     *
     * Repeatable (no is_used flip); die is consumed like any normal action.
     * We re-validate the die-source + color gate here defensively so the
     * dispatcher can't be spoofed by a client sending the wrong cardId.
     */
    private function activateAmuletEquipment(
        int $pid, int $cardId, int $cardTypeArg, string $requiredColor, string $godName
    ): string {
        if ((int)$this->game->globals->get('selected_oracle_card_id') > 0) {
            throw new UserException(
                clienttranslate('This card activates on a rolled die, not a played oracle card.')
            );
        }
        if ($this->game->globals->get('bonus_action_color') !== null) {
            throw new UserException(
                clienttranslate('This card cannot be activated on a bonus action.')
            );
        }
        if ($this->game->isApolloWildActive()
            && (int)$this->game->globals->get('apollo_pending_recolor') === 1
        ) {
            throw new UserException(
                clienttranslate('Recolor the die with Apollo before activating this card.')
            );
        }
        $dieIndex = $this->game->globals->get('selected_die_index');
        if ($dieIndex === null) {
            throw new UserException(clienttranslate('No die selected.'));
        }
        $die = $this->game->getObjectFromDB(
            "SELECT color FROM oracle_die WHERE player_id = $pid AND die_index = $dieIndex"
        );
        if (!$die || ($die['color'] ?? null) !== $requiredColor) {
            throw new UserException(
                clienttranslate('This card requires a die of the matching color.')
            );
        }

        // +1 Favor
        $this->game->DbQuery(
            "UPDATE player SET favor_tokens = favor_tokens + 1 WHERE player_id = $pid"
        );
        $newFavor = (int)$this->game->getUniqueValueFromDB(
            "SELECT favor_tokens FROM player WHERE player_id = $pid"
        );

        // Notify activation BEFORE consuming the die / advancing the god so
        // the log ordering reads naturally: "activates X" → "draws card" →
        // "advances God" → "die used".
        $this->game->notify->all(
            'equipmentActivated',
            clienttranslate('${player_name} activates ${equipment_name} (+1 Favor, +1 Oracle Card, +1 ${god_name})'),
            [
                'player_id' => $pid,
                'player_name' => $this->game->getPlayerNameById($pid),
                'card_id' => $cardId,
                'equipment_name' => $this->game->equipmentName($cardTypeArg),
                'favor_tokens' => $newFavor,
                'god_name' => $godName,
            ]
        );

        // +1 Oracle Card (draw top of deck, private id/color + public fact)
        $this->game->drawOneOracleCardInline($pid);

        // +1 step on the god track
        $this->game->advanceGodOneStep($pid, $godName);

        // Consume the die (returns PlayerActions or ConsultOracle)
        return $this->game->spendActionSource($pid);
    }

    function zombie(int $playerId) {
        return $this->actCancelDieSelection($playerId);
    }
}
