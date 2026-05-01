<?php
/**
 * SeededRandom.php — Deterministic PRNG for reproducible board generation.
 *
 * Mulberry32 algorithm. Instance-scoped state — does NOT touch global mt_srand.
 * Used by BoardGenerator when a fixed seed is needed (debug, replay, tests).
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
        $t = (($t ^ ($t >> 15)) * ($t | 1)) & 0xFFFFFFFF;
        $t ^= ($t + (($t ^ ($t >> 7)) * ($t | 61))) & 0xFFFFFFFF;
        $t = ($t ^ ($t >> 14)) & 0xFFFFFFFF;
        return $min + ($t % ($max - $min + 1));
    }
}
