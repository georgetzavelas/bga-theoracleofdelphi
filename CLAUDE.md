# Project: theoracleofdelphigzed

## Workflow overrides

These override the matching rules in the global `~/.claude/CLAUDE.md`.

- **Do NOT run CodeRabbit on this repo.** Skip the "perform a code review using
  CodeRabbit" step from the global pre-commit workflow. The simplify skill +
  the user's own review are sufficient here. Do not invoke
  `coderabbit review`, `cr review`, or the `coderabbit:code-review` /
  `coderabbit:autofix` / `coderabbit:review` skills unless G explicitly asks.

- **Do NOT include `Co-Authored-By:` lines in commit messages on this repo.**
  Plain commit messages only — no co-author trailers, no "Generated with
  Claude Code" footers. This applies to every commit on this repo.

The rest of the global pre-commit workflow still applies (simplify, local
tests when relevant, no auto-commits, no auto-pushes).

## Post-commit workflow

- **Always merge the feature branch into `master` after every commit on this
  repo.** The default branch here is `master`, not `main`. This is standing
  authorization — do the merge automatically without asking each time. Use a
  regular merge commit (no fast-forward) to match the existing history
  pattern (`Merge branch '<feature>'`). Do NOT push the merge to `origin` —
  pushing still requires explicit approval per the global rule.
- If the merge has conflicts, stop and surface them — do not auto-resolve.
