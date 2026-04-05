# Complete Explore Island Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Explore Island action with shrine visual placement (animated from player board to hex), Zeus tile god advancement reward, and sigma/omega explorer bonuses.

**Architecture:** Add two new PHP state classes (`ChooseGodAdvancement` at id 45, `ChooseInjuryColor` at id 46). Modify `ExploreIsland.php` to transition to these states instead of returning to actions directly. Update client-side `notif_shrineBuilt` to animate shrine piece, add UI handlers for the new states.

**Tech Stack:** PHP (BGA framework states), JavaScript (AMD game module), CSS

---

### Task 1: Create ChooseGodAdvancement state

Reusable state for "advance gods by N total steps with free choice." Used by shrine Zeus tile reward (1 step) and sigma bonus (3 steps).

**Files:**
- Create: `modules/php/States/ChooseGodAdvancement.php`

- [ ] **Step 1: Create the state file**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class ChooseGodAdvancement extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 45,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} may advance a god'),
            descriptionMyTurn: clienttranslate('${you}: advance a god (${steps_remaining} step(s) remaining)'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $stepsRemaining = (int)$this->game->globals->get('god_steps_remaining');
        $reason = $this->game->globals->get('god_advance_reason') ?? 'reward';

        $gods = [];
        foreach (MaterialDefs::GODS as $godName => $god) {
            $safeName = addslashes($godName);
            $row = (int)$this->game->getUniqueValueFromDB(
                "SELECT track_row FROM player_god
                 WHERE player_id = $playerId AND god_name = '$safeName'"
            );
            $gods[] = [
                'god_name' => $godName,
                'color' => $god['color'],
                'current_row' => $row,
                'can_advance' => $row < 6,
            ];
        }

        return [
            'gods' => $gods,
            'steps_remaining' => $stepsRemaining,
            'reason' => $reason,
        ];
    }

    #[PossibleAction]
    public function actAdvanceGod(string $godName, int $activePlayerId) {
        $stepsRemaining = (int)$this->game->globals->get('god_steps_remaining');
        if ($stepsRemaining <= 0) {
            throw new UserException(clienttranslate('No steps remaining'));
        }

        // Validate god exists
        if (!isset(MaterialDefs::GODS[$godName])) {
            throw new UserException(clienttranslate('Invalid god'));
        }

        $safeName = addslashes($godName);
        $currentRow = (int)$this->game->getUniqueValueFromDB(
            "SELECT track_row FROM player_god
             WHERE player_id = $activePlayerId AND god_name = '$safeName'"
        );

        if ($currentRow >= 6) {
            throw new UserException(clienttranslate('This god is already at maximum level'));
        }

        // Row 0 → jump to player-count row
        if ($currentRow === 0) {
            $playerCount = (int)$this->game->getUniqueValueFromDB("SELECT COUNT(*) FROM player");
            $newRow = MaterialDefs::PLAYER_COUNT_ROW[$playerCount] ?? 1;
        } else {
            $newRow = $currentRow + 1;
        }

        $this->game->DbQuery(
            "UPDATE player_god SET track_row = $newRow
             WHERE player_id = $activePlayerId AND god_name = '$safeName'"
        );

        $stepsRemaining--;
        $this->game->globals->set('god_steps_remaining', $stepsRemaining);

        $this->notify->all("godAdvanced", clienttranslate('${player_name} advances ${god_name}'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "god_name" => $godName,
            "new_row" => $newRow,
        ]);

        if ($stepsRemaining > 0) {
            return ChooseGodAdvancement::class;
        }
        return $this->finish($activePlayerId);
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("skipGodAdvancement", clienttranslate('${player_name} finishes advancing gods'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return $this->finish($activePlayerId);
    }

    private function finish(int $playerId): string
    {
        $this->game->globals->set('god_steps_remaining', 0);
        $this->game->globals->set('god_advance_reason', null);

        // Clean up explore globals if they exist
        $this->game->globals->set('explore_hex_q', null);
        $this->game->globals->set('explore_hex_r', null);

        if ($this->game->allDiceUsed($playerId)) {
            return ConsultOracle::class;
        }
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/php/States/ChooseGodAdvancement.php
git commit -m "feat: add ChooseGodAdvancement state for free god advancement"
```

---

### Task 2: Create ChooseInjuryColor state

State for omega bonus: pick injury color to discard, then +1 shield.

**Files:**
- Create: `modules/php/States/ChooseInjuryColor.php`

- [ ] **Step 1: Create the state file**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class ChooseInjuryColor extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 46,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} chooses injuries to discard'),
            descriptionMyTurn: clienttranslate('${you}: choose an injury color to discard all of'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();

        $rows = $this->game->getObjectListFromDB(
            "SELECT DISTINCT card_type_arg FROM card
             WHERE card_type = 'injury' AND card_location = 'hand' AND card_location_arg = $playerId"
        );

        $colors = [];
        foreach ($rows as $row) {
            $colorIdx = (int)$row['card_type_arg'];
            $colors[] = MaterialDefs::COLORS[$colorIdx] ?? 'unknown';
        }

        return [
            'injuryColors' => $colors,
        ];
    }

    #[PossibleAction]
    public function actChooseColor(string $color, int $activePlayerId) {
        // Validate color
        $colorIdx = MaterialDefs::COLOR_INDEX[$color] ?? null;
        if ($colorIdx === null) {
            throw new UserException(clienttranslate('Invalid color'));
        }

        // Count injuries of this color
        $count = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM card
             WHERE card_type = 'injury' AND card_location = 'hand'
             AND card_location_arg = $activePlayerId AND card_type_arg = $colorIdx"
        );
        if ($count === 0) {
            throw new UserException(clienttranslate('You have no injuries of that color'));
        }

        // Discard all injuries of this color
        $this->game->DbQuery(
            "UPDATE card SET card_location = 'discard', card_location_arg = 0
             WHERE card_type = 'injury' AND card_location = 'hand'
             AND card_location_arg = $activePlayerId AND card_type_arg = $colorIdx"
        );

        $this->notify->all("injuriesDiscardedByChoice",
            clienttranslate('${player_name} discards ${count} ${color} injury cards (Omega bonus)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "color" => $color,
            "count" => $count,
        ]);

        // +1 shield (cap at 5)
        return $this->grantShieldAndFinish($activePlayerId);
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        // No injuries to discard, just grant shield
        return $this->grantShieldAndFinish($activePlayerId);
    }

    private function grantShieldAndFinish(int $playerId): string
    {
        $currentShield = (int)$this->game->getUniqueValueFromDB(
            "SELECT shield_value FROM player WHERE player_id = $playerId"
        );
        $newShield = min(5, $currentShield + 1);

        $this->game->DbQuery(
            "UPDATE player SET shield_value = $newShield WHERE player_id = $playerId"
        );

        // Get player color for client shield update
        $playerHexColor = $this->game->getUniqueValueFromDB(
            "SELECT player_color FROM player WHERE player_id = $playerId"
        );
        $playerGameColor = MaterialDefs::HEX_TO_GAME_COLOR[$playerHexColor] ?? 'blue';

        $this->notify->all("shieldIncreased",
            clienttranslate('${player_name} increases shield to ${value} (Omega bonus)'), [
            "player_id" => $playerId,
            "player_name" => $this->game->getPlayerNameById($playerId),
            "value" => $newShield,
            "playerColor" => $playerGameColor,
        ]);

        // Clean up explore globals
        $this->game->globals->set('explore_hex_q', null);
        $this->game->globals->set('explore_hex_r', null);

        if ($this->game->allDiceUsed($playerId)) {
            return ConsultOracle::class;
        }
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/php/States/ChooseInjuryColor.php
git commit -m "feat: add ChooseInjuryColor state for omega bonus"
```

---

### Task 3: Update ExploreIsland to use new states

**Files:**
- Modify: `modules/php/States/ExploreIsland.php`

- [ ] **Step 1: Update `buildOwnShrine()` to transition to ChooseGodAdvancement on Zeus tile completion**

Replace the current `buildOwnShrine()` method (lines 60-93) with:

```php
private function buildOwnShrine(int $playerId, int $hexQ, int $hexR, string $shrineLetter): string
{
    // Find the shrine record for this player + letter
    $letters = $this->getPlayerLetters($playerId);
    $shrineIndex = array_search($shrineLetter, $letters);

    // Update shrine table
    $this->game->DbQuery(
        "UPDATE shrine SET is_built = 1, built_at_hex_q = $hexQ, built_at_hex_r = $hexR
         WHERE player_id = $playerId AND shrine_index = $shrineIndex"
    );

    // Notify shrine built
    $this->notify->all("shrineBuilt", clienttranslate('${player_name} builds a shrine!'), [
        "player_id" => $playerId,
        "player_name" => $this->game->getPlayerNameById($playerId),
        "hex_q" => $hexQ,
        "hex_r" => $hexR,
        "shrine_index" => $shrineIndex,
        "shrine_letter" => $shrineLetter,
    ]);

    // Complete Zeus tile for shrine
    $completedTileId = $this->completeZeusTile($playerId, $shrineLetter);
    if ($completedTileId !== null) {
        $this->notify->all("taskCompleted", clienttranslate('${player_name} completes a Zeus tile!'), [
            "player_id" => $playerId,
            "player_name" => $this->game->getPlayerNameById($playerId),
            "tile_id" => $completedTileId,
        ]);

        // Reward: advance any god by 1 step
        $this->game->globals->set('god_steps_remaining', 1);
        $this->game->globals->set('god_advance_reason', 'shrine_reward');
        return ChooseGodAdvancement::class;
    }

    return $this->returnToActions($playerId);
}
```

- [ ] **Step 2: Update `applyExplorerBonus()` sigma case**

Replace the 'gods' case (lines 148-158) with:

```php
case 'gods':
    // Sigma: Advance gods by 3 total steps
    $this->game->globals->set('god_steps_remaining', $bonus['value']);
    $this->game->globals->set('god_advance_reason', 'sigma_bonus');
    $this->notify->all("shrineExplored", clienttranslate('${player_name} earns Sigma bonus: advance gods by ${value} steps'), [
        "player_id" => $playerId,
        "player_name" => $this->game->getPlayerNameById($playerId),
        "bonus_type" => $bonus['type'],
        "value" => $bonus['value'],
        "description" => $bonus['description'],
        "shrine_letter" => $shrineLetter,
    ]);
    return ChooseGodAdvancement::class;
```

- [ ] **Step 3: Update `applyExplorerBonus()` omega case**

Replace the 'heal' case (lines 160-170) with:

```php
case 'heal':
    // Omega: Discard all injuries of chosen color + 1 shield
    $injuryCount = (int)$this->game->getUniqueValueFromDB(
        "SELECT COUNT(*) FROM card
         WHERE card_type = 'injury' AND card_location = 'hand'
         AND card_location_arg = $playerId"
    );

    $this->notify->all("shrineExplored", clienttranslate('${player_name} earns Omega bonus: discard injuries + shield'), [
        "player_id" => $playerId,
        "player_name" => $this->game->getPlayerNameById($playerId),
        "bonus_type" => $bonus['type'],
        "value" => $bonus['value'],
        "description" => $bonus['description'],
        "shrine_letter" => $shrineLetter,
    ]);

    if ($injuryCount > 0) {
        return ChooseInjuryColor::class;
    }

    // No injuries — just grant +1 shield inline
    $currentShield = (int)$this->game->getUniqueValueFromDB(
        "SELECT shield_value FROM player WHERE player_id = $playerId"
    );
    $newShield = min(5, $currentShield + 1);
    $this->game->DbQuery(
        "UPDATE player SET shield_value = $newShield WHERE player_id = $playerId"
    );
    $playerHexColor = $this->game->getUniqueValueFromDB(
        "SELECT player_color FROM player WHERE player_id = $playerId"
    );
    $playerGameColor = MaterialDefs::HEX_TO_GAME_COLOR[$playerHexColor] ?? 'blue';
    $this->notify->all("shieldIncreased",
        clienttranslate('${player_name} increases shield to ${value} (Omega bonus)'), [
        "player_id" => $playerId,
        "player_name" => $this->game->getPlayerNameById($playerId),
        "value" => $newShield,
        "playerColor" => $playerGameColor,
    ]);
    return $this->returnToActions($playerId);
```

- [ ] **Step 4: Remove `returnToActions` explore globals cleanup**

The `returnToActions()` method (lines 205-215) cleans up `explore_hex_q` and `explore_hex_r`. Since the new states (`ChooseGodAdvancement`, `ChooseInjuryColor`) also need to clean these up before returning to actions, and they already do so in their own `finish()` methods, keep the cleanup in `returnToActions()` as-is. The new states handle their own cleanup — this is fine since the globals are set to null (idempotent).

No change needed here.

- [ ] **Step 5: Commit**

```bash
git add modules/php/States/ExploreIsland.php
git commit -m "feat: ExploreIsland transitions to ChooseGodAdvancement and ChooseInjuryColor"
```

---

### Task 4: Client-side — ChooseGodAdvancement UI

**Files:**
- Modify: `theoracleofdelphigzed.js`

- [ ] **Step 1: Add `onUpdateActionButtons` case for ChooseGodAdvancement**

Add this case in the `onUpdateActionButtons` switch, after the existing `CheckGodAdvancement` case (~line 1704):

```javascript
case 'ChooseGodAdvancement':
    if (args && args.gods) {
        args.gods.forEach(g => {
            if (g.can_advance) {
                var godLabel = g.god_name.charAt(0).toUpperCase() + g.god_name.slice(1) + ' (row ' + g.current_row + ')';
                this.statusBar.addActionButton(godLabel, () => {
                    this.bgaPerformAction("actAdvanceGod", { godName: g.god_name });
                });
            }
        });
    }
    this.statusBar.addActionButton(_('Done'), () => {
        this.bgaPerformAction("actPass", {});
    }, { color: 'secondary' });
    break;
```

- [ ] **Step 2: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat: ChooseGodAdvancement action buttons"
```

---

### Task 5: Client-side — ChooseInjuryColor UI

**Files:**
- Modify: `theoracleofdelphigzed.js`

- [ ] **Step 1: Add `onUpdateActionButtons` case for ChooseInjuryColor**

Add this case after the `ChooseGodAdvancement` case:

```javascript
case 'ChooseInjuryColor':
    if (args && args.injuryColors && args.injuryColors.length > 0) {
        args.injuryColors.forEach(color => {
            var colorLabel = color.charAt(0).toUpperCase() + color.slice(1);
            this.statusBar.addActionButton(_('Discard') + ' ' + colorLabel, () => {
                this.bgaPerformAction("actChooseColor", { color: color });
            });
        });
    }
    this.statusBar.addActionButton(_('Skip'), () => {
        this.bgaPerformAction("actPass", {});
    }, { color: 'secondary' });
    break;
```

- [ ] **Step 2: Add notification handlers for new notifications**

Add these handlers after the existing `notif_injuriesDiscarded` handler (~line 2446):

```javascript
notif_injuriesDiscardedByChoice: function(args) {
    console.log('notif_injuriesDiscardedByChoice', args);
    if (parseInt(args.player_id) === this.player_id) {
        this.components.removeAllInjuryCardsOfColor(args.color);
    }
},

notif_shieldIncreased: function(args) {
    console.log('notif_shieldIncreased', args);
    if (parseInt(args.player_id) === this.player_id) {
        this.components.setShieldValue(parseInt(args.value), args.playerColor);
    }
},
```

- [ ] **Step 3: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat: ChooseInjuryColor UI and notification handlers"
```

---

### Task 6: Shrine piece visual — player board setup + animation to hex

**Files:**
- Modify: `theoracleofdelphigzed.js`
- Modify: `theoracleofdelphigzed.css`

- [ ] **Step 1: Add shrine piece setup from gamedatas**

The player board already has 3 `.shrine-row` elements with shrine.png backgrounds. These act as the shrine piece slots. On setup, mark built shrines as empty and place their pieces on the hex board instead.

Add a new method after `setupShrinesFromGamedata` (~line 1011):

```javascript
/**
 * Set up shrine pieces on player board and hex board based on built status.
 * Unbuilt shrines show piece on player board; built shrines show piece on hex.
 */
setupShrinePiecesFromGamedata: function(gamedatas) {
    if (!gamedatas.shrines) return;
    var self = this;

    // Filter to current player's shrines
    var myShrines = gamedatas.shrines.filter(s => parseInt(s.playerId) === this.player_id);

    // Get the 3 shrine-row elements on the player board
    var shrineRows = document.querySelectorAll('#delphi-shrine-slots .shrine-row');

    myShrines.forEach(function(shrine, idx) {
        var slotEl = shrineRows[idx];
        if (!slotEl) return;

        slotEl.dataset.shrineIndex = shrine.shrineIndex;

        if (parseInt(shrine.isBuilt) === 1 && shrine.builtQ !== null && shrine.builtR !== null) {
            // Shrine is built — hide from player board, show on hex
            slotEl.classList.add('shrine-built');
            var center = self.getHexCenterPixel(parseInt(shrine.builtQ), parseInt(shrine.builtR));
            if (center) {
                self._placeShrinePieceOnHex(center.x, center.y, idx);
            }
        }
    });
},

/**
 * Place a shrine piece element at a hex position on the board
 */
_placeShrinePieceOnHex: function(x, y, shrineIndex) {
    var piece = document.createElement('div');
    piece.className = 'delphi-shrine-piece-placed';
    piece.dataset.shrineIndex = shrineIndex;
    piece.style.left = (x - 15) + 'px';
    piece.style.top = (y - 15) + 'px';
    var boardPieces = document.getElementById('delphi-board-pieces');
    if (boardPieces) boardPieces.appendChild(piece);
},
```

- [ ] **Step 2: Call the new setup method**

In the `setup()` method, find where `setupShrinesFromGamedata` is called (~line 170) and add after it:

```javascript
this.setupShrinesFromGamedata(gamedatas);
this.setupShrinePiecesFromGamedata(gamedatas);
```

- [ ] **Step 3: Update `notif_shrineBuilt` to animate the piece**

Replace the existing no-op handler (~line 2425) with:

```javascript
notif_shrineBuilt: function(args) {
    console.log('notif_shrineBuilt', args);
    if (parseInt(args.player_id) !== this.player_id) return;

    var shrineIndex = parseInt(args.shrine_index);
    var hexQ = parseInt(args.hex_q);
    var hexR = parseInt(args.hex_r);

    // Find the shrine slot on the player board
    var shrineRows = document.querySelectorAll('#delphi-shrine-slots .shrine-row');
    var slotEl = shrineRows[shrineIndex];
    if (!slotEl) return;

    var center = this.getHexCenterPixel(hexQ, hexR);
    if (!center) return;

    // Get source and destination positions relative to board-pieces container
    var boardPieces = document.getElementById('delphi-board-pieces');
    if (!boardPieces) return;
    var boardRect = boardPieces.getBoundingClientRect();
    var slotRect = slotEl.getBoundingClientRect();

    // Create flying piece at source position
    var flyingPiece = document.createElement('div');
    flyingPiece.className = 'delphi-shrine-piece-flying';
    flyingPiece.style.left = (slotRect.left - boardRect.left + slotRect.width / 2 - 15) + 'px';
    flyingPiece.style.top = (slotRect.top - boardRect.top + slotRect.height / 2 - 15) + 'px';
    boardPieces.appendChild(flyingPiece);

    // Hide from player board
    slotEl.classList.add('shrine-built');

    // Animate to destination
    var destX = center.x - 15;
    var destY = center.y - 15;
    requestAnimationFrame(function() {
        flyingPiece.style.transition = 'left 0.8s ease-in-out, top 0.8s ease-in-out';
        flyingPiece.style.left = destX + 'px';
        flyingPiece.style.top = destY + 'px';
    });

    // After animation, replace with permanent piece
    var self = this;
    setTimeout(function() {
        flyingPiece.remove();
        self._placeShrinePieceOnHex(center.x, center.y, shrineIndex);
    }, 850);
},
```

- [ ] **Step 4: Add CSS for shrine pieces**

Add to `theoracleofdelphigzed.css` near the existing shrine slot rules (~after line 920):

```css
/* Shrine piece built — hide from player board slot */
.shrine-row.shrine-built {
    opacity: 0.2;
    background-image: none;
}

/* Shrine piece placed on hex board */
.delphi-shrine-piece-placed {
    position: absolute;
    width: 30px;
    height: 30px;
    background-image: url('img/pieces/shrine.png');
    background-size: contain;
    background-repeat: no-repeat;
    z-index: 15;
    pointer-events: none;
}

/* Flying shrine piece (during animation) */
.delphi-shrine-piece-flying {
    position: absolute;
    width: 30px;
    height: 30px;
    background-image: url('img/pieces/shrine.png');
    background-size: contain;
    background-repeat: no-repeat;
    z-index: 100;
    pointer-events: none;
}
```

- [ ] **Step 5: Commit**

```bash
git add theoracleofdelphigzed.js theoracleofdelphigzed.css
git commit -m "feat: shrine piece animation from player board to island hex"
```

---

### Task 7: End-to-end testing

**Files:** None (manual testing)

- [ ] **Step 1: Test own shrine explore**

1. Move ship next to a shrine island matching your color
2. Select die matching the shrine's exploration color
3. Explore island → shrine should flip, piece should animate from player board to hex
4. If Zeus tile completed → should enter ChooseGodAdvancement (1 step)
5. Pick a god → should advance and return to PlayerActions

- [ ] **Step 2: Test sigma bonus**

1. Explore another player's sigma shrine
2. Should enter ChooseGodAdvancement with 3 steps
3. Pick 3 different gods (or same god multiple times)
4. Verify each advances correctly
5. Test "Done" button to stop early

- [ ] **Step 3: Test omega bonus with injuries**

1. Have some injury cards, then explore another player's omega shrine
2. Should enter ChooseInjuryColor showing available colors
3. Pick a color → all injuries of that color discarded
4. Shield should increase by 1 on the player board

- [ ] **Step 4: Test omega bonus without injuries**

1. Have no injury cards, explore an omega shrine
2. Should skip ChooseInjuryColor
3. Shield should increase by 1 directly

- [ ] **Step 5: Test page reload during ChooseGodAdvancement**

1. Enter ChooseGodAdvancement state
2. Refresh page
3. State should restore correctly with buttons

- [ ] **Step 6: Test shrine pieces on page reload**

1. Build a shrine, then refresh
2. Built shrine should appear on hex, not on player board

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: explore island testing fixes"
```

---

### Task 8: Update game implementation plan

**Files:**
- Modify: `docs/plans/game-implementation-plan.md`

- [ ] **Step 1: Update explore island status**

The existing line `- [x] Explore island (flip + shrine placement or bonus) [L]` should be updated to note full completion. Also update the Phase 5 items for sigma/omega if they were tracked separately.

- [ ] **Step 2: Commit**

```bash
git add docs/plans/game-implementation-plan.md
git commit -m "docs: update explore island completion status"
```
