/**
 * MonsterTaskTargets.js — pure computation behind the monster-task hover
 * highlight. Given one of the local player's monster Zeus tiles and the live
 * monsters on the board, returns the monsters that would complete it.
 *
 * Mirrors Game::findCompletableZeusTileForType for task_type = 'monster':
 *
 *   - A named tile is completed by its own monster type, and only while the
 *     tile is still open.
 *   - The "any" tile (task_color NULL) is completed by any type NOT already
 *     spoken for by a sibling monster tile — either as that sibling's
 *     task_color or as an already-recorded completion_value. Completed
 *     siblings still exclude: the server's sibling query has no is_completed
 *     filter, and a discarded tile is stored as completed rather than deleted
 *     (States/DiscardZeusTile).
 *
 * Everything here is in monster-TYPE space ('hydra'), which is what
 * zeus_tile.task_color stores for monster tiles and what a board monster's
 * data-type carries. The die-colour translation the player panel does is
 * deliberately not repeated here.
 *
 * No DOM / dojo dependency: the game class gathers `this.*` into plain arrays
 * and calls this, keeping the rules unit-testable in Node (mirrors
 * DeliveryRelations.js).
 */
define([], function () {
    // Mirror of MaterialDefs::MONSTERS keys.
    var MONSTER_TYPES = ['cyclops', 'minotaur', 'chimera', 'hydra', 'gorgon', 'siren'];

    // Types a sibling tile has locked away from the "any" tile.
    function claimedTypes(tile, tiles) {
        var out = {};
        (tiles || []).forEach(function (t) {
            if (!t || t.id === tile.id) return;
            if (t.color) out[t.color] = 1;
            if (t.completionValue) out[t.completionValue] = 1;
        });
        return out;
    }

    // tile:  {id, color, done}   color = monster type, null for the "any" tile
    // tiles: every monster tile the player holds, in any state
    // Returns the monster types that still complete this tile.
    function typesForTile(tile, tiles) {
        if (!tile || tile.done) return [];
        if (tile.color) return [tile.color];
        var claimed = claimedTypes(tile, tiles);
        return MONSTER_TYPES.filter(function (t) { return !claimed[t]; });
    }

    // monsters: [{id, type}] — live (undefeated) monsters on the board.
    // Returns the ids of those that would complete `tile`.
    function targetsForTile(tile, tiles, monsters) {
        var want = {};
        typesForTile(tile, tiles).forEach(function (t) { want[t] = 1; });
        return (monsters || [])
            .filter(function (m) { return m && want[m.type]; })
            .map(function (m) { return m.id; });
    }

    // Reverse direction: the one tile the server would credit for defeating a
    // monster of this type, or null. Same precedence as
    // findCompletableZeusTileForType — exact match first, then the "any" tile.
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
        return claimedTypes(wild, list)[type] ? null : wild.id;
    }

    return {
        MONSTER_TYPES: MONSTER_TYPES,
        typesForTile: typesForTile,
        targetsForTile: targetsForTile,
        tileForType: tileForType
    };
});
