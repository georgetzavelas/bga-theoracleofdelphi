<?php

declare(strict_types=1);

namespace Bga\Games\theoracleofdelphi;

/**
 * Pure injury maths, lifted out of CheckInjuries and Recover so it can be
 * exercised without the BGA platform. The states keep the DB reads, the
 * notifications and the discarding.
 *
 * At the start of a turn a player's injury hand decides what happens next:
 *
 *   - too many injuries => a forced recovery turn (discard 3, no actions)
 *   - none at all       => the no-injury bonus
 *   - anything between  => an ordinary turn
 *
 * "Too many" is two independent rules, and BOTH of them bite. Three of one
 * colour forces recovery, and so does six in total -- neither implies the
 * other, because a hand of 2+2+2 reaches six without ever reaching three of
 * a colour. Equipment 015 (Pain Tolerance) raises both bars together, to
 * four and eight.
 */
class InjuryRules
{
    /** Equipment 015: Pain Tolerance. */
    public const PAIN_TOLERANCE_EQUIPMENT_ID = 15;

    /** Forced recovery at this many of a single colour. */
    public const SAME_COLOR_THRESHOLD = 3;
    public const SAME_COLOR_THRESHOLD_PAIN_TOLERANCE = 4;

    /** Forced recovery at this many injuries overall. */
    public const TOTAL_THRESHOLD = 6;
    public const TOTAL_THRESHOLD_PAIN_TOLERANCE = 8;

    /** A recovery turn discards exactly this many cards. */
    public const RECOVERY_DISCARD_COUNT = 3;

    /** What the start of the turn resolves to. */
    public const PHASE_RECOVER = 'recover';
    public const PHASE_NO_INJURY_BONUS = 'no_injury_bonus';
    public const PHASE_ACTIONS = 'actions';

    public static function sameColorThreshold(bool $ownsPainTolerance): int
    {
        return $ownsPainTolerance
            ? self::SAME_COLOR_THRESHOLD_PAIN_TOLERANCE
            : self::SAME_COLOR_THRESHOLD;
    }

    public static function totalThreshold(bool $ownsPainTolerance): int
    {
        return $ownsPainTolerance
            ? self::TOTAL_THRESHOLD_PAIN_TOLERANCE
            : self::TOTAL_THRESHOLD;
    }

    /**
     * @param array<mixed,int> $countsByColor injuries held, per colour. Only
     *        the counts matter; the keys are ignored.
     */
    public static function totalInjuries(array $countsByColor): int
    {
        $total = 0;
        foreach ($countsByColor as $count) {
            $total += (int)$count;
        }
        return $total;
    }

    /** True when some single colour has reached its threshold. */
    public static function hasSameColorThreshold(array $countsByColor, bool $ownsPainTolerance): bool
    {
        $threshold = self::sameColorThreshold($ownsPainTolerance);
        foreach ($countsByColor as $count) {
            if ((int)$count >= $threshold) return true;
        }
        return false;
    }

    /** Either rule alone forces the recovery turn. */
    public static function mustRecover(array $countsByColor, bool $ownsPainTolerance): bool
    {
        return self::hasSameColorThreshold($countsByColor, $ownsPainTolerance)
            || self::totalInjuries($countsByColor) >= self::totalThreshold($ownsPainTolerance);
    }

    /**
     * What the start of the turn resolves to. Recovery is checked before the
     * empty-hand case, matching CheckInjuries.
     */
    public static function nextPhase(array $countsByColor, bool $ownsPainTolerance): string
    {
        if (self::mustRecover($countsByColor, $ownsPainTolerance)) {
            return self::PHASE_RECOVER;
        }
        if (self::totalInjuries($countsByColor) === 0) {
            return self::PHASE_NO_INJURY_BONUS;
        }
        return self::PHASE_ACTIONS;
    }

    /**
     * A recovery discard must be a list of exactly three cards. Note the
     * count is fixed at three whether or not the player has Pain Tolerance --
     * that equipment moves the bar for entering recovery, not the price of
     * leaving it.
     *
     * @param mixed $decoded whatever json_decode returned
     */
    public static function isValidRecoveryDiscard(mixed $decoded): bool
    {
        return is_array($decoded) && count($decoded) === self::RECOVERY_DISCARD_COUNT;
    }
}
