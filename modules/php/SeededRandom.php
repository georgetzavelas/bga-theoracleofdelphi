<?php
/**
 * SeededRandom.php — Deterministic PRNG for reproducible board generation.
 *
 * Mulberry32 algorithm. Instance-scoped state — does NOT touch global mt_srand.
 * Used by BoardGenerator when a fixed seed is needed (debug, replay, tests).
 *
 * Implementation note: PHP's int is platform-dependent (typically 64-bit) but
 * cannot hold the full 64-bit product of two 32-bit values without falling
 * back to float (53-bit mantissa = lossy). We use a 16-bit split multiplier
 * to keep all intermediates inside the safe integer range, ensuring identical
 * output across PHP versions and platforms.
 */

class SeededRandom
{
    private int $state;

    public function __construct(int $seed)
    {
        $this->state = $seed & 0xFFFFFFFF;
    }

    /**
     * Returns an int uniformly in [$min, $max] inclusive.
     */
    public function rand(int $min, int $max): int
    {
        $this->state = ($this->state + 0x6D2B79F5) & 0xFFFFFFFF;
        $t = $this->state;
        $t = self::imul32($t ^ ($t >> 15), $t | 1);
        $t ^= ($t + self::imul32($t ^ ($t >> 7), $t | 61)) & 0xFFFFFFFF;
        $t = ($t ^ ($t >> 14)) & 0xFFFFFFFF;
        return $min + ($t % ($max - $min + 1));
    }

    /**
     * 32-bit unsigned modular multiplication, exact across PHP versions.
     * Splits each operand into 16-bit halves so all intermediates stay
     * below 2^50 — well within PHP's safe-integer range on 64-bit systems.
     */
    private static function imul32(int $a, int $b): int
    {
        $a &= 0xFFFFFFFF;
        $b &= 0xFFFFFFFF;
        $aHi = ($a >> 16) & 0xFFFF;
        $aLo = $a & 0xFFFF;
        $bHi = ($b >> 16) & 0xFFFF;
        $bLo = $b & 0xFFFF;
        // (aHi*65536 + aLo) * (bHi*65536 + bLo) mod 2^32
        // = ((aHi*bLo + aLo*bHi) << 16 + aLo*bLo) mod 2^32
        // The aHi*bHi*2^32 term cancels under mod 2^32.
        $cross = (($aHi * $bLo + $aLo * $bHi) << 16) & 0xFFFFFFFF;
        $low = ($aLo * $bLo) & 0xFFFFFFFF;
        return ($cross + $low) & 0xFFFFFFFF;
    }
}
