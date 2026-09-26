/**
 * Finished Zeus tiles fade back until the task row is hovered.
 *
 * An experiment behind FADE_DONE_TASKS. What each check pins:
 *
 *   - The switch is one constant, applied as a body class in setup, so the
 *     experiment turns off in one place.
 *   - A done tile fades AND desaturates: opacity alone turns red pinkish on
 *     the cream panel.
 *   - A just-finished tile (pp-done-new) stays at full strength, and the fade
 *     waits: the moment of finishing is still seen.
 *   - Hovering the task row restores every done tile, quickly; hover is on
 *     the row, not the tile, so the tiles do not flicker.
 *   - Reduced motion drops the transition.
 *
 * Run: node tests/test_fade_done_tasks_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JS = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'theoracleofdelphi.css'), 'utf8');

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } }

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Body of the first rule whose selector list contains `sel` exactly. */
function rule(sel) {
    const re = new RegExp('(?:^|\\n)([^{}]*?' + esc(sel) + '(?=\\s*[,{])[^{}]*)\\{([^}]*)\\}');
    return (CSS.match(re) || [])[2] || '';
}

check(/FADE_DONE_TASKS:\s*true/.test(JS), 'the experiment is on, behind one constant');
check(/classList\.toggle\('delphi-fade-done-tasks',\s*!!this\.FADE_DONE_TASKS\)/.test(JS),
    'setup applies it as a body class');

const B = 'body.delphi-fade-done-tasks ';
const faded = rule(B + '.delphi-pp-task-pip.done');
check(/opacity:\s*0\.\d+/.test(faded), 'a done tile fades');
check(/filter:\s*saturate\(0\.\d+\)/.test(faded), 'and loses some colour, so red never reads as pink');
const delay = (faded.match(/opacity\s+[\d.]+s\s+\w+\s+([\d.]+)s/) || [])[1];
check(delay && parseFloat(delay) > 0, 'the fade waits before it starts, got ' + delay);
check(/border-color/.test(faded), 'without dropping the ring\'s own transition');

const full = rule(B + '.delphi-pp-task-pip.done.pp-done-new');
check(/opacity:\s*1/.test(full) && /filter:\s*none/.test(full), 'a just-finished tile stays at full strength');

const hover = rule(B + '.delphi-pp-tasks:hover .delphi-pp-task-pip.done');
check(/opacity:\s*1/.test(hover) || /opacity:\s*1/.test(full), 'hovering the row restores every done tile');
check(!/\.delphi-pp-task-pip(\.done)?:hover/.test(CSS.slice(CSS.indexOf(B))),
    'on the row, not per tile');
const hoverT = (CSS.match(new RegExp(esc(B + '.delphi-pp-tasks:hover .delphi-pp-task-pip.done') + '\\s*\\{([^}]*transition[^}]*)\\}')) || [])[1] || '';
check(/opacity\s+0\.1\d?s/.test(hoverT), 'and quickly');

check(/body\.motion-reduced-pref\.delphi-fade-done-tasks \.delphi-pp-task-pip\.done\s*\{[^}]*transition:\s*none/.test(CSS),
    'reduced motion drops the transition');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
