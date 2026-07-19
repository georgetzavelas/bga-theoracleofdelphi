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

Replace the positional column with a compact **icon + vertical pip meter +
row number** per god, keeping the 6-across grid.

(Design note: this started as a circular ring gauge. It shipped, but the ring
arc and especially the top-row gold halo were hard to read on the cream panel,
because gold and cream are nearly equal in lightness so a glow has nothing to
lighten against. It was then reworked into the vertical pip meter below, with a
high-contrast dark-ringed medallion for the top row instead of a glow. The file
name is kept for history.)

### Each god cell (`~36px` tall, down from 70px)

- The **god icon** (`.delphi-pp-god-token`, existing `god-<name>` background),
  22px, static.
- A **vertical pip meter** (`.delphi-pp-god-meter`) beside it: six pips that
  fill bottom-up to the current row, mirroring the god climbing the board's
  track. Rendered with `flex-direction: column-reverse` so the first pip sits
  at the bottom; filled pips are dark bronze (`#6e4f0c`, legible on cream) over
  a light track. This is the at-a-glance "how close to the top" cue.
- A small **row-number badge** at the icon's bottom-right showing the absolute
  row `0-6` (matches the physical board's numbered rows). Explicit and readable
  without hovering.
- Widths are small enough (icon + gap + meter) that all six fit the 240px
  panel with margin.
- `title` kept for screen readers / hover: `"<God>, row N"`, or
  `"<God>, row N (ability ready)"` at the top.

### Top row (row 6, ability usable): gold medallion

When `step >= 6`, the god icon becomes a **dark-ringed gold medallion** (gold
`background-color` behind the god art + a `--pp-ink` ring) and the meter fills
with gold. The **ink ring provides the contrast** that a gold glow could not on
the cream panel, so the top row is unmistakable. It is static (no animation),
so no reduced-motion handling is needed.

### JS changes (`modules/js/Components.js`)

- `_renderGodTrack` returns the pip-meter markup: gauge container (legacy id) +
  icon-wrap (token + number badge) + a `.delphi-pp-god-meter` of six
  `.delphi-pp-god-pip` spans (first `row` filled), + `topped` class when
  `step >= 6`.
- `updateGodStep(playerId, god, step)` toggles `.on` on the six pips (`i < s`),
  updates the badge text and `title`, and toggles `topped`.
- `_godTopPx` is removed (no consumer remains).

### CSS changes (`theoracleofdelphi.css`)

- Replace the `.delphi-pp-god-track` (70px positional column) rules with the
  pip-meter rules: flex-row gauge container, icon-wrap, token, `.pp-god-row`
  badge, `.delphi-pp-god-meter` (`column-reverse`), `.delphi-pp-god-pip`
  (`.on` = dark bronze), and the `.topped` medallion + gold-meter rules.
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
