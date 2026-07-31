<?php
declare(strict_types=1);

namespace Bga\Games\theoracleofdelphi;

/**
 * Pure decision logic for "do I still need more cargo of this type?".
 *
 * Kept free of the game/DB framework so it can be unit-tested standalone
 * (see tests/test_cargo_needs.php). Game::playerStillNeedsCargoOfType supplies
 * the DB glue and delegates the decision here.
 *
 * This enforces the FAQ rule "Can I fight Monsters or load Statues or Offerings
 * that I don't need to complete for a task? No" in the COUNT sense. It used to
 * be a bare `openTasks > itemsAboard` comparison, which is wrong the moment task
 * colours matter: a player holding a red offering with only a PINK offering tile
 * left counted as "already covered" and was locked out of loading the pink they
 * actually needed. Reported from a real game, where the red had been picked up
 * for a white (any-colour) tile that was then completed with green, leaving the
 * red unable to complete anything.
 *
 * So the question is not "how many do I hold?" but "is there an open tile that
 * nothing aboard can complete?".
 */
class CargoNeeds
{
    /**
     * Colours a WHITE (any-colour) tile may NOT be completed with: every colour
     * already spoken for by a sibling tile of the same type, either as that
     * tile's fixed colour or as the colour a completed sibling was finished
     * with. Mirrors Game::findCompletableZeusTileForType so both agree on what
     * a white tile accepts.
     *
     * @param array<int, array{task_color: ?string, completion_value?: ?string}> $siblingTiles
     *        Every tile of this type for the player, completed or not.
     * @return string[]
     */
    public static function excludedColors(array $siblingTiles): array
    {
        $excluded = [];
        foreach ($siblingTiles as $tile) {
            if (!empty($tile['task_color'])) $excluded[] = $tile['task_color'];
            if (!empty($tile['completion_value'])) $excluded[] = $tile['completion_value'];
        }
        return array_values(array_unique($excluded));
    }

    /**
     * True iff at least one open tile cannot be completed by anything already
     * aboard, i.e. the player may still take more cargo of this type.
     *
     * Assignment is greedy but deliberately ordered: an item is matched to a
     * tile of its own colour first, and only falls back to a white tile if no
     * exact match is open. Otherwise a wildcard tile could be consumed by an
     * item that had an exact home available, understating what is still needed.
     *
     * @param array<int, array{task_color: ?string}> $openTiles  Incomplete tiles of this type.
     * @param array<int, array{task_color: ?string, completion_value?: ?string}> $siblingTiles
     *        All tiles of this type (drives the white-tile exclusion set).
     * @param string[] $cargoColors  Colours of the matching items aboard.
     */
    public static function needsMore(array $openTiles, array $siblingTiles, array $cargoColors): bool
    {
        if (empty($openTiles)) return false;

        $excluded = self::excludedColors($siblingTiles);
        $claimed = [];

        foreach ($cargoColors as $color) {
            $target = null;

            // Exact colour match first.
            foreach ($openTiles as $i => $tile) {
                if (isset($claimed[$i])) continue;
                if (($tile['task_color'] ?? null) === $color) { $target = $i; break; }
            }

            // Then a white tile, but only with a colour that tile would accept.
            if ($target === null && !in_array($color, $excluded, true)) {
                foreach ($openTiles as $i => $tile) {
                    if (isset($claimed[$i])) continue;
                    if (($tile['task_color'] ?? null) === null) { $target = $i; break; }
                }
            }

            // No home for this item: it is dead weight and covers nothing.
            if ($target !== null) $claimed[$target] = true;
        }

        return count($claimed) < count($openTiles);
    }
}
