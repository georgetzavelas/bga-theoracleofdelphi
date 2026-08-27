# BGA Kit: a reusable starter kit and lessons base for the next Board Game Arena game

Date: 2026-08-27
Status: approved design, ready for implementation planning

## Problem

The Oracle of Delphi took roughly ten months (2025-11-02 to 2026-08-27, 1111
non-merge commits). A large share of that time went into discovering how the
BGA platform actually behaves, and into retrofitting subsystems that should
have existed from the start. None of that knowledge is currently in a form the
next game can use.

What exists today is not enough:

- `.claude/commands/game-plan.md` is a 28KB planning template with no
  hard-won content. Line 27 instructs the agent to read framework docs in
  `bga-framework/bga-framework.md`, a directory that does not exist.
- `CLAUDE.md` carries one load-bearing mechanical rule (the JS cache-bust
  ritual) and it is wrong in two ways: it names `theoracleofdelphigzed.js`,
  renamed months ago to `theoracleofdelphi.js`, and it says six `define()`
  URLs when there are nine plus the `JS_VERSION` property, ten markers total.
- The real knowledge lives in commit bodies (about 960 characters of body per
  commit across the last 300) and in code comments, neither of which is
  organized or reachable.

## Goals

1. A future Claude Code session, in an empty repository, can stamp in a
   working skeleton and start on game logic rather than on platform discovery.
2. Multiple agents can work that repository in parallel without colliding, by
   design rather than by conflict resolution.
3. Lessons that were paid for once are not paid for twice.
4. Mechanical rules cannot silently rot the way the cache-bust rule did.

## Non-goals

- No BGA API reference. That is BGA's documentation's job and it rots fastest.
  The kit records only what was learned the hard way, and dates it.
- No Oracle of Delphi rules content.
- No change to `.claude/commands/game-plan.md`. Its dead `bga-framework/`
  reference is worth fixing, but as a separate decision.
- No packaging as a plugin or a user-level skill. Decided: the kit is checked
  into the consuming repository.

## Where it lives

Authored at `bga-kit/` in this repository, which is canonical. Each lesson
therefore sits in the same repository as the commits that prove it.

`bga-kit/stamp.sh <target-repo> <gamename>` copies `skeleton/` into a target
repository and templates the game name. Game two owns its copy from that point
on. Because the copy came from a git-tracked source, improvements discovered
during game two can be diffed back rather than lost.

## Structure

```
bga-kit/
  README.md                          how to stamp, how to feed changes back
  stamp.sh

  knowledge/
    00-non-negotiables.md            ALWAYS read. Hard cap 150 lines.
    01-parallel-work-map.md          ALWAYS read by the orchestrating agent.
    10-state-machine-and-actions.md
    11-notifications-and-log.md
    12-undo.md
    13-player-panel-and-scoring.md
    14-action-bar-and-state-args.md
    15-private-state-and-privacy.md
    16-database-and-persistence.md
    17-options-preferences-i18n.md
    20-css-and-layout.md
    21-animation-and-timing.md
    22-mobile-touch-and-zoom.md
    23-testing.md
    24-studio-deploy-and-cachebust.md
    optional/
      30-spatial-boards.md           hex grid, pathfinding, board generation

  skeleton/                          copied verbatim, <gamename> templated
    CLAUDE.md
    gameinfos.inc.php
    gameoptions.json
    gamepreferences.json
    stats.json
    dbmodel.sql                      append-only, one block per feature
    <gamename>.js                    thin shell; module list from one constant
    <gamename>.css                   sentinel-sectioned
    modules/js/README                the one-module-per-subsystem rule
    modules/php/Game.php             thin shell
    modules/php/MaterialDefs.php     skeleton
    modules/php/UndoState.php        manifest-driven snapshot contract
    modules/php/States/UndoableState.php
    modules/php/States/README        the one-state-per-file rule
    tests/run_all.sh                 taken verbatim from this repository
    tests/test_example.php
    tests/test_example_js.js
    .github/workflows/tests.yml      PHP pinned to the version BGA runs
    scripts/                         see below
  postmortems/index.md               surviving lessons, one line + commit SHA
```

The `skeleton/` contents above are fixed by this design. The *contents* of the
`knowledge/` documents are not; they are the output of the mining phases and
are specified here only by their shape and their subject.

### Backend and frontend split

The requested backend/frontend division is expressed as the numbering. The 10s
are backend-major, the 20s are frontend-major.

Five subsystems are genuinely cross-cutting: notifications and the log, undo,
the player panel, the action bar, and private-state privacy. Each of these
filed as one document in the 10s, because its contract originates server-side,
and each states its JS half explicitly inside that document.

Splitting those five by layer was rejected. The evidence is that their bugs
were bugs in the contract, not in either half. `fix(undo): per-player restore
notif (no private leak) + actor self-hand repaint` is one lesson spanning both
sides, and it is unintelligible if the halves are filed separately.

### Reading contract

An agent reads `00-non-negotiables.md` and `01-parallel-work-map.md` always,
then only the numbered documents for the subsystems it owns. An orchestrating
agent reads `01` to allocate work. `optional/30-spatial-boards.md` is read only
if the game has a positional board.

The 150-line cap on `00-non-negotiables.md` is a hard constraint, not a
target. A long always-read file is a file that gets skimmed, and a skimmed
mechanical rule is the failure that produced the stale cache-bust instruction.

## Fixed document shape

Every numbered document uses the same five headings, in this order, so an
agent can locate what it needs without reading the whole file:

1. **Contract** — the exact PHP to JS handoff. Notification names, argument
   keys, `getArgs` shape. What a backend agent and a frontend agent must agree
   on before either begins.
2. **Pattern** — the shape to copy, naming the `skeleton/` file that
   implements it where one exists.
3. **Traps** — what went wrong, each with a commit SHA. The document states
   the rule; the SHA lets an agent read the original post-mortem when it needs
   the reasoning.
4. **Test** — the test to write, naming the skeleton test that demonstrates it.
5. **Framework facts (checked YYYY-MM-DD)** — perishable claims about platform
   behavior, dated, with the source URL, and an instruction to re-verify.

Heading 5 is the anti-rot mechanism. Adaptation lessons are stable and carry no
date. Platform facts rot, so they carry one.

## Mechanical rules ship as scripts

Rule: if a rule can be performed or checked by a script, it ships as a script,
and the document says "run X" rather than "remember to Y".

Evidence for the rule: the prose cache-bust instruction is wrong in two ways,
while `tests/run_all.sh` has never drifted because it discovers tests by glob
instead of listing them.

```
skeleton/scripts/
  bump-js-version.sh        moves every cache-bust marker in one command
  new-state.sh              scaffolds a state class plus its test
  new-js-module.sh          scaffolds a module, registers it, scaffolds its test
  check-conventions.sh      pre-commit; three checks, see below
```

`check-conventions.sh` exits non-zero on any of:

- a cache-bust marker that disagrees with the single version constant,
- a file under `modules/js/` that the loader does not register,
- a CSS rule outside the alphabetical sentinel section for its component.

These are the three drift classes the skeleton's bets can be broken by, and
all three are mechanically detectable. Prose rules that a script cannot check
do not belong in the skeleton at all; they belong in `00-non-negotiables.md`.

## Day-one architectural bets

Seven bets the skeleton encodes, each backed by measured evidence from this
repository.

| # | Bet | Evidence |
|---|-----|----------|
| 1 | One state class per file | 37 files in `modules/php/States/`, no merge conflicts across the project |
| 2 | The main `.js` is a thin shell; every subsystem is a module under `modules/js/` | 13,609 lines and 354 methods in `theoracleofdelphi.js` |
| 3 | One version constant, with the module URL list computed from it | 10 duplicated `?v` markers, three merge conflicts in a single session, and a stale rule in CLAUDE.md |
| 4 | Undo exists from the first commit | Undo spec landed 2026-07-11, 8.3 months in; 34 of the final 231 commits were undo-scoped, plus knock-on `bonus-action` and `player-panel` fixes |
| 5 | Prefer convention-based auto-wiring over registries | 67 of 79 `notif_` handlers are auto-wired by `bgaSetupPromiseNotifications()`, so adding one appends rather than edits; the same trick makes test files conflict-free |
| 6 | `dbmodel.sql` is append-only, one block per feature | 14 tables in a single contended file |
| 7 | CSS is sentinel-sectioned within one file | 5,911 lines and 291 sections in `theoracleofdelphi.css` |

Bet 4 is the most expensive lesson available. Retrofitting undo forced it to
discover framework-owned player columns, non-UTF-8 column data, private-state
leaks to opponents, animation suppression on restore, and piece reconciliation,
one bug at a time. Designed in from the start, every subsequent feature is
snapshot-aware without extra work.

Bet 7 is deliberately the low-machinery option. Authoring per-component CSS
files and concatenating them was considered and rejected: it adds a build step
and a generated file in git, for a conflict class that alphabetically ordered
sentinel sections already prevent, since agents editing different components
touch non-adjacent lines. `check-conventions.sh` verifies a new rule landed in
its correct section.

## Parallel work map

`01-parallel-work-map.md` carries three things:

1. **Contention table.** Every file the skeleton creates, classified as
   uncontended (one owner per file, safe to fan out), append-only (concurrent
   appends, merge cleanly), or serialized (needs a single owner for the
   duration of a phase).
2. **Safe concurrency sets.** Which subsystems can be built at the same time,
   derived from which files they touch.
3. **Handoff protocol.** For the five cross-cutting subsystems, the contract
   from heading 1 of that subsystem's document is fixed and written down before
   either the backend or the frontend agent starts, so neither invents it.

## Mining methodology

Four phases, run as a Workflow.

**Phase 1, fan out by subsystem.** One agent per cluster, clusters taken from
the commit-prefix histogram (`ui` 32 fixes, `undo` 16, `player-panel` 15,
`log` 13, `bonus-action` 12, `action-bar` 11, and the rest). Each agent reads
every commit body in its cluster plus the code that owns that subsystem at
HEAD, and returns findings in the five-heading shape.

**Phase 2, adversarial verification.** Every finding is independently checked:
is it still true at HEAD, or was it superseded by a later commit? This phase is
mandatory. `cc88c68` ("restore score via counters, not raw SQL") was superseded
by `fb7e04d` ("purely via counters, no column by name") the same day, and
`17791e2` reshaped both. Unverified mining emits all three as rules. A kit that
confidently teaches a superseded pattern is worse than no kit.

**Phase 3, deleted design documents.** About 40 spec and plan files were
written and later deleted; 3,347 lines in the final deletion alone. One agent
reads them from git history for decisions that never reached a code comment.

**Phase 4, synthesis.** Assemble surviving findings into the fixed-shape
documents, then build the skeleton.

Only findings that survive phase 2 reach `postmortems/index.md`. Superseded
findings are dropped rather than filed in an appendix, because an appendix of
rejected approaches is liable to be read as guidance. The commit SHAs in each
document's Traps section remain the route into the raw history for any agent
that wants the archaeology.

## Verification

The kit is not done until it demonstrably works. Acceptance criteria, each
executable:

1. `stamp.sh` into an empty directory produces a tree where
   `bash tests/run_all.sh` exits zero.
2. `new-state.sh Foo` produces a state class and a test, and
   `run_all.sh` still exits zero.
3. `new-js-module.sh Foo` produces a module, registers it in the loader, and
   produces a test; `run_all.sh` still exits zero.
4. `bump-js-version.sh` moves every cache-bust marker, verified by a grep that
   finds zero stale markers.
5. `check-conventions.sh` exits non-zero on a deliberately drifted file: a CSS
   rule in the wrong section, an unregistered JS module, and a mismatched
   cache-bust marker.
6. Every commit SHA cited in a Traps section resolves in this repository.
7. `00-non-negotiables.md` is at most 150 lines.

## Success criteria

The kit succeeds if, on game two, the first day is spent on that game's rules
rather than on platform mechanics, and if no bug from the postmortems index
recurs.
