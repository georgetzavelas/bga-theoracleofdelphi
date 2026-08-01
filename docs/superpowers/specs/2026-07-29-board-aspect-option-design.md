# Game board setup: a compact board option

Date: 2026-07-29
Status: implemented

> **History.** First shipped as an aspect-ratio target of 1.0 versus 1.5. That was
> the wrong lever and was replaced, in the same session, by best-of-8 selection.
> The measurements that killed it are kept below, because the reasoning generalises:
> the board's *area* is fixed, so a shape control cannot make it smaller.

A pre-game option (`gameoptions.json` id 101):

- **Spacious** (default) — generate one board, exactly as the base game always has.
- **Compact** — generate up to 8 boards and keep the one with the smallest rendered
  footprint.

## Why not aspect ratio

The 120-hex area is **fixed by the deck**. `validateBoard()` requires all 12
islands (6 of size 7, 3 of 9, 3 of 11) and all 6 cities (size 3), so every board
places every cluster. An aspect target therefore *reshapes* the board; it cannot
shrink it.

Measured over 600 seeds per target, isolating that one constant:

| | Aspect 1.5 | Aspect 1.0 |
| --- | --- | --- |
| Bounding-box area, mean | 805k px² | 794k px² (**−1.3%**) |
| Fill (land / bbox) | 47.0% | 47.7% (**+1.6%**) |
| Board px, mean | 1055 × 762 | 888 × 893 |
| Island span (longest sail) | 15.2 | 13.8 |
| Ops, mean | 3047 | 4404 (**+45%**) |

Area and fill are unchanged inside noise. What 1.0 actually did was rotate the
problem: −16% width for +17% height, at +45% generation cost, plus a −10% change
to the longest sailing distance that nobody had asked for. More than half the
bounding box is empty water either way.

Worth recording the one thing 1.0 *was* best at: if the goal had been a tighter
**game** rather than a smaller **board**, its −10% island span beats every
alternative here (area-scored greedy leaves span at 15.0). It was the right lever
for the wrong goal.

## Why selection beats a smarter score

The placement search is greedy and per-candidate, so while building it cannot see
how big the finished board will be. Three approaches, measured:

| Approach | Mean footprint | vs baseline | Worst case |
| --- | --- | --- | --- |
| Aspect 1.5 (baseline) | 801k | — | 1167k |
| Aspect 1.0 | 794k | −1% | 1167k |
| Score on area, not aspect | 719k | −10% | — |
| **Best-of-8 by footprint** | **676k** | **−16%** | **846k (−28%)** |
| Floor seen in 300 boards | 574k | −28% | — |

Rewriting the scoring function to chase area reaches only about −10%, because a
greedy heuristic still cannot see the whole board. Choosing among *finished*
boards reaches −16%.

**The worst case matters more than the mean**, because a layout breaks on the
largest board a player can roll, not the average one. Best-of-8 is the only
approach here that moves it: 1167k → 846k.

## The shared budget: why this is safe

An "op" is one candidate placement evaluated in the backtracking search. The
budgets exist because generation runs synchronously inside `setupNewGame`, **which
BGA caps at 10s of PHP execution**, and a small fraction of seeds explore a
combinatorial blowup. `DEFAULT_MAX_OPS_TOTAL` (150,000) was calibrated so that
exhausting it still fits inside that limit.

Best-of-8 therefore has one dangerous implementation and one safe one:

| Design | Mean | p99 | Max seen | **Hard ceiling** |
| --- | --- | --- | --- | --- |
| One board (today) | 0.21s | 1.09s | 1.72s | 9.0s |
| 8 candidates, own budget each | 1.70s | 3.52s | 5.24s | **72s — dead request** |
| **8 candidates, one shared budget** | **1.61s** | **2.88s** | **4.14s** | **9.0s, unchanged** |

`generateMostCompact()` allots each candidate only what remains of a single
budget. The ceiling is then exactly today's, **by the same calibration that made
150,000 safe in the first place** — an argument that does not depend on how fast
any particular machine is. A pathological table yields *fewer candidates* rather
than a slower request.

Measured over 250 tables: all 250 still obtained the full 8, peaking at 114k of
the 150k budget, with zero failures. So the degradation path is a safety net, not
a routine occurrence.

Accepted cost: mean work rises 3,550 → 25,926 ops (7.3×). Within budget, but if
that proves sluggish in the studio, `COMPACT_CANDIDATES = 5` gives −13% for ~16k
ops, and the shared budget already degrades on its own.

## Reproducibility

The candidate count is a generation **input**: the same RNG stream yields a
different winner when a different number of candidates is drawn from it.

- Every candidate draws from the **same** caller-supplied RNG stream, one after
  another. Sub-seeding was not needed and would have been worse: one seed still
  identifies the whole selection.
- `Game.php` records `board_candidates` (1 or 8) as a game state value and a table
  stat, storing the **count** rather than the option id, so a future change to how
  many candidates Compact draws cannot silently change what an old seed
  reproduces.
- `ALGORITHM_VERSION` stays at 2. Spacious is bit-identical to the pre-option
  generator, verified across 60 seeds by fingerprinting every hex plus every
  cluster anchor and rotation.
- `regenerate_board.php <seed> [candidates] [aspect_x100]`. The third argument
  exists only for tables created during the single commit in which Compact meant
  aspect 1.0; `targetAspectRatio` stays a free generator parameter so those remain
  reproducible.

## Implementation

| Piece | Change |
| --- | --- |
| `gameoptions.json` | option 101, values 1 Spacious / 2 Compact, default 1 |
| `stats.json` | table stat `board_candidates` |
| `BoardGenerator` | `generateMostCompact()`, `boardFootprint()`, `COMPACT_CANDIDATES`; geometry helpers made static |
| `Game.php` | `boardCandidateCount()`, branches on it, records the stat |
| `regenerate_board.php` | optional candidate count |
| `BoardBuilder.js` | mirrors only the aspect target; annotated that Compact is a selection it does not model |

`landscapeBias` became a misnomer once the target was configurable and is now
`aspectBias`, with the old name still accepted and pinned as equivalent.

## Testing

`tests/test_board_aspect.php`, 29 checks. The two that carry the most weight:

- **The budget is shared, not per-candidate.** Asserted at budgets of 6k, 10k and
  20k — deliberately smaller than 8 healthy candidates need. A generous 150k
  budget cannot distinguish the two designs, because 8 candidates never approach
  it; the first version of this check used 150k and passed happily against a
  per-candidate build.
- **Determinism**, and that the candidate count changes the outcome (so it must be
  recorded).

Plus: one candidate is byte-identical to a plain generation; the winner is the
true minimum of the candidates, verified by replaying the stream by hand; the
winner is never larger than the first draw; the reported op count is the total
across candidates; a too-small budget degrades to fewer candidates rather than
failing; the result carries the same keys as `generate()`.

Non-vacuous: per-candidate budgets, under-reported ops, selecting the largest, and
skipping selection entirely each fail.

Not covered, and knowingly so: the early `break` when the budget is exhausted is
observationally equivalent to letting a zero-budget candidate fail, so no test
pins it. It stays for clarity, not correctness.

## Out of scope

- Any client-side change. The board's size is discovered at runtime from
  `offsetWidth`/`offsetHeight`, so zoom and layout need nothing.
- Selecting on max dimension rather than area. Area is the better proxy for
  "space on screen"; max dimension would suit "fits a given window" and is the
  obvious next experiment if compact still feels large in play.
