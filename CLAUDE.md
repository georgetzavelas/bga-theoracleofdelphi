# Project: theoracleofdelphigzed

## Workflow overrides

These override the matching rules in the global `~/.claude/CLAUDE.md`.

- **Do NOT run CodeRabbit on this repo.** Skip the "perform a code review using
  CodeRabbit" step from the global pre-commit workflow. The simplify skill +
  the user's own review are sufficient here. Do not invoke
  `coderabbit review`, `cr review`, or the `coderabbit:code-review` /
  `coderabbit:autofix` / `coderabbit:review` skills unless G explicitly asks.

The rest of the global pre-commit workflow still applies (simplify, local
tests when relevant, no auto-commits, no auto-pushes).
