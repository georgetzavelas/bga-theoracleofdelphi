# BGA Kit: a reusable starter kit and lessons base for the next Board Game Arena game

Date: 2026-08-27
Status: revision 3, awaiting review

## Problem

The Oracle of Delphi took roughly ten months (2025-11-02 to 2026-08-27, 1111
non-merge commits). A large share of that time went into discovering how the
BGA platform actually behaves, and into retrofitting subsystems that should
have existed from the start. None of that knowledge is currently in a form the
next game can use.

What exists today is not enough:

- `.claude/commands/game-plan.md` is a 28KB planning template with no
  hard-won content of its own. It defers to `bga-framework/bga-framework.md`
  for platform knowledge.
- `bga-framework/` does exist: three documents totalling 108KB, written at
  project start as an attempt to capture the platform. It is gitignored, so it
  is absent from git history. It contains real value, and it also contains
  confidently-wrong guidance that demonstrably cost this project months. See
  "Evidence precedence" below, and `knowledge/02-framework-claims-disproved.md`
  in the structure that follows.
- `CLAUDE.md` carries one load-bearing mechanical rule (the JS cache-bust
  ritual) and it is wrong in two ways: it names `theoracleofdelphigzed.js`,
  renamed months ago to `theoracleofdelphi.js`, and it says six `define()`
  URLs when there are nine plus the `JS_VERSION` property, ten markers total.
- The real knowledge lives in commit bodies (about 960 characters of body per
  commit across the last 300) and in code comments, neither of which is
  organized or reachable.

## Evidence precedence

Three sources of truth, in strict order. Where they disagree, the lower number
wins, and the disagreement is itself recorded as a lesson.

1. **Code at HEAD.** What the game actually does is what the platform actually
   permitted.
2. **Commit history.** About 200 `fix(...)` commits with substantial bodies.
   Where two commits give conflicting rules, the later supersedes the earlier.
3. **`bga-framework/` capture documents.** Useful colour on why the code looks
   the way it does, and a large body of API patterns worth keeping. Not
   authoritative. Written before the game was built, and wrong in places that
   mattered.

This ordering is not a formality. The capture documents contain a section at
`bga-framework.md:53` titled "BGA Framework Default Behaviors (Don't Ask About
These)" which asserts that undo and mobile responsiveness are handled
automatically, and instructs the reader, in bold, **"Do not ask"** about each.
Both became the two most expensive areas of the project:

| Claim | What shipped |
|-------|--------------|
| "BGA provides built-in undo. No need to implement custom undo logic." | A custom `undo_snapshot` table, `UndoState.php`, the `UndoableState` trait, `performUndo()`, and 34 undo-scoped commits, 16 of them bug fixes, all in the final 6.5 weeks |
| "BGA framework handles responsive design. Games automatically adapt to mobile." | 24 commits scoped to zoom (17), touch (4) and mobile (3); a bespoke `DragScroller.js`; three dedicated tests; 6 media queries; a worktree named `iphone-ship-movement-bug` |

Two further deltas, lower cost but same class: the guide prescribes a SCSS
build pipeline and the repository contains zero `.scss` files; the guide states
"limit total image files to < 12" and the game shipped 270 and reached alpha.
Its 2MB-per-file limit does appear to hold, the largest asset being about 384KB.

The guide was also right in places, and the kit must say so, or it will be read
as uniformly untrustworthy and discarded. The repository's `type(scope):`
commit convention comes directly from `bga-testing-deployment.md:494` and was
adopted wholesale.

## Goals

1. A future Claude Code session, in an empty repository, can stamp in a
   working skeleton and start on game logic rather than on platform discovery.
2. Multiple agents can work that repository in parallel without colliding, by
   design rather than by conflict resolution.
3. Lessons that were paid for once are not paid for twice.
4. Mechanical rules cannot silently rot the way the cache-bust rule did.
5. No document in the kit ever suppresses a question. Guidance that closes off
   inquiry is the most expensive failure mode observed in the existing inputs,
   because unlike an omission it prevents the reader from noticing the gap.

## Non-goals

- The kit does not **author** a BGA API reference. That is BGA's documentation's
  job and it rots fastest. The kit authors only what was learned the hard way,
  and dates it. It does carry the existing 2025-11 capture documents forward
  under `reference/framework-capture/`, explicitly as tier-3 evidence rather
  than as authored guidance.
- No Oracle of Delphi rules content.
- No change to `.claude/commands/game-plan.md`. It now resolves, since
  `bga-framework/` exists. Whether that template should defer to the kit
  instead is a separate decision.
- No packaging as a plugin or a user-level skill. Decided: the kit is checked
  into the consuming repository.

## Where it lives

Authored at `bga-kit/` in this repository, which is canonical but **deliberately
untracked**. `.gitignore` line 7 is `bga-kit/`, alongside the existing
exclusions for `bga-framework/` and `CLAUDE.md`. The kit is working material
for the next game, not source for this one.

The consequence, accepted: there is no versioned baseline here, so improvements
discovered during game two cannot be recovered by `git diff` against this
repository. Feeding changes back is a manual copy in the other direction.

A second consequence, worth knowing rather than fixing: because it is
gitignored, `bga-kit/` will not appear in this repository's worktrees, by the
mechanism measured in "Gitignored material does not reach a worktree" below. It
does not matter while the kit's only consumer is game two.

### Getting it into game two

Two steps, the first manual by choice:

1. Copy the `bga-kit/` directory into the new game's repository.
2. Run `bga-kit/stamp.sh <gamename>` from the new repository root. It lays
   `skeleton/*` down at the root with `<gamename>` templated into filenames and
   file contents, and leaves `knowledge/`, `reference/` and `postmortems/`
   in place under `bga-kit/`.

In the target repository, `bga-kit/` **is** tracked. That is the point of the
decision to check the kit in: agents working game two in parallel worktrees must
all see the knowledge documents with no external setup, and gitignored material
does not reach a worktree.

This creates one trap the skeleton must defuse. If game two's `.gitignore` is
copied from this repository, it will carry `bga-kit/` and `bga-framework/`, and
game two will silently untrack the very knowledge it needs. So the skeleton
ships its own `.gitignore`, which must contain neither line, and
`check-conventions.sh` verifies that.

## Structure

```
bga-kit/
  README.md                          how to stamp, how to feed changes back
  stamp.sh

  knowledge/
    00-non-negotiables.md            ALWAYS read. Hard cap 150 lines.
    01-parallel-work-map.md          ALWAYS read by the orchestrating agent.
    02-framework-claims-disproved.md ALWAYS read. Claims the capture docs make
                                     that this project disproved, and the
                                     questions they told the reader not to ask.
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

  skeleton/                          laid at the target root by stamp.sh
    .gitignore                       must NOT ignore bga-kit/ or bga-framework/
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
  reference/framework-capture/       the three 2025-11 capture documents,
                                     carried forward as colour, each stamped
                                     with a header pointing at 02-*.md
  postmortems/index.md               surviving lessons, one line + commit SHA
```

The reference directory is deliberately **not** named `bga-framework/`. A
`.gitignore` line of `bga-framework/` matches a directory of that name at any
depth, so `bga-kit/reference/bga-framework/` would be silently untracked in any
repository carrying that line, this one included. Verified by probe, not
assumed. Naming it `framework-capture/` makes the path safe regardless of what
the target's `.gitignore` inherited.

The `skeleton/` contents above are fixed by this design. The *contents* of the
`knowledge/` documents are not; they are the output of the mining phases and
are specified here only by their shape and their subject.

### Backend and frontend split

The requested backend/frontend division is expressed as the numbering. The 10s
are backend-major, the 20s are frontend-major.

Five subsystems are genuinely cross-cutting: notifications and the log, undo,
the player panel, the action bar, and private-state privacy. Each of these is
filed as one document in the 10s, because its contract originates server-side,
and each states its JS half explicitly inside that document.

Splitting those five by layer was rejected. The evidence is that their bugs
were bugs in the contract, not in either half. `fix(undo): per-player restore
notif (no private leak) + actor self-hand repaint` is one lesson spanning both
sides, and it is unintelligible if the halves are filed separately.

### Reading contract

An agent reads `00-non-negotiables.md`, `01-parallel-work-map.md` and
`02-framework-claims-disproved.md` always, then only the numbered documents for
the subsystems it owns. An orchestrating agent reads `01` to allocate work.
`optional/30-spatial-boards.md` is read only if the game has a positional
board. `reference/framework-capture/` is never read start to finish; it is
consulted for a specific API pattern, and only after `02-*.md`.

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
   behavior, dated, with the source URL, and an instruction to re-verify. Where
   the capture documents assert something this subsystem disproved, the
   correction is stated here and cross-referenced from
   `02-framework-claims-disproved.md`.

Heading 5 is the anti-rot mechanism. Adaptation lessons are stable and carry no
date. Platform facts rot, so they carry one.

### Writing constraint

No document in the kit may tell the reader not to ask something. Any claim that
the platform provides a capability for free must carry the evidence for that
claim and the date it was checked. A claim that cannot meet that bar is written
as an open question instead of an assertion.

This constraint exists because `bga-framework.md:53` did the opposite, and the
two capabilities it declared free became the project's two largest sinks. An
omission leaves the reader to discover the gap; a confident false assertion
stops them looking.

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
  check-conventions.sh      pre-commit; five checks, see below
```

`check-conventions.sh` exits non-zero on any of:

- a cache-bust marker that disagrees with the single version constant,
- a file under `modules/js/` that the loader does not register,
- a CSS rule outside the alphabetical sentinel section for its component,
- a `knowledge/` document containing question-suppressing phrasing,
- a `.gitignore` line that would untrack `bga-kit/` or `bga-framework/`.

These are the five ways the skeleton's bets can be broken silently, and all
five are mechanically detectable. Prose rules that a script cannot check do not
belong in the skeleton at all; they belong in `00-non-negotiables.md`.

## Day-one architectural bets

Seven bets the skeleton encodes, each backed by measured evidence from this
repository.

| # | Bet | Evidence |
|---|-----|----------|
| 1 | One state class per file | 37 files in `modules/php/States/`, no merge conflicts across the project |
| 2 | The main `.js` is a thin shell; every subsystem is a module under `modules/js/` | 13,745 lines and 354 methods in `theoracleofdelphi.js` |
| 3 | One version constant, with the module URL list computed from it | 10 duplicated `?v` markers, three merge conflicts in a single session, and a stale rule in CLAUDE.md |
| 4 | Undo exists from the first commit | Undo spec landed 2026-07-11, 8.3 months in; 36 commits are undo-scoped, 16 of them `fix(undo)`, plus knock-on `bonus-action` and `player-panel` fixes. Root cause identified: `bga-framework.md:69` instructed the reader **"Do not ask: Should we implement undo? - Framework handles this"** |
| 5 | Prefer convention-based auto-wiring over registries | 67 of 79 `notif_` handlers are auto-wired by `bgaSetupPromiseNotifications()`, so adding one appends rather than edits; the same trick makes test files conflict-free |
| 6 | `dbmodel.sql` is append-only, one block per feature | 14 tables in a single contended file |
| 7 | CSS is sentinel-sectioned within one file | 5,947 lines and 291 sections in `theoracleofdelphi.css` |

Bet 4 is the most expensive lesson available, and it is the one with a known
cause rather than merely a known cost. Retrofitting undo forced it to discover
framework-owned player columns, non-UTF-8 column data, private-state leaks to
opponents, animation suppression on restore, and piece reconciliation, one bug
at a time. Designed in from the start, every subsequent feature is
snapshot-aware without extra work. The reason it was not designed in is that
the project's own framework notes said it was unnecessary and told the reader
not to raise it.

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

### Gitignored material does not reach a worktree

Measured in this repository on 2026-08-27. Both existing worktrees under
`.claude/worktrees/` are missing `bga-framework/` entirely, because it is
gitignored, while both do have the tracked `docs/Delphi_Rules_v2.pdf`. Every
agent that has worked this project in a parallel worktree has therefore done so
without the framework guide on disk.

`CLAUDE.md` is the lone exception: also gitignored, yet present in both
worktrees, so the harness copies that one file specifically. Nothing else
gitignored propagates.

The rule for game two: anything an agent in a worktree must read has to be
git-tracked in that repository. This is the load-bearing reason `bga-kit/` is
tracked in the target even though it is not tracked here.

## Mining methodology

Five phases, run as a Workflow.

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

**Phase 4, framework claim audit.** A different method from phases 1 to 3:
this phase audits a document for falsehoods rather than mining history for
lessons. Every substantive assertion across the 108KB of
`reference/framework-capture/` is checked against code at HEAD and against the
commit history, and classified as confirmed, corrected, stale, or never tested
here. Only corrected and stale claims reach `02-framework-claims-disproved.md`;
confirmed claims are left where they are so the reference stays usable. Claims
phrased so as to suppress a question are called out as such regardless of
whether they turned out true, because the phrasing is the defect.

**Phase 5, synthesis.** Assemble surviving findings into the fixed-shape
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
5. `check-conventions.sh` exits non-zero on each of its four drift cases,
   verified with a deliberately broken fixture per case: a CSS rule in the
   wrong section, an unregistered JS module, a mismatched cache-bust marker,
   and a knowledge document containing question-suppressing phrasing.
6. Every commit SHA cited in a Traps section resolves in this repository.
7. `00-non-negotiables.md` is at most 150 lines.
8. In the stamped **target** repository, every file under `bga-kit/` is
   git-tracked, verified by `git check-ignore` returning non-zero for each.
   This repository intentionally tracks none of them.
9. The skeleton's `.gitignore` contains no line matching `bga-kit/` or
   `bga-framework/`. Enforced by `check-conventions.sh`.
10. Every claim recorded in `02-framework-claims-disproved.md` cites both the
    capture-document line it corrects and the code or commit that disproves it.
11. No file under `knowledge/` contains the strings "do not ask", "don't ask",
    or "no need to implement". Enforced by `check-conventions.sh`.

## Success criteria

The kit succeeds if, on game two, the first day is spent on that game's rules
rather than on platform mechanics, and if no bug from the postmortems index
recurs.
