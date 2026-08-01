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
   region, which stay independent of each other.
3. **The control exists only side by side.** Stacked, the two regions are in
   separate rows and share no width, so a balance between them has nothing to
   trade. The control is hidden there and any zoom is reset to neutral.
4. `_updateGameScale()` remains the **single writer** of the player-area scale.

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
left them all behind: measured 150px adrift at 150% zoom, still at their original
size while the hexes under them grew. Scaling a *container* repositions its
children, which is why the Zeus token lives **inside** that overlay rather than
carrying a transform of its own. A leaf scaled about its own corner grows without
moving to where its hex went.

Since the control became side-by-side-only, `setZoom` is only ever called with 1
(beside puts the multiplier on the column instead), so this desync can no longer
be reached from the UI. It stays fixed because `setZoom`, `zoomIn`, `zoomOut` and
`zoomFit` are public and the next caller should not have to rediscover it.

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

`playerZoom` is stored on the game object and **read by** `_updateGameScale()`,
which applies it as a column scale beside the board. It is never applied in the
stacked layout, where it is held at neutral.

Scales go on through `_applyElementScale()` / `_applyColumnZoom()`, which
recompute the margin compensation. `transform: scale()` keeps the original layout
box, so skipping that recompute produces dead space, phantom scrollbars, or
overlapping columns.

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

The two columns are **vertically centred against each other** rather than both
hanging from the top. Board height is emergent per game, so either column can be
the shorter one: measured across 40 boards, the board is taller than the 790px
player area on most Spacious tables (by up to 239px) and shorter on most Compact
ones. Top alignment left that whole difference as dead space under one column,
measured at 91px of centre.

This composes with the per-column zoom because that rule's margin compensation
makes each column's margin box equal its painted extent, so centring the margin
box centres what is drawn. Verified at balance 0, where the columns differ by
755px in height and remain exactly centred.

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

  Hidden entirely (`[hidden]`, plus an explicit `display: none` rule so no author
  style can override the UA one) whenever the layout is stacked.

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

### Stacked layout: no zoom at all

`_syncZoomAvailability(false)` hides `#delphi-zoom-ui` and returns the zoom to
neutral. Rationale: the two regions are in separate rows and never compete for
width, so a balance between them has nothing to trade. Offering a control that
cannot express anything useful is worse than not offering it.

The reset is **persisted**, so storage always matches what is on screen and a
zoom cannot reappear on the next reload. The accepted cost is that a zoom is
forgotten rather than suspended: narrowing past the side-by-side threshold and
widening again returns to neutral, not to the previous size.

Three details that make it hold:

- The panel is force-closed on the way out, since it may have been open at the
  moment the layout changed.
- `setZoomBalance()` refuses while stacked. The panel is hidden, but the
  `ctrl+wheel` and keyboard handlers are bound to the region and the document, so
  without the guard they would still drive an invisible control. The stacked
  relayout resets it anyway, so the visible symptom is a flicker: zoom applied,
  then snapped back within the same call.
- **Both handlers check the layout BEFORE `preventDefault()`.** Refusing to zoom
  is not sufficient. Claiming the chord and then discarding it leaves the player
  in "below the game board" with no board zoom *and* no page zoom, which is
  strictly worse than never having added the shortcut. Page zoom and trackpad
  pinch are how low-vision players cope, so the gesture goes back to the browser
  whenever the zoom does not exist. Side by side it is still claimed, or the page
  zooms too and the two compound.
- Because the zoom is always neutral here, the stacked branch needs no cap and no
  board window sizing. Both existed only to make a stacked zoom behave and were
  removed rather than left as machinery for a case that can no longer arise.

### Who does NOT get the zoom

Spectators, and anyone whose id is not among the players (archive viewing). Both
already have `#delphi-current-player-area` hidden at setup, because every board
appears in the opponent row instead. A balance between the game board and a board
that is not on screen cannot express anything: one end of the slider would scale
nothing while the other still shrank the game board, so the control could only
make their view worse.

`_hasOwnPlayerBoard()` is the single predicate, shared with the code that does the
hiding so the two cannot drift apart about who counts as a spectator. It gates
three places: the markup is never mounted (which also means `setupZoomControls()`
finds no toggle and binds neither the wheel nor the keyboard handlers),
`setZoomBalance()` refuses first thing, and `_updateGameScale()` passes it to
`_syncZoomAvailability()` so any stored zoom is reset rather than applied.

That last one exposed a latent ordering bug: `boardZoom`/`playerZoom` were read
into locals before `_syncZoomAvailability()` could reset them, so a spectator's
first relayout still applied the discarded values. The multipliers are now re-read
after that call. Moving the decision earlier is safe precisely because the
beside-or-stacked choice is deliberately zoom-independent.

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
