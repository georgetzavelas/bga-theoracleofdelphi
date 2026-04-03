# Ship Overlap Fix with Ownership Ring

## Context

When the game starts, both players' ships are placed on the Zeus hex at identical pixel coordinates, rendering superimposed. The waiting player cannot see their boat at all. This makes the opening moment confusing — players don't know where their ship is or that two ships share the space.

## Design

### 1. Hex Offsets on Shared Hexes

When 2+ ships occupy the same hex, apply positional offsets so both are visible side by side within the hex. When a ship is alone on a hex, it centers normally.

**Offset source:** `SHIP_CLUSTER_OFFSETS` already defined at `theoracleofdelphigzed.js:439`:
```javascript
SHIP_CLUSTER_OFFSETS: [
    { dx: -16, dy: -10 },   // top-left
    { dx: 16,  dy: -10 },   // top-right
    { dx: -16, dy: 10 },    // bottom-left
    { dx: 16,  dy: 10 }     // bottom-right
]
```

Only the first two offsets are needed for a 2-player game (top-left, top-right).

**Offset logic:**
- Build a helper that checks `shipPositions` to find all ships on a given hex
- If multiple ships share a hex, assign each a slot index (0 or 1) and apply the corresponding offset to the hex center pixel
- If a ship is alone on a hex, use the hex center directly (no offset)

**Trigger points — offsets must be recalculated:**
- `createShipsFromGamedata()` — initial placement at game start
- `moveShipToHex()` / `notif_shipMoved()` — when a ship arrives at or departs from a hex, both the mover and any ships already on the destination/origin hex need offset recalculation

### 2. Permanent Ownership Highlight Ring

A subtle colored ring rendered around the current viewer's ship at all times, so players can always identify which ship is theirs.

**Implementation:**
- In `Components.createShip()`, accept an `isMine` boolean parameter
- If `isMine` is true, add a `.my-ship` CSS class to the ship element
- Style `.my-ship` with a colored glow ring via `box-shadow`

**CSS:**
```css
.delphi-ship.my-ship {
    box-shadow: 0 0 8px 3px currentColor;
    border-radius: 50%;
}
```

The `currentColor` approach may not work depending on how ship colors are set. Alternative: pass the player's hex color and use it directly, e.g. `box-shadow: 0 0 8px 3px #e54040` for red. The color can be set as a CSS custom property on the element.

## Files to Modify

| File | Change |
|------|--------|
| `theoracleofdelphigzed.js` | Add shared-hex detection helper. Update `createShipsFromGamedata()`, `moveShipToHex()`, and `notif_shipMoved()` to apply/remove offsets. Pass `isMine` flag when creating ships. |
| `modules/js/Components.js` | Update `createShip()` to accept `isMine` param, add `.my-ship` class and set player color as CSS custom property. Update `moveShip()` to accept offset-adjusted coordinates. |
| `theoracleofdelphigzed.css` | Add `.delphi-ship.my-ship` rule with `box-shadow` glow ring. |

## Verification

1. Start a new 2-player game — both ships should be visible on the Zeus hex, offset from each other
2. Confirm each player sees a highlight ring on their own ship only
3. Move one ship off Zeus — the remaining ship should re-center (no offset)
4. Move both ships to the same hex mid-game — offsets should reappear
5. Verify ship movement animations still look smooth with offsets applied
