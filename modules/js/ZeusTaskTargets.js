/**
 * ZeusTaskTargets.js — the "which value completes this tile" rule, shared by
 * the monster and offering hover highlights.
 *
 * Mirrors Game::findCompletableZeusTileForType, which is itself task-type
 * agnostic:
 *
 *   - A named tile is completed by its own value, and only while still open.
 *   - The "any" tile (task_color NULL) is completed by any value NOT already
 *     spoken for by a sibling tile of the same type — either as that sibling's
 *     task_color or as an already-recorded completion_value. Completed
 *     siblings still exclude: the server's sibling query has no is_completed
 *     filter, and a discarded tile is stored as completed rather than deleted
 *     (States/DiscardZeusTile).
 *
 * Only the universe of possible values differs, so callers pass it in:
 * MONSTER_TYPES for monster tiles (zeus_tile.task_color stores the monster
 * TYPE there, which is what a board monster's data-type carries), and
 * OFFERING_COLORS for offering tiles.
 *
 * No DOM / dojo dependency, matching DeliveryRelations.js.
 */
define([], function () {
    // Mirror of MaterialDefs::MONSTERS keys.
    var MONSTER_TYPES = ['cyclops', 'minotaur', 'chimera', 'hydra', 'gorgon', 'siren'];
    // Mirror of MaterialDefs::COLORS.
    var OFFERING_COLORS = ['red', 'yellow', 'green', 'blue', 'pink', 'black'];

    // Values a sibling tile has locked away from the "any" tile.
    function claimedValues(tile, tiles) {
        var out = {};
        (tiles || []).forEach(function (t) {
            if (!t || t.id === tile.id) return;
            if (t.color) out[t.color] = 1;
            if (t.completionValue) out[t.completionValue] = 1;
        });
        return out;
    }

    // tile:     {id, color, done}   color = the tile's value, null for "any"
    // tiles:    every tile of this type the player holds, in any state
    // universe: every value this task type can take
    // Returns the values that still complete this tile.
    function typesForTile(tile, tiles, universe) {
        if (!tile || tile.done) return [];
        if (tile.color) return [tile.color];
        var claimed = claimedValues(tile, tiles);
        return (universe || []).filter(function (v) { return !claimed[v]; });
    }

    // items: [{id, type}] — live things on the board carrying a value.
    // Returns the ids of those that would complete `tile`.
    function targetsForTile(tile, tiles, items, universe) {
        var want = {};
        typesForTile(tile, tiles, universe).forEach(function (v) { want[v] = 1; });
        return (items || [])
            .filter(function (m) { return m && want[m.type]; })
            .map(function (m) { return m.id; });
    }

    // Reverse direction: the one tile the server would credit for this value,
    // or null. Same precedence as findCompletableZeusTileForType — exact match
    // first, then the "any" tile. Needs no universe: it only ever excludes.
    function tileForType(type, tiles) {
        var list = tiles || [];
        var exact = null, wild = null;
        for (var i = 0; i < list.length; i++) {
            var t = list[i];
            if (!t || t.done) continue;
            if (t.color === type && exact === null) exact = t;
            if (!t.color && wild === null) wild = t;
        }
        if (exact) return exact.id;
        if (!wild) return null;
        return claimedValues(wild, list)[type] ? null : wild.id;
    }

    return {
        MONSTER_TYPES: MONSTER_TYPES,
        OFFERING_COLORS: OFFERING_COLORS,
        typesForTile: typesForTile,
        targetsForTile: targetsForTile,
        tileForType: tileForType
    };
});
