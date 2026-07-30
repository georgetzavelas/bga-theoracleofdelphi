<?php
/**
 * regenerate_board.php — Reproduce a board from a seed.
 *
 * Usage:
 *   php tests/regenerate_board.php <seed> [aspect_x100]
 *
 * <seed> is either a decimal integer or an encoded form like 'v1-K7F3-9DR'.
 * Refuses on algorithm-version mismatch with current code.
 *
 * [aspect_x100] is the board_aspect_x100 table stat: 150 for Spacious (the
 * default, and what every game before the Game board setup option used) or 100
 * for Compact. The aspect is an INPUT to generation, so a seed reproduces a
 * different board under a different target. Games recorded before that stat
 * existed were all Spacious, so omitting it reproduces them correctly.
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

$aspectX100 = isset($argv[2])
    ? (int)$argv[2]
    : (int)round(BoardGenerator::ASPECT_SPACIOUS * 100);
$known = [
    (int)round(BoardGenerator::ASPECT_SPACIOUS * 100) => 'spacious',
    (int)round(BoardGenerator::ASPECT_COMPACT * 100) => 'compact',
];
if (!isset($known[$aspectX100])) {
    fwrite(STDERR, "ERROR: unknown aspect_x100 '$aspectX100'; expected one of "
                 . implode(', ', array_keys($known)) . ".\n");
    exit(4);
}
fwrite(STDERR, "Aspect target: " . ($aspectX100 / 100) . " ({$known[$aspectX100]})\n");

$rng = new SeededRandom($seed);
$generator = new BoardGenerator([
    'randFn' => [$rng, 'rand'],
    'targetAspectRatio' => $aspectX100 / 100,
]);
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
