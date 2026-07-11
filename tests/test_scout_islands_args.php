<?php
/**
 * Privacy regression test for Island Scout (Equipment 013).
 *
 * BGA broadcasts a state's getArgs() output to ALL clients, so the
 * phase-2 (preview) args of ScoutIslands must never carry the scouted
 * shrine contents (shrine_owner_color / shrine_letter). Those reach the
 * acting player privately via notify->player(islandsPeeked) and, on
 * reload, via the per-player myPeekedHexes field in Game::getAllDatas().
 *
 * The pure shaping of the public args lives in
 * ScoutIslands::previewArgsFromPeekedHexes(); this test exercises it
 * directly. ScoutIslands extends a BGA framework base class that isn't
 * available outside the platform, so — mirroring the define()-stub trick
 * the JS tests use — we declare a minimal stub parent before loading the
 * state file (a static call never runs the constructor, so nothing else
 * in the framework is needed).
 *
 * Run: php tests/test_scout_islands_args.php
 */

namespace Bga\GameFramework\States {
    // Minimal stub so ScoutIslands (which `extends GameState`) is
    // declarable without the BGA platform present.
    if (!class_exists(GameState::class)) {
        class GameState {}
    }
}

namespace {
    require_once __DIR__ . '/../modules/php/States/ScoutIslands.php';

    use Bga\Games\theoracleofdelphi\States\ScoutIslands;

    $passed = 0;
    $failed = 0;
    function check(bool $c, string $m): void {
        global $passed, $failed;
        if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
    }

    /** Recursively collect every array key present anywhere in $v. */
    function all_keys($v): array {
        $keys = [];
        if (is_array($v)) {
            foreach ($v as $k => $child) {
                if (is_string($k)) { $keys[] = $k; }
                $keys = array_merge($keys, all_keys($child));
            }
        }
        return $keys;
    }

    check(
        method_exists(ScoutIslands::class, 'previewArgsFromPeekedHexes'),
        'ScoutIslands exposes previewArgsFromPeekedHexes() for testable arg shaping'
    );

    // Fixture as stored in the peek_hexes global: full private contents,
    // exactly what actConfirmPeek() records. The public args must strip
    // everything but the coordinates.
    $peekedHexes = [
        ['q' => 1, 'r' => -2, 'shrine_owner_color' => 'red',  'shrine_letter' => 'psi',   'color' => 'ffffff'],
        ['q' => 0, 'r' => 3,  'shrine_owner_color' => 'blue', 'shrine_letter' => 'omega', 'color' => '000000'],
    ];

    $args = ScoutIslands::previewArgsFromPeekedHexes($peekedHexes);

    $keys = all_keys($args);
    check(!in_array('shrine_owner_color', $keys, true),
        'preview args must NOT leak shrine_owner_color to all clients');
    check(!in_array('shrine_letter', $keys, true),
        'preview args must NOT leak shrine_letter to all clients');
    check(!in_array('color', $keys, true),
        'preview args must NOT leak the raw shrine color to all clients');

    check(($args['phase'] ?? null) === 'preview', 'phase is "preview"');
    check(($args['peekCount'] ?? null) === 2, 'peekCount reflects the number of scouted islands');

    $coords = $args['peekedCoords'] ?? null;
    check(is_array($coords) && count($coords) === 2, 'peekedCoords carries both scouted hexes');
    if (is_array($coords)) {
        $shapeOk = true;
        foreach ($coords as $c) {
            // Coords are public (the tile pickup is visible in physical
            // play); only the contents underneath are secret. Each entry
            // must be exactly {q, r} and nothing more.
            if (array_keys($c) !== ['q', 'r']) { $shapeOk = false; }
            if (!is_int($c['q'] ?? null) || !is_int($c['r'] ?? null)) { $shapeOk = false; }
        }
        check($shapeOk, 'each peekedCoords entry is exactly {q:int, r:int}');
        check(($coords[0] === ['q' => 1, 'r' => -2]) && ($coords[1] === ['q' => 0, 'r' => 3]),
            'coordinates are preserved in order');
    }

    // Empty input (defensive: never seen in practice, but the decode of a
    // missing global yields []) must not crash and must report zero.
    $emptyArgs = ScoutIslands::previewArgsFromPeekedHexes([]);
    check(($emptyArgs['peekCount'] ?? null) === 0 && ($emptyArgs['peekedCoords'] ?? null) === [],
        'empty peek set yields peekCount 0 and no coords');

    echo "\n$passed passed, $failed failed\n";
    exit($failed === 0 ? 0 : 1);
}
