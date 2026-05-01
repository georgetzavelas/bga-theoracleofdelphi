<?php
/**
 * regenerate_board.php — Reproduce a board from a seed.
 *
 * Usage:
 *   php tests/regenerate_board.php <seed>
 *
 * <seed> is either a decimal integer or an encoded form like 'v1-K7F3-9DR'.
 * Refuses on algorithm-version mismatch with current code.
 */

require_once(__DIR__ . '/../modules/php/SeededRandom.php');
require_once(__DIR__ . '/../modules/php/BoardSeed.php');
require_once(__DIR__ . '/../modules/php/BoardGenerator.php');

if ($argc < 2) {
    fwrite(STDERR, "Usage: php tests/regenerate_board.php <seed>\n");
    fwrite(STDERR, "  <seed> = decimal int or encoded form like 'v1-K7F3-9DR'\n");
    exit(1);
}

$input = $argv[1];

if (preg_match('/^v\d+/i', $input)) {
    $parsed = BoardSeed::decode($input);
    if ($parsed === null) {
        fwrite(STDERR, "ERROR: invalid encoded seed: $input\n");
        exit(2);
    }
    $seed = $parsed['seed'];
    $version = $parsed['version'];
} else {
    $seed = (int)$input;
    $version = BoardGenerator::ALGORITHM_VERSION;
}

if ($version !== BoardGenerator::ALGORITHM_VERSION) {
    fwrite(STDERR, "ERROR: seed is for algorithm v{$version}; current is v"
                 . BoardGenerator::ALGORITHM_VERSION . ".\n");
    fwrite(STDERR, "       Old seeds cannot be reproduced against the current algorithm.\n");
    exit(3);
}

$rng = new SeededRandom($seed);
$generator = new BoardGenerator(['randFn' => [$rng, 'rand']]);
$result = $generator->generate();

if (!$result['valid']) {
    fwrite(STDERR, "ERROR: generation failed for seed $seed after {$result['attempts']} attempts.\n");
    exit(4);
}

echo "Seed: $seed\n";
echo "Encoded: " . BoardSeed::encode($seed, $version) . "\n";
echo "Algorithm version: $version\n";
echo "Hexes: " . count($result['hexes']) . "\n";
echo "Cluster placements:\n";
foreach ($result['clusters'] as $i => $p) {
    printf("  [%2d] %-14s anchor=(%2d,%2d) rot=%d\n",
        $i, $p['cluster']['id'], $p['anchorQ'], $p['anchorR'], $p['rotation']);
}
$z = $result['zeusPosition'];
echo "Zeus: ({$z['q']}, {$z['r']})\n";
