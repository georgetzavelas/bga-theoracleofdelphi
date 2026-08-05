<?php
/**
 * Regression test: Game::getActionColor() must return null — not build SQL —
 * when no action source is selected.
 *
 * Live crash from a real game (GS1 05/08 03:39:02):
 *
 *   SELECT color FROM oracle_die WHERE player_id = 2414022 AND die_index =
 *   You have an error in your SQL syntax ... near '' at line 1
 *
 * `selected_die_index` was null and got interpolated straight into the query.
 * The trigger was making the Amulets (004/005/006) accept a played Oracle Card:
 * computeActivatableEquipment now calls getActionColor() unconditionally, and it
 * runs on EVERY PlayerActions (hub) render — where no die is selected. The
 * previous code only queried when the index was non-null, so the latent hole in
 * getActionColor was unreachable. Reloading into the hub took the request down.
 *
 * Behavioural, not a grep: getActionColor's die branch is exercised through a
 * stub so the null path is actually executed. die_index 0 is a real die, so the
 * guard must test for null specifically, not falsiness — that is the assertion
 * most likely to regress if someone "simplifies" it to `if (!$dieIndex)`.
 *
 * Run: php tests/test_action_color_no_source.php
 */

$root = $argv[1] ?? (__DIR__ . '/..');
$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}

// ---------------------------------------------------------------------------
// Extract the real getActionColor body and run it against a stub whose DB
// accessor RECORDS queries and fails loudly on a malformed one — the same way
// MySQL did in production.
// ---------------------------------------------------------------------------
$src = file_get_contents("$root/modules/php/Game.php");
if (!preg_match('/public function getActionColor\(int \$playerId\): \?string\s*\{(.*?)\n    \}/s', $src, $m)) {
    echo "FAIL: could not extract getActionColor()\n\n0 passed, 1 failed\n";
    exit(1);
}
$body = $m[1];

eval('
class ColorProbe {
    public $globals;
    public array $queries = [];
    public function __construct(array $g) { $this->globals = new Globals($g); }
    public function getObjectFromDB(string $sql) {
        $this->queries[] = $sql;
        // Mirror MySQL: a comparison with nothing on the right is a syntax
        // error, not a miss. Anchored at end-of-string so a normal
        // "= 2414022" is untouched.
        if (preg_match("/=\s*$/", rtrim($sql))) {
            throw new RuntimeException("SQL syntax error near \x27\x27: " . trim($sql));
        }
        if (preg_match("/die_index = (\d+)/", $sql, $mm)) {
            return ($mm[1] === "1") ? ["color" => "green"] : null;
        }
        return null;
    }
    public function getActionColor(int $playerId): ?string {' . $body . '
    }
}
class Globals {
    private array $v;
    public function __construct(array $v) { $this->v = $v; }
    public function get(string $k) { return $this->v[$k] ?? null; }
}
');

/** @return array{0: ?string, 1: string} [result, error] */
function probe(array $globals): array {
    $p = new ColorProbe($globals);
    try {
        return [$p->getActionColor(2414022), ''];
    } catch (\Throwable $e) {
        return [null, $e->getMessage()];
    }
}

// 1. The exact production case: hub render, nothing selected.
[$res, $err] = probe(['selected_die_index' => null, 'selected_oracle_card_id' => 0]);
check($err === '', "no source selected must not build SQL (got: $err)");
check($res === null, 'no source selected returns null');

// 2. Empty-string index (globals round-tripping through JSON can yield '').
[$res, $err] = probe(['selected_die_index' => '', 'selected_oracle_card_id' => 0]);
check($err === '', "empty-string die index must not build SQL (got: $err)");
check($res === null, 'empty-string die index returns null');

// 3. die_index 0 is a REAL die and must still be queried. This is what breaks
//    if the guard is loosened to a falsiness check.
$p = new ColorProbe(['selected_die_index' => 0, 'selected_oracle_card_id' => 0]);
try {
    $p->getActionColor(2414022);
    $queried = (bool)preg_grep('/die_index = 0/', $p->queries);
} catch (\Throwable $e) {
    $queried = false;
}
check($queried, 'die_index 0 is still queried (guard tests null, not falsiness)');

// 4. A normal die still resolves.
[$res, $err] = probe(['selected_die_index' => 1, 'selected_oracle_card_id' => 0]);
check($err === '' && $res === 'green', 'a selected die resolves its colour');

// 5. A played oracle card short-circuits before the die branch entirely —
//    this is the path the Amulet ruling depends on.
$p = new ColorProbe([
    'selected_die_index' => null,
    'selected_oracle_card_id' => 77,
    'selected_oracle_card_color' => 'green',
]);
$res = $p->getActionColor(2414022);
check($res === 'green', 'a played oracle card returns its colour');
check($p->queries === [], 'the card path issues no die query');

// 6. Bonus action wins outright.
[$res, $err] = probe([
    'bonus_action_color' => 'blue',
    'selected_die_index' => null,
    'selected_oracle_card_id' => 0,
]);
check($err === '' && $res === 'blue', 'a bonus action returns its colour');

// ---------------------------------------------------------------------------
// The hub caller must tolerate that null, since it renders on every turn.
// ---------------------------------------------------------------------------
$compute = '';
if (preg_match('/public function computeActivatableEquipment.*?\n    \}/s', $src, $m)) {
    $compute = $m[0];
}
check($compute !== '', 'computeActivatableEquipment() is extractable');
check(str_contains($compute, '$actionColor !== null'),
      'the amulet arm explicitly requires a non-null action colour, so the hub '
      . 'render (nothing selected) lights up no amulet');

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
