<?php
/**
 * BoardSeed.php — Encode/decode between 32-bit board seeds and a human-friendly
 * Crockford base32 string of the form 'v{version}-XXXX-XXX'.
 *
 * Crockford alphabet (no I, L, O, U) prevents transcription confusion.
 * The decoder is permissive: case-insensitive, optional second dash.
 */

class BoardSeed
{
    private const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

    public static function encode(int $seed, int $version): string
    {
        $seed = $seed & 0xFFFFFFFF;
        $chars = '';
        for ($i = 0; $i < 7; $i++) {
            $chars .= self::ALPHABET[$seed & 0x1F];
            $seed >>= 5;
        }
        return "v{$version}-" . substr($chars, 0, 4) . '-' . substr($chars, 4);
    }

    /**
     * @return array{seed: int, version: int}|null  null on malformed input.
     */
    public static function decode(string $encoded): ?array
    {
        if (!preg_match('/^v(\d+)-?([0-9A-Z]{4})-?([0-9A-Z]{3})$/i', $encoded, $m)) {
            return null;
        }
        $version = (int)$m[1];
        $body = strtoupper($m[2] . $m[3]);
        $seed = 0;
        for ($i = 6; $i >= 0; $i--) {
            $idx = strpos(self::ALPHABET, $body[$i]);
            if ($idx === false) {
                return null;
            }
            $seed = ($seed << 5) | $idx;
        }
        return ['seed' => $seed, 'version' => $version];
    }
}
