# Design: opponent player boards below the game

Date: 2026-07-21
Status: Approved for planning

## Problem

You can see your own full player area (oracle wheel + dice, the four Zeus-tile
tracks, shrines, favor, played card, oracle hand, equipment, companions,
injuries) but you have no board-level view of the other players. The top-right
BGA player panels summarize each opponent compactly, but there is no
"glance across the table at their board" view. We want each other player's
board rendered below all the local game elements (the hex board, your player
board, and the component strip), in a way that is delightful but not
distracting.

## Decisions (locked with the user)

- Fidelity: a scaled, read-only **replica** of the real player board, reusing
  the actual board's visual language (not the compact panel layout).
- Content: the **full player state** — everything in `#delphi-current-player-area`
  (Zeus-tile tracks, oracle wheel + dice, shrine slots, favor tokens, played
  oracle card, oracle hand, equipment, companions, injuries), **plus gods and
  loaded cargo**. Oracle hands are public in this implementation, so they render
  as real face-up cards, not backs. Gods and cargo are not part of the
  player-area DOM (gods track in the panel pantheon, cargo rides the ship on the
  hex board), so on the replica they reuse the panel's compact representation
  (pantheon pips + cargo slots) while everything else uses the board layout.
- Layout: a single full-width row below everything, one board per opponent, in
  player order. Recessed at rest; hover brings one board to full strength with
  a slight lift. Always shown — **no collapse control and no game preference**.
- Architecture: a **dedicated read-only renderer**, isolated from the
  interactive local-board code (no refactor of the working board).
- No server changes: all per-player data is already sent.

## Non-goals

- No change to the interactive local player board or its code paths.
- No new server data, no new PHP, no new preference, no collapse/toggle UI.
- The board replica does not become interactive or clickable in any way.

## Design

### Data source

Everything needed is already in `gamedatas.panelState[pid]`, built per player
in `getAllDatas` for **all** players (Game.php ~1459-1503):

- `dice` — the player's oracle dice (color, originalColor, isUsed).
- `tasks.{shrines,statues,offerings,monsters}` — the four Zeus-tile tracks
  (per-tile color/letter/completionValue/done).
- `oracleHand` — the full hand with real colors (public in this implementation;
  see the explicit comment at Game.php:1471).
- `equipment`, `companions` — full card identities.
- `injuries` — per-color counts.
- `shieldValue`, `favorTokens`.
- `gods` — the six-god pantheon track steps (godName, trackStep).
- `cargo` — loaded statues/offerings riding the ship.

Built-shrine positions (which of the three shrine slots are built) come from
`gamedatas.shrines` (playerId, isBuilt), consistent with the local board's
`setupShrinePiecesFromGamedata`. The `panelState.tasks.shrines` `done` flags
also encode shrine completion and are the simpler source for the slot state.

No server work is required.

### Which boards to show (players and spectators)

Render one board for every player whose id `!==` `this.player_id`:

```
Object.keys(gamedatas.players).filter(pid => parseInt(pid) !== parseInt(this.player_id))
```

- As a player: excludes yourself (your interactive board is the main one).
- As a spectator: `this.player_id` is not a key in `gamedatas.players`
  (confirmed via `getPlayerGameColor`, theoracleofdelphi.js:4276), so the
  filter excludes nobody and all boards render. A spectator's main
  `#delphi-current-player-area` is already empty today (self-board setup bails
  when there is no "me", e.g. `setupShieldFromGamedata`:4317), so the opponent
  row naturally becomes the primary content for spectators. Public notifs reach
  spectators, so live-sync behaves identically.

Boards are ordered by `playerNo` so the row is stable across reloads.

### Renderer

A new dedicated module (e.g. `modules/js/OpponentBoards.js`, or a scoped
section of Components.js) exposes:

- `renderOpponentBoards(gamedatas)` — builds the full row once at setup.
- `renderOpponentBoard(pid, panelState[pid], shrines)` — builds one board.
- `updateOpponentBoard(pid)` — coarse re-render of one board from current
  state (used by live-sync).

Each board:

- Produces **board-style** DOM (oracle wheel with the six color slots and the
  player's dice seated in them, the four Zeus-tile columns, the shrine slots,
  and the favor / played-card / hand / equipment / companion / injury areas),
  reusing the same CSS class names as `#delphi-current-player-area` so the real
  board stylesheet paints it. This is a re-implementation of the board layout
  parameterized by player, not a call into the interactive setup functions.
- Gods and cargo have no board-level layout, so the replica renders them in the
  panel's compact representation (a pantheon pip row and cargo slots) as
  additional sections of the board, reusing the panel component's existing
  markup/classes rather than inventing a new one.
- Uses **per-player-scoped ids** (e.g. `opp-<pid>-oracle-dice`,
  `opp-<pid>-shrine-slots`) so three boards coexist without id collisions. The
  local board keeps the existing singular ids untouched.
- Is wrapped in a `transform: scale(~0.4)` shell (exact factor tuned in
  implementation) with `transform-origin: top left`, sized so the row fits a
  typical viewport; the wrapper reserves the scaled height so layout is correct.

### Read-only

The replica is a view, never a control:

- No click / drag / keyboard handlers of any kind.
- No `tabindex`, no `role="button"`, `cursor: default`.
- Dice are static (no selection affordance); shrine slots and Zeus tiles carry
  none of the interactive hover/active classes from the recent player-board
  work.

### Placement & layout

- A new full-width container `#delphi-opponent-boards` is appended below all
  existing game elements, after the component strip / player area, so it sits
  under the hex board, the local player board, and the component strip in
  **both** the beside and stacked player-board layouts (pref 102).
- The boards lay out in a single horizontal row. If their combined width
  exceeds the viewport, the row scrolls horizontally (overflow-x) rather than
  wrapping into a tall block, keeping it one quiet strip. This is called out
  explicitly so we never silently wrap into a wall of boards.

### Feel (delightful, not distracting)

- At rest the whole row is visually recessed: reduced opacity / lower contrast
  so it reads as secondary to your own game area.
- Hovering a single board brings just that board to full opacity and lifts it
  slightly (`transform: translateY`). Only the hovered board reacts.
- No pulse or continuous animation.
- Reduced motion: both suppression paths (`@media (prefers-reduced-motion)` and
  `body.motion-reduced-pref`) drop the lift; the opacity change on hover stays
  (it is a state cue, not motion).

### Live updates (the main implementation surface and risk)

Each board must stay current as the game progresses. The plan: at every notif
handler that already refreshes a per-player panel, also call
`updateOpponentBoard(pid)` for the affected player (a coarse full re-render of
that one board from current client state is acceptable, since the board is
static and read-only). Relevant notifs include, at least:

`diceRolled`, `startingDiceRolled`, `dieSelected`, `dieUsed`, `dieCancelled`,
`dieRecolored`, `taskCompleted`, `shrineBuilt`, `shrineDiscovered`,
`shrineExplored`, `godAdvanced`, `godReset`, `combatInjury`, `titanInjury`,
`injuriesRecovered`, `injuriesDiscarded`, `injuriesDiscardedByChoice`,
`shieldChanged`, `shieldIncreased`, `favorTokensChanged`, `favorTokensTaken`,
`favorSpentForMovement`, `equipmentSelected`, `equipmentUsed`,
`companionSelected`, `oracleCardDrawn`, `oracleCardsDrawn`, `oracleCardPlayed`,
`oracleCardDiscarded`, `oracleCardCancelled`, `oracleCardRecolored`,
`loadCargo`, `deliverCargo` (cargo), and the god notifs above (pantheon).

The implementation plan must enumerate these against the actual per-player
state each mutates and confirm coverage; a missed notif means a stale board.
Because the client updates panels incrementally (DOM mutations) rather than
re-reading `panelState`, the plan must decide how `updateOpponentBoard` gets
current state: either (a) maintain a small per-player client state object that
these notifs also update and the renderer reads, or (b) update the board's
individual elements alongside the panel's at each site. Option (a) is the
cleaner single-source-of-truth approach and is the recommended direction.

## Implementation notes

- `theoracleofdelphi.js`: add `#delphi-opponent-boards` to the main template;
  call `renderOpponentBoards` at the end of setup; add the
  `updateOpponentBoard(pid)` calls at the notif sites above. Bump the JS
  cache-bust marker (main-file change).
- New renderer module wired into the `define([...])` block (new cache-bust
  entry) if placed in its own file.
- `theoracleofdelphi.css`: `#delphi-opponent-boards` row (full width, flex,
  overflow-x), the per-board scale wrapper, the recede/hover treatment, and
  both reduced-motion suppressions. Reuse existing board classes for the inner
  DOM; scope any board-replica-only overrides under `#delphi-opponent-boards`.

## Verification

- Harness: render `renderOpponentBoard` from a fixed `panelState` fixture and
  confirm every sub-area appears with correct counts/colors (dice seated on the
  wheel, Zeus columns with the right done/remaining, shrine slots, favor count,
  hand face-up, equipment/companion/injury piles, the gods pantheon at the
  right track steps, and loaded cargo slots).
- Read-only: assert no click handlers, no `tabindex`/`role`, `cursor: default`,
  and that none of the interactive board hover/active classes apply.
- Feel: computed opacity recessed at rest; hover raises opacity + translateY on
  the hovered board only; `translateY` suppressed under `body.motion-reduced-pref`.
- Layout: the row sits below the game board, local board, and component strip
  in both beside and stacked layouts, and scrolls horizontally (does not wrap)
  when boards exceed viewport width.
- Spectator: with `this.player_id` absent from `gamedatas.players`, all boards
  render and none is skipped.
- Live-sync (Studio): drive a real game and confirm each listed notif updates
  the correct opponent board.

## Open risks

- **Live-sync completeness** is the dominant risk: any missed notif leaves a
  stale board. Mitigated by enumerating notifs against mutated state in the
  plan, and by coarse full-board re-renders.
- **Vertical space**: three full boards in a 4-player game is real scroll cost;
  the recede treatment and horizontal scroll keep it as contained as possible,
  but the cost is inherent to the request.
- **Scale legibility**: at ~0.4 the card text/pips must still read; the scale
  factor is tuned during implementation, trading legibility against footprint.
- **Re-render churn**: coarse per-board re-renders on frequent notifs (dice)
  should be cheap, but the plan should confirm no visible flicker (rebuild into
  a detached node, swap in).
