# Hex Cluster Landscape Bias — Design

**Date:** 2026-04-30
**Status:** Design approved (amended for PHP+JS parity), ready for implementation plan
**Owner:** G

## Problem

The hex cluster fitting algorithm in `modules/js/BoardBuilder.js` produces boards with unconstrained aspect ratios. Boards can drift tall (portrait), forcing the player to scroll vertically to reach the player board below the hex board. The packing algorithm has no notion of page width, target shape, or screen orientation; it only enforces hex non-overlap, water connectivity (≥2 adjacent water-pairs), and a minimum city-anchor distance.

## Goal

Bias the planner so its natural output is wider than tall — landscape-shaped — without breaking the existing organic variety in board layouts and without coupling to a specific pixel width or device.

**Non-goals:**
- Hard-bounding the board to a specific pixel width.
- Reading or reacting to the BGA game zone width at runtime.
- Rotating the board 90° post-hoc.
- Solving tablet portrait orientation (a CSS/zoom concern, not a planner concern).

## Approach

Bias toward a target **aspect ratio** of **1.5:1** (width ÷ height). Aspect ratio is dimensionless, so the same logical shape scales naturally to any screen — desktop, laptop, tablet landscape, tablet portrait — with CSS handling the actual size. Bias is **soft** (scoring, not rejection) and engages from the third cluster onward.

## Architecture

The same packing algorithm exists in **two parallel implementations**: a server-side PHP version (the source of truth for actual gameplay state) and a client-side JS version (used for board preview and dev tooling). Both must change together so server and client agree on board shape.

### PHP injection point (primary — gameplay)

`findPlacementWithHistory` in [BoardGenerator.php:198–225](../../modules/php/BoardGenerator.php). Line 202 shuffles candidates:

```php
$this->shuffleArray($candidates);
```

Replace with a conditional sort: when scoring is active, sort by aspect-ratio score (descending); otherwise, fall back to the existing shuffle.

**New helpers added to BoardGenerator.php:**
- `scoreCandidate(array $candidate, array $cluster, array $existingPixelBounds): float` — returns a score; higher = closer to target ratio.
- `projectHexToPixel(int $q, int $r): array` — pure helper mirroring the JS renderer's transform so scoring uses pixel-space bounds (PHP doesn't render but must compute the same shape).
- `computePixelBoundsForHexes(array $hexes): array` — utility for the precompute optimization. Returns `['minX', 'maxX', 'minY', 'maxY']`.

Note: PHP already has a `getBoardBounds()` at [BoardGenerator.php:766](../../modules/php/BoardGenerator.php), but it returns axial `(q, r)` bounds. Aspect ratio in axial coordinates does not match aspect ratio in pixel space (the hex grid is non-orthogonal), so we cannot reuse it. The new pixel-bounds helper is required.

**New constants on BoardGenerator.php** (matching the JS renderer's values):
- `HEX_WIDTH_PX = 60`
- `HEX_HEIGHT_PX = 69`

### JS injection point (parity — preview)

`findPlacementWithHistory` in [BoardBuilder.js:199–228](../../modules/js/BoardBuilder.js). Line 204:

```js
this.shuffleArray(candidates);
```

Same conditional-sort replacement as PHP.

**New helpers added to BoardBuilder:**
- `scoreCandidate(candidate, cluster, existingBounds)` — returns a number; higher = closer to target ratio.
- `projectHexToPixel(q, r)` — mirrors [BoardRenderer.js:104–107](../../modules/js/BoardRenderer.js). Lives on BoardBuilder so it doesn't reach into the renderer.
- `computeBoundsForHexes(hexes)` — utility for the precompute optimization.

### Untouched in both implementations

`findConnectionCandidates`, `canPlaceCluster`, `wouldMaintainWaterConnectivity`, `backtrack`, `placeIslandClustersWithBacktracking`. All scoring is read-only against `occupiedHexes` state.

## Scoring function

```js
score = -Math.abs(ratio - TARGET_ASPECT_RATIO) + (Math.random() * ASPECT_SCORE_JITTER)
```

Where:
- `ratio = width / height` of the projected pixel-space bounding box including existing hexes plus the candidate's hexes.
- `TARGET_ASPECT_RATIO = 1.5`
- `ASPECT_SCORE_JITTER = 0.02`

**Width/height:** project each hex's axial `(q, r)` to pixel `(x, y)` using the same transform the renderer uses, then compute `width = maxX − minX` and `height = maxY − minY` across all hexes (existing + candidate).

**Performance:** precompute existing bounds once at the top of `findPlacementWithHistory`. Per-candidate scoring then projects only the candidate's ~10 hexes and combines with `min(existingMinX, candidateMinX)`, etc. — O(candidate-hexes) per candidate, not O(all-hexes).

**Edge cases:**
- `height === 0`: treat ratio as `Infinity`; score becomes very negative; candidate falls to the bottom. No divide-by-zero.
- All-equal scores: jitter randomizes the order of near-ties (within ±0.02), preserving variety.

## Engagement rule

Scoring is active only when `placementStack.length >= 2` — i.e., from the third cluster onward.

- **Cluster 0** is hardcoded to `(0, 0)` ([BoardBuilder.js:152](../../modules/js/BoardBuilder.js)). No choice to make.
- **Cluster 1** would be biased against a single-cluster bounding box, which forces a fixed relative position with no real shape benefit. Skip.
- **Cluster 2+** uses scored sort.

In code: a single `if (placementStack.length >= 2)` branch in `findPlacementWithHistory` selects scored-sort vs. the existing shuffle. Below the threshold, behavior is byte-identical to today.

## Tie-breaking

Pure score-sort would make boards visually repetitive — many candidates score within 0.05 of each other, and stable-sort would always pick the same one. The `ASPECT_SCORE_JITTER = 0.02` term randomizes order among near-ties without overriding meaningful score differences (which are typically 0.1–0.3 between distinct placements).

`ASPECT_SCORE_JITTER` is the only tunable knob and is exposed as a named constant for easy adjustment.

## Edge cases & failure modes

1. **Backtracking interaction.** Scored sort is purely a re-ordering layer. The full candidate list is sorted; walking it with `previousTried` skips already-attempted positions exactly as today. Backtracking now also tries next-best-scored placements, which is an improvement, not a regression. No reachable position becomes unreachable.

2. **"No candidate qualifies."** Cannot happen. Scoring sorts but never rejects. The existing `return null → trigger backtrack` path at [BoardBuilder.js:227](../../modules/js/BoardBuilder.js) fires for the same reasons it does today (overlap, water connectivity, exhausted candidates), never for new scoring logic.

3. **Pathological cluster shapes.** If every placement of a given cluster makes the board taller, scoring orders the "least bad" first. The board still places successfully; it just won't be perfectly landscape. That's fine — the goal is bias, not guarantee.

## Testing

Primary test surface is **PHP**, which has the existing test infrastructure (`tests/test_board_generator.php`, run via `php tests/test_board_generator.php`). JS gets a smoke test only.

**PHP unit tests — `scoreCandidate` (in `tests/test_board_generator.php`):**
- Given existing hexes whose pixel-projected bounding box has ratio 1.5 and a candidate inside that box, score reflects ratio ≈ 1.5 (best, near zero before jitter).
- Given a candidate that produces ratio = 0.75 (portrait), score is more negative than a candidate that produces ratio = 1.5.
- Given `height = 0` (degenerate single-row), score returns a very negative number (no NaN, no crash).

**PHP unit tests — `projectHexToPixel`:**
- `projectHexToPixel(0, 0)` returns `(0, 0)`.
- `projectHexToPixel(1, 0)` returns `(60, 0)` (one hex-width to the right at the same row).
- `projectHexToPixel(0, 1)` returns `(30, 51.75)` (next row, half-offset).

**PHP integration test — statistical (in `tests/test_board_generator.php`):**

Generate 100 boards with bias on and 100 with bias off (a constructor option toggles it). Assert:
- Mean pixel-space aspect ratio with bias on is closer to 1.5 than with bias off, by a measurable margin (e.g., mean deviation reduces by at least 30%).
- Standard deviation of aspect ratios with bias on remains nonzero (jitter preserves variety).
- All 200 runs successfully complete without `BoardGenerator::generate()` returning a failure.

**JS smoke test:**

A small Node script (`tests/test_board_builder_js.js`) that loads `modules/js/BoardBuilder.js` in a Node-compatible way (the file uses BGA's `define()` pattern; we'll require a minimal shim or use `vm.runInNewContext`) and asserts:
- `projectHexToPixel(0, 0)` returns `{x: 0, y: 0}`.
- `scoreCandidate` produces a higher score for a 1.5-ratio outcome than a 0.75-ratio outcome.

Run: `node tests/test_board_builder_js.js`. No statistical assertion in JS — PHP test covers convergence; JS only verifies the math matches.

**Visual smoke test:**

Generate a board in the BGA dev environment 5–10 times. Eyeball it: noticeably wider than tall, still organic-looking, varied between runs. Confirm preview (JS) and gameplay (PHP) produce visually similar shapes.

## Open questions

None. All design decisions resolved:
- **Constraint:** aspect ratio (not pixel width) for screen adaptability.
- **Target:** 1.5:1.
- **Style:** soft scoring (re-order, not reject).
- **Engagement:** from cluster #3 onward.
- **Tie-breaking:** small score jitter (0.02).

## Constants summary

Same set added to both PHP (`BoardGenerator.php`) and JS (`BoardBuilder.js`) so behavior matches across server and client.

| Constant | Value | Purpose |
|----------|-------|---------|
| `TARGET_ASPECT_RATIO` | `1.5` | Target width/height ratio. |
| `ASPECT_SCORE_JITTER` | `0.02` | Randomization among near-ties. |
| `MIN_CLUSTERS_FOR_BIAS` | `2` | Stack length at/above which scoring engages (i.e., placing the 3rd cluster onward). |
| `HEX_WIDTH_PX` | `60` | Hex width in pixels (matches `BoardRenderer.js`). Used only for pixel-space scoring projection. |
| `HEX_HEIGHT_PX` | `69` | Hex height in pixels (matches `BoardRenderer.js`). |

**Source of truth:** these constants must agree between PHP and JS. If `BoardRenderer.js` ever changes its `hexWidth` or `hexHeight`, both `BoardBuilder.js` and `BoardGenerator.php` must be updated to match. (The renderer's actual rendering size is allowed to differ — what matters is that scoring uses *consistent* values across server and client.)
