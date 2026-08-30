<?php
/**
 * After reaching Zeus, leftover dice and top-row gods become Oracle cards.
 *
 * Rulebook p.11, "End of the Game", note 1:
 *
 *   "After reaching Zeus, unused Oracle Dice and Special Actions of Gods
 *    should be used to 'Draw 1 Oracle Card' (page 11, Action 'Draw 1 Oracle
 *    Card' and page 8, 'Gods') as Oracle Cards break the tie for first place."
 *
 * So this is the rulebook's instruction, not an optimisation invented here.
 * Both halves are legal by the same book:
 *
 *   - "Draw 1 Oracle Card" is listed under COLOUR-INDEPENDENT actions (p.11),
 *     so any leftover die qualifies whatever colour it rolled. Game's
 *     actDrawOracleCard has no preconditions, matching that.
 *   - A top-row god may be returned to the bottom of the track to draw a card
 *     instead of using its Special Action (p.8).
 *
 * Reaching Zeus already implies every Zeus tile is complete — MoveShip refuses
 * the destination otherwise — so membership in zeus_reachers is the whole
 * condition, and nothing else a die could buy can change the player's result.
 *
 * Source lint: Game extends \Bga\GameFramework\Table and cannot be
 * instantiated off-platform. Same reasoning as test_recolor_cancel_refund.php.
 *
 * Run: php tests/test_zeus_tiebreak_cards.php
 */

$root = dirname(__DIR__);
$pass = 0; $fail = 0;
function check(bool $c, string $m): void {
    global $pass, $fail;
    if ($c) { $pass++; } else { $fail++; echo "  FAIL: $m\n"; }
}
function body(string $file, string $sig): string {
    $src = file_get_contents($file);
    $at = strpos($src, $sig);
    if ($at === false) return '';
    $open = strpos($src, '{', $at);
    if ($open === false) return '';
    $depth = 0;
    for ($i = $open, $n = strlen($src); $i < $n; $i++) {
        if ($src[$i] === '{') $depth++;
        elseif ($src[$i] === '}' && --$depth === 0) return substr($src, $at, $i - $at + 1);
    }
    return '';
}

$game = "$root/modules/php/Game.php";

// =========================================================================
// 1. The conversion itself
// =========================================================================
echo "=== convertRemainingSourcesToOracleCards ===\n";
$fn = body($game, 'public function convertRemainingSourcesToOracleCards(int $playerId): array');
check($fn !== '', 'convertRemainingSourcesToOracleCards found');

// Gated on having reached Zeus, and on nothing else: being on Zeus already
// implies every tile is done.
check(str_contains($fn, "globals->get('zeus_reachers')") && str_contains($fn, 'in_array'),
      'gated on this player being in zeus_reachers');
check(preg_match('/if\s*\(!in_array\(\$playerId, \$reachers, true\)\)/', $fn) === 1,
      'and returns empty-handed for anyone who has not reached Zeus');

// Dice: every UNUSED one, regardless of colour ("Draw 1 Oracle Card" is a
// colour-independent action).
check(str_contains($fn, "WHERE player_id = \$playerId AND is_used = 0"),
      'takes every unused die');
check(!preg_match('/oracle_die[\s\S]{0,200}?color\s*=/', $fn),
      'and does NOT filter dice by colour — the draw action is colour-independent');

// Gods: top row only. That also honours p.11's second note, that a god which
// only reaches the top AFTER the last turn cannot be used: it is not on the
// top row at the moment this runs.
check(preg_match('/player_god[\s\S]{0,120}?track_step = 6/', $fn) === 1,
      'takes only TOP-ROW gods (track_step 6, as assertGodAtTopRow uses)');
check(str_contains($fn, 'resetGod('),
      'and returns each traded god to the bottom of the track');

// Draw BEFORE consuming: on an exhausted deck there is nothing to gain, and
// spending a god anyway would be a pure loss.
$firstDraw = strpos($fn, 'drawOneOracleCardInline');
$firstSpend = strpos($fn, 'UPDATE oracle_die SET is_used = 1');
check($firstDraw !== false && $firstSpend !== false && $firstDraw < $firstSpend,
      'draws before marking a die used, so an empty deck costs nothing');
$godDraw = strpos($fn, 'drawOneOracleCardInline', $firstSpend);
$godReset = strpos($fn, 'resetGod(');
check($godDraw !== false && $godReset !== false && $godDraw < $godReset,
      'and draws before resetting a god, for the same reason');
check(preg_match('/drawOneOracleCardInline\([^)]*\) === null\)\s*\{?\s*(return|break)/', $fn) === 1,
      'an exhausted deck stops the conversion rather than burning sources');

// Per-source log lines are suppressed; one summary covers the lot.
check(substr_count($fn, "drawOneOracleCardInline(\$playerId, '')") === 2,
      'both draws suppress their own public log line');

// =========================================================================
// 2. Where it runs
// =========================================================================
echo "=== placement ===\n";
$consult = file_get_contents("$root/modules/php/States/ConsultOracle.php");
check(str_contains($consult, 'convertRemainingSourcesToOracleCards'),
      'called from ConsultOracle, the canonical turn-end boundary');
// ConsultOracle is reached from actEndTurn AND from zombie(), so a player who
// times out on the turn they reached Zeus still gets their tie-break cards.
$actEndTurn = body("$root/modules/php/States/PlayerActions.php",
                   'public function actEndTurn(int $activePlayerId)');
check(!str_contains($actEndTurn, 'convertRemainingSourcesToOracleCards'),
      'NOT in actEndTurn, which a timed-out player never reaches');
// Must precede the re-roll, which resets is_used on every die and would
// otherwise erase the very thing being counted.
$convertAt = strpos($consult, 'convertRemainingSourcesToOracleCards');
$rerollAt  = strpos($consult, "UPDATE oracle_die SET color =");
check($convertAt !== false && $rerollAt !== false && $convertAt < $rerollAt,
      'and runs BEFORE the dice re-roll that clears is_used');
check(str_contains($consult, 'zeusTieBreakCards'),
      'a summary notification reports the draw to everyone');

// =========================================================================
// 3. The client stops warning that the dice are wasted
// =========================================================================
echo "=== client ===\n";
$playerActions = file_get_contents("$root/modules/php/States/PlayerActions.php");
check(str_contains($playerActions, "'endTurnDrawsCards'"),
      'the hub tells the client when leftover dice will become cards');
check(str_contains($playerActions, "zeus_reachers"),
      'derived from the same zeus_reachers condition as the server-side rule');
$js = file_get_contents("$root/theoracleofdelphi.js");
$onEndTurn = (function (string $js): string {
    $at = strpos($js, 'onEndTurn: function');
    $end = strpos($js, "\n        },", $at);
    return substr($js, $at, $end - $at);
})($js);
// Telling a Zeus-reacher their dice will be wasted is the opposite of true.
check(str_contains($onEndTurn, 'drawsCardsInstead'),
      'onEndTurn takes the flag');
check(preg_match('/if\s*\(n <= 0 \|\| drawsCardsInstead\)/', $onEndTurn) === 1,
      'and skips the "will be wasted" confirmation when it is set');

echo "\n";
if ($fail > 0) { echo "$pass passed, $fail failed\n"; exit(1); }
echo "OK: $pass passed, 0 failed\n";
