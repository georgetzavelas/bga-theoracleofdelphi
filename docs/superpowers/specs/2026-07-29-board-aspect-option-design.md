# Game board setup: a compact board option

Date: 2026-07-29
Status: implemented

A new pre-game option (`gameoptions.json` id 101) choosing the aspect ratio board
generation aims for: **Spacious** 1.5 (the default, and the base game's shape) or
**Compact** 1.0.

## What this actually changes

The 120-hex area is **fixed by the deck**. `validateBoard()` requires all 12
islands (6 of size 7, 3 of 9, 3 of 11) and all 6 cities (size 3), so every board
places every cluster. The aspect target therefore **reshapes** the board; it
cannot shrink it.

Measured over 600 seeds per target, isolating the one constant:

| | Spacious 1.5 | Compact 1.0 |
| --- | --- | --- |
| Board px, mean | 1060 × 763 | 892 × 910 |
| Board px, max | 1290 × 949 | 1140 × 1156 |
| Columns × rows, mean | 17.9 × 14.4 | 15.1 × 17.3 |
| Aspect, mean | 1.40 | 0.99 |
| Bounding-box area, mean | 805k px² | 812k px² |
| Valid | 600 / 600 | 600 / 600 |
| Attempts, mean (max) | 1.35 (5) | 1.34 (7) |
| Ops, mean (max) | 3349 (51408) | 4016 (76940) |

So compact buys ~165px of width by spending ~150px of height. Total screen area
is unchanged. The consequence, accepted by G:

- **Helps side by side**, which is width-constrained. A 1140px-max board instead
  of 1290px drops the beside threshold by roughly 115px, so that layout fits on
  noticeably smaller windows.
- **Costs the stacked layout**, which is height-constrained. A 1156px-tall board
  exceeds most laptop viewports on its own, before the supply strip and the
  player board.

Generation cost is fine either way, but compact's worst case roughly doubles the
work: 76940 ops against the 150000 total budget, so ~51% of headroom at the peak
versus ~34% for spacious. No failures in 600 seeds at either target.

## Decisions

1. **Spacious is the default**, matching current behaviour. New tables look
   exactly like old ones unless a player opts in.
2. **The aspect is a generator input, not a new algorithm.** `ALGORITHM_VERSION`
   stays at 2. Bumping it would declare every existing seed unreproducible, which
   is false: at the default target the generator is bit-identical to before.
3. **The chosen target is recorded per game**, because a seed alone no longer
   identifies a board.

## Reproducibility

This is the part most at risk. Before this change, `board_seed_decimal` plus
`board_algorithm_version` fully determined a board. Now the aspect is a third
input.

- `Game.php` stores `board_aspect_x100` as a game state value **and** a table
  stat: `150` or `100`.
- It stores the **ratio**, not the option id. If "compact" were ever re-tuned from
  1.0 to something else, a game recorded as "option 2" would silently regenerate
  as a different board; a game recorded as "100" would not.
- Integer because game state values are ints; ×100 keeps one decimal place, which
  is all the presets need.
- `tests/regenerate_board.php` takes it as an optional second argument, defaulting
  to 150. Every game recorded before this option existed was spacious, so
  omitting the argument reproduces all of them correctly.

Verified directly: across 60 seeds, the default reproduces boards **identical** to
the pre-change generator (fingerprinting every hex and every cluster anchor and
rotation), and compact differs from the default on all 60.

## Implementation

| Piece | Change |
| --- | --- |
| `gameoptions.json` | option 101, values 1 Spacious / 2 Compact, default 1 |
| `stats.json` | table stat `board_aspect_x100` |
| `BoardGenerator` | `ASPECT_SPACIOUS` / `ASPECT_COMPACT` constants; `targetAspectRatio` option read by `scoreCandidate()`; default `ASPECT_SPACIOUS` |
| `Game.php` | `OPT_BOARD_SETUP`, `boardAspectTarget()`, passes the target, records the stat |
| `regenerate_board.php` | optional `aspect_x100` argument, rejects unknown values |
| `BoardBuilder.js` | mirrors both presets and the constructor option (still not used for real games) |

### Naming

`landscapeBias` became a misnomer the moment the target could be 1.0 — a square
bias is not a landscape one. The flag is now `aspectBias`, with the old name still
accepted, since it appears in existing tests and any caller may still pass it. A
test pins the two as equivalent.

## Testing

`tests/test_board_aspect.php`, 20 checks:

- omitting the aspect is identical to asking for spacious, per seed;
- compact reshapes the board for every seed (without this, a generator that
  ignored the option entirely would pass the check above);
- direction: spacious averages wider than tall, compact near square, and compact
  is narrower *and taller* for nearly every seed — the accepted trade-off, pinned
  so it cannot quietly stop being true;
- both targets place all 120 hexes and generate valid boards across 20 seeds;
- the legacy `landscapeBias` flag still works and matches `aspectBias`;
- the ×100 stat encoding round-trips.

`tests/test_board_builder_js.js` gained PHP-parity checks on both presets and the
JS default, matching the existing `MAX_SHALLOWS_AREA` parity guard.

Non-vacuous: flipping the default to compact, ignoring `targetAspectRatio` in
scoring, dropping the legacy flag, swapping the presets, drifting the JS presets
from PHP, and flipping the JS default each fail.

## Out of scope

- Any client-side change. The board's size is already discovered at runtime from
  `offsetWidth`/`offsetHeight`, so the zoom and layout code needs nothing.
- A third target. 1.25 was offered and declined in favour of shipping 1.0.
