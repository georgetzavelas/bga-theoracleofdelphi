# Design: Related-island hover highlight

Date: 2026-07-18
Status: Approved for planning

## Goal

Hovering an island reveals, on the board, the other islands it is linked to by
the game's delivery rules, so a player can see at a glance "where does this go"
(and the reverse). Purely an informational, client-only awareness aid.

Two relationships, each bidirectional and matched by token color:

- **Offering island <-> Temple.** An offering island holds colored offering
  tokens; each color has exactly one temple. Hovering the island lights the
  temple(s) matching the colors of offerings still on it; hovering a temple
  lights the island(s) still holding that color's offerings.
- **City <-> Statue island.** A city holds colored statue tokens (the statue
  source); a statue island accepts a fixed set of up to three colors (its
  pedestals). Hovering a city lights the statue islands that accept the colors
  of statues still in it; hovering a statue island lights the cities still
  holding statues of any color it accepts.

## Non-goals

- No server changes and no game state. Fully client-side and derivable from
  existing `gamedatas`. The feature is gated behind a new client display
  preference (below), off by default.
- Not an action affordance. It is independent of whose turn it is, of ship
  reachability, and of the die color. The existing gold `hex-action-target`
  pulse (Make Offering / Raise Statue) stays the sole "you can act here now"
  signal; this feature must read as visually distinct from it.
- Shrines, monsters, and Zeus are out of scope.

## Preference (id 103)

Gated behind a new game preference `103` "Highlight delivery locations on
hover", `needReload: false`, values Off (default) and On, appended after the
existing preferences (it therefore appears at the bottom of the list by BGA's
ID ordering; the existing prefs 100-102 are left untouched, no renumber). When
off, the hover handlers are inert (bound but early-return), so there is zero
change from today. Turning it on or off applies live via
`onGameUserPreferenceChanged` without a reload; turning it off mid-hover clears
any active overlay.

## Semantics

- **Enabled by the preference.** Everything below applies only when preference
  103 is On. When off, no highlight is ever shown.
- **Always on (when enabled).** Hover works on any turn (including opponents'
  turns) and for any island, reachable or not.
- **Current contents.** A related island is lit only when it currently has
  matching tokens to move. A token counts as "still at its origin" when it is
  neither loaded onto a ship nor delivered/raised:
  - Offering: `originQ/originR == hex`, `playerId` empty, `isDelivered = 0`.
  - Statue in a city: `originQ/originR == city hex`, `playerId` empty,
    `isRaised = 0`.
  An offering island whose offerings are all gone, or a temple whose color has
  no offerings left on any island, simply highlights nothing.
- **Color is the link.** Highlights are color-coded to the token color. An
  island with tokens of two colors lights each partner in that partner's color;
  a many-to-many case (a city with two statue colors, a statue island accepting
  three) can light multiple partners at once.

## Visual treatment: thread + halo

On hover, for each related partner and each matching color:

- **Halo:** a soft glowing ring around the partner hex in the matching color.
  Distinct from the gold action pulse by color and by being a thin ring rather
  than a filled disc.
- **Thread:** a gently curved, color-matched line from the hovered hex to the
  partner hex, with a small dot anchoring the partner end.

The hovered hex itself gets a neutral white outline so the source is
unambiguous. When an island has many partners, threads may be thinned or
capped (draw the halos for all, but limit the number of simultaneous threads)
to avoid clutter; the exact cap is a tuning value.

**Reduced motion (required).** The halo pulse and the thread's flowing dashes
are animations. When reduce motion is active, they must not animate: the halo
becomes a steady ring and the thread a static line, both still fully visible.
This is handled in CSS, not JS: the animations live on dedicated classes that
are added to the two existing suppression blocks, so the same DOM renders
either way.

- `@media (prefers-reduced-motion: reduce)` (OS setting), and
- `body.motion-reduced-pref` (the in-game "Reduce motion" preference, pref 100).

## Architecture

Four small, well-bounded pieces:

1. **Hover binding.** The board already has invisible per-hex hit targets
   (`.island-hover-target`, id `hex_<q>_<r>`) created by
   `_bindIslandTooltipForHex` for every island/city hex. Extend that same
   function: when a hex's attribute is `offering`, `temple`, `statue`, or
   `city`, attach `mouseenter` -> `_showRelatedIslands(hex)` and `mouseleave`
   -> `_clearRelatedIslands()` (guarded by a dataset flag so re-binding on
   reveal does not double-attach). No change to the BGA tooltip binding that
   shares these elements. `_showRelatedIslands` early-returns unless the
   preference is enabled (a flag set from pref 103 at setup and updated on
   live change), so the listeners are inert when the pref is off.

2. **Relation computation** (`_relatedIslandsFor(hex)`): pure function of
   `gamedatas` + `boardHexes`. Returns a list of `{q, r, color}` partners:
   - offering hex -> for each current offering color, the temple of that color.
   - temple hex -> for its color, every offering hex still holding that color.
   - city hex -> for each current statue color, every statue island whose
     `STATUE_ISLAND_COLORS[clusterType]` includes it.
   - statue-island hex -> for each accepted color, every city still holding a
     statue of that color.
   Island kind comes from `boardHexes.attribute` via the existing
   `_getIslandAttribute(q, r)` (not `gamedatas.hexes.islandContent`, which is
   nulled client-side for unrevealed islands).

3. **Overlay rendering** (`_drawRelationFx(hoverHex, partners)`): one dedicated
   SVG layer appended once (lazily) inside `#delphi-hex-grid`, so it pans and
   scales with the board (including beside-mode container scaling). Hex centers
   come from the existing `getHexCenterPixel(q, r)`. Draw the white source
   outline, a halo ring per partner-color, and a thread path per partner-color.
   `_clearRelatedIslands()` empties the layer.

4. **Styling**: new CSS classes for the halo ring and thread (color set via a
   CSS custom property per element so one class serves all colors), plus the
   two reduced-motion suppression entries.

## Data sources (all client-side, no round-trips)

`gamedatas.offerings` (`color, originQ, originR, playerId, isDelivered`),
`gamedatas.temples` (`color, hexQ, hexR`), `gamedatas.statues`
(`color, originQ, originR, playerId, isRaised`), `gamedatas.hexes`
(`clusterType` for statue islands), `Components.STATUE_ISLAND_COLORS`, and
`boardHexes` for island kind. Coordinates from `gamedatas` are DB strings, so
compare as numbers.

## Interaction with existing highlights

The relation overlay is a separate layer and is color-matched, so it coexists
with the gold action pulse without ambiguity. During your turn a deliverable
temple can carry both the gold "act here" pulse and, on hover, its color halo;
these read as different signals and that overlap is acceptable.

## Tooltip coexistence

The BGA island tooltip and the delivery lines both fire on hover and compete
for the same space (the tooltip can cover a line or a destination). Rather
than reposition the framework tooltip (which BGA auto-anchors), the tooltip is
**deferred** while the highlight is on: the lines appear instantly on
mousemove, but the tooltip for the four participating island types
(offering/temple/statue/city) gets a longer delay, so a quick "where does this
deliver" glance shows the lines uncovered and the tooltip only appears if you
rest on the island. Every other hex, and all hexes when the pref is off, keep
the default delay. Implemented via the optional delay argument to
`addTooltipHtml` in `_bindIslandTooltipForHex`; toggling pref 103 re-binds the
participating islands so their delay tracks the pref live. The delay value is a
tuning knob.

## Files touched

- `gamepreferences.json`: add preference 103 "Highlight delivery locations on
  hover" (Off default / On), appended after the existing prefs.
- `theoracleofdelphi.js`: read pref 103 into an enabled flag at setup and
  handle it in `onGameUserPreferenceChanged` (updating the flag and clearing
  any active overlay when turned off); `_bindIslandTooltipForHex` (attach hover
  handlers), new `_relatedIslandsFor`, `_showRelatedIslands`,
  `_clearRelatedIslands`, `_drawRelationFx` (+ lazy `_ensureRelationFxLayer`).
  Bump the JS cache-bust version.
- `theoracleofdelphi.css`: halo + thread classes and their keyframes; add both
  to the `prefers-reduced-motion` and `body.motion-reduced-pref` suppression
  blocks.

## Verification

Client-only visual behavior with no game logic, so no new PHP/JS unit tests.
`_relatedIslandsFor` is a pure function and is the one piece worth exercising in
a small standalone harness (feed it representative `gamedatas` fixtures and
assert the partner sets for each of the four hover kinds, including the
depleted-tokens case that yields no partners). The overlay itself is verified
by driving hover in a browser harness against the real CSS: confirm color
matching, that reduce motion produces static ring + line, and that the overlay
tracks hex centers under board scaling.

## Open risks

- Thread clutter and the simultaneous-thread cap are tuning values to confirm
  against a real board with dense matches.
- Piece elements (offering/statue tokens) sit above the hex hit target; if they
  swallow the hover, the binding may need to also cover the piece element or
  set `pointer-events` so a hover anywhere on the island triggers the effect.
- The relation overlay must sit at a z-index above the cluster images but not
  above interactive pieces/action overlays, so it never blocks clicks
  (`pointer-events: none` on the layer).
