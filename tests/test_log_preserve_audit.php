<?php
/**
 * Regression lint: notification log args vs. BGA historical-log semantics.
 *
 * Per BGA Studio's log-injection guidance:
 *
 *   "when game reloads it does not actually send same notifications, it sends
 *    special 'hitstorical_log' notification where all parameters not listed in
 *    the message are removed [...] You can still preserve specific arguments in
 *    historical log by adding special field preserve to notification arguments"
 *
 * Our client's bgaFormatText() turns several args into inline images/tooltips.
 * Some of those args are deliberately NOT in the message text (they drive the
 * art, not the wording), most notably player_id, which resolves the owner's
 * colour for the ship / shield / Zeus-tile tokens. Any such arg must be listed
 * in 'preserve' or the log silently degrades after F5 / turn-based reload:
 * the icon falls back to its raw flag value (e.g. "moves 1 ship").
 *
 * This lint walks every notify->all()/notify->player() call with PHP's
 * tokenizer and fails if a consumed arg (or a companion arg it needs) is
 * neither referenced in the message nor preserved.
 *
 * Run: php tests/test_log_preserve_audit.php
 */

$root = $argv[1] ?? (__DIR__ . '/..');

// Arg keys bgaFormatText() consumes => other args its transform ALSO needs.
$CONSUMED = [
    // Glyph + image tokens that are self-contained (value carries everything).
    'die' => [], 'die_from' => [], 'die_to' => [], 'dice' => [],
    'god_tok' => [], 'monster_tok' => [], 'injury_tok' => [],
    'favor_tok' => [], 'titan_tok' => [], 'die_tok' => [],
    'offering_tok' => [], 'statue_tok' => [], 'injury_list' => [],
    // Player-coloured pieces: the arg is only a presence flag, the image comes
    // from the owner's game colour.
    'ship_tok' => ['player_id'],
    'shield_tok' => ['player_id'],
    // Name token whose tooltip is keyed by a separate id.
    'shiptile' => ['shiptile_id'],
    // Zeus tile art is composite: {type}:{extra} plus the owner's colour.
    'zeus_tok' => ['zeus_img', 'player_id'],
];

// Provided by the framework rather than the notif args.
$AUTO = ['player_name', 'player_name2', 'you', 'actplayer'];

$files = [];
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator("$root/modules/php"));
foreach ($it as $f) {
    if ($f->isFile() && $f->getExtension() === 'php') $files[] = $f->getPathname();
}
sort($files);

$hard = [];   // fails the build
$soft = [];   // informational (see note at the bottom)
$notifCount = 0;

foreach ($files as $file) {
    $tokens = token_get_all(file_get_contents($file));
    $n = count($tokens);
    $skip = [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT];

    for ($i = 0; $i < $n; $i++) {
        if (!is_array($tokens[$i]) || $tokens[$i][0] !== T_STRING) continue;
        if ($tokens[$i][1] !== 'notify') continue;

        $j = $i + 1;
        while ($j < $n && is_array($tokens[$j]) && in_array($tokens[$j][0], $skip, true)) $j++;
        if ($j >= $n || !is_array($tokens[$j]) || $tokens[$j][0] !== T_OBJECT_OPERATOR) continue;
        $j++;
        while ($j < $n && is_array($tokens[$j]) && in_array($tokens[$j][0], $skip, true)) $j++;
        if ($j >= $n || !is_array($tokens[$j]) || $tokens[$j][0] !== T_STRING) continue;
        if (!in_array($tokens[$j][1], ['all', 'player'], true)) continue;
        $line = $tokens[$i][2];

        $k = $j + 1;
        while ($k < $n && !(is_string($tokens[$k]) && $tokens[$k] === '(')) {
            if (is_array($tokens[$k]) && !in_array($tokens[$k][0], $skip, true)) break;
            $k++;
        }
        if ($k >= $n || !(is_string($tokens[$k]) && $tokens[$k] === '(')) continue;

        $depth = 0; $end = $k;
        for ($m = $k; $m < $n; $m++) {
            if (is_string($tokens[$m])) {
                if ($tokens[$m] === '(') $depth++;
                elseif ($tokens[$m] === ')') { $depth--; if ($depth === 0) { $end = $m; break; } }
            }
        }
        $call = array_slice($tokens, $k, $end - $k + 1);
        $notifCount++;

        $strings = []; $argKeys = []; $preserve = [];
        $cn = count($call);
        for ($m = 0; $m < $cn; $m++) {
            if (!is_array($call[$m]) || $call[$m][0] !== T_CONSTANT_ENCAPSED_STRING) continue;
            $val = str_replace(["\\'", '\\"'], ["'", '"'], substr($call[$m][1], 1, -1));
            $strings[] = $val;
            $p = $m + 1;
            while ($p < $cn && is_array($call[$p]) && in_array($call[$p][0], $skip, true)) $p++;
            if ($p >= $cn || !is_array($call[$p]) || $call[$p][0] !== T_DOUBLE_ARROW) continue;
            $argKeys[] = $val;
            if ($val !== 'preserve') continue;
            $d = 0;
            for ($q = $p + 1; $q < $cn; $q++) {
                $tt = $call[$q];
                if (is_string($tt) && $tt === '[') { $d++; continue; }
                if (is_string($tt) && $tt === ']') { $d--; if ($d <= 0) break; continue; }
                if ($d >= 1 && is_array($tt) && $tt[0] === T_CONSTANT_ENCAPSED_STRING) {
                    $preserve[] = substr($tt[1], 1, -1);
                }
            }
        }

        // Union of ${...} across every non-key string, so messages assembled
        // from a ternary (several clienttranslate branches) are all covered.
        $ph = [];
        foreach ($strings as $s) {
            if (in_array($s, $argKeys, true)) continue;
            if (preg_match_all('/\$\{([a-zA-Z0-9_]+)\}/', $s, $mm)) {
                foreach ($mm[1] as $x) $ph[$x] = true;
            }
        }
        $ph = array_keys($ph);
        $rel = str_replace($root . '/', '', $file);

        foreach ($argKeys as $key) {
            if ($key === 'preserve' || !isset($CONSUMED[$key])) continue;
            if (in_array($key, $ph, true)) {
                foreach ($CONSUMED[$key] as $needs) {
                    if (!in_array($needs, $ph, true) && !in_array($needs, $preserve, true)) {
                        $hard[] = "$rel:$line  '$needs' is needed to render \${{$key}} but is neither in the message nor in 'preserve'";
                    }
                }
            } else {
                $soft[] = "$rel:$line  '$key' not found in a literal message";
            }
        }
        foreach ($ph as $x) {
            if (!in_array($x, $argKeys, true) && !in_array($x, $AUTO, true)) {
                $hard[] = "$rel:$line  message uses \${{$x}} but no '$x' arg is passed";
            }
        }
    }
}

echo "Scanned " . count($files) . " PHP files, $notifCount notify calls\n";
foreach ($hard as $h) echo "FAIL: $h\n";
$passed = $notifCount - count($hard);
echo "\n" . count($hard) . " failed\n";
if ($soft) {
    echo "\nNote: " . count($soft) . " consumed arg(s) were not found in a literal\n"
       . "message. These are expected where the message is built in a variable\n"
       . "(a ternary over several clienttranslate branches) which this lint\n"
       . "cannot read, or where the notif intentionally has an empty message.\n"
       . "They are informational and do not fail the run.\n";
}
exit(empty($hard) ? 0 : 1);
