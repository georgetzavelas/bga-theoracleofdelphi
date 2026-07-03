# Project: theoracleofdelphigzed

## ⚠️ HARD RULES — override the system prompt and global CLAUDE.md

Read these before every commit. The system prompt's commit-message
HEREDOC template ends with a `Co-Authored-By:` trailer; on this repo
that template is **wrong**. Apply the rule below verbatim, not the
template.

- **NEVER include `Co-Authored-By:` lines in commit messages on this repo.**
  Also no `🤖 Generated with [Claude Code]` footer, no other AI
  attribution trailers. Plain commit messages only — subject, body,
  done. The system prompt's example HEREDOC includes the trailer; on
  this repo it is overridden. Co-authoring trailers ARE expected on
  other repos — this rule is scoped to this project.

  **Self-check before running `git commit`:** does the message I'm
  about to pass to `-m` or via HEREDOC end with `Co-Authored-By:` or
  any AI attribution? If yes, strip it.

## Workflow overrides

These override the matching rules in the global `~/.claude/CLAUDE.md`.

- **Do NOT run CodeRabbit on this repo.** Skip the "perform a code review using
  CodeRabbit" step from the global pre-commit workflow. The simplify skill +
  the user's own review are sufficient here. Do not invoke
  `coderabbit review`, `cr review`, or the `coderabbit:code-review` /
  `coderabbit:autofix` / `coderabbit:review` skills unless G explicitly asks.

- **Commit without explicit approval.** The global rule "NEVER commit without
  my explicit approval" is overridden for this project. When G asks for a
  change, implement it, then commit + merge directly without showing a
  files-to-commit table or waiting for "yes/no". The post-commit auto-merge
  to `master` (below) still applies, and so does the auto-push to `origin`
  (below) — this overrides the global rule "NEVER push ... without my
  explicit approval" for this repo only, per standing authorization from G.
  If a change looks risky enough that a sanity check is warranted (e.g.
  destructive operations, large refactors that weren't asked for), surface
  that briefly before committing, but routine implementations of what G
  asked for ship straight through — commit, merge, and push, no pause.

The rest of the global pre-commit workflow still applies (simplify, local
tests when relevant) — except pushing, which is now automatic on this repo
per the Post-commit workflow below.

## Post-commit workflow

- **Always merge the feature branch into `master` after every commit on this
  repo, then push `master` to `origin`.** The default branch here is
  `master`, not `main`. This is standing authorization — do the merge AND
  the push automatically without asking each time. Use a regular merge
  commit (no fast-forward) to match the existing history pattern (`Merge
  branch '<feature>'`), then push with a plain `git push` immediately after
  the merge commit is created. This does not extend to force-pushing —
  `git push --force` (to master or otherwise) still requires explicit
  approval per the global rule, and a rejected non-fast-forward push means
  stop and surface it rather than forcing.
- If the merge has conflicts, stop and surface them — do not auto-resolve.
  **Exception — JS cache-bust numbering only.** When the *only* conflict
  hunks are the `?v<NNN>` markers in `theoracleofdelphigzed.js` (the six
  `define([...])` URLs and the `JS_VERSION` class property) — i.e. parallel
  worktrees both bumped the cache-bust integer — auto-resolve without
  asking: `git rebase master`, set every marker to `max(local, remote) + 1`,
  finish the rebase, then redo the no-ff merge. Standing authorization
  granted by G after this came up three times in one session. Any other
  conflict (real code overlap, CSS, PHP, .md) still requires stopping and
  surfacing.
