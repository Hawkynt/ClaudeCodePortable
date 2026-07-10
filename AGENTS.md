# Agent guide — ClaudeCodePortable

Working agreement for **all** coding agents and human contributors working in
this repository. These rules are not optional. The full house spec lives in
the `Hawkynt/project-template` repo (`STANDARD.md`); this file is the
per-repo distillation.

## What this is

A **portable distribution** of Claude Code: `Claude.bat` / `claude.sh`
bootstrap pinned runtimes (`launcher/`, `VERSION`), with multi-profile
support and a keyboard-driven session picker. Tests are `node --test`
(`tests/*.test.mjs`) — including tests for the CI helper scripts themselves.

## Commits

- **Group changes semantically/logically** — one concern per commit.
- **Every subject line starts with a prefix**: `+` added · `-` removed ·
  `*` changed · `#` bug fixed · `!` critical todo.
- Never start a subject with "fix"/"bugfix"/"changed"/"modified".
- **No AI traces anywhere**: no `Co-Authored-By` AI lines, no "Generated
  with" footers, no agent mentions in messages, comments, or authorship.

## The loop (always, in this order)

1. **Before committing**: `node --test` until green (exactly what CI runs);
   the launcher scripts must keep working on stock `cmd.exe` and POSIX `sh`.
   Update README/CONTRIBUTING when flags, layout or pipeline change;
   `CHANGELOG.md` is generated — never edit it by hand.
2. **Commit** (rules above) and **push**.
3. **Wait for CI**; on `main` a green CI triggers the nightly (prerelease +
   GFS prune). Fix and loop until everything is green.

Stable releases are **manual** (`gh workflow run release.yml`) — never cut
one unless explicitly asked.

## Code conventions

- The helper scripts under `.github/workflows/scripts/` are mirrored from
  the shared template — change them **in the template first**, then mirror;
  their tests under `tests/` pin the contract (notes-only nightlies,
  newest-nightly-always-kept pruning, bot-commit filtering).
- Batch/cmd files keep CRLF; shell scripts stay POSIX-compatible; no admin
  rights may ever become a requirement.
- Privacy section promises in the README are binding: nothing phones home.

## README & repo conventions

- Standard frame: title → badges → one-line `>` blockquote; fixed emoji
  mapping for the standard sections (`## ✨ Features`, `## 📦 Getting
  started`, `## 🖼️ Screenshots`, `## ❤️ Support`, `## 📜 License`).
- License is LGPL-3.0-or-later; the `## ❤️ Support` section and
  `.github/FUNDING.yml` stay intact.
