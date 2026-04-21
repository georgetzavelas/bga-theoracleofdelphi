<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\HexPathfinder;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class MoveShip extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 30,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} moves ship'),
            descriptionMyTurn: clienttranslate('Select destination hex'),
        );
    }

    private function getMovementRange(int $playerId, ?string $dieColor = null): int
    {
        $shipTileId = $this->game->getUniqueValueFromDB(
            "SELECT ship_tile_id FROM player WHERE player_id = $playerId"
        );
        $range = 3;
        if ($shipTileId !== null) {
            $tile = MaterialDefs::SHIP_TILES[(int)$shipTileId] ?? null;
            if ($tile && $tile['ability'] === 'range_plus_2') {
                $range = 5;
            }
        }
        // Equipment 008 (Quadrireme): permanent +1 ship range.
        if ($this->game->playerOwnsEquipment($playerId, 8)) {
            $range += 1;
        }
        // Creature companion of matching color: +3 range.
        if ($dieColor && $this->game->playerOwnsCompanion($playerId, $dieColor, 0)) {
            $range += 3;
        }
        return $range;
    }

    private function getMaxMovementRange(int $playerId, ?string $dieColor = null): int
    {
        $baseRange = $this->getMovementRange($playerId, $dieColor);
        $favor = (int)$this->game->getUniqueValueFromDB(
            "SELECT favor_tokens FROM player WHERE player_id = $playerId"
        );
        return $baseRange + $favor;
    }

    /**
     * A player qualifies for the end-game dash once every one of their
     * Zeus tiles is completed (normally 12; 11 with the fewer_tasks
     * ship tile once that ability is wired up).
     */
    private function isEligibleForZeus(int $playerId): bool
    {
        $incomplete = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM zeus_tile
             WHERE player_id = $playerId AND is_completed = 0"
        );
        return $incomplete === 0;
    }

    /** @return array{q: int, r: int}|null */
    private function getZeusPosition(): ?array
    {
        $pos = $this->game->globals->get('zeus_position');
        if (!$pos) return null;
        return ['q' => (int)$pos['q'], 'r' => (int)$pos['r']];
    }

    private function isZeusHex(int $q, int $r): bool
    {
        $zeus = $this->getZeusPosition();
        return $zeus !== null && $zeus['q'] === $q && $zeus['r'] === $r;
    }

    private function getPathfinder(int $playerId): HexPathfinder
    {
        $pathfinder = new HexPathfinder();
        $waterHexes = $this->game->getObjectListFromDB(
            "SELECT q, r FROM hex WHERE tile_type = 'water'"
        );
        // End-game: once the player's Zeus tiles are all complete, unlock
        // the Zeus shallows hex as a reachable destination. Any color die
        // may be used to reach it (see color check below).
        if ($this->isEligibleForZeus($playerId)) {
            $zeus = $this->getZeusPosition();
            if ($zeus !== null) {
                $waterHexes[] = ['q' => $zeus['q'], 'r' => $zeus['r']];
            }
        }
        // Equipment 014 (Shallow Runner): shallows become passable AND
        // do not count against the movement budget. We add every shallow
        // hex to the passable set here, and mark the same keys as
        // zero-cost on the pathfinder so they are traversed for free.
        // EXCEPTION: the Zeus shallows hex is gated by isEligibleForZeus
        // above — a 014 owner who hasn't yet completed their Zeus tiles
        // must not be able to reach (and win via) the Zeus hex through
        // this passive.
        $ownsShallowRunner = $this->game->playerOwnsEquipment($playerId, 14);
        $shallowSet = [];
        if ($ownsShallowRunner) {
            $zeus = $this->getZeusPosition();
            $zeusKey = $zeus !== null ? ($zeus['q'] . ',' . $zeus['r']) : null;
            $zeusEligible = $this->isEligibleForZeus($playerId);
            $shallows = $this->game->getObjectListFromDB(
                "SELECT q, r FROM hex WHERE tile_type = 'shallows'"
            );
            foreach ($shallows as $s) {
                $key = (int)$s['q'] . ',' . (int)$s['r'];
                // Skip the Zeus hex for non-eligible players (the eligibility
                // branch above already handles it when appropriate).
                if ($key === $zeusKey && !$zeusEligible) continue;
                $waterHexes[] = ['q' => $s['q'], 'r' => $s['r']];
                $shallowSet[$key] = true;
            }
        }
        $pathfinder->loadWaterHexes($waterHexes);
        if (!empty($shallowSet)) {
            $pathfinder->setZeroCostHexes($shallowSet);
        }
        return $pathfinder;
    }

    private function getSelectedDieColor(int $playerId): string
    {
        return $this->game->getActionColor($playerId) ?? '';
    }

    /** @return array<string, string> Map of "q,r" => color for all water hexes */
    private function getWaterHexColors(): array
    {
        $rows = $this->game->getObjectListFromDB(
            "SELECT q, r, color FROM hex WHERE tile_type = 'water'"
        );
        $map = [];
        foreach ($rows as $row) {
            $map[(int)$row['q'] . ',' . (int)$row['r']] = $row['color'] ?? '';
        }
        return $map;
    }

    /** @return array<string, true> Set of "q,r" keys for all shallow hexes on the board. */
    private function getShallowHexSet(): array
    {
        $rows = $this->game->getObjectListFromDB(
            "SELECT q, r FROM hex WHERE tile_type = 'shallows'"
        );
        $set = [];
        foreach ($rows as $row) {
            $set[(int)$row['q'] . ',' . (int)$row['r']] = true;
        }
        return $set;
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $player = $this->game->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];
        $dieColor = $this->getSelectedDieColor($playerId);
        $range = $this->getMovementRange($playerId, $dieColor);
        $maxRange = $this->getMaxMovementRange($playerId, $dieColor);
        $creatureActive = $dieColor
            && $this->game->playerOwnsCompanion($playerId, $dieColor, 0);

        $pathfinder = $this->getPathfinder($playerId);
        $reachable = $pathfinder->getReachableHexes($shipQ, $shipR, $maxRange);

        // Filter: normally can only stop on hexes matching the die color.
        // Creature companion of the matching color removes that restriction;
        // the Zeus shallows hex (when reachable at end-game) is color-agnostic.
        // Equipment 014 (Shallow Runner) lets the ship end on any shallow
        // hex regardless of die color (shallows carry no water color).
        $hexColors = $this->getWaterHexColors();
        $ownsShallowRunner = $this->game->playerOwnsEquipment($playerId, 14);
        $shallowDestSet = $ownsShallowRunner ? $this->getShallowHexSet() : [];
        $reachableList = [];
        foreach ($reachable as $key => $dist) {
            [$qStr, $rStr] = explode(',', $key);
            $q = (int)$qStr;
            $r = (int)$rStr;
            $hexColor = $hexColors[$key] ?? '';
            $isZeus = $this->isZeusHex($q, $r);
            $isShallow = isset($shallowDestSet[$key]);
            if ($creatureActive || $hexColor === $dieColor || $isZeus || $isShallow) {
                $reachableList[] = ['q' => $q, 'r' => $r, 'distance' => $dist, 'isZeus' => $isZeus];
            }
        }

        return [
            'shipQ' => $shipQ,
            'shipR' => $shipR,
            'baseRange' => $range,
            'maxRange' => $maxRange,
            'dieColor' => $dieColor,
            'reachableHexes' => $reachableList,
            'playerFavor' => (int)$this->game->getUniqueValueFromDB(
                "SELECT favor_tokens FROM player WHERE player_id = $playerId"
            ),
        ];
    }

    function onEnteringState(int $activePlayerId) {
        $dieColor = $this->getSelectedDieColor($activePlayerId);
        if ($dieColor && $this->game->playerOwnsCompanion($activePlayerId, $dieColor, 0)) {
            $this->notify->all("creatureMoveBonus",
                clienttranslate('${companion_name} extends ${player_name}\'s ship range +3 and ignores water color'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
                "color" => $dieColor,
                "companion_name" => MaterialDefs::companionName($dieColor, 0),
            ]);
        }
        return null;
    }

    #[PossibleAction]
    public function actConfirmMove(int $q, int $r, int $activePlayerId) {
        $player = $this->game->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $activePlayerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];
        $dieColor = $this->getSelectedDieColor($activePlayerId);
        $baseRange = $this->getMovementRange($activePlayerId, $dieColor);
        $maxRange = $this->getMaxMovementRange($activePlayerId, $dieColor);

        $pathfinder = $this->getPathfinder($activePlayerId);
        $reachable = $pathfinder->getReachableHexes($shipQ, $shipR, $maxRange);
        $targetKey = "$q,$r";
        if (!isset($reachable[$targetKey])) {
            throw new UserException(clienttranslate('You cannot move there'));
        }

        // Destination must match die color, EXCEPT for the Zeus shallows
        // hex (landing there ends the game regardless of die color) and
        // EXCEPT when the player owns a Creature companion of the die's
        // color (ability lets them end on any water color), and EXCEPT
        // when the destination is a shallow hex and the player owns
        // Equipment 014 (Shallow Runner) — shallows have no water color.
        $isZeusDestination = $this->isZeusHex($q, $r);
        $creatureActive = $dieColor && $this->game->playerOwnsCompanion($activePlayerId, $dieColor, 0);
        $isShallowDestination = false;
        if ($this->game->playerOwnsEquipment($activePlayerId, 14)) {
            $shallowType = $this->game->getUniqueValueFromDB(
                "SELECT tile_type FROM hex WHERE q = $q AND r = $r"
            );
            $isShallowDestination = ($shallowType === 'shallows');
        }
        if (!$isZeusDestination && !$creatureActive && !$isShallowDestination) {
            $destColor = $this->game->getUniqueValueFromDB(
                "SELECT color FROM hex WHERE q = $q AND r = $r AND tile_type = 'water'"
            );
            if ($destColor !== $dieColor) {
                throw new UserException(clienttranslate('Destination must match die color'));
            }
        }

        // Check if favor is needed for extended range
        $distance = $reachable[$targetKey];
        $favorCost = max(0, $distance - $baseRange);

        if ($favorCost > 0) {
            $currentFavor = (int)$this->game->getUniqueValueFromDB(
                "SELECT favor_tokens FROM player WHERE player_id = $activePlayerId"
            );
            if ($currentFavor < $favorCost) {
                throw new UserException(clienttranslate('Not enough Favor Tokens for that distance'));
            }
            $this->game->DbQuery(
                "UPDATE player SET favor_tokens = favor_tokens - $favorCost WHERE player_id = $activePlayerId"
            );
            $newFavor = $currentFavor - $favorCost;

            $this->notify->all("favorSpentForMovement",
                clienttranslate('${player_name} spends ${cost} Favor to extend movement'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
                "cost" => $favorCost,
                "favor_tokens" => $newFavor,
            ]);
        }

        // Update ship position
        $this->game->DbQuery(
            "UPDATE player SET ship_q = $q, ship_r = $r WHERE player_id = $activePlayerId"
        );

        $this->notify->all("shipMoved", clienttranslate('${player_name} moves their ship'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "q" => $q,
            "r" => $r,
        ]);

        // Landing on Zeus triggers the final round: the winner is locked
        // in now, but remaining players still complete their turns for
        // this round (per Oracle of Delphi rules). NextPlayer watches for
        // the turn rotation to return to the first Zeus-reacher and
        // transitions to PreEndGame at that point. Meanwhile, this
        // player's own turn continues normally via spendActionSource
        // below. If a later player also reaches Zeus in the same final
        // round, they're added to the list and EndScore tie-breaks them
        // by oracle cards and favor.
        if ($isZeusDestination) {
            $reachers = $this->game->globals->get('zeus_reachers') ?? [];
            if (!in_array($activePlayerId, $reachers, true)) {
                $reachers[] = $activePlayerId;
                $this->game->globals->set('zeus_reachers', $reachers);
            }

            if (count($reachers) === 1) {
                // First player to reach — trigger the final-round rotation.
                $this->game->globals->set('winner_player_id', $activePlayerId);
                $this->notify->all("reachedZeus", clienttranslate('${player_name} reaches Zeus! Final round — remaining players take one more turn.'), [
                    "player_id" => $activePlayerId,
                    "player_name" => $this->game->getPlayerNameById($activePlayerId),
                ]);
            } else {
                // Another Zeus-reach in the same final round — tie-break territory.
                $this->notify->all("reachedZeus", clienttranslate('${player_name} also reaches Zeus! Tie-breaker will decide the winner.'), [
                    "player_id" => $activePlayerId,
                    "player_name" => $this->game->getPlayerNameById($activePlayerId),
                ]);
            }
        }

        return $this->game->spendActionSource($activePlayerId);
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->game->globals->set('selected_die_index', null);
        $this->notify->all("dieCancelled", clienttranslate('${player_name} cancels die selection'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
