# Zoom control: one slider sizing the whole game view

> **Revised after first build.** This began as two independent sliders (board
> and player board). Seeing it in place, G asked for a single control instead,
> "as long as it is properly labelled". The sections below are updated; the
> reasoning about auto-fit, the single writer and persistence is unchanged, and
> the per-column beside-mode machinery has been removed.

Date: 2026-07-27
Status: approved by G, ready to implement

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
2. **One control**, applied to the board and the player board together, and
   labelled so that is obvious.
3. `_updateGameScale()` remains the **single writer** of the player-area scale.

### Why the fit is computed on natural sizes

The zoom must be applied *after* the fit division, never folded into it. In the
beside layout the composition is fitted to the available width, so dividing by
zoomed widths and then multiplying by the same zoom cancels exactly: measured,
100% gave 0.564 and 140% gave 0.566, and the slider would have appeared to do
nothing in that layout. `test_zoom_js.js` pins this.

## Model

One persisted multiplier, defaulting to `1`, applied to both regions.

### Game board

The slider drives `HexGrid.setZoom(zoom)` in the stacked layout. This scales
the grid *inside*
the already-clipped wrapper, so:

- it never widens the layout, in either mode;
- DragScroller already handles seeing the rest;
- `offsetWidth` ignores transforms, so the fit maths never sees it.

In the beside layout the grid zoom is released and the composition scale covers
the board instead, because the board wrapper is deliberately `overflow: visible`
there and a scaled grid would spill over the player column.

`HexGrid` clamps to 0.5..1.5 already. The slider exposes 60%..160% and lets the
clamp win at the extremes.

### Player board

The multiplier is stored on the game object and **read by**
`_updateGameScale()`:

```
stacked:  scale = clamp(fitScale) * zoom
beside:   compositionScale = clamp(fitScale) * zoom
```

applied through the existing `_applyElementScale()`, which recomputes the
negative-margin compensation. `transform: scale()` keeps the original layout
box, so skipping that recompute produces dead space and phantom scrollbars.

### Beside layout

One composition scale covers both columns, so they grow together as the single
slider promises. The grid's own zoom is released here, or it would apply a
second time on top of the composition scale.

## Interaction

- **Button**: `img/pieces/zoom.jpg`, top right of the player area, just under
  the action bar. Mounted as a **sibling of** `#delphi-game-container`, not
  inside it, because the container is itself scaled in beside mode and a button
  inside would shrink exactly when it is hardest to hit.
- **Panel**: click toggles a popover anchored under the button, overlaying
  whatever is beneath. One row: a percentage readout, `-` / `+`, a slider, and
  **Fit** (back to 100%), plus a line stating that it sizes the board and the
  player board together.
- **Ctrl + scroll / pinch** over either region does the same thing, for players
  who never open the panel.
- **Focal point**: zoom holds the viewport centre (slider and buttons) or the
  cursor (ctrl+scroll), adjusting the container's scroll offset by the same
  delta. Scaling from the origin makes the board lurch and loses the player's
  place.
- Dismiss on outside click and on Escape.

## Persistence

`localStorage`, keyed by table id and player id, so two tables and two accounts
on one browser do not collide. BGA user preferences cannot be used: they are
discrete dropdowns and cannot carry a continuous value.

Corrupt or absent values fall back to `1`. Values are clamped on read, so a
hand-edited key cannot wedge the layout. The short-lived two-value shape
(`{board, player}`) is migrated by taking the larger of the two rather than
resetting anyone to 100%.

The wiring is bound exactly once. Mounting the markup and wiring it live in
different parts of `setup()`, and calling the wiring from both bound every
handler twice: the toggle opened the panel and its duplicate closed it, so the
button appeared dead. `setupZoomControls()` is idempotent and the test asserts
one wiring call and one mount.

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
