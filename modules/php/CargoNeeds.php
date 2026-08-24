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

        $claimed = self::assign($openTiles, self::excludedColors($siblingTiles), $cargoColors);

        return count($claimed) < count($openTiles);
    }

    /**
     * True iff a NEW item of $newColor would have a home, given what the ship
     * already carries.
     *
     * This is the reservation question, and it is the one needsMore() cannot
     * answer. needsMore asks "is any open tile uncovered?", which stays true
     * while other tiles are open — so with tiles [yellow, green, white] and a
     * red offering aboard (red can only ever serve the white tile), it still
     * reports that more cargo is needed, and it is right: yellow and green are
     * uncovered. But it says nothing about whether BLUE specifically is useful,
     * and blue also only fits white, which red has already taken.
     *
     * That gap is what stranded cargo in two reported games:
     *   - tiles yellow/green/white, load red for white, then load blue: blue
     *     was allowed, delivered to white, and red could never be used again;
     *   - only white left, load black for it, then a yellow was still offered,
     *     leaving whichever one was not delivered stuck aboard.
     *
     * Assignment is the same greedy-but-ordered pass needsMore uses, so the two
     * agree by construction: existing cargo is placed first (exact colour
     * before wildcard), then the candidate is offered whatever is left. Exact-
     * first is optimal here, not just a heuristic — a colour-locked tile can
     * only ever be served by its own colour, and the house rule forbids two
     * carried items of the same colour, so claiming an exact tile never denies
     * it to anything else, and it leaves the interchangeable wildcard tiles for
     * the items that genuinely need them.
     *
     * @param array<int, array{task_color: ?string}> $openTiles  Incomplete tiles of this type.
     * @param array<int, array{task_color: ?string, completion_value?: ?string}> $siblingTiles
     * @param string[] $cargoColors  Colours of the matching items already aboard.
     */
    public static function canTakeColor(
        array $openTiles,
        array $siblingTiles,
        array $cargoColors,
        string $newColor
    ): bool {
        if (empty($openTiles)) return false;

        $excluded = self::excludedColors($siblingTiles);
        $claimed = self::assign($openTiles, $excluded, $cargoColors);

        // An open tile of exactly this colour is always a home.
        foreach ($openTiles as $i => $tile) {
            if (isset($claimed[$i])) continue;
            if (($tile['task_color'] ?? null) === $newColor) return true;
        }

        // Otherwise it needs a wildcard tile, and must be allowed on one.
        if (in_array($newColor, $excluded, true)) return false;
        foreach ($openTiles as $i => $tile) {
            if (isset($claimed[$i])) continue;
            if (($tile['task_color'] ?? null) === null) return true;
        }

        return false;
    }

    /**
     * WHY a colour is refused, or null if it is loadable.
     *
     * canTakeColor answers yes/no; the client needs to say something, and "not
     * this one" is exactly what the per-colour gates cannot explain. Every gate
     * in SelectAction::getLoadableOfferings currently fails silently — the
     * offering does not light up and the tap does nothing — which is
     * indistinguishable from the game being broken. One reported game had a
     * player recolour a die seven times over ten minutes, 2 Favor each, trying
     * to load a colour that no die would ever have unlocked.
     *
     * Lives here rather than in the state because it needs no DB: the same four
     * inputs canTakeColor takes decide all five reasons. That also means the two
     * cannot drift, which matters — a reason that disagreed with the gate would
     * explain a refusal that did not happen, or stay silent on one that did.
     * test_cargo_needs.php pins that agreement across every colour and hold.
     *
     * Gate order mirrors getLoadableOfferings, so the reason names the gate that
     * actually refused rather than a later one that also would have.
     *
     * Reasons, each with a different remedy (or, for the last two, none):
     *   noTasks   - no open tiles of this type at all
     *   covered   - open tiles, but what is aboard already covers them
     *   colorHeld - the same-colour house rule, which canTakeColor does not
     *               model (it only cites it to justify exact-first assignment)
     *   colorUsed - a sibling tile is fixed to this colour or was completed
     *               with it, so no wildcard will accept it
     *   reserved  - a wildcard would be the only home and carried cargo has
     *               already claimed it. Permanent: delivering the cargo closes
     *               the tile recording its colour rather than freeing it.
     *
     * @param array<int, array{task_color: ?string}> $openTiles
     * @param array<int, array{task_color: ?string, completion_value?: ?string}> $siblingTiles
     * @param string[] $cargoColors
     */
    public static function refusalReason(
        array $openTiles,
        array $siblingTiles,
        array $cargoColors,
        string $newColor
    ): ?string {
        if (empty($openTiles)) return 'noTasks';
        if (!self::needsMore($openTiles, $siblingTiles, $cargoColors)) return 'covered';
        if (in_array($newColor, $cargoColors, true)) return 'colorHeld';
        if (self::canTakeColor($openTiles, $siblingTiles, $cargoColors, $newColor)) return null;

        return in_array($newColor, self::excludedColors($siblingTiles), true)
            ? 'colorUsed'
            : 'reserved';
    }

    /**
     * Greedily assign carried colours to open tiles, exact colour before
     * wildcard. Returns the set of claimed tile indices.
     *
     * Shared by needsMore() and canTakeColor() so a change to the matching
     * rule can never make the "do I need more?" and "may I take this?"
     * answers disagree — which is precisely how cargo got stranded.
     *
     * @return array<int, true>
     */
    private static function assign(array $openTiles, array $excluded, array $cargoColors): array
    {
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

        return $claimed;
    }
}
