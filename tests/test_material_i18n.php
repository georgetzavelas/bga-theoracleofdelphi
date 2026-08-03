<?php
/**
 * Regression test: every player-visible material string must be translatable,
 * and must actually reach the player translated.
 *
 * Reported as "the translated text for all Equipment Cards is missing from the
 * translation page". BGA builds that page by scanning the source for
 * clienttranslate() / _() call sites, so a string only appears there if a
 * LITERAL sits inside such a call. All of this game's material text lived in
 * plain `const` arrays — invisible to the scanner, and a PHP constant
 * initializer cannot hold a function call at all. Equipment was the reported
 * case; ship tiles, companions, shrine bonuses, colour names and god names had
 * the same defect.
 *
 * Two halves, both checked here:
 *   1. EXTRACTION — the literals sit inside clienttranslate() in MaterialDefs,
 *      so translators can see them.
 *   2. DELIVERY — the translated value reaches the screen: notif args are
 *      tagged with BGA's 'i18n' key, and the client localizes each defs map on
 *      ingest. A string that is extractable but never translated at render time
 *      gives translators busywork and the player English.
 *
 * Run: php tests/test_material_i18n.php
 */

namespace Bga\Games\theoracleofdelphi {
    // MaterialDefs' display strings are wrapped in clienttranslate(), a BGA
    // runtime global. Defining it in the game's own namespace makes PHP resolve
    // it here without shadowing the real one on the platform (unqualified calls
    // prefer the current namespace, and this file isn't loaded there). It is an
    // identity marker either way — it only tags the literal for extraction.
    if (!\function_exists(__NAMESPACE__ . '\clienttranslate')) {
        function clienttranslate(string $text): string { return $text; }
    }
}

namespace {
    require_once __DIR__ . '/../modules/php/MaterialDefs.php';

    use Bga\Games\theoracleofdelphi\MaterialDefs;

    $root = $argv[1] ?? (__DIR__ . '/..');
    $passed = 0; $failed = 0;
    function check(bool $c, string $m): void {
        global $passed, $failed;
        if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
    }

    // -----------------------------------------------------------------------
    // 1. Completeness per material group: an entry per id, none empty.
    //    A missing entry is a blank tooltip, not a visible error.
    // -----------------------------------------------------------------------
    $groups = [
        'equipment name'      => [MaterialDefs::equipmentNames(),        array_keys(MaterialDefs::EQUIPMENT_CARDS)],
        'equipment ability'   => [MaterialDefs::equipmentDescriptions(), array_keys(MaterialDefs::EQUIPMENT_CARDS)],
        'ship tile name'      => [MaterialDefs::shipTileNames(),         array_keys(MaterialDefs::SHIP_TILES)],
        'ship tile summary'   => [MaterialDefs::shipTileDescriptions(),  array_keys(MaterialDefs::SHIP_TILES)],
        'ship tile detail'    => [MaterialDefs::shipTileDetails(),       array_keys(MaterialDefs::SHIP_TILES)],
        'companion name'      => [MaterialDefs::companionNames(),        range(0, 17)],
        'companion ability'   => [MaterialDefs::companionDescriptions(), array_keys(MaterialDefs::COMPANION_TYPES)],
        'companion subtype'   => [MaterialDefs::companionSubtypeLabels(), array_keys(MaterialDefs::COMPANION_TYPES)],
        'shrine bonus'        => [MaterialDefs::shrineBonusDescriptions(), array_keys(MaterialDefs::SHRINE_BONUSES)],
        'colour name'         => [MaterialDefs::colorNames(),            MaterialDefs::COLORS],
        'god name'            => [MaterialDefs::godNames(),              array_keys(MaterialDefs::GODS)],
        'cargo item type'     => [MaterialDefs::itemTypeNames(),         ['offering', 'statue']],
    ];

    $allStrings = [];
    foreach ($groups as $label => [$map, $ids]) {
        $missing = array_values(array_diff(
            array_map('strval', $ids), array_map('strval', array_keys($map))));
        check($missing === [],
              "$label: an entry per id (missing: " . implode(', ', $missing) . ')');
        $empty = array_keys(array_filter($map, fn($v) => trim((string)$v) === ''));
        check($empty === [], "$label: no empty strings (empty ids: " . implode(', ', $empty) . ')');
        $allStrings = array_merge($allStrings, array_values($map));
    }

    // Equipment and companion NAMES are the log's lookup key (reverseNameMap
    // resolves name -> card id), so a duplicate would point one card's tooltip
    // at another.
    foreach (['equipment' => MaterialDefs::equipmentNames(),
              'companion' => MaterialDefs::companionNames()] as $what => $names) {
        check(count(array_unique($names)) === count($names), "$what names are unique");
    }

    // Accessor fallbacks the callers rely on for an out-of-range id.
    check(MaterialDefs::equipmentName(999) === 'Equipment #999', 'equipmentName() falls back');
    check(MaterialDefs::equipmentDescription(999) === '', 'equipmentDescription() returns ""');
    check(MaterialDefs::shipTileName(999) === 'Ship Tile #999', 'shipTileName() falls back');
    check(MaterialDefs::colorName('nope') === 'nope', 'colorName() falls back to the key');
    check(MaterialDefs::godName('nope') === 'nope', 'godName() falls back to the key');

    // -----------------------------------------------------------------------
    // 2. Extraction: every string above sits inside a clienttranslate() literal.
    // -----------------------------------------------------------------------
    $defsSrc = file_get_contents("$root/modules/php/MaterialDefs.php");
    preg_match_all("/clienttranslate\('((?:[^'\\\\]|\\\\.)*)'\)/", $defsSrc, $m);
    $marked = array_map(fn($s) => str_replace(["\\'", '\\\\'], ["'", '\\'], $s), $m[1]);

    $unmarked = array_values(array_unique(array_filter(
        $allStrings, fn($s) => !in_array($s, $marked, true))));
    check($unmarked === [],
          'every material string is wrapped in clienttranslate(); unmarked: '
          . implode(' | ', $unmarked));

    // A `const` cannot hold clienttranslate(), so display keys reappearing in
    // the logic-only consts mean someone moved text back out of reach.
    $strays = [];
    foreach (['EQUIPMENT_CARDS' => MaterialDefs::EQUIPMENT_CARDS,
              'SHIP_TILES'      => MaterialDefs::SHIP_TILES,
              'COMPANION_TYPES' => MaterialDefs::COMPANION_TYPES,
              'SHRINE_BONUSES'  => MaterialDefs::SHRINE_BONUSES] as $constName => $rows) {
        foreach ($rows as $row) {
            foreach (['name', 'description', 'detail'] as $k) {
                // Concatenated, not interpolated: "$constName[$k]" is parsed as
                // an array access on the string and throws under PHP 8.
                if (isset($row[$k])) { $strays[] = $constName . "['" . $k . "']"; }
            }
        }
    }
    check($strays === [],
          'logic consts hold no display text: ' . implode(', ', array_unique($strays)));

    // -----------------------------------------------------------------------
    // 3. Delivery, server side. For every notify call with a LITERAL
    //    clienttranslate() message:
    //      a) an arg rendered as ${text} must be i18n-tagged if it is display
    //         text sourced from a translatable table;
    //      b) an i18n-tagged arg must be reachable when the log is REPLAYED —
    //         either in the message or in 'preserve'. BGA strips unreferenced
    //         args from the historical log, so tagging one that is neither
    //         translates a sometimes-absent value and implies it matters.
    //    Calls whose message is a variable are skipped: the template isn't
    //    visible here, so neither rule can be judged.
    // -----------------------------------------------------------------------
    $phpFiles = array_merge(
        ["$root/modules/php/Game.php"], glob("$root/modules/php/States/*.php"));

    /** @return list<array{file:string,line:int,span:string,hasLiteralMsg:bool}> */
    function notifyCalls(array $files): array {
        $calls = [];
        foreach ($files as $file) {
            $lines = explode("\n", file_get_contents($file));
            $n = count($lines);
            for ($i = 0; $i < $n; $i++) {
                if (!preg_match('/notify->(all|player)\s*\(/', $lines[$i])) continue;
                $depth = 0; $started = false; $end = $i;
                for ($j = $i; $j < $n; $j++) {
                    $stripped = preg_replace(
                        '/\'(\\\\.|[^\'\\\\])*\'|"(\\\\.|[^"\\\\])*"/', "''", $lines[$j]);
                    for ($k = 0, $len = strlen($stripped); $k < $len; $k++) {
                        if ($stripped[$k] === '(') { $depth++; $started = true; }
                        elseif ($stripped[$k] === ')') { $depth--; }
                    }
                    $end = $j;
                    if ($started && $depth <= 0) break;
                }
                $span = implode("\n", array_slice($lines, $i, $end - $i + 1));
                $calls[] = [
                    'file' => basename($file),
                    'line' => $i + 1,
                    'span' => $span,
                    'hasLiteralMsg' => str_contains($span, 'clienttranslate('),
                ];
            }
        }
        return $calls;
    }

    $calls = notifyCalls($phpFiles);
    check(count($calls) > 50, 'the notify-call scanner found the calls (' . count($calls) . ')');

    // (a) Display args that must be tagged wherever they are passed.
    $mustTag = [
        'equipment_name', 'companion_name', 'color_name', 'shiptile',
        'god_label', 'subtype_label', 'item_type_name',
    ];
    $untagged = [];
    foreach ($calls as $c) {
        if (!preg_match('/[\'"]i18n[\'"]\s*=>\s*\[([^\]]*)\]/', $c['span'], $m)) {
            $tagged = [];
        } else {
            preg_match_all('/[\'"]([a-z_]+)[\'"]/', $m[1], $t);
            $tagged = $t[1];
        }
        foreach ($mustTag as $arg) {
            if (!preg_match('/[\'"]' . preg_quote($arg, '/') . '[\'"]\s*=>/', $c['span'])) continue;
            if (!in_array($arg, $tagged, true)) {
                $untagged[] = "{$c['file']}:{$c['line']} ($arg)";
            }
        }
    }
    check($untagged === [],
          'every display arg is i18n-tagged; untagged: ' . implode(', ', $untagged));

    // (b) No orphan tags.
    $orphans = [];
    foreach ($calls as $c) {
        if (!$c['hasLiteralMsg']) continue;   // message built elsewhere — unjudgeable
        if (!preg_match('/[\'"]i18n[\'"]\s*=>\s*\[([^\]]*)\]/', $c['span'], $m)) continue;
        preg_match_all('/[\'"]([a-z_]+)[\'"]/', $m[1], $t);
        foreach ($t[1] as $tag) {
            $inMessage = str_contains($c['span'], '${' . $tag . '}');
            $preserved = (bool)preg_match(
                '/[\'"]preserve[\'"]\s*=>\s*\[[^\]]*[\'"]' . preg_quote($tag, '/') . '[\'"]/',
                $c['span']);
            if (!$inMessage && !$preserved) {
                $orphans[] = "{$c['file']}:{$c['line']} ($tag)";
            }
        }
    }
    check($orphans === [],
          'every i18n tag is in its message or preserved; orphans: ' . implode(', ', $orphans));

    // No message may render a raw logic key as prose. These are the keys that
    // double as English words, which is what made them easy to leak.
    $rawKeyInMessage = [];
    foreach ($calls as $c) {
        foreach (['color', 'subtype', 'item_type', 'god_name'] as $key) {
            if (str_contains($c['span'], '${' . $key . '}')) {
                $rawKeyInMessage[] = "{$c['file']}:{$c['line']} (\${$key})";
            }
        }
    }
    check($rawKeyInMessage === [],
          'no message renders a raw logic key as text: ' . implode(', ', $rawKeyInMessage));

    // -----------------------------------------------------------------------
    // 4. Delivery, client side: each defs map is localized on INGEST, not at
    //    each render site. The same strings feed tooltips, panel thumbnails and
    //    the log's name->id reverse map; translating only some of those is what
    //    makes a log tooltip silently stop resolving in non-English locales.
    // -----------------------------------------------------------------------
    $js = file_get_contents("$root/theoracleofdelphi.js");
    foreach (['equipmentDefs', 'companionDefs', 'shipTileDefs'] as $map) {
        check(str_contains($js, "this.$map = this._localizeCardDefs("),
              "$map is localized once on ingest");
    }
    check(str_contains($js, "subtitle: def.subtypeLabel"),
          'the companion tooltip shows the translated subtype label, not the raw key');

    // Behavioural: run the REAL reverseNameMap over a def map shaped the way
    // _localizeCardDefs leaves it, and assert both the translated and the
    // English name resolve to the same card id. A source grep here would pass
    // on the explanatory comment alone.
    if (preg_match('/function reverseNameMap\(defs\) \{.*?\n    \}/s', $js, $rm)) {
        $probe = escapeshellarg(
            $rm[0] . "\n"
            . "var m = reverseNameMap({8: {name: 'Quadrirreme', nameRaw: 'Quadrireme'}});\n"
            . "console.log([m['Quadrirreme'], m['Quadrireme']].join(','));\n");
        $out = trim((string)shell_exec("node -e $probe 2>&1"));
        check($out === '8,8',
              "reverseNameMap resolves BOTH the translated and English name (got '$out')");
    } else {
        check(false, 'reverseNameMap() is extractable for the behavioural check');
    }

    // Components.js renders its own movement-tooltip labels; they must go
    // through the module's _t() helper or they stay English forever.
    $components = file_get_contents("$root/modules/js/Components.js");
    check(str_contains($components, 'function _t(text)'),
          'Components.js has a _t() translation helper');
    check(!preg_match("/label: '[A-Z]/", $components),
          'no bare English label literals remain in Components.js');

    echo "\n$passed passed, $failed failed\n";
    exit($failed === 0 ? 0 : 1);
}
