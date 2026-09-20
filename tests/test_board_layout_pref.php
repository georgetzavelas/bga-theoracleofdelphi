<?php
/**
 * Regression lint: pref 102 "Player Board position" and its three modes.
 *
 *   1  below the game board        — never beside
 *   2  beside (wide screens)       — beside when it clears the readability floor
 *   3  beside, always              — beside at any width
 *
 * TWO READ SITES, ONE DERIVATION. Setup and the live-change handler used to
 * read the pref independently, as `!= 1` and `== 2`. With two values those
 * agree; the third makes them disagree, and the symptom is nasty because it is
 * asymmetric — picking "Always" would go beside on reload but stack the instant
 * you changed the setting, so it looks like the preference "doesn't stick".
 * Both sites now route through _setBoardLayoutPref, and this file's job is to
 * keep it that way when a fourth mode arrives.
 *
 * THE FLOOR. BESIDE_FLOOR guards AUTOMATIC shrinking — it refuses side-by-side
 * when the window would squash it unreadably. Mode 3 bypasses it by explicit
 * request. Mode 2 must NOT: a bypass that ignores the mode silently changes the
 * default experience for every player, which is the mutation most worth
 * catching here because nothing would look broken.
 *
 * A source lint rather than a behavioural test: the layout code needs a real
 * DOM and a rendered board, neither of which exists in this harness.
 *
 * Run: php tests/test_board_layout_pref.php
 */

$root = $argv[1] ?? (__DIR__ . '/..');
$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}

$jsSrc   = file_get_contents("$root/theoracleofdelphi.js");
$prefRaw = file_get_contents("$root/gamepreferences.json");
$prefs   = json_decode($prefRaw, true);

// ---------------------------------------------------------------------------
// 1. The preference itself.
// ---------------------------------------------------------------------------
check(is_array($prefs), 'gamepreferences.json parses');
check(isset($prefs['102']), 'pref 102 exists');
$values = $prefs['102']['values'] ?? [];
check(count($values) === 3, 'pref 102 offers three modes');
check(isset($values['3']), 'mode 3 exists');
check(str_contains(strtolower($values['3']['name'] ?? ''), 'always'),
      'mode 3 is labelled as the always variant');
check((string)($prefs['102']['default'] ?? '') === '2',
      'the default is still 2 — adding a mode must not move existing players');
// needReload:false means the live handler is the ONLY thing applying a change.
check(($prefs['102']['needReload'] ?? null) === false,
      'pref 102 applies live, so the live handler must be correct (see below)');

// ---------------------------------------------------------------------------
// 2. One derivation, two callers. This is the trap the third mode sprang.
// ---------------------------------------------------------------------------
check(str_contains($jsSrc, '_setBoardLayoutPref: function'),
      'the derivation helper exists');
// The definition is `_setBoardLayoutPref: function(`, so it does not match a
// `(` suffix — this counts CALL SITES only, and there must be exactly the two.
check(substr_count($jsSrc, '_setBoardLayoutPref(') === 2,
      'exactly two call sites — setup and the live handler, both routed here');

// Neither caller may derive the flags itself.
$setupAt = strpos($jsSrc, 'Player Board position (pref 102)');
$setupChunk = $setupAt !== false ? substr($jsSrc, $setupAt, 700) : '';
check($setupChunk !== '', 'the setup read site is locatable');
check(!preg_match('/_besideLayout\s*=/', $setupChunk),
      'setup does NOT assign the flag itself — it calls the helper');

if (preg_match('/_applyBoardLayout: function\(value\) \{(.*?)\n        \},/s', $jsSrc, $m)) {
    check(!preg_match('/_besideLayout\s*=/', $m[1]),
          'the live handler does NOT assign the flag itself either (this is the '
          . 'half that used to read == 2 and would have stacked on mode 3)');
    check(str_contains($m[1], '_setBoardLayoutPref'),
          'the live handler routes through the helper');
} else {
    check(false, '_applyBoardLayout is extractable');
}

// ---------------------------------------------------------------------------
// 3. The mapping.
// ---------------------------------------------------------------------------
if (preg_match('/_setBoardLayoutPref: function\(value\) \{(.*?)\n        \},/s', $jsSrc, $m)) {
    $body = $m[1];
    check(str_contains($body, '_besideLayout') && str_contains($body, '_besideAlways'),
          'the helper derives both flags');
    // Below is the only mode that is NOT beside; always is the only one that forces it.
    check(preg_match('/_besideLayout\s*=\s*mode\s*!==\s*1/', $body) === 1,
          'beside is allowed for every mode except 1 (below)');
    check(preg_match('/_besideAlways\s*=\s*mode\s*===\s*3/', $body) === 1,
          'only mode 3 forces beside');
    // An unset pref must land on the JSON default, not on "always".
    check(str_contains($body, '2'),
          'an unrecognised or unset value falls back to 2, matching the JSON default');
} else {
    check(false, '_setBoardLayoutPref is extractable');
}

// ---------------------------------------------------------------------------
// 4. The floor bypass — scoped to mode 3 only.
// ---------------------------------------------------------------------------
check(str_contains($jsSrc, 'BESIDE_FLOOR = 0.55'),
      'the readability floor still exists');
if (preg_match('/if \((.*?)neutralFit >= BESIDE_FLOOR\) \{/s', $jsSrc, $m)) {
    check(str_contains($m[0], '_besideAlways'),
          'mode 3 bypasses the floor');
    check(str_contains($m[0], '||'),
          'it is an OR — the floor still applies to mode 2, and a bypass that '
          . 'ignored the mode would silently restyle every default player');
} else {
    check(false, 'the layout decision is extractable');
}

// The floor must not have simply been deleted or defanged.
check(str_contains($jsSrc, 'neutralFit >= BESIDE_FLOOR'),
      'the floor comparison survives for the non-always path');

// ---------------------------------------------------------------------------
// 5. Mode 1 still wins outright.
// ---------------------------------------------------------------------------
// boardW is forced to 0 when beside is not allowed, which is what makes "below"
// stack at any width. _besideAlways must not be consulted there, or mode 1
// could be dragged sideways.
if (preg_match('/var boardW = (.*?);/s', $jsSrc, $m)) {
    check(str_contains($m[1], '_besideLayout'),
          'the board-width gate reads _besideLayout');
    check(!str_contains($m[1], '_besideAlways'),
          'and NOT _besideAlways — "below" must stay below at every width');
} else {
    check(false, 'the boardW gate is extractable');
}

// ---------------------------------------------------------------------------
// 6. Nothing downstream imposes a minimum scale.
// ---------------------------------------------------------------------------
// Removing the floor only works because the composition scale has no lower
// clamp. If someone adds one, "Always" silently starts clipping instead of
// fitting.
if (preg_match('/var besideScale = (.*?);/s', $jsSrc, $m)) {
    check(str_contains($m[1], 'Math.min'),
          'besideScale caps at 1');
    check(!str_contains($m[1], 'Math.max'),
          'besideScale has NO lower clamp — that is what lets Always keep fitting');
} else {
    check(false, 'besideScale is extractable');
}

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
