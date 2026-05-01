# Monster Chip — Stone Thickness & Sandwich Stacking

## Goal

Replace the current solid-color CSS sides on monster chips with a stone-textured side that matches `img/pieces/monster.png`, and change stacked-monster geometry so chips stack as a literal vertical sandwich (no horizontal offset) instead of staircasing to the right.

## Current state

- `Components.js:185–258` (`createMonster`) builds each chip from three CSS faces: `.monster-face-top` (artwork), `.monster-face-front` (bottom edge, solid color), `.monster-face-right` (right edge, solid color).
- `Components.js:265–298` (`updateMonsterStack3D`) positions stacked chips with `translateZ(i * 7px) translateY(-i * 4px + centerOffset)`. The `translateY` is what creates the staircase-to-the-right pattern.
- `theoracleofdelphigzed.css:1454–1547` defines the 3D structure, the per-monster solid color side fills, and the parent isometric tilt `perspective(200px) rotateX(22deg) rotateZ(-30deg)`.
- Chip thickness is `7px` (Z translation of the top face; height/width of the side faces).
- Six monster types with established color variables: cyclops (red), minotaur (black), chimera (yellow), hydra (pink), gorgon (green), siren (blue).
- Texture asset already exists at `img/pieces/monster.png` (the `img/` directory is gitignored, same as all other assets — runtime-only).

## Changes

### 1. Stack geometry — pure vertical sandwich

In `updateMonsterStack3D` (`Components.js:265–298`):

- Remove the `translateY(-i * 4px)` offset between stacked chips.
- Keep the `translateZ` offset (each chip lifts by one chip thickness above the one below).
- Keep `centerOffset` so the stack stays visually centered on the hex regardless of stack height.
- The parent isometric tilt (`rotateX(22deg) rotateZ(-30deg)`) stays unchanged — chips still read in 3/4 view.

Result: chips stack directly above each other. From the existing camera angle the colored stone sides of every chip in the stack are visible; only the topmost chip's monster artwork is visible on the top face. No JS logic is needed to hide the top faces of lower chips — the opaque side walls of the chip above naturally occlude them.

### 2. Stone texture on the sides

In `theoracleofdelphigzed.css:1454–1547`:

- Add `background-image: url('img/pieces/monster.png')` to `.monster-face-front` and `.monster-face-right`.
- Use `background-position` and `background-size` to crop the stone-side region of the source PNG and stretch it across the thin face area.
- The exact crop coordinates will be tuned during implementation by inspecting the source image dimensions; the goal is that only the stone strip (not the carved face) appears on the chip side.

`.monster-face-top` continues to use the existing per-monster `.jpg` artwork — unchanged.

**Fallback:** if the cropped strip doesn't stretch cleanly, generate a dedicated side-strip asset with `sips` and save as `img/pieces/monster-side.png`, then reference that instead. Start with the CSS-only approach; only fall back if the visual is poor.

### 3. Per-monster tint on the stone

For each monster type, blend the type's color into the stone texture so color cue is preserved on the side:

```css
.monster-face-front,
.monster-face-right {
  background-image: url('img/pieces/monster.png');
  background-color: var(--monster-side-color);
  background-blend-mode: multiply;
  background-position: <stone-strip-coords>;
  background-size: <strip-stretched-to-face>;
}
```

Per-type `--monster-side-color` is set by the existing `.delphi-monster-{type}` selectors (reuse the current darker-shade values from lines 1513–1547).

**Fallback:** if `multiply` produces muddy results for the lighter monster colors (yellow/pink especially), swap to `soft-light` or `overlay` per affected type. Pick the best per type during implementation.

### 4. Chip thickness — 7px → 10px

In CSS:

- `.monster-face-top` `translateZ(7px)` → `translateZ(10px)`.
- `.monster-face-front` height `7px` → `10px`.
- `.monster-face-right` width `7px` → `10px`.

In JS (`updateMonsterStack3D`):

- Z offset between stacked chips `7px` → `10px` so chips remain flush.

The wider stone band makes the sandwich stack read more clearly without making a single un-stacked chip look bulky.

## Files affected

- `modules/js/Components.js` — `updateMonsterStack3D` only (drop Y offset, bump Z offset to 10px).
- `theoracleofdelphigzed.css` — `.monster-face-top` Z translation, `.monster-face-front` and `.monster-face-right` dimensions plus stone-texture backgrounds and blend mode, per-monster `--monster-side-color` variable plumbing.

No changes to `createMonster`, no new components, no new image assets (unless fallback is needed).

## Out of scope

- Hover preview rendering (`showMonsterHoverPreview`, `Components.js:440–479`) — keeps existing behavior unless it visibly breaks.
- The isometric tilt angle and `perspective` value — unchanged.
- The monster artwork JPGs themselves.
- Animations or transitions when chips are added/removed from a stack.

## Success criteria

- A single un-stacked monster chip on the hex shows: monster artwork on top, tinted stone texture on the visible front and right sides.
- A stack of N monster chips shows: N tinted stone bands stacked directly above each other (no staircase), with the topmost chip's artwork on top and no other artwork visible.
- Each monster type's tinted stone is visually distinguishable from the other five.
- No regressions in the un-stacked single-chip rendering, in hover preview, or in click/select interactions.
