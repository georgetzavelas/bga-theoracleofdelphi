# Apollo's free any-colour card play: design spec

Date: 2026-07-27 (revised 2026-07-28 after playtest)

## Revision note

The first implementation pinned the benefit to one card (`is_wild`) and let the
player move a medallion between cards. Playtest killed it: the medallion was
invisible behind the overlapping hand, then the server forbade playing any other
card, then the action-bar halo went stale on a move. Stepping back, the player
plays exactly one Oracle card per turn, so the benefit is not a token needing a
home. It is a **discount on the colour choice they were already making.**

So the marker is gone. Apollo now grants a free any-colour choice on the one card
play, delivered by the SAME `apollo_pending_recolor` gate the dice already use.

The benefit is announced **on the card tooltip itself**, not in a banner: the
action-bar tooltip always names the card by colour ("Red Oracle Card"), and while
Apollo is active adds a second line, "If selected will be wild", with the Apollo
god icon. A separate status chip was tried first and removed: the promise belongs
on the card the player is hovering, at the moment they are choosing.

Sections below describing the movable blessing are kept only as the record of
what was tried and why it failed.

## Goal

Two changes to Apollo (god ability `dice_wild`), one a rules correction and one
a UX improvement. They are specified together because they touch the same code
paths and their balance effects offset each other.

1. **Rules correction.** Apollo must not grant an extra Oracle card play. The
   one-Oracle-card-per-turn limit applies to the wild card like any other.
2. **Movable blessing.** The player may move the wild designation from the
   drawn card to any other Oracle card in hand, freely, until they play.

Player feedback driving (2): the drawn card is often one the player wants to
keep for a later turn, but today the wild benefit is welded to that specific
card, so collecting it forces them to spend the card they wanted to save while
a junk card sits unused in hand.

## Current state

Using Apollo (`PlayerActions::useApollo`):

- sets the `apollo_wild_active` global for the turn (all dice wild),
- draws the top Oracle card into hand with `is_wild = 1`,
- announces publicly that Apollo was used (no card identity), and privately
  sends the drawn card's id + colour via `apolloWildCardPrivate`,
- calls `sealUndo()` so the player cannot peek at the draw and then undo.

Wildness is transient. `ConsultOracle` clears `apollo_wild_active` and the
in-hand `is_wild` flags at the start of the next turn, and `reshuffleOracleDeck`
clears `is_wild` on cards returning to the deck. An unplayed wild card stays in
hand as a normal card of its native colour, so the card itself is never lost.

The wild card currently also bypasses the one-card-per-turn limit, in four
places:

| Site | Current behaviour |
|---|---|
| `PlayerActions::getArgs` (hand query gate) | exposes the hand when `oracle_card_played === 0` **or** Apollo is active |
| `PlayerActions::getArgs` (`$canPlayOracleCard`) | true when `oracle_card_played === 0` **or** a wild card is in hand |
| `PlayerActions::actPlayWildOracleCard` | rejects only when a card was played **and** Apollo is not active |
| `Game::hasNonDieActionsRemaining` | counts only `is_wild = 1` cards when Apollo is active |

And a fifth site went the other way, *forbidding* regular cards outright:

| Site | Current behaviour |
|---|---|
| `PlayerActions::actPlayOracleCard` | throws "You must play the wild oracle card drawn by Apollo" whenever Apollo is active |

All five were deliberate (the code carries comments saying so), but they are not
the intended rule. They are being reversed on the designer's ruling. The fifth
was found only after playtest feedback ("I still can't select the other Oracle
card"): the original audit searched for *bypasses* of the one-card limit, so an
added restriction did not match the pattern.

## Locked decisions

- **No extra card play.** One Oracle card play per turn, always. Playing the
  wild card consumes it.
- **No forced card.** Apollo grants one card play that may be any colour for
  free, not an obligation to spend the drawn card. Every Oracle card in hand
  stays playable during an Apollo turn.
- **Blessing starts attached** to the drawn card, exactly as today, so a wild
  card is visible from the first instant and the feature needs no empty state.
- **Moving is free and unlimited** until the card play is spent.
- **Move gesture:** a small dimmed Apollo medallion (the existing
  `img/gods/apollo.png`, so no new art) on every *other* Oracle card stack, on
  BOTH surfaces: the hand card and the action-bar icon. Clicking it moves the
  blessing there. Clicking a card body still plays it, so the existing play flow
  is untouched and there is no mode.
- **`is_wild` stays the source of truth.** The concept "one of your cards is
  wild" already threads through the undo snapshot, the reload payload,
  spectator rendering, log tokens and the Demigod skip rule. Moving the
  blessing changes *when and by whom* the flag is set, nothing else.
- **No public log line for a move.** Which card is wild is hidden information;
  opponents already see the public "uses Apollo" line.
- **No blessing when nothing was drawn.** If the deck and discard are both
  empty, `useApollo` draws no card, so there is no wild card and nothing to
  move. Allowing the player to bless a card already in hand would be a buff.

## Balance

Removing the extra play is a nerf; letting the player choose which card carries
the wild is a buff. Net effect is close to neutral, possibly slightly weaker
than today. Apollo becomes: all dice wild this turn, and your one Oracle card
play may be any colour for free.

## Resolved edge cases

| Case | Behaviour |
|---|---|
| Only the drawn card in hand | No badges (nothing to move to). |
| Card play already spent on a normal card | Wild card stays in hand but is unplayable this turn. Badges hide. Wildness expires normally at end of turn. |
| Player ignores the blessing and plays a different card | Allowed. The blessing simply expires unused, which is strictly worse for the player, so it needs no guard. |
| Deck and discard both empty | No card drawn, no blessing, dice-wild only. Unchanged from today. |
| Player moves then plays the newly blessed card | Normal wild play, any colour, consumes the single card play. |
| Player never plays | Wildness expires at end of turn, all cards keep their native colours. |
| Undo | `card` is already in `UndoState::SNAPSHOT_TABLES`, so `is_wild` is captured and a move is undoable like any other clean action. The `sealUndo()` in `useApollo` is unchanged: it seals the *draw*, which is what leaks information. |
| Reload / replay / spectator | No new persistent state. `getAllDatas` already emits `is_wild` per card for the owner's hand. |

## Architecture

### Server (PHP)

**Rules correction.** Remove the Apollo special-casing at all five sites listed
above, so the one-card-per-turn limit is unconditional and no card is forced:

- `PlayerActions::getArgs`: gate the hand query on `oracle_card_played === 0`
  only, and drop `$apolloWildCardInHand` from `$canPlayOracleCard`.
- `PlayerActions::actPlayWildOracleCard`: reject whenever
  `oracle_card_played !== 0`.
- `Game::hasNonDieActionsRemaining`: drop the `$apolloWildActive` branch and
  the `$wildClause`.
- `PlayerActions::actPlayOracleCard`: drop the `isApolloWildActive()` throw, so
  any card in hand stays playable during an Apollo turn.

`$apolloWildCardInHand` becomes unused once `$canPlayOracleCard` stops
consulting it; remove it rather than leaving a dead local.

**New action** `PlayerActions::actMoveApolloBlessing(int $card_id, int $activePlayerId)`:

Validates, throwing `UserException` on failure:
1. `isApolloWildActive()` is true,
2. `oracle_card_played === 0` (the play is still available),
3. `$card_id` is an Oracle card in this player's hand,
4. `$card_id` is not already the wild card.

Then clears `is_wild` on the player's current wild card and sets it on
`$card_id`, in that order, so the "exactly one wild card" invariant never
breaks mid-update.

Emits a **private** notification `apolloBlessingMoved` to the acting player
with `from_card_id`, `to_card_id` and `to_color`, and no log message. No
`sealUndo()`: the move reveals nothing the player did not already know.

Annotate with `#[PossibleAction]`, matching every other action in this state
class, so the framework accepts it while in `PlayerActions`.

### Client (JS)

**Visibility signal.** No new `getArgs` field is required. `PlayerActions`
already returns `apolloWildActive` and `canPlayOracleCard`, and after the rules
correction the hand query is gated on the play being unspent, so
`canPlayOracleCard` is false exactly when badges should be hidden (play spent,
or no cards). Badges render when `apolloWildActive && canPlayOracleCard`.

**Rendering.** The hand does not show one element per card: regular cards are
merged into one counted element per colour, and only wild cards are standalone
with a `data-card-id`. So the badge sits on each regular **colour stack**, and
clicking it blesses one card of that colour, resolved from the `cardId` the
existing `_setupOracleCardClickHandlers` already carries per stack. Cards of one
colour are interchangeable, so this is semantically exact, and the blessed card
visibly splits out of the stack the same way the Apollo draw already does.

Badges hang off the existing `_bindHandOracleCardSelectable` /
`_teardownOracleCardClickHandlers` pair, which is already called on entering
`PlayerActions` (gated on `canPlayOracleCard`) and torn down on re-entry, so no
new lifecycle is introduced. The badge is a child of the card element with its
own click handler calling
`bgaPerformAction('actMoveApolloBlessing', { card_id })`, and it must
`stopPropagation` so it does not also trigger the card's play handler.

**The client lock is removed entirely.** The client used to mark regular stacks
`.oracle-card-apollo-locked` (dimmed, `pointer-events: none`, no click handler),
mirroring the server's fifth restriction. Both are gone: regular cards are
selectable during an Apollo turn on both surfaces, and the dimming rule is
deleted rather than overridden, since `pointer-events: none` on the parent would
have swallowed the medallion's own clicks.

**Badge placement was measured, not guessed.** Two facts make the obvious
top-right corner unusable in the hand, and both were found with
`elementFromPoint` against the real stylesheet:
- Hand cards overlap by 98px and the FIRST card holds the highest z-index, so
  every card behind it shows only its bottom ~42px. A top-anchored badge is
  completely hidden behind the card in front, and cannot escape by raising
  z-index because the card's own z-index establishes the stacking context.
- The bottom-RIGHT corner is already taken: `.card-count-badge` is overridden to
  `bottom: 5px` in the hand for the same visibility reason.

So the medallion is bottom-LEFT. The action-bar variant
(`.apollo-blessing-badge-sm`) keeps that corner but shrinks to 18px and hangs
just outside the 36x50 icon, mirroring how `.action-card-count` hangs off the
top-right.

The Node stub DOM used by the client tests has no layout and cannot catch this
class of bug, so the test asserts the CSS contract (bottom/left anchoring, own
pointer events, and that the lock rule stays deleted) on the stylesheet text.

**Colour resolution.** The move notification carries `to_color`, resolved
server-side with the same `oracle_card_play_colors[cardId] ?? nativeColor` rule
`getArgs` uses, so a paid recolour is respected. The client needs it to
decrement the correct stack and paint the new standalone wild.

**Notification handler** `notif_apolloBlessingMoved`:
- `revertOracleWildCardInHand(from_card_id)` to merge the old card back into
  its colour stack,
- `addOracleCardToHand(color, true, to_card_id)` to split the new one out with
  the existing wild treatment,
- re-render the badges.

Both primitives already exist and are already used for the end-of-turn revert
and the Apollo draw respectively.

**Animation.** The sun travels from the old card to the new one via the
existing `_flyCard` helper (`className: 'delphi-flying-piece'`), so it inherits
the established flight timing and the 1500ms safety net. Skip the flight when
`this.instantaneousMode` is set, consistent with `_holdFor`.

**Teardown.** Badges are removed when the card play is spent, when the wild card
is played, and at end of turn.

### Strings

The ability description in `getGodAbilityDescription` currently reads
"All dice become wild + draw wild Oracle Card". It should state the corrected
rule and the movability, e.g. "All dice wild; draw an Oracle card that plays as
any colour (movable, uses your card play)". Final wording is a copy decision,
not a structural one.

## Failure modes / compatibility

- **Games in progress.** The rules correction changes legal moves mid-game. A
  player who has already played a card this turn and was counting on the wild
  as a second play will find it unavailable. Acceptable: the window is one
  turn, and the correction matches intended rules.
- **Invariant risk.** Two cards flagged wild simultaneously would let the
  client render two wild cards and `hasNonDieActionsRemaining` count wrongly.
  The single-transaction clear-then-set in `actMoveApolloBlessing` prevents it;
  the test plan asserts it directly.
- **Badge / play click collision.** If `stopPropagation` is missed, clicking a
  badge would both move the blessing and start a play. Covered by test.

## Test plan

Server (pure logic, `tests/`):
- Moving clears the old flag and sets the new one, leaving exactly one wild
  card in hand.
- Move rejected when Apollo is not active, when the card play is already spent,
  when the target is not in hand, and when the target is already wild.
- After the correction, playing a second Oracle card is rejected whether or not
  Apollo is active.

Client:
- Badges appear on non-wild cards only, and only while Apollo is active with
  the play unspent.
- Badge click emits the action and does not trigger the card's play handler.
- The move handler produces exactly one wild card in the hand DOM.

Studio playtest (cannot be automated here):
- Use Apollo, move the blessing, play the newly blessed card as an off-colour.
- Use Apollo, play a normal card first, confirm the wild card is not playable.
- Reload mid-turn after moving and confirm the correct card is still wild.
- Confirm a spectator and an opponent never learn which card is wild.
