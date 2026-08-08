<?php

declare(strict_types=1);

namespace Bga\Games\theoracleofdelphi;

/**
 * Pure monster-combat maths, lifted out of the combat states so it can be
 * exercised without the BGA platform. The states keep the DB reads, the
 * notifications and the die roll itself; the rules live here.
 *
 * A combat round:
 *   1. Strength starts at 9 - shield (FightMonsterStart).
 *   2. The player rolls the battle die, a d10 numbered 0-9 (CombatRound).
 *   3. roll >= strength wins. Otherwise the round is lost, and a roll of 0
 *      also draws an injury of the monster's colour (CombatResult).
 *   4. On a loss the player may pay 1 Favor to drop strength by 1 and roll
 *      again, or surrender (CombatDefeat).
 */
class CombatRules
{
    /** The battle die is a d10 with faces 0-9. */
    public const DIE_MIN = 0;
    public const DIE_MAX = 9;

    /**
     * Strength against an unshielded player. It equals the highest die face
     * on purpose: with no shield, only the single best roll wins.
     */
    public const BASE_STRENGTH = 9;

    public const OUTCOME_VICTORY = 'victory';
    public const OUTCOME_INJURY = 'injury';
    public const OUTCOME_DEFEAT = 'defeat';

    /** Opening strength for a player carrying $shield shields. */
    public static function startingStrength(int $shield): int
    {
        return max(0, self::BASE_STRENGTH - $shield);
    }

    /** Paying 1 Favor drops the monster's strength by 1, never below 0. */
    public static function afterPayingFavor(int $strength): int
    {
        return max(0, $strength - 1);
    }

    /** Continuing a lost round costs 1 Favor, so it needs at least 1. */
    public static function canPayFavor(int $favor): bool
    {
        return $favor >= 1;
    }

    /** The round is won when the roll meets or beats the strength. */
    public static function isVictory(int $roll, int $strength): bool
    {
        return $roll >= $strength;
    }

    /**
     * A rolled 0 draws an injury -- but only when the 0 actually lost.
     *
     * The order matters and is easy to get backwards. Once favor payments
     * have ground strength down to 0, a roll of 0 meets it and WINS, and the
     * player must not also be handed an injury for the roll that beat the
     * monster. CombatResult checks victory first for exactly this reason.
     */
    public static function drawsInjury(int $roll, int $strength): bool
    {
        return !self::isVictory($roll, $strength) && $roll === 0;
    }

    /** The whole round resolved in one call. */
    public static function outcome(int $roll, int $strength): string
    {
        if (self::isVictory($roll, $strength)) return self::OUTCOME_VICTORY;
        if (self::drawsInjury($roll, $strength)) return self::OUTCOME_INJURY;
        return self::OUTCOME_DEFEAT;
    }

    /**
     * Which die faces beat the given strength. Used to state the odds a
     * player is actually being offered: 10 - strength faces in 10.
     *
     * @return list<int>
     */
    public static function winningRolls(int $strength): array
    {
        if ($strength > self::DIE_MAX) return [];
        return range(max(self::DIE_MIN, $strength), self::DIE_MAX);
    }
}
