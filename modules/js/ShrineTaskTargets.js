/**
 * ShrineTaskTargets.js — pure lookup behind the shrine-task hover highlight:
 * given one of the local player's shrine Zeus tiles, where is its island and
 * how does the player know about it.
 *
 * Reads the client's live hex cache (gamedatas.hexes, kept current by
 * notif_islandRevealed and notif_islandsPeeked). The server fills
 * shrineGameColor + shrineLetter on an UNREVEALED hex only when this player
 * has peeked it, so that pairing IS the "privately known" signal — see
 * setupShrinesFromGamedata, which uses the same rule to decide the eye marker.
 *
 * Two knowable states, and they are different actions, not degrees of the same
 * one:
 *
 *   discovered — is_revealed, so another player explored it and stamped the
 *                owner's shrine row. Sail there and Build Shrine.
 *                Exploring your OWN shrine island builds it on the spot
 *                (ExploreIsland::buildOwnShrine), so a shrine island that is
 *                revealed but still unbuilt was always someone else's find.
 *   peeked     — you looked, nobody has explored. Not buildable: the
 *                SelectAction build query requires the explore stamp. Sail
 *                there and Explore, which builds it and completes the task.
 *
 * Both need a die matching the island's exploration colour, so dieColor is the
 * same answer either way.
 *
 * No DOM / dojo dependency, matching DeliveryRelations.js and
 * MonsterTaskTargets.js.
 */
define([], function () {
    // 'empty' is the legacy taskless shrine island (a Zeus tile returned to the
    // box in games created while DiscardZeusTile still cleared the board).
    function ownedBy(hex, myColor) {
        return !!hex && !!myColor && myColor !== 'empty'
            && hex.shrineGameColor === myColor
            && !!hex.shrineLetter;
    }

    function revealed(hex) {
        return parseInt(hex.isRevealed, 10) === 1;
    }

    /**
     * The island behind this shrine task, or null while it is still unknown.
     * @returns {{q:number, r:number, dieColor:string, state:string}|null}
     */
    function locate(letter, myColor, hexes) {
        if (!letter) return null;
        var list = hexes || [];
        for (var i = 0; i < list.length; i++) {
            var h = list[i];
            if (!ownedBy(h, myColor) || h.shrineLetter !== letter) continue;
            return {
                q: parseInt(h.q, 10),
                r: parseInt(h.r, 10),
                dieColor: h.color,
                state: revealed(h) ? 'discovered' : 'peeked'
            };
        }
        return null;
    }

    /** Reverse: the shrine letter this hex would satisfy for me, or null. */
    function letterForHex(hex, myColor) {
        return ownedBy(hex, myColor) ? hex.shrineLetter : null;
    }

    return { locate: locate, letterForHex: letterForHex };
});
