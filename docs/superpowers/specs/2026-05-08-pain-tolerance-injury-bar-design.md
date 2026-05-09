# Player Panel Injury Bar — Pain Tolerance Awareness

**Date:** 2026-05-08
**Status:** Design
**Scope:** Make the per-player injury bar in the BGA player panel reflect the Pain Tolerance equipment card (card 015) — bumping capacity from 6 → 8 slots, raising per-colour run thresholds from 3 → 4, and visually grouping adjacent same-colour cells so a same-colour run reads as a single group rather than a string of identical fragments.

## Goal

When a player owns Pain Tolerance, their panel injury bar should communicate the boosted thresholds at a glance: more capacity, a clearer way to see "you have N of this colour" for runs, and a visible cue that the equipment is the reason the bar can hold more. Players without Pain Tolerance see the existing 6-slot bar unchanged. The bar already lives at [Components.js:3022-3050](../../../modules/js/Components.js#L3022) and is styled by [theoracleofdelphigzed.css:4148-4180](../../../theoracleofdelphigzed.css#L4148).

## Background

Pain Tolerance ([CheckInjuries.php:22-25](../../../modules/php/States/CheckInjuries.php#L22)) raises forced-recovery thresholds:

|  | Default | Pain Tolerance |
|---|---|---|
| Per-colour cap | 3 | 4 |
| Total cap | 6 | 8 |

The current bar visualises each injury as one cell; adjacent same-colour cells are visually distinct (separated by a 2px grid gap, individual rounded corners, individual rings) so a player with 3 reds reads as "three red cells next to each other" rather than "a stack of 3 red." With Pain Tolerance, runs can reach 4, making the per-cell rendering even noisier.

## Decisions (from brainstorming)

| # | Question | Decision |
|---|----------|----------|
| 1 | Layout when Pain Tolerance is active | Option A — single dynamic-width row (6 → 8 cells), same horizontal slot grid; same-colour cells get a unified group treatment |
| 2 | "PT active" indicator | Option B — bar grows AND its frame picks up a gold accent (`var(--gold)`); no separate badge or icon |
| 3 | Resize transition | Option A — snap. Equipment can't be lost in this codebase ([no removeEquipmentCard call sites](../../../modules/js/Components.js#L2131)), so the resize fires once per game when the equipment card is acquired |
| 4 | Threshold ring colour palette | Option B — without PT keeps orange (warn-2) / red (danger-3) as today. With PT: warn at run-length 3 = **gold ring**, danger at run-length 4 = red as before. Total label: warn at one-below-cap (5/6 or 7/8), danger at cap (6/6 or 8/8) |

## Visual specification

### Bar capacity and frame

| State | Cells | Grid | Frame |
|-------|-------|------|-------|
| No PT | 6 | `grid-template-columns: repeat(6, 1fr)` (current) | white background, default border |
| PT active | 8 | `grid-template-columns: repeat(8, 1fr)` | white background, **2px gold border** (`var(--gold, #FFD700)`), subtle outer glow `0 0 4px rgba(255, 215, 0, 0.35)` |

A modifier class `.pt-active` on `.delphi-pp-injury-bar` flips between the two states. The gold border replaces the existing `border: 1px solid var(--pp-frame)`; outer glow is added as a `box-shadow`.

The total label shifts from `N/6` to `N/8`. Warn/danger triggers shift accordingly (warn at total = cap-1, danger at total = cap).

### Run-grouped cells (the "group up to four of a colour" treatment)

Adjacent same-colour cells render as a single visually-merged run. Each cell carries a position class:

- `group-single` — run length 1 (rounded corners on all four sides, default treatment)
- `group-start` — first cell of a length-2+ run (rounded corners on left only)
- `group-mid` — interior cell of a length-3+ run (no rounded corners)
- `group-end` — last cell of a length-2+ run (rounded corners on right only)

The ring (warn / danger) is rendered as a multi-cell composite via inset `box-shadow`:

- `group-single` ring: full inset border (current behaviour)
- `group-start` ring: top + bottom + **left** inset borders (no right border, so the run's interior reads as continuous)
- `group-mid` ring: top + bottom inset borders only
- `group-end` ring: top + bottom + **right** inset borders

Visually this paints a single continuous ring around the entire run. The 2px grid gap between cells stays — small enough that the run still reads as one shape, while preserving the 1:1 cell-to-injury count for fast counting.

### Threshold ring colours

| State | Run length | Ring | CSS class |
|-------|-----------|------|-----------|
| No PT | 2 | orange `#f0a500` | `warn-2` (existing) |
| No PT | 3+ | red `#d33` + soft red glow | `danger-3` (existing) |
| PT active | 1, 2 | none | (no ring class) |
| PT active | 3 | gold `var(--gold, #FFD700)` | `warn-3` (new) |
| PT active | 4+ | red `#d33` + soft red glow | `danger-4` (new) |

Without PT, runs of 1 get no ring; with PT the no-ring zone extends to runs of 2 — at the higher cap, run-of-2 isn't worth warning on yet.

### Total label palette

| State | Default | Warn (one below cap) | Danger (at cap) |
|-------|---------|----------------------|------------------|
| No PT | grey, `N/6` | orange `#f0a500`, `5/6` | red `#d33`, `6/6` |
| PT active | grey, `N/8` | orange `#f0a500`, `7/8` | red `#d33`, `8/8` |

(Total stays orange/red even when PT is active — the gold treatment is reserved for the *run* warning band; total uses red as the unambiguous "at cap" signal across both states.)

## Behavioural specification

### Pain Tolerance ownership detection

`updateInjuries(playerId, byColor)` becomes `updateInjuries(playerId, byColor, opts)` where `opts.painTolerance` (boolean, default false) drives the layout. Call sites compute it from `panelState.equipment` — an array of `{id, card_idx}`. PT is `card_idx === 15`.

A small helper in the main game class — `_playerHasPainTolerance(playerId)` — wraps the lookup and is called by every existing `updateInjuries` call site to keep them tidy. Single source of truth for the detection; flipping the flag is a one-line change if rules ever shift.

### Re-render on equipment acquisition

The equipment-acquired notif handler ([theoracleofdelphigzed.js:6086-6099](../../../theoracleofdelphigzed.js#L6086)) already re-renders cargo when card 16 (Reinforced Hull) is acquired. Mirror this for card 15 (Pain Tolerance): after pushing the new equipment entry to `ps.equipment`, call `updateInjuries(player_id, ps.injuries, { painTolerance: true })` so the bar resizes immediately on the same notif that lands the equipment card. No animation — snap per decision 3.

### Active player vs spectators / opponents

Same as today — `updateInjuries` is called for every player in `panelState`, so all four panels reflect each player's individual PT status. A spectator viewing a player who owns PT sees the wider bar; viewing one who doesn't, sees the 6-slot bar.

### Defensive: more than the cap

If somehow `byColor` includes a run length above the cap (4 with PT, 3 without — shouldn't happen mechanically, but the server is the source of truth), the bar still renders correctly: extra cells beyond the cap fall off the right side because the grid is fixed-width. The `runLen >= cap` cells get the danger ring class.

## CSS changes

### Modified

```css
.delphi-pp-injury-bar {
    flex: 1;
    display: grid; grid-template-columns: repeat(6, 1fr);
    gap: 2px;
    background: white;
    border: 1px solid var(--pp-frame);
    border-radius: 3px;
    padding: 1px;
    height: 16px;
}
.delphi-pp-injury-bar.pt-active {
    grid-template-columns: repeat(8, 1fr);
    border: 2px solid var(--gold, #FFD700);
    box-shadow: 0 0 4px rgba(255, 215, 0, 0.35);
}
```

### Added (group-position-aware shapes and rings)

```css
/* Group-position rounding — interior edges flat, run reads as one shape */
.delphi-pp-injury-cell.group-start { border-radius: 1px 0 0 1px; }
.delphi-pp-injury-cell.group-mid   { border-radius: 0; }
.delphi-pp-injury-cell.group-end   { border-radius: 0 1px 1px 0; }

/* Single-side ring composites for runs — together they paint one ring
   around a run that spans multiple cells. Each rule contributes the
   sides that face outward; interior edges stay clear so the ring is
   visually continuous. */
.delphi-pp-injury-cell.warn-2.group-single,
.delphi-pp-injury-cell.warn-3.group-single {
    box-shadow: inset 0 0 0 1.5px var(--injury-warn-color);
}
.delphi-pp-injury-cell.warn-2.group-start,
.delphi-pp-injury-cell.warn-3.group-start {
    box-shadow:
        inset 1.5px 0 0 var(--injury-warn-color),
        inset 0 1.5px 0 var(--injury-warn-color),
        inset 0 -1.5px 0 var(--injury-warn-color);
}
.delphi-pp-injury-cell.warn-2.group-mid,
.delphi-pp-injury-cell.warn-3.group-mid {
    box-shadow:
        inset 0 1.5px 0 var(--injury-warn-color),
        inset 0 -1.5px 0 var(--injury-warn-color);
}
.delphi-pp-injury-cell.warn-2.group-end,
.delphi-pp-injury-cell.warn-3.group-end {
    box-shadow:
        inset -1.5px 0 0 var(--injury-warn-color),
        inset 0 1.5px 0 var(--injury-warn-color),
        inset 0 -1.5px 0 var(--injury-warn-color);
}

.delphi-pp-injury-cell.warn-2 { --injury-warn-color: #f0a500; }
.delphi-pp-injury-cell.warn-3 { --injury-warn-color: #FFD700; }

/* Danger (red, with glow) — same group-position composite plus an
   outer glow on group-end / single (the glow only appears once per
   run instead of layering on every cell). */
.delphi-pp-injury-cell.danger-3.group-single,
.delphi-pp-injury-cell.danger-4.group-single {
    box-shadow: inset 0 0 0 1.5px #d33, 0 0 6px rgba(211, 51, 51, 0.6);
}
.delphi-pp-injury-cell.danger-3.group-start,
.delphi-pp-injury-cell.danger-4.group-start {
    box-shadow:
        inset 1.5px 0 0 #d33,
        inset 0 1.5px 0 #d33,
        inset 0 -1.5px 0 #d33;
}
.delphi-pp-injury-cell.danger-3.group-mid,
.delphi-pp-injury-cell.danger-4.group-mid {
    box-shadow:
        inset 0 1.5px 0 #d33,
        inset 0 -1.5px 0 #d33;
}
.delphi-pp-injury-cell.danger-3.group-end,
.delphi-pp-injury-cell.danger-4.group-end {
    box-shadow:
        inset -1.5px 0 0 #d33,
        inset 0 1.5px 0 #d33,
        inset 0 -1.5px 0 #d33,
        0 0 6px rgba(211, 51, 51, 0.6);
}
```

### Removed

The existing `.delphi-pp-injury-cell.warn-2` and `.danger-3` rules collapse into the position-aware variants above. The original full-inset shadows live on inside the `.group-single` rule so a 1-of-a-colour cell still gets the same look as today.

## JS changes

### Components.js — updateInjuries

```javascript
updateInjuries: function(playerId, byColor, opts) {
    opts = opts || {};
    var painTolerance = !!opts.painTolerance;
    var capacity = painTolerance ? 8 : 6;
    var runWarnAt = painTolerance ? 3 : 2;
    var runDangerAt = painTolerance ? 4 : 3;

    var bar = document.getElementById('pp-injury-bar-' + playerId);
    var totalEl = document.getElementById('pp-injury-total-' + playerId);
    if (!bar || !totalEl) return;

    bar.classList.toggle('pt-active', painTolerance);

    // Flatten byColor into a per-cell list, tracking each cell's
    // position within its colour run for the group-* class assignment.
    var cells = [];
    var total = 0;
    byColor.forEach(function(row) {
        var n = parseInt(row.n, 10);
        total += n;
        for (var i = 0; i < n; i++) {
            cells.push({
                color: row.color,
                runLen: n,
                runIdx: i,
            });
        }
    });
    while (cells.length < capacity) cells.push(null);

    bar.innerHTML = cells.map(function(cell) {
        if (!cell) return '<div class="delphi-pp-injury-cell"></div>';
        var cls = 'delphi-pp-injury-cell filled';

        // Group position class
        if (cell.runLen === 1) cls += ' group-single';
        else if (cell.runIdx === 0) cls += ' group-start';
        else if (cell.runIdx === cell.runLen - 1) cls += ' group-end';
        else cls += ' group-mid';

        // Threshold ring class (paired with palette via CSS)
        if (cell.runLen === runWarnAt) {
            cls += painTolerance ? ' warn-3' : ' warn-2';
        } else if (cell.runLen >= runDangerAt) {
            cls += painTolerance ? ' danger-4' : ' danger-3';
        }

        return '<div class="' + cls + '" data-color="' + cell.color + '"></div>';
    }).join('');

    var totalCls = 'delphi-pp-injury-total';
    if (total >= capacity) totalCls += ' danger';
    else if (total >= capacity - 1) totalCls += ' warn';
    totalEl.className = totalCls;
    totalEl.textContent = total + '/' + capacity;
},
```

### Main game class — _playerHasPainTolerance helper

```javascript
_playerHasPainTolerance: function(playerId) {
    var ps = this.gamedatas.panelState && this.gamedatas.panelState[playerId];
    if (!ps || !ps.equipment) return false;
    return ps.equipment.some(function(e) { return parseInt(e.card_idx, 10) === 15; });
},
```

### Call-site updates

Every `updateInjuries(playerId, ps.injuries)` call site (~8 of them across `theoracleofdelphigzed.js`) becomes:

```javascript
this.components.playerPanel.updateInjuries(args.player_id, ps.injuries, {
    painTolerance: this._playerHasPainTolerance(args.player_id),
});
```

The Components.js internal call at line 3019 also gets updated, reading `painTolerance` from the gamedatas the panel was rendered against.

### Equipment-acquired notif — re-render on PT acquisition

In the equipment-acquired notif handler around [theoracleofdelphigzed.js:6086](../../../theoracleofdelphigzed.js#L6086), mirror the Reinforced Hull pattern: after the equipment array is updated, if `cardIdx === 15`, call `updateInjuries` with the new PT flag so the bar resizes immediately:

```javascript
if (cardIdx === 15) {
    this.components.playerPanel.updateInjuries(args.player_id, ps.injuries || [], {
        painTolerance: true,
    });
}
```

## Acceptance tests

1. **No PT, baseline.** Player without Pain Tolerance — bar is 6 cells, white background with default frame, total reads `N/6`. Existing warn-2 / danger-3 ring behaviour unchanged.
2. **PT active, capacity.** Player with Pain Tolerance — bar is 8 cells, gold frame + soft outer glow, total reads `N/8`.
3. **Run grouping.** Player has 3 reds + 1 blue. The three red cells render as one continuous run with rounded outer corners + flat interior corners + a single ring (gold without PT? no — at run-length 3 without PT it's red danger-3; with PT it's gold warn-3). The blue cell is a single rounded cell.
4. **Run threshold ring (no PT).** Run of 2 → orange ring around the whole run. Run of 3 → red ring + outer glow.
5. **Run threshold ring (PT active).** Run of 2 → no ring. Run of 3 → gold ring around the whole run. Run of 4 → red ring + outer glow.
6. **Total threshold (no PT).** 5/6 → orange total label. 6/6 → red.
7. **Total threshold (PT).** 7/8 → orange total label. 8/8 → red.
8. **Acquisition resize.** Player has 4 injuries (e.g., 2 red + 1 blue + 1 yellow), then acquires Pain Tolerance. After the equipment card lands, the bar instantly snaps to 8 cells with the gold frame; the existing 4 injuries stay in place; rings recompute (the run-of-2 red, which had an orange warn-2 ring, loses it because the warn threshold is now 3).
9. **Multi-player.** With one player who owns PT and one who doesn't, both panels render correctly side-by-side — gold-framed 8-slot bar on the PT player, white-framed 6-slot bar on the other.
10. **Loss-of-PT (defensive).** Although equipment can't currently be lost, if `panelState.equipment` ever returns false for `card_idx === 15` after a re-render, the bar reverts to 6 cells without errors. Guarantee: `pt-active` toggles via `classList.toggle('pt-active', painTolerance)` so the modifier is always in sync with the flag.

## Out of scope (YAGNI)

- Animated 6 → 8 expansion (decision 3 — snap)
- A separate "PT" badge or icon (decision 1 — gold frame is the only indicator)
- Per-cell hover tooltips explaining why the cap is higher (the equipment card itself has a tooltip)
- Treating per-colour caps as separate from total cap — the spec assumes "PT active" raises both caps together, which matches `CheckInjuries.php`'s rule
- Animation on the gold frame appearance (snap per decision 3)
- Removal-of-equipment paths — no gameplay path triggers that today
