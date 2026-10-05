/**
 * The equipment pick warns about cards that would do nothing for the player.
 *
 * Such a card is dimmed (.supply-slot-noeffect), carries a "No effect"
 * ribbon, and its tooltip says why. It stays pickable, since taking a card to
 * deny an opponent is legal: a click asks first ("Take it anyway" / Back),
 * where any other card is picked at once. Leaving the pick restores it.
 *
 * Run: node tests/test_equipment_no_effect_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'theoracleofdelphi.css'), 'utf8');
const PHP = fs.readFileSync(path.join(__dirname, '..', 'modules/php/Game.php'), 'utf8');

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }
function extract(name) {
    const s = SRC.indexOf('        ' + name + ': ');
    if (s < 0) throw new Error('method not found: ' + name);
    let i = SRC.indexOf('{', s), d = 0;
    for (; i < SRC.length; i++) {
        if (SRC[i] === '{') d++;
        else if (SRC[i] === '}') { d--; if (!d) break; }
    }
    return SRC.slice(s, i + 1);
}
const names = ['_setupEquipmentPickAffordance', '_markEquipmentNoEffect', '_unmarkEquipmentNoEffect',
    '_confirmNoEffectPick', '_buildEquipmentNoEffectText', '_teardownEquipmentPickAffordance'];
global._ = (s) => s;
global.dojo = { string: { substitute: (t, o) => t.replace(/\$\{(\w+)\}/g, (_, k) => o[k]) } };

function slot(cardId, typeArg) {
    const s = {
        id: 'supply-eq-' + cardId, dataset: { cardId: String(cardId), cardTypeArg: String(typeArg) },
        classes: new Set(), children: [], listeners: [],
        classList: { add(c) { s.classes.add(c); }, remove(c) { s.classes.delete(c); } },
        addEventListener(t, f) { s.listeners.push(f); }, removeEventListener(t, f) { s.listeners = s.listeners.filter(x => x !== f); },
        appendChild(c) { c.parent = s; s.children.push(c); },
        querySelector(q) { return s.children.find(c => '.' + c.className === q) || null; },
    };
    return s;
}
const hook = slot(41, 19), quad = slot(42, 8);
global.document = {
    querySelectorAll: () => [hook, quad],
    createElement: () => { const e = { className: '', textContent: '', remove() { const p = e.parent; p.children = p.children.filter(c => c !== e); } }; return e; },
};
const g = new Function('return {' + names.map(extract).join(',\n') + '}')();
const tips = {}, picked = [], confirms = [];
Object.assign(g, {
    isCurrentPlayerActive: () => true,
    equipmentDefs: { 19: { name: 'Cool Statue Hook' }, 8: { name: 'Quadrireme' } },
    _buildEquipmentTooltipHtml: (t) => '<card ' + t + '>',
    _escHtml: (s) => s,
    addTooltipHtml: (id, html) => { tips[id] = html; },
    removeTooltip: (id) => { delete tips[id]; },
    _onEquipmentSupplyClick: (s) => picked.push(s.dataset.cardId),
    _confirmInActionBar: (title, label, onConfirm) => confirms.push({ title, label, onConfirm }),
    _equipmentNoEffect: { 41: 'hook_no_task' },
});

g._setupEquipmentPickAffordance();
check(hook.classes.has('supply-slot-noeffect') && hook.children.some(c => c.className === 'supply-noeffect-ribbon' && c.textContent === 'No effect'),
    'a card with no effect is dimmed and ribboned "No effect"');
check(/No effect for you: no statue of its colours would fill one of your open statue tasks\./.test(tips[hook.id] || ''),
    'its tooltip says why, got ' + tips[hook.id]);
check(!quad.classes.has('supply-slot-noeffect') && !quad.children.length, 'a useful card is left alone');

quad.listeners[0]();
check(picked.join() === '42' && confirms.length === 0, 'a useful card is picked at once');
hook.listeners[0]();
check(confirms.length === 1 && picked.join() === '42', 'a no-effect card asks first instead of picking');
check(/^Cool Statue Hook would have no effect for you: .* Take it anyway\?$/.test(confirms[0].title) && confirms[0].label === 'Take it anyway',
    'with the card, the reason, and "Take it anyway"');
confirms[0].onConfirm();
check(picked.join() === '42,41', '"Take it anyway" picks it');

g._teardownEquipmentPickAffordance();
check(!hook.classes.has('supply-slot-noeffect') && !hook.children.length && tips[hook.id] === '<card 19>',
    'leaving the pick restores the card and its normal tooltip');

// Every reason the server can send has a sentence.
const keys = new Set();
for (const m of PHP.matchAll(/return [^;]*?'(ship_full|hook_no_task|hook_none_on_board|scout_islands|surge_gods|statues_done|offerings_done|rewards_done|hull_done)'/g)) keys.add(m[1]);
['ship_full', 'hook_no_task', 'hook_none_on_board', 'scout_islands', 'surge_gods', 'statues_done', 'offerings_done', 'rewards_done', 'hull_done']
    .forEach(k => keys.add(k));
keys.forEach(k => check(g._buildEquipmentNoEffectText(k, 19) !== 'it would not help you right now.', 'reason ' + k + ' has its own sentence'));

check(/\.supply-equipment-slot\.supply-slot-noeffect \{[^}]*filter:\s*grayscale[^}]*animation:\s*none/.test(CSS),
    'the dimmed card stops pulsing gold');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
