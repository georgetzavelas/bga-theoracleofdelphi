# Design: "Player board beside the board" display layout

Date: 2026-07-18
Status: Approved for planning

## Goal

Give players an optional layout that places the player board to the **right**
of the hex game board instead of below it, so wide screens use their
horizontal space instead of scrolling a tall vertical stack.

## Decision record: why a display reflow, not a new board

The original idea was a second board-generation mode that produces a board no
wider than 13 hexes (city included), freeing horizontal room for the player
board. Measurement killed that path:

- Every board is a fixed **120 hexes**. The count is set by the game (12
  clusters plus cities plus sea), so narrowing the board cannot remove hexes,
  only relocate them downward.
- The current landscape bias produces boards **16 to 21 hexes wide by 13 to 17
  tall** (aspect ~1.3 to 1.5). Even the existing no-bias mode bottoms out near
  15 wide. Forcing 13 wide would yield roughly 13 wide by 24 to 28 tall: a
  tall, narrow tower ~780px wide by ~1200 to 1500px tall.
- The player area is the opposite shape: wide and short (~1136 by 790). A
  780x1400 tower next to an 1136x790 panel overhangs the panel by ~600px with
  dead space beside it. Narrowing the board trades a horizontal-overflow
  problem for a vertical-overflow one.

Conclusion: board width is game state (all players, deterministic, seeded);
the side-by-side arrangement is a per-player view concern. They are only
loosely coupled, so the layout goal is best served entirely on the client
without touching board generation.

## Non-goals

- No change to board generation, `ALGORITHM_VERSION`, seeds, or any stored
  board data. The 120-hex board is identical for every player.
- No new game option. This is a per-player display preference, so it never
  affects other players or game state.
- No change to the dice/oracle/god action strip, which lives in the BGA action
  bar (`#page-title`), separate from the game container.

## Design

### 1. Trigger: a new game preference (id 102)

Add preference `102` "Player Board position" to `gamepreferences.json`,
`needReload: false`, mirroring the existing supply-strip-position preference
`101`:

- 1: "Below the game board" (default)
- 2: "Beside the game board (wide screens)"

A small `_applyBoardLayout()` helper toggles a body/container class
`delphi-layout-beside`, applied at setup and on preference change, alongside
the existing `_applySupplyStripPosition()`.

### 2. Layout mechanism: CSS grid with template areas

Stacked mode is unchanged: `#delphi-game-container` stays a flex column of
`[board, supply, player-area]`, and the supply strip can still sit above,
between, or below via its `order` override (preference 101).

Beside mode switches `#delphi-game-container` to CSS grid so the supply strip
spans the **full width** of both columns (a 1120px strip confined to the right
column would be cramped against a ~2300px composition):

```
supply top:                       supply bottom:
  "supply supply"                    "board  player"
  "board  player"                    "supply supply"
```

The three supply-position values collapse to top-or-bottom in beside mode
(there is no vertical "between" when the board and player board are side by
side):

- "above the game board" -> top shelf
- "between the board and player board" (default) -> **top shelf**
- "below the player board" -> bottom shelf

Children get grid-area assignments: `#delphi-board-wrapper` -> board,
`#delphi-current-player-area` -> player, `#delphi-supply-strip` -> supply.
Within the right column the player area keeps its existing internal grid.

### 3. Board viewport behavior: fit the whole board

In beside mode a single uniform scale is applied to the whole two-column
composition so the board and player board are **both fully visible**, sized to
the viewport:

- `scale = availableWidth / (boardWidth + gap + playerWidth)`, clamped to a
  max of 1.
- On ~1920 that is ~0.83 (hexes ~50px, everything visible at a glance); on an
  ultrawide it is ~1.0.
- The existing horizontal `DragScroller` on `#delphi-board-container` stays
  wired, so pan remains available when the composition is scaled small.

Rejected alternative: keep hexes full size and pan the board in a fixed
window. It preserves hex size but forces constant dragging to reach the ~30%
of the board off-column at 1920, which defeats the "see both at once" goal.

### 4. Graceful degradation across screen sizes

Reuse the existing `initResponsiveScaling` and its `resize` and
`ResizeObserver` hooks. Generalize its reference width from the player-area
value `1136` to `boardWidth + gap + playerWidth` (~2300) when beside mode is
active. If the computed fit scale would fall below a readability floor
(~0.55, a window too narrow to be legible side by side), auto-fall-back to the
classic stacked layout for that viewport. Beside mode therefore engages only
when there is room and silently reverts on a narrow window. On true mobile the
layout is always stacked.

### 5. Integration hazard to manage

There are currently two scaling systems: the JS scaler and CSS `@media`
breakpoints (1280/1024/768) that scale the player area. In beside mode those
media rules would fight the new composition scale. Gate them behind
`:not(.delphi-layout-beside)` so beside mode is driven purely by the
generalized JS scaler. This is the main surface area of the change; the rest
is additive.

### 6. Facts that keep this low-risk

- Board clicks already invert ambient scale via `getBoundingClientRect` in
  `setupBoardClickHandler` (`scaleX = rect.width / offsetWidth`), so scaling
  the board keeps clicks landing on the correct hex. No coordinate rework.
- The action strip is outside the game container, so it is unaffected.
- No PHP, no server round-trips, no game-state changes. Fully reversible per
  player and per session.

## Files touched

- `gamepreferences.json`: add preference 102.
- `theoracleofdelphi.css`: beside-mode grid rules and template areas; gate the
  existing width `@media` rules behind `:not(.delphi-layout-beside)`.
- `theoracleofdelphi.js`: `_applyBoardLayout()` helper; wire preference 102 at
  setup and on change; generalize `initResponsiveScaling` for the two-column
  reference width and the stacked-fallback floor. Bump the JS cache-bust
  version per repo convention.

## Verification

Presentational change with no game logic, so no new PHP/JS unit tests. Verify
by driving the layout at representative widths (ultrawide ~2560, desktop
~1920, laptop ~1440, narrow ~1100) and confirming: beside mode engages with
both boards fully visible and correctly scaled; the supply strip spans full
width at the chosen shelf; board clicks land on the right hex under scale; and
the layout auto-reverts to stacked below the readability floor. Confirm the
classic stacked layout and preference 101 are unchanged when beside mode is
off.

## Open risks

- The readability floor (~0.55) and the exact reference-width gap are tuning
  values to confirm during implementation against real rendered widths.
- Transform-scaling a container that hosts the `DragScroller` scroll element
  should be validated (scaled scroll math), though clicks are already
  scale-corrected.
