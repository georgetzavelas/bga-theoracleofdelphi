<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi;

/**
 * Pure serialization contract for the undo buffer. No DB access, no framework
 * dependency, so it is unit-testable with the standalone smoke-test harness.
 * The Game class reads/writes rows; this class only turns the resulting
 * associative array into JSON and back.
 */
final class UndoState
{
    public static function encode(array $state): string
    {
        return json_encode([
            'tables'  => $state['tables']  ?? [],
            'globals' => $state['globals'] ?? [],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /** @return array{tables: array, globals: array} */
    public static function decode(string $json): array
    {
        $decoded = json_decode($json, true);
        if (!is_array($decoded)) {
            return ['tables' => [], 'globals' => []];
        }
        return [
            'tables'  => $decoded['tables']  ?? [],
            'globals' => $decoded['globals'] ?? [],
        ];
    }
}
