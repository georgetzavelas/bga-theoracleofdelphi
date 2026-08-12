<?php

declare(strict_types=1);

namespace Bga\Games\theoracleofdelphi;

require_once(__DIR__ . '/MaterialDefs.php');

/**
 * Pure recolour-cost maths, lifted out of Game so it can be exercised without
 * the BGA platform. Game::applyRecolorCost keeps the favor balance check, the
 * debit and the undo bookkeeping; the pricing lives here.
 *
 * Recolouring a die or oracle card moves it around the six-colour oracle
 * wheel, and each step costs one Favor Token:
 *
 *   - Clockwise only by default, so the far side of the wheel costs 5.
 *   - The reverse_recolor ship tile allows either direction, so the cost
 *     becomes the cheaper of the two and nothing costs more than 3.
 *   - The recolor_discount ship tile (Thrifty Wheel) takes one Favor off,
 *     never below zero.
 *
 * The discount is why Game::applyRecolorCost carries an $allowDiscount gate:
 * a discount applied to every recolour would let a player walk the whole
 * wheel one free step at a time. See the sum-of-steps checks in
 * tests/test_recolor_rules.php, which price that exploit out explicitly.
 */
class RecolorRules
{
    /** Cost of a single step around the wheel, in Favor Tokens. */
    public const STEP_COST = 1;

    /** How much the Thrifty Wheel ship tile takes off a recolour. */
    public const DISCOUNT = 1;

    /** @return list<string> the wheel, clockwise */
    public static function wheel(): array
    {
        return MaterialDefs::ORACLE_WHEEL_ORDER;
    }

    /** Number of colours on the wheel. */
    public static function wheelSize(): int
    {
        return count(self::wheel());
    }

    /**
     * Wheel distance from one oracle colour to another.
     *
     * Returns 0 for a same-colour target AND for a colour that is not on the
     * wheel at all. Callers must treat 0 as "not a real recolour" rather than
     * "free": Game::applyRecolorCost throws Invalid recolor target on 0,
     * which is what stops an unrecognised colour from being recoloured for
     * nothing.
     */
    public static function wheelCost(string $fromColor, string $targetColor, bool $bothDirections = false): int
    {
        if ($fromColor === $targetColor) return 0;
        $order = self::wheel();
        $fromIdx = array_search($fromColor, $order);
        $toIdx = array_search($targetColor, $order);
        if ($fromIdx === false || $toIdx === false) return 0;
        $n = count($order);
        $cw = ($toIdx - $fromIdx + $n) % $n;
        if (!$bothDirections) return $cw * self::STEP_COST;
        $ccw = $n - $cw;
        return min($cw, $ccw) * self::STEP_COST;
    }

    /** The Thrifty Wheel discount, which never takes a cost below zero. */
    public static function discountedCost(int $baseCost, bool $hasDiscount): int
    {
        return $hasDiscount ? max(0, $baseCost - self::DISCOUNT) : $baseCost;
    }

    /** A cost of 0 means the target was invalid, not that it is free. */
    public static function isValidTarget(int $wheelCost): bool
    {
        return $wheelCost > 0;
    }
}
