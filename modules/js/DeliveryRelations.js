/**
 * DeliveryRelations.js — pure computation of the "related islands" for the
 * delivery-locations hover highlight. Given a hovered hex and a plain-data
 * snapshot of the board, returns the partner hexes it is linked to by the
 * delivery rules, one entry per matching token color:
 *
 *   offering island  <-> temple        (matched by offering color)
 *   city             <-> statue island (city holds statues; island accepts
 *                                        a fixed color set — matched by color)
 *
 * No DOM / dojo dependency: the game class gathers `this.*` into a plain
 * context and calls this, keeping the logic unit-testable in Node (mirrors
 * LogTokens.js). "Current contents" is the caller's responsibility: it only
 * passes offerings still on islands and statues still in cities.
 */
define([], function () {
    function n(v) { return parseInt(v, 10); }

    function at(list, q, r) {
        return (list || []).filter(function (e) { return n(e.q) === q && n(e.r) === r; });
    }

    function dedup(list) {
        var seen = {}, out = [];
        list.forEach(function (e) {
            var k = n(e.q) + ',' + n(e.r) + ',' + e.color;
            if (!seen[k]) { seen[k] = 1; out.push({ q: n(e.q), r: n(e.r), color: e.color }); }
        });
        return out;
    }

    // hex: {q, r}. ctx: {
    //   attribute:        'offering'|'temple'|'city'|'statue',
    //   color:            optional single token color to restrict to. When
    //                     set (a specific offering/statue/temple piece was
    //                     hovered), only that color's partners are returned;
    //                     when absent (statue island hovered hex-level), every
    //                     matching color is used.
    //   offeringsOnBoard: [{q, r, color}]   (offerings still on islands),
    //   temples:          [{q, r, color}],
    //   statueIslands:    [{q, r, colors:[...]}]   (accepted color set),
    //   citiesStatues:    [{q, r, color}]   (statues still in cities, by origin)
    // }
    // Returns [{q, r, color}] partner hexes (self excluded, deduped).
    function relatedIslands(hex, ctx) {
        var q = n(hex.q), r = n(hex.r), out = [];
        var attr = ctx.attribute;
        var only = ctx.color || null;
        function allowed(c) { return !only || c === only; }

        if (attr === 'offering') {
            at(ctx.offeringsOnBoard, q, r).forEach(function (o) {
                if (!allowed(o.color)) return;
                (ctx.temples || []).forEach(function (t) {
                    if (t.color === o.color) out.push({ q: t.q, r: t.r, color: o.color });
                });
            });
        } else if (attr === 'temple') {
            var me = at(ctx.temples, q, r)[0];
            if (me && allowed(me.color)) {
                (ctx.offeringsOnBoard || []).forEach(function (o) {
                    if (o.color === me.color) out.push({ q: o.q, r: o.r, color: me.color });
                });
            }
        } else if (attr === 'city') {
            var cityColors = {};
            at(ctx.citiesStatues, q, r).forEach(function (s) { if (allowed(s.color)) cityColors[s.color] = 1; });
            (ctx.statueIslands || []).forEach(function (isl) {
                (isl.colors || []).forEach(function (color) {
                    if (cityColors[color]) out.push({ q: isl.q, r: isl.r, color: color });
                });
            });
        } else if (attr === 'statue') {
            var meIsl = at(ctx.statueIslands, q, r)[0];
            if (meIsl) {
                var accept = {};
                (meIsl.colors || []).forEach(function (c) { accept[c] = 1; });
                (ctx.citiesStatues || []).forEach(function (s) {
                    if (accept[s.color] && allowed(s.color)) out.push({ q: s.q, r: s.r, color: s.color });
                });
            }
        }

        return dedup(out).filter(function (e) { return !(e.q === q && e.r === r); });
    }

    return { relatedIslands: relatedIslands };
});
