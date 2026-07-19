# Design: compact ring-gauge god row in the player panels

Date: 2026-07-19
Status: Approved for planning

## Goal

Shrink the god display in each BGA player summary panel (the "pantheon") and
call out each god's row explicitly, with a delightful state when a god reaches
the top row (its ability is usable). Scope is the panel pantheon only, not the
large interactive god track on the ship's-log board.

## Current state (what changes)

`Components.renderPantheon(playerId, gamedatas)` builds `.delphi-pp-pantheon`
(a 6-column grid, one column per god) and calls `_renderGodTrack(playerId,
god, step)` per god. Each god renders as `.delphi-pp-god-track`: a **70px-tall**
gradient column with a `.delphi-pp-god-token` (the god icon) absolutely
positioned by `_godTopPx(step)` so its height encodes the step. The row number
is not printed; it lives only in the token `title` tooltip. `updateGodStep`
moves the token and toggles a `topped` glow class. Total pantheon height is
~83px.

Problems: it eats vertical space, the row is not explicit (tooltip only), and
the "at the top" state is a subtle box-shadow that is easy to miss.

## Design

Replace the positional column with a **ring gauge** per god, keeping the
6-across grid.

### Each god cell (`~38px`, down from 70px)

- A circular **progress ring** around the god icon, filled proportional to the
  row: a `conic-gradient` whose filled arc runs to `var(--god-fill)`, a
  ready-made angle (row x 60deg, so 6 rows fill the circle) set inline by JS.
  A pre-computed angle is used instead of `calc(var(--god-step) * 60deg)`
  because conic-gradient rejects `calc()` on a unitless custom property. The
  filled arc is a deep gold (`#c99a3a`) over a translucent track. This
  preserves the at-a-glance "how close to the top" comparison across all six
  gods. (Note: `--gold-deep` is referenced but undefined elsewhere in the
  panel CSS, so a literal is used here; the undefined-var bug is tracked
  separately.)
- The **god icon** (`.delphi-pp-god-token`, existing `god-<name>` background)
  centered inside the ring, static (no more `top` positioning).
- A small **row-number badge** at the bottom-right showing the absolute row
  `0-6` (matches the physical board's numbered rows). Explicit and readable
  without hovering.
- `title` kept for screen readers / hover: `"<God> - row N"`, or
  `"<God> - row N (ability ready)"` at the top.

### Top row (row 6, ability usable): radiant halo

When `step >= 6`, the ring blooms into a **radiant golden halo**: the ring
turns full bright gold (`--gold`) and a soft outer aureole (drop-shadow glow)
blooms around it. It reads as "ascendant / power ready," needs no per-god art,
and is clearly distinct from the deep-gold partial arc. A gentle glow pulse
plays when motion is allowed; under reduced motion it renders as a static
aureole (see below). Literal rays were dropped: at ~38px in a six-across panel
they read as noise, and the glowing aureole conveys the halo cleanly.

### JS changes (`modules/js/Components.js`)

- `_renderGodTrack` returns the ring-gauge markup: gauge container +
  `--god-step` inline + centered icon + number badge + `topped` class when
  `step >= 6`.
- `updateGodStep(playerId, god, step)` sets `--god-step`, updates the badge
  text and `title`, and toggles `topped`. It no longer positions the token.
- `_godTopPx` is removed (no consumer remains).

### CSS changes (`theoracleofdelphi.css`)

- Replace the `.delphi-pp-god-track` (70px positional column) rules with the
  ring-gauge rules: gauge container, `::before` conic ring, `::after` inner
  cutout showing the panel background (donut), centered token, `.pp-god-row`
  badge, and the `.topped` halo (aureole glow + rays + optional pulse).
- Keep the `god-<name>` background-image rules for the token.
- The pantheon grid stays `repeat(6, 1fr)`; only the per-cell height shrinks.

### Reduced motion

The halo's glow pulse (and any ray shimmer) must be gated. Add the topped
halo's animated selector to BOTH existing suppression lists
(`@media (prefers-reduced-motion: reduce)` and `body.motion-reduced-pref`),
matching the pattern already used for the board track's row-6 pulse. Static
fallback: the full gold ring + aureole + rays, without animation, so the top
state is still obvious.

## Non-goals

- No change to the big ship's-log god track (`#delphi-god-track`) or its
  advance/use-ability interactions.
- No server, game-state, or data changes; `panelState.gods[g].step` is the
  same input. Purely presentational, applies to every player panel including
  opponents'.
- The panel pantheon is display-only (a summary), so there are no click
  targets to preserve.

## Verification

Presentational, no game logic, so no new unit tests. Verify in a browser
harness against the real CSS: render gods at rows 0, 3, 5 and a topped god at
6; confirm the ring fills proportionally, the badge shows the absolute row,
the topped god shows the radiant halo, the row is legible, the cell is ~38px
(pantheon materially shorter than 83px), and the halo animation freezes under
`body.motion-reduced-pref` while staying visibly "topped."

## Open risks

- Exact gauge diameter, badge size, and ray intensity are tuning values to
  settle against the real panel width (6 cells across a narrow panel).
- Legibility of a 0-6 badge at panel scale; bump size/contrast if needed.
