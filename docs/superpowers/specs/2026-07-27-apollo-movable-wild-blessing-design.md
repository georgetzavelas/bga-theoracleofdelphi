# Apollo's movable wild blessing: design spec

Date: 2026-07-27

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

This was deliberate (the code carries comments saying so), but it is not the
intended rule. It is being reversed on the designer's ruling.

## Locked decisions

- **No extra card play.** One Oracle card play per turn, always. Playing the
  wild card consumes it.
- **Blessing starts attached** to the drawn card, exactly as today, so a wild
  card is visible from the first instant and the feature needs no empty state.
- **Moving is free and unlimited** until the card play is spent.
- **Move gesture:** a small dimmed sun badge on every *other* Oracle card in
  hand. Clicking a badge moves the blessing there. Clicking a card body still
  plays it, so the existing play flow is untouched and there is no mode.
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
| Deck and discard both empty | No card drawn, no blessing, dice-wild only. Unchanged from today. |
| Player moves then plays the newly blessed card | Normal wild play, any colour, consumes the single card play. |
| Player never plays | Wildness expires at end of turn, all cards keep their native colours. |
| Undo | `card` is already in `UndoState::SNAPSHOT_TABLES`, so `is_wild` is captured and a move is undoable like any other clean action. The `sealUndo()` in `useApollo` is unchanged: it seals the *draw*, which is what leaks information. |
| Reload / replay / spectator | No new persistent state. `getAllDatas` already emits `is_wild` per card for the owner's hand. |

## Architecture

### Server (PHP)

**Rules correction.** Remove the Apollo bypass at all four sites listed above so
the one-card-per-turn limit is unconditional:

- `PlayerActions::getArgs`: gate the hand query on `oracle_card_played === 0`
  only, and drop `$apolloWildCardInHand` from `$canPlayOracleCard`.
- `PlayerActions::actPlayWildOracleCard`: reject whenever
  `oracle_card_played !== 0`.
- `Game::hasNonDieActionsRemaining`: drop the `$apolloWildActive` branch and
  the `$wildClause`.

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
with `from_card_id` and `to_card_id`, and no log message. No `sealUndo()`: the
move reveals nothing the player did not already know.

Annotate with `#[PossibleAction]`, matching every other action in this state
class, so the framework accepts it while in `PlayerActions`.

### Client (JS)

**Visibility signal.** No new `getArgs` field is required. `PlayerActions`
already returns `apolloWildActive` and `canPlayOracleCard`, and after the rules
correction the hand query is gated on the play being unspent, so
`canPlayOracleCard` is false exactly when badges should be hidden (play spent,
or no cards). Badges render when `apolloWildActive && canPlayOracleCard`.

**Rendering.** Render a dimmed sun badge on every Oracle card in the hand area
that is not the wild one. The hand cards are client-managed DOM
(`addOracleCardToHand`), not driven by `getArgs`, so badges are built on
entering `PlayerActions` and torn down on leaving it. The badge is a child of
the card element with its own click handler calling
`bgaPerformAction('actMoveApolloBlessing', { card_id })`, and it must
`stopPropagation` so it does not also trigger the card's play handler.

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
