/**
 * Dynamic words inside translated strings must be translated too.
 *
 * Reported as "Choose Yellow" showing "Yellow" in English in every locale.
 * The surrounding sentence was translated, but the colour/god/monster inside
 * it was a logic key ('yellow') capitalised for display, which no locale's
 * translation table ever sees. BGA's rules (doc: Translations):
 *   - the inserted word comes from a LITERAL _('Yellow'), so the scanner puts
 *     it on the Translation page;
 *   - the sentence is ONE translatable string with a ${placeholder}, never
 *     _('Discard') + ' ' + word, since word order differs by language;
 *   - server-side, a display arg from a clienttranslate() table is listed in
 *     the notif/state args' 'i18n' key.
 *
 * Run: node tests/test_dynamic_label_i18n_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.js'), 'utf8');
const COMP = fs.readFileSync(path.join(ROOT, 'modules', 'js', 'Components.js'), 'utf8');

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }
function extract(src, name) {
    const s = src.indexOf('        ' + name + ': ');
    if (s < 0) throw new Error('not found: ' + name);
    let i = src.indexOf('{', s), d = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') d++;
        else if (src[i] === '}') { d--; if (!d) break; }
    }
    return src.slice(s, i + 1);
}

// ---- the helpers translate through _() -----------------------------------
{
    const FR = { Yellow: 'Jaune', Wild: 'Joker', Ares: 'Arès', Hydra: 'Hydre' };
    const g = new Function('_', `return {
${extract(SRC, '_colorLabel')},
${extract(SRC, '_godLabel')},
${extract(SRC, '_monsterLabel')}
};`)((s) => FR[s] || s);
    check(g._colorLabel('yellow') === 'Jaune', 'colour key -> translated name');
    check(g._colorLabel('YELLOW') === 'Jaune', 'colour lookup ignores case');
    check(g._colorLabel('wild') === 'Joker', 'wild has a name too');
    check(g._godLabel('ares') === 'Arès', 'god key -> translated name');
    check(g._monsterLabel('hydra') === 'Hydre', 'monster key -> translated name');
    check(g._colorLabel('teal') === 'Teal', 'unknown key still reads (capitalised)');
}

// ---- every name is a literal the scanner can see --------------------------
['Red', 'Yellow', 'Green', 'Blue', 'Pink', 'Black', 'Wild',
 'Aphrodite', 'Apollo', 'Ares', 'Artemis', 'Hermes', 'Poseidon',
 'Chimera', 'Cyclops', 'Gorgon', 'Hydra', 'Minotaur', 'Siren'].forEach((w) => {
    check(SRC.includes("_('" + w + "')"), `_('${w}') literal exists for extraction`);
});

// ---- no key is capitalised for display outside the helpers ---------------
{
    const helpers = ['_colorLabel', '_godLabel', '_monsterLabel'].map((n) => extract(SRC, n));
    let rest = SRC;
    helpers.forEach((h) => { rest = rest.replace(h, ''); });
    check(!/charAt\(0\)\.toUpperCase\(\)/.test(rest),
        'theoracleofdelphi.js: display labels go through the helpers, not charAt(0).toUpperCase()');
    const compRest = COMP.replace(extract(COMP, '_monsterLabel'), '')
        .replace(/_capitalize: function[^\n]*\n/, '');
    check(!/charAt\(0\)\.toUpperCase\(\)/.test(compRest),
        'Components.js: monster/god labels go through the helpers');
}

// ---- sentences are single translatable strings ---------------------------
['Discard', 'Explore', 'Defeat'].forEach((verb) => {
    check(!new RegExp("_\\('" + verb + "'\\) \\+ ' ' \\+").test(SRC),
        `no _('${verb}') + ' ' + word concatenation`);
});
check(SRC.includes("_('Discard ${color}')"), 'Discard button is one string');
check(SRC.includes("_('Explore ${color} Island')"), 'Explore button is one string');
check(SRC.includes("_('Defeat ${monster}')"), 'Defeat button is one string');

// ---- server: display args are i18n-tagged --------------------------------
{
    const sel = fs.readFileSync(path.join(ROOT, 'modules/php/States/SelectAction.php'), 'utf8');
    const dieArgs = sel.match(/'die_color' => [^\n]*\n\s*'i18n' => \['die_color'\]/g) || [];
    check(dieArgs.length === 2, `both SelectAction arg sets tag die_color (got ${dieArgs.length})`);
    check(/\$\{target_color_name\}/.test(sel) && /"i18n" => \[[^\]]*"target_color_name"/.test(sel),
        'card recolour log renders a translated target colour');

    const pa = fs.readFileSync(path.join(ROOT, 'modules/php/States/PlayerActions.php'), 'utf8');
    check(!/\$\{card_color\}/.test(pa), 'oracle card plays no longer render the raw card_color key');
    check((pa.match(/"color_name" => MaterialDefs::colorName\(/g) || []).length >= 2,
        'oracle card plays send a translated color_name');

    const uga = fs.readFileSync(path.join(ROOT, 'modules/php/States/UseGodAbility.php'), 'utf8');
    check(/'i18n' => \[[^\]]*'god_ability_instruction'/.test(uga),
        'the god-ability instruction (the whole status bar text) is i18n-tagged');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
