<?php
declare(strict_types=1);

namespace Bga\Games\theoracleofdelphi;

/**
 * Pure decision logic for the Ship Tile draft variant.
 *
 * Kept free of the game/DB framework so it can be unit-tested standalone
 * (see tests/test_draft_logic.php). The DraftShipTile state supplies the
 * DB glue (reading the pool global, the player rows) and delegates the
 * "who / what is choosable next" questions here.
 */
class DraftLogic
{
    /**
     * Number of tiles laid out face up: one more than the player count,
     * per the rulebook variant.
     */
    public static function poolSize(int $playerCount): int
    {
        return $playerCount + 1;
    }

    /**
     * Tiles still choosable: the drafted pool minus the ones already
     * claimed. Order is preserved from the pool so the display is stable
     * across picks.
     *
     * @param int[] $pool            Tile ids laid out for this draft.
     * @param int[] $claimedTileIds  Tile ids already taken.
     * @return int[]
     */
    public static function availableTiles(array $pool, array $claimedTileIds): array
    {
        $claimed = array_map('intval', $claimedTileIds);
        return array_values(array_filter(
            array_map('intval', $pool),
            static fn (int $tileId): bool => !in_array($tileId, $claimed, true)
        ));
    }

    /**
     * The next player to draft, given the players who still have no tile.
     *
     * Draft order is descending player_no (reverse turn order): the last
     * player picks first, walking back toward the first player. Everyone
     * with a higher player_no has already drafted, so the next drafter is
     * simply the undrafted player with the highest remaining player_no.
     *
     * @param array<int,int> $undrafted  player_id => player_no for players
     *                                   without a tile yet.
     * @return int|null  player_id of the next drafter, or null when the
     *                   draft is complete.
     */
    public static function nextDrafter(array $undrafted): ?int
    {
        $nextPlayerId = null;
        $highestNo = null;
        foreach ($undrafted as $playerId => $playerNo) {
            if ($highestNo === null || (int)$playerNo > $highestNo) {
                $highestNo = (int)$playerNo;
                $nextPlayerId = (int)$playerId;
            }
        }
        return $nextPlayerId;
    }
}
