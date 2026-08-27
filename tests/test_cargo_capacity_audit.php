<?php
/**
 * Audit: cargo capacity is computed in exactly one place.
 *
 * Reported from a real game. A player with Hermes on the top row, two statues
 * aboard, three incomplete statue Zeus tiles and Reinforced Hull (equipment 16,
 * +1 permanent storage) sat beside a city and could not use Hermes.
 *
 * Game::playerHasCargoSpace computed capacity itself instead of calling
 * getCargoCapacity, and the two copies disagreed on one argument:
 *
 *     playerHasCargoSpace:  playerOwnsEquipment($playerId, 16)
 *     getCargoCapacity:     playerOwnsEquipment($playerId, 16, false)
 *
 * That third parameter is `bool $unusedOnly = true`. Reinforced Hull is a MIXED
 * card: a one-time +1 Shield that fires on receipt and marks the card
 * is_used = 1, plus a permanent +1 storage that must survive it. Defaulting
 * $unusedOnly to true meant the Hermes gate stopped counting the +1 the moment
 * the shield fired, so it saw capacity 2 against 2 statues aboard and refused
 * with "No cargo space available" — while the player's own panel, which counts
 * the card unconditionally, showed 3 slots with 2 used.
 *
 * This is an audit rather than a unit test because roughly all of Game.php
 * touches the database and cannot run outside the platform. Reading the source
 * is the only handle available, which is the same reasoning as
 * test_sql_interpolation_audit.php.
 *
 * The invariant: anything asking "how much can this ship hold?" goes through
 * getCargoCapacity. One deliberate exception is allowlisted below.
 *
 * Run: php tests/test_cargo_capacity_audit.php
 */

$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}

$root = dirname(__DIR__);
$game = file_get_contents($root . '/modules/php/Game.php');

/** Strip // and /* comments, so assertions read CODE and not prose about it. */
function codeOnly(string $src): string {
    $src = preg_replace('#/\*.*?\*/#s', '', $src);
    return preg_replace('#//[^\n]*#', '', $src);
}

/** Body of one method in Game.php, by name. */
function methodBody(string $src, string $name): ?string {
    $needle = "function $name(";
    $at = strpos($src, $needle);
    if ($at === false) return null;
    $brace = strpos($src, '{', $at);
    $depth = 0;
    for ($i = $brace; $i < strlen($src); $i++) {
        if ($src[$i] === '{') $depth++;
        elseif ($src[$i] === '}') {
            $depth--;
            if ($depth === 0) return substr($src, $brace, $i - $brace + 1);
        }
    }
    return null;
}

// ---- the canonical implementation ------------------------------------------
$capacity = methodBody($game, 'getCargoCapacity');
check($capacity !== null, 'Game::getCargoCapacity exists');
check($capacity && strpos($capacity, 'playerOwnsEquipment($playerId, 16, false)') !== false,
    'getCargoCapacity passes unusedOnly=false, so Reinforced Hull\'s permanent '
    . '+1 storage survives the card being marked is_used=1 by its one-time shield');

// ---- the method that got it wrong ------------------------------------------
$space = methodBody($game, 'playerHasCargoSpace');
check($space !== null, 'Game::playerHasCargoSpace exists');
check($space && strpos($space, 'getCargoCapacity(') !== false,
    'playerHasCargoSpace derives capacity from getCargoCapacity rather than '
    . 'recomputing it — the recomputation is what drifted and broke Hermes');
$spaceCode = $space === null ? '' : codeOnly($space);
check($space && strpos($spaceCode, 'SHIP_TILES') === false,
    'and does not read SHIP_TILES itself');
check($space && strpos($spaceCode, 'playerOwnsEquipment') === false,
    'and does not re-derive the Reinforced Hull bonus, which is the exact line '
    . 'that disagreed (comments naming it are fine — this reads code only)');

// ---- nobody else re-derives it ---------------------------------------------
// Allowlisted: the bulk player-panel builder adds the +1 while walking an
// already-fetched equipment array for every player at once. Routing it through
// getCargoCapacity would mean one query per player for a value it already has
// in hand. It is correct — it checks only that the card is held, with no
// is_used filter — and it is the readout that exposed the bug by disagreeing
// with the Hermes gate.
$ALLOW = ['getCargoCapacity', 'getAllDatas'];

$files = array_merge(
    [$root . '/modules/php/Game.php'],
    glob($root . '/modules/php/States/*.php')
);
$offenders = [];
foreach ($files as $f) {
    $src = file_get_contents($f);
    // Any site adding a bonus for equipment 16 outside the allowlist.
    if (!preg_match_all('/^.*\b(16)\b.*(\+= 1|\+ 1|storage).*$/m', $src, $m, PREG_OFFSET_CAPTURE)) {
        continue;
    }
    foreach ($m[0] as [$line, $off]) {
        if (strpos($line, '//') !== false && strpos(ltrim($line), '//') === 0) continue;
        if (strpos($line, 'card_idx') === false
            && strpos($line, 'playerOwnsEquipment') === false) continue;
        // Which method is this line inside?
        $before = substr($src, 0, $off);
        $inMethod = preg_match_all('/function (\w+)\s*\(/', $before, $fn) ? end($fn[1]) : '(top level)';
        if (in_array($inMethod, $ALLOW, true)) continue;
        $offenders[] = basename($f) . '::' . $inMethod;
    }
}
check(empty($offenders),
    'the Reinforced Hull storage bonus is applied only in getCargoCapacity and '
    . 'the allowlisted bulk panel builder'
    . ($offenders ? ' (found in: ' . implode(', ', array_unique($offenders)) . ')' : ''));

// ---- nobody re-derives CAPACITY, bonus or not ------------------------------
// The first version of this audit scanned for sites re-deriving the Reinforced
// Hull bonus, and missed the worst copy in the codebase: actGrabStatue read the
// ship tile's storage and never mentioned equipment 16 at all, so it was
// invisible to a scan looking for the bonus. It capped Hermes at the bare tile
// capacity and threw "No cargo space available" on the ACTION after the
// availability gate had already said yes.
//
// The rule that actually holds is about the computation, not the bonus: reading
// SHIP_TILES storage to decide how much a PLAYER can carry belongs in
// getCargoCapacity and nowhere else.
$CAP_ALLOW = [
    // The canonical implementation.
    'getCargoCapacity' => 'is the single source of truth',
    // Reports the TILE's own storage in the draft notification, before any
    // equipment exists. That is a property of the tile, not the player's
    // capacity, so the Hull correctly plays no part.
    'assignDraftedShipTile' => 'reports the tile\'s printed storage, not a capacity',
    // Bulk panel builder — see the note above.
    'getAllDatas' => 'bulk path over an already-fetched equipment array',
];
$capOffenders = [];
foreach ($files as $f) {
    $src = codeOnly(file_get_contents($f));
    if (!preg_match_all('/^.*SHIP_TILES\[.*storage.*$/m', $src, $m, PREG_OFFSET_CAPTURE)) {
        continue;
    }
    foreach ($m[0] as [$line, $off]) {
        $before = substr($src, 0, $off);
        $inMethod = preg_match_all('/function (\w+)\s*\(/', $before, $fn) ? end($fn[1]) : '(top level)';
        if (isset($CAP_ALLOW[$inMethod])) continue;
        $capOffenders[] = basename($f) . '::' . $inMethod;
    }
}
check(empty($capOffenders),
    'player cargo capacity is derived only in getCargoCapacity'
    . ($capOffenders ? ' (re-derived in: ' . implode(', ', array_unique($capOffenders)) . ')' : ''));

// The action path specifically, because this is where the second report landed:
// the availability gate said yes and then actGrabStatue threw.
$grab = file_get_contents($root . '/modules/php/States/UseGodAbility.php');
check(strpos(codeOnly($grab), 'getCargoCapacity(') !== false,
    'UseGodAbility asks getCargoCapacity rather than counting slots itself — '
    . 'an action that refuses what its own availability gate permitted is worse '
    . 'than either being wrong alone');

// ---- the callers that were affected ----------------------------------------
// Both Hermes gates. Ordinary loading already used getCargoCapacity, which is
// why this looked like a Hermes-only bug despite living in a shared helper.
check(substr_count($game, 'playerHasCargoSpace(') >= 2,
    'playerHasCargoSpace still backs the Hermes availability gates');

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
