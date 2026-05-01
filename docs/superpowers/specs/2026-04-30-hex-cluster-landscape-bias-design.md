# Hex Cluster Landscape Bias — Design

**Date:** 2026-04-30
**Status:** Design approved, ready for implementation plan
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

One file, one function, one swapped line plus one helper.

**Injection point:** `findPlacementWithHistory` in [BoardBuilder.js:199–228](../../modules/js/BoardBuilder.js).

Today, line 204 shuffles candidates randomly:

```js
this.shuffleArray(candidates);
```

Replace with a conditional sort: when scoring is active, sort by aspect-ratio score (descending); otherwise, fall back to the existing shuffle.

**New helpers added to BoardBuilder:**
- `scoreCandidate(candidate, cluster, existingBounds)` — returns a single number; higher = closer to target ratio.
- `projectHexToPixel(q, r)` — mirrors [BoardRenderer.js:192–202](../../modules/js/BoardRenderer.js) so scoring uses pixel-space bounds.
- `computeBoundsForHexes(hexes)` — small utility for the precompute optimization.

Untouched: `findConnectionCandidates`, `canPlaceCluster`, `wouldMaintainWaterConnectivity`, `backtrack`, `placeIslandClustersWithBacktracking`. All scoring is read-only against `occupiedHexes` state.

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

**Unit tests — `scoreCandidate`:**
- Given existing hexes forming a 1000×1000 box and a candidate that extends to 1500×1000, score reflects ratio = 1.5 (best).
- Given a candidate that produces ratio = 0.75 (portrait), score is more negative than ratio = 1.5.
- Given `height = 0`, score returns a very negative number (no NaN, no crash).

**Integration tests — full board generation, statistical:**

Run `placeIslandClustersWithBacktracking` 100 times with a fixed cluster set, both with and without the bias. Assert:
- Mean aspect ratio shifts measurably toward 1.5 with bias on.
- Standard deviation of aspect ratios stays nonzero (jitter preserves variety).
- All 100 runs successfully place all clusters (no convergence regression).

Lives in `tests/` alongside existing board-builder tests.

**Visual smoke test:**

Generate a board in the BGA dev environment 5–10 times. Eyeball it: noticeably wider than tall, still organic-looking, varied between runs.

## Open questions

None. All design decisions resolved:
- **Constraint:** aspect ratio (not pixel width) for screen adaptability.
- **Target:** 1.5:1.
- **Style:** soft scoring (re-order, not reject).
- **Engagement:** from cluster #3 onward.
- **Tie-breaking:** small score jitter (0.02).

## Constants summary

| Constant | Value | Purpose |
|----------|-------|---------|
| `TARGET_ASPECT_RATIO` | `1.5` | Target width/height ratio. |
| `ASPECT_SCORE_JITTER` | `0.02` | Randomization among near-ties. |
| `MIN_CLUSTERS_FOR_BIAS` | `2` | Stack length at/above which scoring engages (i.e., placing the 3rd cluster onward). |
