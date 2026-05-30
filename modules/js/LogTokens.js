/**
 * LogTokens.js — pure helper that turns a (type, id) pair into an inline
 * game-log image element with a unique id + data attributes, so a post-render
 * hook can attach a BGA tooltip to it. No DOM / dojo dependency: the theme-URL
 * resolver is injected (like LogGlyphs takes its labels), keeping it unit
 * testable in Node. Unknown types return null so the caller falls back to the
 * raw text value.
 *
 * Extend PATHS as Workstream C adds token types (monster, injury, ship tile,
 * favor, zeus tile, titan, die face).
 */
define([], function () {
    function pad3(id) { return ('00' + String(parseInt(id, 10))).slice(-3); }

    // type -> function(id) -> path relative to the game theme root.
    // (Zeus tiles are composite — type/colour/letter — and are resolved by the
    // game class via an explicit path override, not here.)
    var PATHS = {
        equipment: function (id) { return 'img/equipment/card-' + pad3(id) + '.jpg'; },
        god:       function (id) { return 'img/gods/' + String(id).toLowerCase() + '.png'; },
        monster:   function (id) { return 'img/monsters/' + String(id) + '-tile.png'; },
        injury:    function (id) { return 'img/injury/' + String(id).toLowerCase() + '.jpg'; },
        shiptile:  function (id) { return 'img/ship-tiles/ship-' + parseInt(id, 10) + '.jpg'; },
        favor:     function ()   { return 'img/pieces/favor-token.jpg'; },
        titan:     function ()   { return 'img/pieces/titan.jpg'; },
        dieface:   function (id) { return 'img/pieces/die-face-' + parseInt(id, 10) + '.jpg'; },
    };

    function path(type, id) {
        var fn = PATHS[type];
        if (!fn || id === null || id === undefined || id === '') return null;
        return fn(id);
    }

    function escAttr(s) {
        return String(s === null || s === undefined ? '' : s).replace(/"/g, '&quot;');
    }

    // Build the token span from an explicit src. dataId is stored in data-tt
    // for the post-render tooltip hook (may be a composite like
    // "playerId:taskType:extra" for zeus tiles).
    function htmlSrc(type, dataId, label, uid, src) {
        return '<span class="log-tok" id="logtok_' + uid + '" data-tt="' + type + ':' + dataId + '">'
             + '<img class="log-tok-img log-tok-' + type + '" src="' + escAttr(src)
             + '" alt="' + escAttr(label) + '"></span>';
    }

    // Build the inline token HTML, or null if the type is unknown.
    // resolveImg(relPath) -> full URL (the game's themeImg); uid is a unique
    // per-injection counter so the post-render hook can target each element.
    function html(type, id, label, uid, resolveImg) {
        var rel = path(type, id);
        if (rel === null) return null;
        var src = resolveImg ? resolveImg(rel) : rel;
        return htmlSrc(type, id, label, uid, src);
    }

    return { path: path, html: html, htmlSrc: htmlSrc };
});
