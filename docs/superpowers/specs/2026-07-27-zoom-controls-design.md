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

The slider drives `HexGrid.setZoom(boardZoom)`. This scales the board *inside* a
clipping window, so:

- it never widens the layout, in either mode;
- DragScroller already handles seeing the rest;
- the beside fit maths is unaffected, because `offsetWidth` ignores transforms.

`ZOOM_MAX` is capped at `HexGrid.maxZoom` so the readout can never promise a
size the board refuses to reach.

`setZoom` transforms **every layer in board coordinates**, not just the hex art.
`#delphi-board-pieces` is a sibling of `#delphi-hex-grid` holding every ship,
shrine, statue and monster at unscaled board pixels, so scaling the art alone
left them all behind: 150px adrift at 150% zoom, still at their original size
while the hexes under them grew. Scaling a *container* repositions its children,
which is why the Zeus token had to move **inside** that overlay rather than get
a transform of its own. A leaf scaled about its own corner grows without moving
to where its hex went.

This never surfaced before because `setZoom` had no caller: the old
`setupZoomControls` wired buttons that were never created.

Scaling that overlay has a knock-on effect: anything converting a **viewport**
point into overlay coordinates must divide the scale out first, or the transform
multiplies the offset again and the result misses by exactly the zoom factor.
`_toBoardPiecesPoint()` does that, taking the scale from
`getBoundingClientRect().width / offsetWidth` so it captures the total applied
scale (board zoom, plus the composition and column scales in beside mode) rather
than assuming which ancestor caused it. The shrine-token flight is the current
caller, at both endpoints. Placement helpers that already work in board
coordinates, and the geometric hit-test that compares viewport rects to viewport
coords, need no conversion.

### Player board

`playerZoom` is stored on the game object and **read by** `_updateGameScale()`:

```
stacked:  scale = clamp(fitScale) * playerZoom
```

applied through the existing `_applyElementScale()`, which recomputes the
negative-margin compensation. `transform: scale()` keeps the original layout
box, so skipping that recompute produces dead space and phantom scrollbars.

### Which layout, and why zoom must not decide

The layout is chosen from the preference and the **natural** widths, never from
the zoom. Zoom moving the layout out from under the player is disorienting in
both directions, and feeding it into the readability floor did exactly that: one
nudge of the slider flipped a stacked table into beside (and, before that, a
zoomed beside table into stacked). Deciding on natural widths gets both
properties at once and drops a special case.

So the effective layout can differ from the preference, whenever beside is
preferred but the window is too narrow to read it. Anything that behaves
differently per layout must therefore ask `_besideActive()`, which reads the
class actually applied, rather than the `_besideLayout` preference. Reading the
preference is what silently discarded the board multiplier on a narrow window,
leaving the whole game-board half of the slider dead.

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

- **Button**: `img/pieces/zoom.png`, rendered as a transparent icon rather than
  a button with a picture on it. A `<button>` carries a UA background and border
  that would show through the PNG's transparent areas as a grey box, so both are
  cleared and `appearance: none` stops the platform adding chrome back. Sized
  with `contain` so a non-square icon is not cropped, and the shadow uses
  `filter: drop-shadow()` rather than `box-shadow`, because drop-shadow follows
  the alpha channel while box-shadow would outline the transparent bounding box.
  The open state glows the icon itself, since there is no longer a border to
  recolour. Keyboard focus still comes from the global `*:focus-visible` gold
  ring, so removing the border costs nothing there.

  Positioned top right, sitting **1px** below the
  action bar (measured from the action bar's bottom edge to the button's top),
  with its right edge aligned to the action bar's.

  The horizontal inset is measured at runtime by `_alignZoomButton()` rather
  than hardcoded, because the button is positioned against the game area and
  nothing guarantees the action bar shares that width. It is recomputed from
  `_updateGameScale()`, so it survives resizes like the scales do. A negative
  inset is allowed when the bar reaches past the game area, bounded by the
  distance to the viewport edge: aligning exactly matters more than staying
  inside the game area, but not more than avoiding a page scrollbar. Mounted as a **sibling of** `#delphi-game-container`, not
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
- **The platform zoom chord**: plus moves the balance toward the player board,
  minus toward the game board, in the same 5-point steps as the slider. Both
  Ctrl and Meta are accepted, since the chord is Ctrl on Windows and Linux but
  Cmd on macOS, and several spellings per direction (`+`, `=`, `NumpadAdd` and
  `-`, `_`, `NumpadSubtract`) because `+` needs Shift on most layouts.

  It calls `preventDefault()` to claim the chord, so the browser does not also
  zoom the page and compound the effect. It stands down entirely when the event
  target is an `input`, `textarea` or contenteditable, so BGA's chat keeps it.
  The panel names the platform's own modifier so the hint reads correctly on the
  machine showing it.
- **Focal point**: zoom holds the viewport centre (slider and buttons) or the
  cursor (ctrl+scroll), adjusting the container's scroll offset by the same
  delta. Scaling from the origin makes the board lurch and loses the player's
  place.
- Dismiss on outside click and on Escape.

### Stacked layout

Both regions still trade against each other here, but the constrained axis is
vertical rather than horizontal: the two sit in separate rows, so a bigger board
costs less scrolling rather than nothing. Same control, same meaning, and the end
labels stay honest.

- **Game board.** The clipping window is sized to the zoomed board, so a zoom
  spends the available width showing *more* board instead of cropping it at the
  natural width. It only starts clipping (and panning) once the board is
  genuinely wider than the page. Height is never capped: vertical room costs
  only page scroll, so the board keeps its bottom edge.
- **Player board.** Capped at the width that still fits. This region has no pan
  and grows from `top center`, so anything past the edge spills off *both* sides
  at once and its left half is unreachable for good, measured at −152px.

Consequence, accepted: on a window with no spare width the player-board end of
the slider cannot enlarge the player board. It still shrinks the game board, so
no slider position is inert, and the readout reports the capped size rather than
the request so the ceiling is visible rather than mysterious.

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
