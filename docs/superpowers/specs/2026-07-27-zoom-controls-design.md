# Zoom control: balancing the board against the player board

Date: 2026-07-27
Status: implemented

> **History.** Built as two independent sliders, briefly collapsed to a single
> combined control, reverted, and finally settled as ONE slider expressing the
> BALANCE between the two regions: "Game board" labels its left end, "Player
> board" its right, and each end shows its own live percentage. Centre is
> neutral (both 100%) and the two move as mirror images. The single-control build is reachable at 233c87f if the
> reasoning is ever wanted again. One detail from it is worth remembering: a
> *uniform* zoom must NOT be folded into the beside fit division, because the
> fit cancels it exactly. That trap does not apply here, since independent
> per-column multipliers are precisely what the fit base needs to absorb in
> order to keep the composition fitting.

## Problem

Players cannot adjust how large the game board and their player board appear.
The layout auto-fits to the window, which is a reasonable default but leaves no
room for preference: a player on a large screen may want a bigger board, and a
player who mostly watches their own board may want that larger instead.

## What already exists

Most of the machinery is present. This is largely a UI and persistence job.

| Piece | State |
| --- | --- |
| `HexGrid.setZoom / zoomIn / zoomOut / zoomFit` | Complete, clamps to `minZoom` 0.5 / `maxZoom` 1.5, applies `transform: scale()` with `transform-origin: top left` |
| `bx.DragScroller` on `#delphi-board-container` | Live. Board panning already works |
| `#delphi-board-container` | `overflow: hidden`, so a zoomed board is clipped and pannable, never widening the page |
| `_updateGameScale()` | Central auto-fit. Computes the scale for the player area and supply strip (stacked) or the whole composition (beside) |
| `setupZoomControls()` | **Dead code.** Wires `delphi-zoom-in/out/fit`, which are never created. Guarded by `if (el)`, so it silently no-ops |

## Decisions

1. **Manual zoom is a multiplier on top of auto-fit**, not an override. 100%
   means "whatever currently fits". Auto-fit keeps adapting to window size, so
   nothing can end up unusably large or small.
2. **One slider expressing a balance.** It drives two multipliers, one per
   region, which stay independent in both layouts including beside.
3. `_updateGameScale()` remains the **single writer** of the player-area scale.

## Model

Two persisted multipliers, both defaulting to `1`, moved together by the single
balance slider as mirror images:

- `boardZoom`
- `playerZoom`

### Game board

The slider drives `HexGrid.setZoom(boardZoom)`. This scales the grid *inside*
the already-clipped wrapper, so:

- it never widens the layout, in either mode;
- DragScroller already handles seeing the rest;
- behaviour is identical stacked or beside, because `offsetWidth` ignores
  transforms and so the beside fit maths is unaffected by board zoom.

`ZOOM_MAX` is capped at `HexGrid.maxZoom` so the readout can never promise a
size the board refuses to reach.

### Player board

`playerZoom` is stored on the game object and **read by** `_updateGameScale()`:

```
stacked:  scale = clamp(fitScale) * playerZoom
```

applied through the existing `_applyElementScale()`, which recomputes the
negative-margin compensation. `transform: scale()` keeps the original layout
box, so skipping that recompute produces dead space and phantom scrollbars.

### Beside layout

The player column takes its own scaled natural width; the board column takes
the remainder. The board zooms inside its clipped window rather than pushing the
composition wider. This is what makes "independent" and "always fits" both true
at once.

Consequence, accepted by G: in beside mode enlarging the player board takes
width from the board column, so the board shows less of itself until panned or
zoomed out. The balance mapping means the two always trade against each other
anyway, which is what the two end labels communicate.

## Interaction

- **Button**: `img/pieces/zoom.jpg`, top right, sitting **1px** below the
  action bar (measured from the action bar's bottom edge to the button's top). Mounted as a **sibling of** `#delphi-game-container`, not
  inside it, because the container is itself scaled in beside mode and a button
  inside would shrink exactly when it is hardest to hit.
- **Panel**: click toggles a popover anchored under the button, overlaying
  whatever is beneath. One balance slider: the left end labelled "Game board"
  and the right "Player board", each carrying its own live percentage, with
  `-` / `+` either side and **Fit** (back to centre).
- **Ceiling**: `ZOOM_MAX` is capped at `HexGrid.maxZoom`. A higher value would
  let the readout promise a size the board silently refuses to reach, because
  `HexGrid.setZoom` clamps internally and the label would keep counting up.
- **Ctrl + scroll / pinch** over either region does the same thing, for players
  who never open the panel.
- **Focal point**: zoom holds the viewport centre (slider and buttons) or the
  cursor (ctrl+scroll), adjusting the container's scroll offset by the same
  delta. Scaling from the origin makes the board lurch and loses the player's
  place.
- Dismiss on outside click and on Escape.

### What the zoom does NOT touch

The component strip (`#delphi-supply-strip`) keeps the plain fitted scale and is
deliberately left out of the user zoom. It is a fixed shelf of decks and supply
cards rather than part of the player's board, so resizing it with the board only
costs vertical room. It still follows the automatic fit, just not the slider.

## Persistence

`localStorage`, keyed by table id and player id, so two tables and two accounts
on one browser do not collide. BGA user preferences cannot be used: they are
discrete dropdowns and cannot carry a continuous value.

Corrupt or absent values fall back to `1`. Values are clamped on read, so a
hand-edited key cannot wedge the layout.

## Testing

- Node tests over the extracted helpers: clamping, persistence round-trip,
  corrupt-value fallback, and that the multiplier composes with a fit scale
  rather than replacing it.
- Browser harness measuring the **actual rendered** scale of both regions
  across window sizes and both layouts, proving:
  - a zoom survives a window resize (the reset bug this design exists to
    prevent);
  - the compensation margin tracks the applied scale;
  - board zoom never changes the layout width.

## Out of scope

- Porting anything to `BoardBuilder.js`; it does not generate real boards.
- Replacing the existing responsive auto-fit. This layers on top of it.
