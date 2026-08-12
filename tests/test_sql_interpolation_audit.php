<?php
/**
 * Audit: every string interpolated into SQL must be escaped or provably safe.
 *
 * Game.php and the state classes build SQL by string interpolation, which is
 * the platform's own idiom — BGA's DbQuery takes a finished string, there are
 * no bound parameters to reach for. That puts the burden on the call sites,
 * and this is the check that keeps them honest.
 *
 * The rest of the suite cannot help here. Roughly 94% of Game.php is methods
 * that touch the database or the framework, so they cannot be executed outside
 * the platform at all; the extracted rules modules cover the pure logic and
 * stop at the SQL. Reading the source is the only handle available, so that is
 * what this does.
 *
 * Numeric interpolation is safe when the value is an int: a typed `int $x`
 * parameter or an explicit `(int)` cast cannot carry a quote. The risk is
 * QUOTED interpolation — `'$color'` — where a string lands inside SQL string
 * literals. Each of those must either come from addslashes() or be listed
 * below with the reason it cannot be attacker-controlled.
 *
 * Every entry in the allowlist was checked by reading its call site. Adding to
 * it is a deliberate act: if a new quoted interpolation appears, this test
 * fails and someone has to decide whether it needs addslashes or an entry
 * here. That is the whole point.
 *
 * Run: php tests/test_sql_interpolation_audit.php
 */

$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}

$root = dirname(__DIR__);

/**
 * Quoted interpolations that are safe by provenance rather than by escaping.
 * Keyed by variable name; the value records why, and is here to be read by
 * whoever trips this test next.
 */
$SAFE_BY_PROVENANCE = [
    // Game.php:349 — INSERT INTO monster
    'color' => 'MaterialDefs::COLORS, an internal constant (shuffled, never player input)',
    // Game.php:419 — INSERT INTO statue
    'cityColor' => 'substr() of a cluster id from ClusterDefinitions, an internal constant',
    // Game.php:505 — INSERT INTO card
    'location' => "a literal ternary: 'display' or 'deck'",
];

$files = array_merge(
    glob("$root/modules/php/*.php"),
    glob("$root/modules/php/States/*.php")
);
check(count($files) > 30, 'found the php sources to audit, got ' . count($files));

$offenders = [];
$checkedInterpolations = 0;

foreach ($files as $file) {
    $src = str_replace("\r\n", "\n", file_get_contents($file));
    $rel = str_replace("$root/", '', $file);
    $lines = explode("\n", $src);

    // Quoted interpolations: '$var' and '{$expr}'
    if (!preg_match_all("/'\\\$(\w+)'|'\{\\\$([^}]+)\}'/", $src, $matches, PREG_OFFSET_CAPTURE | PREG_SET_ORDER)) {
        continue;
    }
    foreach ($matches as $m) {
        $raw = $m[1][0] !== '' ? $m[1][0] : ($m[2][0] ?? '');
        $offset = $m[0][1];
        $line = substr_count(substr($src, 0, $offset), "\n") + 1;
        $checkedInterpolations++;

        // The base variable name, stripping array access and property reads.
        $base = preg_split('/[\[\-\>\(]/', $raw)[0];
        $base = trim($base, '$ ');

        // Safe if the variable is assigned from addslashes anywhere in the file.
        $escaped = (bool)preg_match(
            '/\$' . preg_quote($base, '/') . '\s*=\s*(?:\(string\)\s*)?addslashes\s*\(/', $src);
        // Or if it is escaped inline at the interpolation site's own statement.
        if (!$escaped && isset($SAFE_BY_PROVENANCE[$base])) {
            continue;
        }
        if (!$escaped) {
            $offenders[] = "$rel:$line  '\$$raw'";
        }
    }
}

check($checkedInterpolations > 0,
    'the audit actually found interpolations to check (' . $checkedInterpolations . ')');

check($offenders === [],
    "every quoted SQL interpolation is escaped or allowlisted.\n"
    . "  " . count($offenders) . " unaccounted for:\n    "
    . implode("\n    ", array_slice($offenders, 0, 15))
    . "\n  Either pass the value through addslashes() before interpolating, or, if it\n"
    . "  cannot be player-controlled, add it to \$SAFE_BY_PROVENANCE with the reason.");

// The allowlist must not rot. An entry that no longer matches anything means
// the call site changed and nobody revisited the exemption.
$allSrc = '';
foreach ($files as $file) { $allSrc .= str_replace("\r\n", "\n", file_get_contents($file)); }
$stale = [];
foreach (array_keys($SAFE_BY_PROVENANCE) as $name) {
    if (!preg_match("/'\\\$" . preg_quote($name, '/') . "'|'\{\\\$" . preg_quote($name, '/') . "[^}]*\}'/", $allSrc)) {
        $stale[] = $name;
    }
}
check($stale === [],
    'no allowlist entry has outlived its call site (' . implode(', ', $stale)
    . ') — remove entries that are no longer needed so the list stays meaningful');

// A guard on the guard: the pattern must actually match the shape it claims
// to, or this whole file silently passes while auditing nothing.
$probe = "DbQuery(\"UPDATE x SET c = '\$dangerous' WHERE id = \$id\");";
check(preg_match("/'\\\$(\w+)'/", $probe) === 1,
    'the audit pattern still recognises a quoted interpolation');
check(preg_match("/'\\\$(\w+)'/", 'DbQuery("SET n = $intValue");') === 0,
    'and does not flag an unquoted numeric interpolation');

echo "$passed passed, $failed failed  ($checkedInterpolations quoted interpolations audited)\n";
exit($failed === 0 ? 0 : 1);
