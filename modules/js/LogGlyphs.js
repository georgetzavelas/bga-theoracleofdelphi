/**
 * LogGlyphs.js — pure helper that turns an Oracle-die colour value into an
 * inline die-face glyph for the game log. No DOM / dojo / _() dependency:
 * the translatable labels are passed in by the caller so this stays unit
 * testable in Node. Unknown values are returned unchanged (text fallback).
 */
define([], function () {
    var KNOWN = { red:1, yellow:1, green:1, blue:1, pink:1, black:1, wild:1 };

    // Normalise an arbitrary log value ('Red', ' green ') to a token, or null.
    function token(value) {
        if (value === null || value === undefined) return null;
        var t = String(value).toLowerCase().trim();
        return KNOWN.hasOwnProperty(t) ? t : null;
    }

    // value -> glyph HTML, or the original value unchanged if not a colour.
    function glyph(value, labels) {
        var t = token(value);
        if (t === null) return value;
        var label = (labels && labels[t]) || t;
        return '<span class="log-die die-color-' + t + '" role="img" aria-label="'
             + label + '" title="' + label + '"></span>';
    }

    // "green, red, green" -> three space-joined glyphs. Non-colours pass through.
    function glyphList(value, labels) {
        if (value === null || value === undefined) return value;
        return String(value).split(',').map(function (part) {
            return glyph(part.trim(), labels);
        }).join(' ');
    }

    return { token: token, glyph: glyph, glyphList: glyphList };
});
