<?php
/**
 * Game board setup option (gameoptions.json id 101): the aspect ratio board
 * generation aims for.
 *
 * The property that matters most is the FIRST one below. The aspect target is an
 * input to generation, so making it configurable risks changing what every
 * already-recorded seed reproduces. The default must therefore leave existing
 * boards byte-identical, and only an explicit Compact choice may differ.
 *
 * Run: php tests/test_board_aspect.php
 */

require_once(__DIR__ . '/../modules/php/BoardGenerator.php');
require_once(__DIR__ . '/../modules/php/SeededRandom.php');

$pass = 0;
$fail = 0;

function check(bool $cond, string $msg): void {
    global $pass, $fail;
    if ($cond) { $pass++; } else { echo "  FAIL: $msg\n"; $fail++; }
}

/**
 * Identity of a generated board: every hex, plus every cluster placement with
 * its anchor and rotation. Two boards with the same fingerprint are the same
 * board.
 */
function fingerprint(array $res): string {
    $h = [];
    foreach ($res['hexes'] as $x) {
        $h[] = $x['q'] . ',' . $x['r'] . ':' . $x['type'] . ':' . ($x['color'] ?? '-');
    }
    sort($h);
    $c = [];
    foreach ($res['clusters'] as $p) {
        $c[] = $p['cluster']['id'] . '@' . $p['anchorQ'] . ',' . $p['anchorR'] . 'r' . $p['rotation'];
    }
    sort($c);
    return md5(implode('|', $h) . '#' . implode('|', $c));
}

function build(int $seed, ?float $aspect = null): array {
    $opts = ['randFn' => [new SeededRandom($seed), 'rand']];
    if ($aspect !== null) $opts['targetAspectRatio'] = $aspect;
    return (new BoardGenerator($opts))->generate();
}

/** Rendered bounding box, in the same units BoardRenderer uses. */
function extent(array $res): array {
    $HW = 60.0; $HH = 69.0;
    $minX = INF; $maxX = -INF; $minY = INF; $maxY = -INF;
    foreach ($res['hexes'] as $x) {
        $px = $HW * ($x['q'] + $x['r'] * 0.5);
        $py = $HH * 0.75 * $x['r'];
        $minX = min($minX, $px); $maxX = max($maxX, $px + $HW);
        $minY = min($minY, $py); $maxY = max($maxY, $py + $HH);
    }
    $w = $maxX - $minX; $h = $maxY - $minY;
    return ['w' => $w, 'h' => $h, 'aspect' => $w / $h];
}

// ---- the presets ----------------------------------------------------------
check(BoardGenerator::ASPECT_SPACIOUS === 1.5, 'spacious is 1.5');
check(BoardGenerator::ASPECT_COMPACT === 1.0, 'compact is 1.0');

// ---- the default must be spacious, and must not be merely "some default" ---
// Omitting the option has to behave exactly like asking for spacious, or the
// option's own default in gameoptions.json would disagree with the code.
$SEEDS = [4001, 4002, 4003, 4004, 4005, 4006, 4007, 4008];
$defaultMatchesSpacious = 0;
foreach ($SEEDS as $s) {
    if (fingerprint(build($s)) === fingerprint(build($s, BoardGenerator::ASPECT_SPACIOUS))) {
        $defaultMatchesSpacious++;
    }
}
check($defaultMatchesSpacious === count($SEEDS),
    "omitting the aspect equals asking for spacious ($defaultMatchesSpacious/"
    . count($SEEDS) . ')');

// ---- compact must actually produce a DIFFERENT board ----------------------
// Without this the check above could pass on a generator that ignores the
// option entirely.
$compactDiffers = 0;
foreach ($SEEDS as $s) {
    if (fingerprint(build($s)) !== fingerprint(build($s, BoardGenerator::ASPECT_COMPACT))) {
        $compactDiffers++;
    }
}
check($compactDiffers === count($SEEDS),
    "compact reshapes the board for every seed ($compactDiffers/" . count($SEEDS) . ')');

// ---- and it must reshape it in the RIGHT direction ------------------------
// Per-seed noise is real, so this is asserted on the aggregate: spacious lands
// wider than tall, compact close to square. Measured over 600 seeds the means
// are 1.40 and 0.99.
$sumSpacious = 0.0; $sumCompact = 0.0;
$compactNarrower = 0; $compactTaller = 0;
foreach ($SEEDS as $s) {
    $sp = extent(build($s, BoardGenerator::ASPECT_SPACIOUS));
    $cp = extent(build($s, BoardGenerator::ASPECT_COMPACT));
    $sumSpacious += $sp['aspect'];
    $sumCompact += $cp['aspect'];
    if ($cp['w'] < $sp['w']) $compactNarrower++;
    if ($cp['h'] > $sp['h']) $compactTaller++;
}
$meanSpacious = $sumSpacious / count($SEEDS);
$meanCompact = $sumCompact / count($SEEDS);
check($meanSpacious > 1.2,
    sprintf('spacious averages wider than tall (%.2f)', $meanSpacious));
check($meanCompact < 1.15,
    sprintf('compact averages near square (%.2f)', $meanCompact));
check($meanCompact < $meanSpacious,
    sprintf('compact is squarer than spacious (%.2f vs %.2f)', $meanCompact, $meanSpacious));
// The trade-off G accepted, pinned so it cannot silently stop being true: the
// 120-hex area is fixed, so compact buys width by spending height.
check($compactNarrower >= count($SEEDS) - 2,
    "compact is narrower for most seeds ($compactNarrower/" . count($SEEDS) . ')');
check($compactTaller >= count($SEEDS) - 2,
    "and taller for most seeds ($compactTaller/" . count($SEEDS) . ')');

// ---- both targets must generate valid boards -----------------------------
// A target the generator cannot satisfy would fail at table creation, which is
// the worst possible place to find out.
foreach ([['spacious', BoardGenerator::ASPECT_SPACIOUS],
          ['compact', BoardGenerator::ASPECT_COMPACT]] as [$label, $aspect]) {
    $valid = 0; $hexes = [];
    foreach (range(4100, 4119) as $s) {
        $r = build($s, $aspect);
        if (!empty($r['valid'])) $valid++;
        $hexes[count($r['hexes'])] = true;
    }
    check($valid === 20, "$label generates 20/20 valid boards (got $valid)");
    check(array_keys($hexes) === [120], "$label always places all 120 hexes");
}

// ---- the aspect bias can still be switched off ---------------------------
// 'landscapeBias' is the historical option name and predates the target being
// configurable, so callers passing it must keep working.
$noBias = (new BoardGenerator([
    'randFn' => [new SeededRandom(4200), 'rand'], 'landscapeBias' => false,
]))->generate();
check(!empty($noBias['valid']), 'the legacy landscapeBias=false still generates');
$withBias = build(4200);
check(fingerprint($noBias) !== fingerprint($withBias),
    'and switching the bias off changes the board, so the flag is still wired');
$noBiasNew = (new BoardGenerator([
    'randFn' => [new SeededRandom(4200), 'rand'], 'aspectBias' => false,
]))->generate();
check(fingerprint($noBias) === fingerprint($noBiasNew),
    'the new aspectBias name is equivalent to the old landscapeBias');

// ---- the stat encoding round-trips --------------------------------------
// Game.php stores the aspect as an int (x100) because game state values are
// ints, and regenerate_board.php reads it back.
foreach ([BoardGenerator::ASPECT_SPACIOUS, BoardGenerator::ASPECT_COMPACT] as $a) {
    $stored = (int)round($a * 100);
    check((float)$stored / 100.0 === (float)$a,
        "aspect $a survives the x100 int round-trip as $stored");
}
check((int)round(BoardGenerator::ASPECT_SPACIOUS * 100) === 150, 'spacious stores as 150');
check((int)round(BoardGenerator::ASPECT_COMPACT * 100) === 100, 'compact stores as 100');

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);
