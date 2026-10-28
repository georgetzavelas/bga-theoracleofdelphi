<?php
/**
 * Regression lint: in Ship Tile draft mode, a tile that asks for a choice
 * (Quartermaster's Equipment card, Head Start's Zeus tile) is resolved right
 * after the pick, before the next player drafts.
 *
 * Previously both choices waited for RoundStart's pre-round-1 detours, after
 * the whole draft, injuries and dice. A Quartermaster drafter got the Oracle
 * card at pick time but no Equipment prompt until much later.
 *
 *   1. actDraftTile asks Game::pendingShipTileChoice before handing the draft
 *      on, and returns the choice state with the drafter still active.
 *   2. Both choice states leave through Game::stateAfterShipTileChoice, which
 *      continues the draft in draft mode and returns to RoundStart otherwise.
 *   3. RoundStart (random mode) uses the same pendingShipTileChoice check, so
 *      the two modes cannot disagree on what is pending.
 *
 * Run: php tests/test_draft_ship_tile_choice.php
 */

$root = $argv[1] ?? (__DIR__ . '/..');
$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}

function stripComments(string $src): string {
    return preg_replace('!//[^\n]*!', '', preg_replace('!/\*.*?\*/!s', '', $src));
}

/** Extract a method body by brace matching, comments removed. */
function methodBody(string $src, string $name): string {
    $src = stripComments($src);
    $at = strpos($src, "function $name(");
    if ($at === false) return '';
    $open = strpos($src, '{', $at);
    if ($open === false) return '';
    $depth = 0;
    for ($i = $open, $n = strlen($src); $i < $n; $i++) {
        if ($src[$i] === '{') $depth++;
        if ($src[$i] === '}' && --$depth === 0) return substr($src, $open, $i - $open + 1);
    }
    return '';
}

$gameSrc    = file_get_contents("$root/modules/php/Game.php");
$draftSrc   = file_get_contents("$root/modules/php/States/DraftShipTile.php");
$equipSrc   = file_get_contents("$root/modules/php/States/SelectStartingEquipment.php");
$discardSrc = file_get_contents("$root/modules/php/States/DiscardZeusTile.php");
$roundSrc   = file_get_contents("$root/modules/php/States/RoundStart.php");

// ---------------------------------------------------------------------------
// 1. The pick asks for the choice before the next drafter.
// ---------------------------------------------------------------------------
$pick = methodBody($draftSrc, 'actDraftTile');
$assignAt = strpos($pick, 'assignDraftedShipTile(');
$choiceAt = strpos($pick, 'pendingShipTileChoice($activePlayerId)');
$nextAt   = strpos($pick, 'continueDraft(');
check($choiceAt !== false, 'actDraftTile checks pendingShipTileChoice for the drafter');
check($assignAt !== false && $choiceAt !== false && $assignAt < $choiceAt,
      'the check runs after the tile is assigned (which sets the pending flag)');
check($choiceAt !== false && $nextAt !== false && $choiceAt < $nextAt,
      'the choice comes before the draft moves to the next player');
check(preg_match('/if\s*\(\s*\$choice\s*!==\s*null\s*\)\s*\{\s*return\s+\$choice;/', $pick) === 1,
      'a pending choice is returned without changing the active player');

$continue = methodBody($draftSrc, 'continueDraft');
check(str_contains($draftSrc, 'public static function continueDraft(Game $game): string'),
      'continueDraft is public static so the choice states can reach it');
check(str_contains($continue, 'nextShipTileDrafter()')
      && str_contains($continue, 'changeActivePlayer($next)')
      && str_contains($continue, 'return DraftShipTile::class'),
      'continueDraft activates the next drafter');
check(str_contains($continue, 'finishDraft()'), 'continueDraft ends the draft through finishDraft');

// ---------------------------------------------------------------------------
// 2. pendingShipTileChoice covers both tiles.
// ---------------------------------------------------------------------------
$pending = methodBody($gameSrc, 'pendingShipTileChoice');
check(str_contains($pending, "'starting_equipment'")
      && str_contains($pending, "'pending_starting_equipment_'")
      && str_contains($pending, 'return SelectStartingEquipment::class'),
      'Quartermaster with the pending flag goes to SelectStartingEquipment');
check(str_contains($pending, "'fewer_tasks'")
      && str_contains($pending, 'is_completed = 0')
      && preg_match('/\$activeCount\s*>\s*11\)\s*return DiscardZeusTile::class/', $pending) === 1,
      'Head Start with all 12 Zeus tiles active goes to DiscardZeusTile');

$after = methodBody($gameSrc, 'stateAfterShipTileChoice');
check(preg_match('/isDraftMode\(\)\s*\?\s*DraftShipTile::continueDraft\(\$this\)\s*:\s*RoundStart::class/', $after) === 1,
      'stateAfterShipTileChoice continues the draft in draft mode, RoundStart otherwise');

// ---------------------------------------------------------------------------
// 3. Both choice states leave through the shared exit, never RoundStart.
// ---------------------------------------------------------------------------
foreach ([
    ['SelectStartingEquipment', $equipSrc, 'actSelectEquipment'],
    ['SelectStartingEquipment', $equipSrc, 'zombie'],
    ['DiscardZeusTile', $discardSrc, 'actDiscardTile'],
    ['DiscardZeusTile', $discardSrc, 'zombie'],
] as [$state, $src, $method]) {
    $body = methodBody($src, $method);
    check($body !== '', "$state::$method() is extractable");
    check(!preg_match('/return\s+RoundStart::class/', $body),
          "$state::$method() does not return RoundStart directly (would skip the rest of the draft)");
    check(str_contains($body, 'stateAfterShipTileChoice()'),
          "$state::$method() leaves through stateAfterShipTileChoice");
}

// ---------------------------------------------------------------------------
// 4. Random mode's RoundStart uses the same check.
// ---------------------------------------------------------------------------
$round = methodBody($roundSrc, 'onEnteringState');
check(str_contains($round, 'pendingShipTileChoice($playerId)'),
      'RoundStart detours through pendingShipTileChoice');
check(!str_contains($roundSrc, 'findPendingStartingEquipmentPlayer')
      && !str_contains($roundSrc, 'findPendingFewerTasksPlayer'),
      'the old per-tile RoundStart finders are gone (one definition of "pending")');

echo "\n$passed passed, $failed failed\n";
exit($failed ? 1 : 0);
