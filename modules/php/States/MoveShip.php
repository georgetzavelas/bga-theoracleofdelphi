<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphi\Game;
use Bga\Games\theoracleofdelphi\HexPathfinder;
use Bga\Games\theoracleofdelphi\MaterialDefs;

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

    private static function getMovementRange(Game $game, int $playerId, ?string $dieColor = null): int
    {
        $shipTileId = $game->getUniqueValueFromDB(
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
        if ($game->playerOwnsEquipment($playerId, 8)) {
            $range += 1;
        }
        // Creature companion of matching color: +3 range.
        if ($dieColor && $game->playerOwnsCompanion($playerId, $dieColor, 0)) {
            $range += 3;
        }
        return $range;
    }

    private static function getMaxMovementRange(Game $game, int $playerId, ?string $dieColor = null): int
    {
        $baseRange = self::getMovementRange($game, $playerId, $dieColor);
        $favor = (int)$game->getUniqueValueFromDB(
            "SELECT favor_tokens FROM player WHERE player_id = $playerId"
        );
        return $baseRange + $favor;
    }

    /**
     * A player qualifies for the end-game dash once every one of their
     * Zeus tiles is completed (normally 12; 11 with the fewer_tasks
     * ship tile once that ability is wired up).
     */
    // Zeus eligibility/position and the reached-Zeus bookkeeping live on
    // the Game object so MoveShip and UseGodAbility (Poseidon's teleport)
    // share one implementation. These thin wrappers keep the local call
    // sites terse.
    private static function isEligibleForZeus(Game $game, int $playerId): bool
    {
        return $game->isEligibleForZeus($playerId);
    }

    /** @return array{q: int, r: int}|null */
    private static function getZeusPosition(Game $game): ?array
    {
        return $game->getZeusPosition();
    }

    private static function isZeusHex(Game $game, int $q, int $r): bool
    {
        return $game->isZeusHex($q, $r);
    }

    private static function getPathfinder(Game $game, int $playerId): HexPathfinder
    {
        $pathfinder = new HexPathfinder();
        $waterHexes = $game->getObjectListFromDB(
            "SELECT q, r FROM hex WHERE tile_type = 'water'"
        );
        // End-game: once the player's Zeus tiles are all complete, unlock
        // the Zeus shallows hex as a reachable destination. Any color die
        // may be used to reach it (see color check below).
        if (self::isEligibleForZeus($game, $playerId)) {
            $zeus = self::getZeusPosition($game);
            if ($zeus !== null) {
                $waterHexes[] = ['q' => $zeus['q'], 'r' => $zeus['r']];
            }
        }
        // Equipment 014 (Shallow Runner): shallows become passable AND
        // do not count against the movement budget. The Zeus hex is a
        // shallow too, so it gets the same treatment — a 014 owner can
        // ROUTE through Zeus for free regardless of eligibility. The
        // separate question of whether they can LAND on Zeus (= win)
        // is enforced by the destination filter in getArgs and by
        // actConfirmMove, NOT here at the passability layer.
        $ownsShallowRunner = $game->playerOwnsEquipment($playerId, 14);
        $shallowSet = [];
        if ($ownsShallowRunner) {
            $shallows = $game->getObjectListFromDB(
                "SELECT q, r FROM hex WHERE tile_type = 'shallows'"
            );
            foreach ($shallows as $s) {
                $key = (int)$s['q'] . ',' . (int)$s['r'];
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

    private static function getSelectedDieColor(Game $game, int $playerId): string
    {
        return $game->getActionColor($playerId) ?? '';
    }

    /** @return array<string, string> Map of "q,r" => color for all water hexes */
    private static function getWaterHexColors(Game $game): array
    {
        $rows = $game->getObjectListFromDB(
            "SELECT q, r, color FROM hex WHERE tile_type = 'water'"
        );
        $map = [];
        foreach ($rows as $row) {
            $map[(int)$row['q'] . ',' . (int)$row['r']] = $row['color'] ?? '';
        }
        return $map;
    }

    /** @return array<string, true> Set of "q,r" keys for all shallow hexes on the board. */
    private static function getShallowHexSet(Game $game): array
    {
        $rows = $game->getObjectListFromDB(
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
        return self::moveTargets($this->game, (int)$this->game->getActivePlayerId());
    }

    /**
     * Where the ship can go with the current action source, and how far.
     *
     * Static, and callable without a MoveShip instance, so SelectAction can
     * offer the same targets as a preview the moment a die or card is chosen.
     * One calculation for both means the colour, range, favor extension, Zeus
     * and Creature rules cannot drift between the preview and the move.
     */
    public static function moveTargets(Game $game, int $playerId): array
    {
        $player = $game->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];
        $dieColor = self::getSelectedDieColor($game, $playerId);
        $range = self::getMovementRange($game, $playerId, $dieColor);
        $maxRange = self::getMaxMovementRange($game, $playerId, $dieColor);
        $creatureActive = $dieColor
            && $game->playerOwnsCompanion($playerId, $dieColor, 0);

        $pathfinder = self::getPathfinder($game, $playerId);
        $reachable = $pathfinder->getReachableHexes($shipQ, $shipR, $maxRange);

        // Filter destinations. Shallows are routing-only for card 014
        // owners — passing THROUGH at zero cost is the card's benefit,
        // but the ship can never END on a shallow. The Zeus hex is the
        // sole exception: it's a shallow geographically, and landing
        // there is permitted only when all Zeus tiles are complete
        // (= isEligibleForZeus). Non-Zeus shallows that the pathfinder
        // exposes in the reachable set are dropped here. Color rule:
        // a normal water destination must match the die colour unless
        // the Creature companion of that colour grants colour-agnostic
        // landing. Zeus itself is colour-agnostic.
        $hexColors = self::getWaterHexColors($game);
        $shallowDestSet = self::getShallowHexSet($game);
        $zeusEligible = self::isEligibleForZeus($game, $playerId);
        $reachableList = [];
        foreach ($reachable as $key => $dist) {
            [$qStr, $rStr] = explode(',', $key);
            $q = (int)$qStr;
            $r = (int)$rStr;
            $hexColor = $hexColors[$key] ?? '';
            $isZeus = self::isZeusHex($game, $q, $r);
            // Non-Zeus shallows are routing-only — never a destination.
            if (isset($shallowDestSet[$key]) && !$isZeus) continue;
            // Zeus only opens up once tiles are complete. Card 014
            // owners can still ROUTE through it at zero cost; this
            // gate only blocks LANDING.
            if ($isZeus && !$zeusEligible) continue;
            if ($creatureActive || $hexColor === $dieColor || $isZeus) {
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
            'playerFavor' => (int)$game->getUniqueValueFromDB(
                "SELECT favor_tokens FROM player WHERE player_id = $playerId"
            ),
        ];
    }

    function onEnteringState(int $activePlayerId) {
        $dieColor = self::getSelectedDieColor($this->game, $activePlayerId);
        if ($dieColor && $this->game->playerOwnsCompanion($activePlayerId, $dieColor, 0)) {
            $this->notify->all("creatureMoveBonus",
                clienttranslate('${companion_name} extends ${player_name}\'s ship range +3 and ignores water color'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
                "color" => $dieColor,
                "companion_name" => MaterialDefs::companionName($dieColor, 0),
                "i18n" => ["companion_name"],
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
        $dieColor = self::getSelectedDieColor($this->game, $activePlayerId);
        $baseRange = self::getMovementRange($this->game, $activePlayerId, $dieColor);
        $maxRange = self::getMaxMovementRange($this->game, $activePlayerId, $dieColor);

        $pathfinder = self::getPathfinder($this->game, $activePlayerId);
        $reachable = $pathfinder->getReachableHexes($shipQ, $shipR, $maxRange);
        $targetKey = "$q,$r";
        if (!isset($reachable[$targetKey])) {
            throw new UserException(clienttranslate('You cannot move there'));
        }

        // Shallows are routing-only (card 014 passive). The Zeus
        // hex is the sole exception: a shallow that can be landed
        // on once all Zeus tiles are complete. Reject any other
        // shallow destination here as defence-in-depth — the
        // client picker already filters them out via getArgs.
        $isZeusDestination = self::isZeusHex($this->game, $q, $r);
        $destTileType = $this->game->getUniqueValueFromDB(
            "SELECT tile_type FROM hex WHERE q = $q AND r = $r"
        );
        if ($destTileType === 'shallows' && !$isZeusDestination) {
            throw new UserException(clienttranslate('You cannot end your move on a shallow'));
        }
        if ($isZeusDestination && !self::isEligibleForZeus($this->game, $activePlayerId)) {
            throw new UserException(clienttranslate('You must complete all your Zeus tiles before landing on Zeus'));
        }

        // Destination must match die color, EXCEPT for the Zeus shallows
        // hex (landing there ends the game regardless of die color) and
        // EXCEPT when the player owns a Creature companion of the die's
        // color (ability lets them end on any water color).
        $creatureActive = $dieColor && $this->game->playerOwnsCompanion($activePlayerId, $dieColor, 0);
        if (!$isZeusDestination && !$creatureActive) {
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
            $this->game->statInc($favorCost, 'favor_tokens_spent', $activePlayerId);
            $newFavor = $currentFavor - $favorCost;

            $this->notify->all("favorSpentForMovement",
                clienttranslate('${player_name} spends ${cost} favor to extend movement'), [
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
        $this->game->statInc($distance, 'ship_movement_hexes', $activePlayerId);

        $this->notify->all("shipMoved", clienttranslate('${player_name} moves ${ship_tok} ship'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "q" => $q,
            "r" => $r,
            "ship_tok" => 1,
            // bgaFormatText resolves the ship's colour from player_id, which
            // the message never references, so BGA would strip it from the
            // historical log and the icon would degrade to a bare "1".
            "preserve" => ["player_id"],
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
            $this->game->registerZeusReach($activePlayerId);
        }

        return $this->game->spendActionSource($activePlayerId);
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        // Release the action source (card OR die), refunding a Favor paid to
        // recolor it — this state's only back-out is a bare Cancel, with no
        // Undo button to fall back on. See Game::abandonSelectedSource.
        return $this->game->abandonSelectedSource($activePlayerId);
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
