# Design: make "Look at Islands" discoverable

Date: 2026-07-19
Status: Approved for planning

## Problem

"Look at Islands" is a die action: spend your selected die to secretly reveal
up to 2 unrevealed ("cloudy") shrine islands and learn what is on them. It is
the **only** die action with no visual affordance. When a die is selected the
game highlights every place you can act (move hexes, deliverable temples,
explorable/buildable islands, fightable monsters, advanceable god, oracle deck,
favor pile) with the gold "act here" pulse; peekable islands get nothing. The
client silently stores which islands are peekable (`_peekableHexKeys`) and
waits for the player to happen to click one. New players don't know the action
exists, and even those who do have no on-board cue for how to start it.

## Non-goals

- **No button.** A "Look at Islands" button would be inconsistent with the
  other board-affordance die actions (e.g. taking favor tokens is discovered by
  the glowing favor pile, not a button). Look stays a board affordance.
- No change to the Look game logic, states (`SelectAction` ->
  `actLookAtIslands` -> `PeekIslands`), or the persistent peek-knowledge
  markers.
- Constraint: there can be ~8 unrevealed islands at once, so the affordance
  must not mark them all persistently (that reads as clutter and competes with
  the gold action highlights).

## Design

Two complementary, board-native pieces built on things that already exist.

### 1. Teach it in the shrine tooltip

The unrevealed-shrine-island tooltip (`_buildIslandTooltipHtml`, the branch
that renders "Unrevealed Shrine Island" + "Explore with a `<colour>` die")
gains a **Look line** beneath the Explore line, e.g. *"Look: spend a die to
secretly reveal what's on up to 2 unrevealed islands."* It is always shown
(descriptive, like the Explore line), so any player hovering a cloudy island to
learn what it is now also learns the Look action by name. This carries the
"players don't know it exists" half.

### 2. Extend the eye-badge language with a hover affordance

The game already uses a **solid eye** (`.shrine-peek-marker` on the shrine
overlay) to mean "this island has been looked at" (your persistent peek marks
and others' live looks). We add the missing first stage of that same motif:

- On your turn, while a die is selected and there are peekable islands
  (`_peekableHexKeys` is populated), **hovering** a peekable island shows a
  **hollow "lookable" eye** (`.shrine-look-available`) on its shrine overlay,
  with a gentle pulse. Only the hovered island shows it, so at most one appears
  at a time.
- Clicking the island starts the Look (existing
  `_enterPeekWithPreselectedHex` / explore-vs-peek confirm path). Once looked,
  the island carries the persistent **solid** eye. Visually the **hollow eye
  fills into the solid eye** — the affordance and the knowledge marker are the
  same eye at two stages ("open the eye").
- The hollow eye is calm and clearly distinct from the gold "act here" pulse,
  so an island that is both explorable (gold) and lookable (eye) reads as
  offering both.

This carries the "can't find the trigger" half without persistent clutter.

### 3. Reduced motion

The hollow-eye pulse is gated in both reduced-motion blocks (the
`@media (prefers-reduced-motion)` list and `body.motion-reduced-pref`), falling
back to a static hollow eye (still visible on hover).

## Implementation notes

- `theoracleofdelphi.js`
  - `_buildIslandTooltipHtml`: add the Look line to the unrevealed-shrine
    branch.
  - `_setupLookHover()` (called at setup): one delegated `mousemove` on
    `#delphi-board-container`. Resolve the hex (`_hexFromEvent`); if it is in
    `_peekableHexKeys`, add `.shrine-look-available` to that hex's shrine
    overlay (via `_shrineIdFromHex` + `components.shrines`); on hex change or
    leaving a peekable hex, remove it. Dedupe by hex key. Not gated on the
    delivery-highlight preference (this is a core affordance), so it is a
    separate listener from `_setupDeliveryHighlightHover`.
  - Clear any `.shrine-look-available` when `_peekableHexKeys` is cleared
    (state exit) so a stale hover eye never lingers.
- `theoracleofdelphi.css`
  - `.shrine-look-available`: hollow eye (outline ring, translucent fill,
    the same eye glyph/size as `.shrine-peek-marker`), gentle pulse; add it to
    both reduced-motion suppression lists.

## Verification

- The tooltip Look line renders on unrevealed shrine islands (inspection /
  Studio hover).
- Hover logic: a harness confirming that, given a `_peekableHexKeys` set,
  hovering a peekable hex adds `.shrine-look-available` to its shrine element
  and removes it on leaving / on a non-peekable hex.
- Reduced motion: computed `animation` on `.shrine-look-available` is `none`
  under `body.motion-reduced-pref`.
- Live in Studio: on your die-selected turn, hover a cloudy island -> hollow
  eye + tooltip Look line; click -> look; the island keeps the solid eye.

## Open risks

- The exact hover mechanism reuses the pixel->hex resolution already used by
  the board click handler and delivery hover, so it inherits their
  scale-correctness; still worth confirming the eye lands on the right island
  under the beside-layout scale in Studio.
