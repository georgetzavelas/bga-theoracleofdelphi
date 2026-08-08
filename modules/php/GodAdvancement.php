<?php

declare(strict_types=1);

namespace Bga\Games\theoracleofdelphi;

require_once(__DIR__ . '/MaterialDefs.php');

/**
 * Pure God Track maths, lifted out of Game and the god states so it can be
 * exercised without the BGA platform. The callers keep their DB reads and
 * notifications; the rules live here.
 *
 * The track has six on-track steps, 1..6, plus 0 meaning "off track". Two
 * things about that make it easy to get wrong:
 *
 *   - Stepping onto the track is not "0 becomes 1". A god's first
 *     advancement jumps straight to a step that depends on the player count
 *     (2p starts at 3, 3p at 2, 4p at 1), so a smaller game starts its gods
 *     further along. Only advancements from step 1 upward are plain +1.
 *
 *   - There are two different eligibility rules, and they differ on purpose.
 *     A general advancement (a reward, the no-injury bonus) can start a god
 *     from 0, so it asks only "is this god below the top?". An Oracle
 *     Consultation advancement cannot start a god, so it asks for a god
 *     already on the track: 0 < step < 6. Collapsing the two would silently
 *     change what an Oracle Consultation offers.
 */
class GodAdvancement
{
    /** Topmost step of the God Track. Steps run 1..6, with 0 = off track. */
    public const MAX_STEP = 6;

    /** Where a god lands on its first advancement, if the count is unknown. */
    public const DEFAULT_START_STEP = 1;

    /** A god at step 0 has not yet stepped onto the track. */
    public static function isOnTrack(int $step): bool
    {
        return $step > 0;
    }

    /** True while the god still has somewhere to go. */
    public static function canAdvance(int $step): bool
    {
        return $step < self::MAX_STEP;
    }

    /**
     * Where a god's FIRST advancement lands it. Fewer players start further
     * up the track (2p => 3, 3p => 2, 4p => 1).
     */
    public static function startingStep(int $playerCount): int
    {
        return MaterialDefs::PLAYER_COUNT_STEP[$playerCount] ?? self::DEFAULT_START_STEP;
    }

    /**
     * The step a god moves to when advanced once: off the track it jumps to
     * the player-count start, at the top it stays put, otherwise +1.
     */
    public static function nextStep(int $currentStep, int $playerCount): int
    {
        if ($currentStep >= self::MAX_STEP) return $currentStep;
        if ($currentStep === 0) return self::startingStep($playerCount);
        return $currentStep + 1;
    }

    /** How many steps short of the top this god is. */
    public static function stepsNeededToTop(int $step): int
    {
        return max(0, self::MAX_STEP - $step);
    }

    /**
     * Oracle Consultation eligibility: the god must already be on the track
     * and not yet at the top. This is deliberately stricter than
     * canAdvance() -- a consultation advances a god, it never starts one.
     */
    public static function isOracleConsultEligible(int $step): bool
    {
        return self::isOnTrack($step) && self::canAdvance($step);
    }

    /**
     * The gods a player may advance from another player's Oracle
     * Consultation: one whose colour matches a die in the source player's
     * pool, and which is already on the track but below the top.
     *
     * Iterates colours then gods, matching the order the DB-backed original
     * produced.
     *
     * @param list<string> $sourceColors die colours in the source pool
     * @param array<string,int> $stepByGod god name => current track step
     * @return list<array{god_name:string,color:string,current_step:int}>
     */
    public static function eligibleGodsForOracleConsult(array $sourceColors, array $stepByGod): array
    {
        $eligible = [];
        foreach (array_unique($sourceColors) as $color) {
            foreach (MaterialDefs::GODS as $godName => $god) {
                if ($god['color'] !== $color) continue;
                $step = $stepByGod[$godName] ?? 0;
                if (self::isOracleConsultEligible($step)) {
                    $eligible[] = [
                        'god_name' => $godName,
                        'color' => $color,
                        'current_step' => $step,
                    ];
                }
            }
        }
        return $eligible;
    }
}
