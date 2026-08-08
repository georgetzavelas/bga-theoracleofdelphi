<?php
/**
 * Support script for tests/test_cluster_parity_js.js — not a test itself, so it
 * is deliberately named without the test_ prefix and the runner skips it.
 *
 * Dumps everything the PHP ClusterDefinitions knows as JSON on stdout, so the
 * Node side can drive its own copy of the same definitions and diff the two.
 *
 * Run: php tests/dump_clusters.php
 */

require_once __DIR__ . '/../modules/php/ClusterDefinitions.php';

$defs = new ClusterDefinitions();

/** Cluster ids, via the same private map the accessors read. */
$ids = [];
foreach ([3, 7, 9, 11] as $size) {
    foreach ($defs->getClustersBySize($size) as $cluster) {
        $ids[] = $cluster['id'];
    }
}
sort($ids);

$clusters = [];
foreach ($ids as $id) {
    $c = $defs->getCluster($id);
    $clusters[$id] = [
        'id' => $c['id'],
        'size' => $c['size'],
        'color' => $c['color'] ?? null,
        'hexes' => array_map(fn($h) => [
            'dq' => $h['dq'],
            'dr' => $h['dr'],
            'type' => $h['type'] ?? null,
            'color' => $h['color'] ?? null,
            'attribute' => $h['attribute'] ?? null,
            'explorationColor' => $h['explorationColor'] ?? null,
        ], $c['hexes']),
    ];
}

$groups = [
    'city' => array_map(fn($c) => $c['id'], $defs->getCityClusters()),
    'island' => array_map(fn($c) => $c['id'], $defs->getIslandClusters()),
];
foreach ([3, 7, 9, 11] as $size) {
    $groups["size$size"] = array_map(fn($c) => $c['id'], $defs->getClustersBySize($size));
}

/** Bare rotation math over a small grid, including out-of-range step counts. */
$rotate = [];
for ($dq = -3; $dq <= 3; $dq++) {
    for ($dr = -3; $dr <= 3; $dr++) {
        for ($steps = -7; $steps <= 7; $steps++) {
            $rotate["$dq,$dr,$steps"] = $defs->rotateHex($dq, $dr, $steps);
        }
    }
}

/**
 * Placed clusters. Rotations run past the 0-5 range on both sides so the
 * modulo normalisation is covered on the world path too, and the anchors are
 * off-origin (and negative) so the translation is not just adding zero.
 */
$anchors = [[0, 0], [3, -2], [-4, 5]];
$world = [];
foreach ($ids as $id) {
    $cluster = $defs->getCluster($id);
    foreach ($anchors as [$aq, $ar]) {
        foreach (range(-1, 6) as $rot) {
            $key = "$id|$aq|$ar|$rot";
            $world[$key] = array_map(fn($h) => [
                'q' => $h['q'],
                'r' => $h['r'],
                'type' => $h['type'] ?? null,
                'color' => $h['color'] ?? null,
                'attribute' => $h['attribute'] ?? null,
            ], $defs->getWorldHexes($cluster, $aq, $ar, $rot));
        }
    }
}

echo json_encode([
    'ids' => $ids,
    'clusters' => $clusters,
    'groups' => $groups,
    'rotate' => $rotate,
    'world' => $world,
]);
