<?php
/**
 * regenerate_board.php — Reproduce a board from a seed.
 *
 * Usage:
 *   php tests/regenerate_board.php <seed> [candidates] [aspect_x100]
 *
 * <seed> is either a decimal integer or an encoded form like 'v1-K7F3-9DR'.
 * Refuses on algorithm-version mismatch with current code.
 *
 * [candidates] is the board_candidates table stat: 1 for Spacious (the default,
 * and what every game before the Game board setup option used) or 8 for Compact,
 * where several boards are drawn from the one stream and the smallest kept. It is
 * an INPUT to generation, so the same seed yields a different board under a
 * different count.
 *
 * [aspect_x100] only matters for tables created during the single commit in which
 * Compact meant an aspect target of 1.0 rather than a selection. Pass 100 to
 * reproduce one of those; everything else used 150.
 */

require_once(__DIR__ . '/../modules/php/SeededRandom.php');
require_once(__DIR__ . '/../modules/php/BoardSeed.php');
require_once(__DIR__ . '/../modules/php/BoardGenerator.php');

if ($argc < 2) {
    fwrite(STDERR, "Usage: php tests/regenerate_board.php <seed> [aspect_x100]\n");
    fwrite(STDERR, "  <seed>        = decimal int or encoded form like 'v1-K7F3-9DR'\n");
    fwrite(STDERR, "  [aspect_x100] = 150 spacious (default) or 100 compact\n");
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

$candidates = isset($argv[2]) ? max(1, (int)$argv[2]) : 1;
$aspectX100 = isset($argv[3])
    ? (int)$argv[3]
    : (int)round(BoardGenerator::ASPECT_SPACIOUS * 100);

fwrite(STDERR, "Candidates: $candidates" . ($candidates > 1 ? ' (keep smallest)' : '')
             . ", aspect target " . ($aspectX100 / 100) . "\n");

$rng = new SeededRandom($seed);
$genOptions = ['randFn' => [$rng, 'rand'], 'targetAspectRatio' => $aspectX100 / 100];
$result = $candidates > 1
    ? BoardGenerator::generateMostCompact($candidates, $genOptions)
    : (new BoardGenerator($genOptions))->generate();

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
