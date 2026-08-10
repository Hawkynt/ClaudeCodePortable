# ClaudeCodePortable

<p align="center">
  <img src="./assets/claude.png" alt="ClaudeCodePortable" width="180">
</p>

[![License](https://img.shields.io/github/license/Hawkynt/ClaudeCodePortable)](https://github.com/Hawkynt/ClaudeCodePortable/blob/main/LICENSE)
[![Language](https://img.shields.io/github/languages/top/Hawkynt/ClaudeCodePortable?color=8957D5)](https://github.com/Hawkynt/ClaudeCodePortable)

[![CI](https://github.com/Hawkynt/ClaudeCodePortable/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Hawkynt/ClaudeCodePortable/actions/workflows/ci.yml)
![Last Commit](https://img.shields.io/github/last-commit/Hawkynt/ClaudeCodePortable?branch=main)
![Activity](https://img.shields.io/github/commit-activity/m/Hawkynt/ClaudeCodePortable)

[![Stars](https://img.shields.io/github/stars/Hawkynt/ClaudeCodePortable?color=FFD700)](https://github.com/Hawkynt/ClaudeCodePortable/stargazers)
[![Forks](https://img.shields.io/github/forks/Hawkynt/ClaudeCodePortable?color=008080)](https://github.com/Hawkynt/ClaudeCodePortable/network/members)
[![Issues](https://img.shields.io/github/issues/Hawkynt/ClaudeCodePortable)](https://github.com/Hawkynt/ClaudeCodePortable/issues)
![Code Size](https://img.shields.io/github/languages/code-size/Hawkynt/ClaudeCodePortable?color=4CAF50)
![Repo Size](https://img.shields.io/github/repo-size/Hawkynt/ClaudeCodePortable?color=FF9800)

[![Release](https://img.shields.io/github/v/release/Hawkynt/ClaudeCodePortable)](https://github.com/Hawkynt/ClaudeCodePortable/releases/latest)
[![Nightly](https://img.shields.io/github/v/release/Hawkynt/ClaudeCodePortable?include_prereleases&sort=date&filter=nightly-*&label=nightly&color=FF9800)](https://github.com/Hawkynt/ClaudeCodePortable/releases)
[![Downloads](https://img.shields.io/github/downloads/Hawkynt/ClaudeCodePortable/total)](https://github.com/Hawkynt/ClaudeCodePortable/releases)

> A self-contained, portable distribution of the major agentic coding CLIs — [Claude Code](https://docs.anthropic.com/claude/code), [OpenAI Codex](https://developers.openai.com/codex/cli), [GitHub Copilot](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli), and [Google Antigravity](https://antigravity.google/) — with per-tool multi-profile support, a keyboard-driven session/profile picker, cross-platform bootstrap scripts, and Windows Explorer integration. Drop the folder on any USB stick, cloud share, or working directory and run `Claude.bat` / `Codex.bat` / `Copilot.bat` / `Antigravity.bat` (Windows) or `claude.sh` / `codex.sh` / `copilot.sh` / `antigravity.sh` (Linux/macOS), no admin rights required.

## ✨ Features

- **Portable runtimes**: Node.js (+ npm/npx), Git, Bash, Perl (+ cpan), Python (+ pip), and
  PowerShell 7 are downloaded on first run into `app/`, each with SHA256
  verification against pinned versions.
- **Multi-profile**: keep independent Claude accounts side-by-side under
  `profiles/<name>/`. Each profile has its own login, settings, session
  history, npm cache, and npm-global.
- **Multi-tool**: the same portable + per-profile experience for OpenAI
  Codex CLI (`Codex.bat`), GitHub Copilot CLI (`Copilot.bat`), Google
  Antigravity CLI (`Antigravity.bat`), and happy-coder (`Happy.bat`) — see
  *Sibling launchers* below.
- **Skill template library**: 15 rigor skills + a skill-gate instructions
  file under `templates/`, mergeable into any Claude profile and exportable
  into Codex/Copilot/Antigravity native formats (`--seed-skills`).
- **Session picker**: inside any project directory, the launcher shows
  previous sessions with relative timestamps, message counts, and the first
  and last user prompt of each. Resume with a keypress; pin, label, delete,
  move or copy sessions across profiles, and toggle
  `--dangerously-skip-permissions` per launch.
- **Profile picker**: switch or manage profiles interactively from the
  session menu. Create / delete / rename profiles in place.
- **Windows Explorer integration**: one cascading *"Open <tool>"* entry per
  launcher in the folder right-click menu, each with one sub-entry per
  profile.
- **Daily auto-update**: checks each npm-installed tool for updates once
  per calendar day, per profile.
- **Zero external deps**: the launcher is plain ES-module JavaScript; no
  `node_modules`, no build step.

## Layout

```
ClaudeCodePortable/
├── Claude.bat / claude.sh           ← Claude Code bootstrap (installs Node, runs launcher)
├── Happy.bat                        ← happy-coder launcher (remote-ready Claude)
├── Codex.bat / codex.sh             ← OpenAI Codex CLI launcher
├── Copilot.bat / copilot.sh         ← GitHub Copilot CLI launcher
├── Antigravity.bat / antigravity.sh ← Google Antigravity CLI launcher
├── README.md
├── LICENSE
├── .gitignore
├── launcher/             ← ES-module launcher (all logic)
│   ├── launcher.mjs      ← Claude entry point
│   ├── happy-launcher.mjs        ← happy-coder entry point
│   ├── codex-launcher.mjs        ← Codex entry point (CODEX_HOME per profile)
│   ├── copilot-launcher.mjs      ← Copilot entry point (COPILOT_HOME per profile)
│   ├── antigravity-launcher.mjs  ← Antigravity entry point (HOME-redirected)
│   ├── tool-launcher-core.mjs    ← shared profile/PATH/env/install/spawn plumbing
│   ├── skills-export.mjs         ← template skills → native tool layouts
│   ├── profile-merge.mjs         ← selective config merge between profiles
│   ├── merge-wizard.mjs          ← interactive merge multi-select
│   ├── paths.mjs         ← tool versions, URLs, SHA256, path resolution
│   ├── install.mjs       ← SHA256-verified downloads + extraction
│   ├── profiles.mjs      ← profile CRUD + email lookup
│   ├── sessions.mjs      ← .jsonl scanning + delete/move/copy
│   ├── registry.mjs      ← multi-tool file-manager context menus
│   ├── args.mjs          ← CLI flag parser
│   ├── ui.mjs            ← ANSI colors, raw-mode input, prompts, relative time
│   ├── session-menu.mjs  ← cyan / green picker
│   └── profile-menu.mjs  ← magenta / cyan picker
├── templates/            ← profile-agnostic template library (committed)
│   ├── CLAUDE.md         ← skill-gate global instructions
│   └── skills/           ← 15 skills (SKILL.md dirs), mergeable/exportable
├── app/                  ← auto-installed portable runtimes (git-ignored)
│   ├── node/
│   ├── git/              ← MinGit (Windows only; standalone `git`)
│   ├── bash/             ← PortableGit (Windows only; bash + coreutils + bundled perl)
│   ├── perl/             ← relocatable-perl (Linux/macOS only)
│   ├── python/           ← Python embeddable (Windows) / python-build-standalone (others)
│   └── powershell/       ← PowerShell 7
└── profiles/             ← per-profile data (git-ignored)
    └── default/
        ├── claude-config/     ← CLAUDE_CONFIG_DIR (sessions, settings, .claude.json) — owned by Claude
        ├── codex-config/      ← CODEX_HOME (config.toml, auth.json, skills/) — owned by Codex
        ├── copilot-config/    ← COPILOT_HOME (settings, skills/, instructions) — owned by Copilot
        ├── copilot-cache/     ← COPILOT_CACHE_HOME
        ├── .gemini/           ← Antigravity CLI state (via HOME redirection)
        ├── cp-meta/           ← launcher-owned metadata (pin state, friendly labels) — NOT inside claude-config/
        ├── npm-cache/
        └── npm-global/        ← npm-installed CLIs live here (claude, happy, codex, copilot)
```

Only `launcher/`, `templates/`, the bootstrap scripts, this README, and the
license/gitignore are checked in. `app/` and `profiles/` are populated at
runtime and must never be committed.

## 📦 Getting started

### Windows

1. Clone or download this repository.
2. Double-click `Claude.bat` (or run from a terminal).
3. On first run the bootstrap downloads Node.js into `app/node/`, then the
   launcher fills the rest of `app/` and installs `@anthropic-ai/claude-code`
   into `profiles/default/npm-global/`. Anthropic OAuth login prompts you.
4. Subsequent runs open the session picker for the current directory.

### Linux / macOS

```bash
./claude.sh
```

Requires `curl` or `wget`, `tar`, and an outbound HTTPS connection. The
bootstrap fetches the platform-appropriate Node build into `app/node/`,
then the launcher fills in the rest.

## Command-line flags

| flag                                                    | purpose                                                                                                                                                                                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--profile <name>`                                      | use the named profile instead of the default                                                                                                                                                                                       |
| `--list-profiles`                                       | print known profiles and exit                                                                                                                                                                                                      |
| `--new-profile <name>`                                  | create an empty profile and exit                                                                                                                                                                                                   |
| `--move-session <id> --to <profile> [--from <profile>]` | relocate a session between profiles                                                                                                                                                                                                |
| `--register-shell`                                      | install the Windows Explorer cascading menu (HKCU)                                                                                                                                                                                 |
| `--unregister-shell`                                    | remove it                                                                                                                                                                                                                          |
| `--reinstall [tool]`                                    | delete `app/<tool>` so it re-downloads next run. `tool` is one of `node` (manual delete required), `git`, `bash`, `perl`, `python`, `powershell`, `all` (default), or `claude` (wipes every profile's `npm-global` + `npm-cache`). |
| `--doctor`                                              | health check: runtimes, active-profile Claude install, Explorer menu registry freshness, SHA256 pin coverage. Coloured report; non-zero exit on any hard failure.                                                                  |
| `--new`                                                 | skip the session menu, start a new session                                                                                                                                                                                         |
| `--continue` / `-c` / `--resume-last`                   | skip menu, resume last session                                                                                                                                                                                                     |
| `--resume <id>`                                         | skip menu, resume a specific session                                                                                                                                                                                               |
| `-p`, `--print`, `--prompt`                             | claude-native; skips the menu automatically                                                                                                                                                                                        |
| `--seed-skills`                                         | (sibling launchers) export the template skills + instructions into the tool's config home                                                                                                                                          |

Any flag not recognized by the launcher is forwarded to the underlying tool
(`claude`, `happy`, `codex`, `copilot`, or `agy`) verbatim.

### Environment variables

| variable               | effect                                              |
| ---------------------- | --------------------------------------------------- |
| `CLAUDE_PROFILE`       | fallback profile name when `--profile` is not given |
| `CLAUDE_SKIP_MENU=1`   | skip the session menu, pass `--continue`            |
| `CLAUDE_SKIP_MENU=new` | skip the session menu, start a new session          |

## Session menu

| key                               | action                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `Enter` / arrow keys              | `↑`/`↓` move highlight, `Enter` picks it. Bare `Enter` resumes the highlighted row.      |
| `Esc`                             | start a new session (or clear an active filter)                                          |
| `1`-`9`, `A`-`Z` (minus reserved) | resume a specific session                                                                |
| `/`                               | open a substring filter over prompts / labels / IDs; pinned rows always show             |
| `F` then `<key>`                  | pin / unpin a session — pinned rows sort first and always pass the filter                |
| `R` then `<key>`                  | give a session a friendly label (stored under `cp-meta/`)                                |
| `D` then `<key>`                  | delete a session (with `y/N` confirm)                                                    |
| `M` then `<key>`                  | move a session to another profile                                                        |
| `C` then `<key>`                  | copy a session to another profile (source kept)                                          |
| `S`                               | toggle `--dangerously-skip-permissions` for the launch (on by default)                   |
| `P`                               | open the profile picker                                                                  |
| `Q`                               | quit the launcher without starting Claude                                                |

Deleting or moving the last session in a folder no longer drops you straight
into a fresh session — the picker stays open so you can switch profiles, quit,
or start a new session deliberately.

## Profile picker

| key              | action                                                                |
| ---------------- | --------------------------------------------------------------------- |
| `Enter`          | use `default` (or the first profile if none is named `default`)       |
| `Esc`            | abort                                                                 |
| digit / letter   | pick a specific profile                                               |
| `N`              | create a new profile (prompts for a name, then offers to seed it — see below) |
| `D` then `<key>` | delete a profile (double confirm; removes all sessions + credentials) |
| `R` then `<key>` | rename a profile (rename to `default` = make default)                 |
| `M` then `<key>` | merge template skills / config from another profile into a profile    |
| `X`              | register (or refresh) the Explorer context menu                       |
| `U`              | unregister the Explorer context menu                                  |
| `Q`              | quit                                                                  |

### Profile config merge & the template skill library

Creating a profile (`N`) offers to seed it; `M` runs the same wizard against an
existing profile. The wizard lets you multi-select what to pull in:

- **Template skills** from `templates/skills/` — a profile-agnostic skill
  library shipped with the launcher (rigor pack: `plan-gate`,
  `adversarial-verify`, `live-state-truth`, `scope-fence`, `ruthless-editor`,
  `memory-hygiene`; plus `structured-memory` self-compacting memory,
  `codebase-index` with a syntax-aware Python indexer, `search-discipline`,
  `prose-first`, `jina-reader`, and the down-model rigor set
  `finish-the-task`, `effort-scaling`, `root-cause-first`, `done-means-done`).
- **Template CLAUDE.md** (`templates/CLAUDE.md`) — global instructions with a
  Fable-style unconditional skill gate ("check for relevant skills BEFORE
  acting"), the highest-leverage fix for models that under-trigger skills.
- **From another profile**: individual skills, MCP servers (`mcpServers` in
  `.claude.json`), the status line, model configuration (`model`,
  `effortLevel`), and `CLAUDE.md`.

The status line is resolved from the `statusLine` setting rather than a
hardcoded filename: whichever files the command points at are copied
(`statusline.py`, `statusline.js`, a script in a subfolder, plus any extra
files it references), subfolders are created in the target, and absolute paths
into the source profile are rewritten to `$CLAUDE_CONFIG_DIR` so the setting
works in its new home.

Merging is strictly additive: anything already present in the target profile
wins and is reported as skipped — a merge never overwrites a profile's own
skills, servers, or settings. The logic lives in `launcher/profile-merge.mjs`,
the wizard in `launcher/merge-wizard.mjs`.

## Sibling launchers (Codex, Copilot, Antigravity, Happy)

The same portable, per-profile experience exists for other agentic CLIs —
each with its own bootstrap script that reuses the shared runtimes in `app/`
and the profiles in `profiles/`:

| Launcher          | Tool                         | Install                | Config isolation                          | Auth isolation                                  |
| ----------------- | ---------------------------- | ---------------------- | ----------------------------------------- | ----------------------------------------------- |
| `Claude.bat/.sh`  | `@anthropic-ai/claude-code`  | npm into profile       | `CLAUDE_CONFIG_DIR` → profile             | per profile (`.credentials.json` in config dir) |
| `Happy.bat`       | `happy-coder` (wraps Claude) | npm into profile       | via Claude's config dir                   | per profile                                     |
| `Codex.bat/.sh`   | `@openai/codex`              | npm into profile       | `CODEX_HOME` → profile                    | per profile (`auth.json` in `CODEX_HOME`)       |
| `Copilot.bat/.sh` | `@github/copilot`            | npm into profile       | `COPILOT_HOME`/`COPILOT_CACHE_HOME`       | ⚠ OS keychain is shared — set `GH_TOKEN` per profile for isolation |
| `Antigravity.bat/.sh` | Google Antigravity CLI (`agy`) | official installer, HOME-redirected | `HOME`/`USERPROFILE`/`LOCALAPPDATA` → profile (no documented relocation var) | per profile on **Windows** (login swapped in/out of the machine keyring around launch); shared on Linux/macOS |

**Profiles are per tool, not shared.** Every profile directory carries a
`.tool` marker (`claude`, `codex`, `copilot`, `antigravity`); profiles
without a marker are Claude profiles (legacy). Each launcher's picker lists
only its own tool's profiles, shows that tool's own account identity
(Codex: ChatGPT email from `auth.json`; Copilot: GitHub login; Antigravity:
Google account from `agy`'s `cli.log`; never another tool's login), and
creates new profiles pre-marked for the tool. Sibling
launchers always open the picker on interactive starts — even with zero or
one profile — so you can see accounts and manage profiles before launch;
with `--skip-menu` a missing profile is auto-created, named after the tool
(`profiles/codex/`, `profiles/copilot/`, ...). Existing pre-multi-tool
profiles are marked `claude` automatically on the next launcher start.
`Happy.bat` shares Claude's profiles by design (it wraps Claude).
`--list-profiles` shows the owner of every profile. Antigravity's exported
skills land in `~/.gemini/config/skills/` (the location its own
customization guide documents for machine-global skills).

All launchers install their tool on first run into
the selected profile and check for updates once per day. `--seed-skills`
(or the first-run prompt) exports the template skill library + skill-gate
instructions into the tool's native layout: `$CODEX_HOME/skills/` +
`AGENTS.md` for Codex, `$COPILOT_HOME/skills/` + `copilot-instructions.md`
for Copilot, and an `antigravity-cli/plugins/portable-skills/` bundle +
`GEMINI.md` for Antigravity. Exports are additive — existing files are never
overwritten.

Registering the file-manager context menu (`X` in the profile picker) now
creates one cascading entry per launcher found at the portable root, each
with a per-profile submenu.

### First run, per launcher

What to expect when trying each one:

1. **`Codex.bat`** — profile picker → npm-installs `@openai/codex` into the
   profile → offers to seed skills/AGENTS.md → starts `codex`. First Codex
   start asks for ChatGPT login; the token lands in
   `profiles/<p>/codex-config/auth.json` (fully per-profile). Resume via
   Codex's own `codex resume`.
2. **`Copilot.bat`** — same flow with `@github/copilot`. First start runs the
   GitHub device-flow login; on machines with a Windows keychain the token is
   stored there and thus SHARED across profiles — for real isolation set
   `GH_TOKEN` before launching (the launcher reminds you when none is set).
3. **`Antigravity.bat`** — no npm package: the launcher runs Google's official
   installer with the profile-redirected environment, so `agy` and its
   `~/.gemini` state land inside the profile. If the installer URL has moved,
   it prints copy-paste manual install instructions instead of failing
   silently. Google login opens a browser; Antigravity stores the token in the
   machine keyring (`gemini:antigravity`), which is not path-isolable — so on
   **Windows** the launcher makes it per-profile anyway: it swaps the profile's
   saved token into the keyring slot before launch and captures the (possibly
   refreshed) token back into `profiles/<p>/.gemini/credential.json` on exit.
   The profile picker shows each Antigravity profile's own account (read from
   `agy`'s `cli.log`). On Linux/macOS the swap is not implemented and the login
   stays shared. First login for a profile is captured automatically; later
   launches restore it.

All three accept `--profile <name>`, `--skip-menu`/`--new`, `--seed-skills`,
and forward any other flags to the underlying tool.

> Antigravity notes: the installer URLs are best-effort (Google moved fast
> after retiring Gemini CLI for individual accounts in June 2026); when the
> automated install fails, the launcher prints manual install guidance with
> the profile's redirected environment.

## Pinned portable runtimes

| Tool               | Version                                                        | Source                                      |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------- |
| Node.js            | 22.16.0                                                        | `nodejs.org/dist` (SHASUMS256.txt verified) |
| Git (standalone)   | MinGit 2.47.1 (Windows only)                                   | git-for-windows GitHub release              |
| Bash               | Git for Windows 2.47.1 PortableGit (bundled perl + coreutils)  | git-for-windows GitHub release              |
| Perl (Linux/macOS) | skaji/relocatable-perl 5.42.2.0                                | GitHub releases                             |
| Python             | 3.13.1 (Windows embeddable / python-build-standalone 20250106) | python.org / astral-sh                      |
| PowerShell         | 7.4.6                                                          | PowerShell GitHub releases                  |

All downloads are SHA256-verified against hashes pinned in
`launcher/paths.mjs`. To upgrade a tool, bump its version + URL + SHA256
there and delete the corresponding subfolder under `app/`.

## Privacy

The launcher exports:

- `DISABLE_TELEMETRY=1`
- `DISABLE_ERROR_REPORTING=1`
- `DISABLE_BUG_COMMAND=1`

No data is sent anywhere by the launcher itself.

## 🖼️ Screenshots

### Session picker

Pinned rows float to the top, labels show instead of UUIDs, arrow keys navigate, `/` filters.

```text
================================================================
 Claude [default] - sessions in D:\Projects\acme-dashboard
================================================================
 runtimes: node 22.16.0 | bash 5.2.37 | perl 5.38.2 | python 3.13.1

*>[1]  started 2026-04-17 11:00  |  last       3d ago  |     42 msgs
       label:   doctor health check
       initial: implement doctor health check for runtimes
       last:    ensure it never throws mid-report

  [2]  started 2026-04-19 12:00  |  last      23h ago  |    128 msgs
       initial: add a portable node+git+python launcher with session picker
       last:    also add GFS pruning for nightlies

  [3]  started 2026-04-12 15:15  |  last       8d ago  |     37 msgs
       initial: initial prototype: read JSONL, display session list
       last:    color the newest session green

[Enter/↑↓] pick   [Esc] NEW   [/] filter   [F <key>] pin   [R <key>] rename   [D <key>] delete   [M <key>] move   [C <key>] copy   [P] profiles   [Q] quit
[S] skip permissions: [x]  (--dangerously-skip-permissions ON)
```

### Profile picker

Independent logins, per-profile session counts, in-menu create / delete / rename housekeeping.
When opened for a specific folder, counts show as `in this folder / total`.

```text
================================================================
 Select Claude profile
================================================================
 runtimes: node 22.16.0 | bash 5.2.37 | perl 5.38.2 | python 3.13.1
  session count shown as: in this folder / total

 [1] default      |  me@example.com        |  last 2h ago          |    2/3 sessions
 [2] work         |  work@example.com      |  last 5d ago          |   5/12 sessions
 [3] experiments  |  (not logged in)       |  last (never used)    |    0/0 sessions

[Enter] default       [Esc] abort   [Q] quit
[N] new profile    [D <key>] delete    [R <key>] rename    [X] register Explorer menu
```

### `--doctor`

Verifies every pinned runtime, the Claude install, and the Explorer menu freshness.

```text
Running ClaudeCodePortable doctor...

  [ ok ]  node         22.16.0 (matches pin)
  [ ok ]  git          2.47.1 (MinGit)
  [ ok ]  bash         5.2.37 (bundled PortableGit)
  [ ok ]  perl         5.38.2 (bundled from PortableGit; no standalone pin)
  [ ok ]  python       3.13.1 (matches pin)
  [ ok ]  pwsh         7.4.6 (matches pin)
  [ ok ]  sha256 pins  all tools pinned for current platform
  [skip]  shell-menu   not registered (run --register-shell to install)
  [ ok ]  profile      default · me@example.com · 57 session(s)

8 green,  0 yellow,  0 red,  1 skipped
```


## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to run the tests, add a
new portable tool, or extend the menus.

## Uninstalling

Remove the folder. If you registered the Explorer context menu, run
`Claude.bat --unregister-shell` first so the registry entries are removed.

## Development

Cloning the repo gives you `launcher/`, bootstrap scripts, tests, and CI
config. Everything under `app/` and `profiles/` is populated at runtime.

### Running tests

Node 22+ has a built-in test runner. From the repo root:

```bash
node --test
```

Tests live in `tests/*.test.mjs` and cover `args`, `ui`, `profiles`,
`sessions`, and the SHA256 helper in `install.mjs`. CI runs them on
Ubuntu, Windows, and macOS (`.github/workflows/ci.yml`).

### Nightly builds (automatic)

Every successful CI run on `master` triggers `.github/workflows/nightly.yml`,
which:

1. Builds `ClaudeCodePortable-<version>.zip` from the exact SHA CI validated
   (shared packaging block `.github/workflows/_build.yml`).
2. Publishes it as a GitHub pre-release with tag `nightly-YYYYMMDD`.
   Pushing again on the same day overwrites the existing nightly.
3. Prunes old nightlies with a promotion-based Grandfather-Father-Son
   rotation. Gaps in activity never waste a slot:
   - **Son**: the 7 newest nightlies, whatever their dates are.
   - **Father**: from older releases, one per distinct ISO-week, up to 4
     weeks. Weeks that son already covers are skipped so father always
     reaches further back when son is quiet.
   - **Grandfather**: from what's older still, one per distinct calendar
     month, up to 3 months. Skips months son or father already touched.

You can grab the latest nightly from the repo's
[releases page](https://github.com/Hawkynt/ClaudeCodePortable/releases)
without ever cutting a tag.

### Cutting a stable release (manual dispatch)

1. Bump `VERSION` if you want a new major/minor/patch base.
2. Dispatch `.github/workflows/release.yml` (Actions → Release → Run
   workflow). It re-runs the full CI matrix, builds
   `ClaudeCodePortable-<version>.zip`, refreshes `CHANGELOG.md`, and cuts a
   GitHub release tagged with the date marker `vYYYYMMDD`.

### Version format

`.github/workflows/scripts/version.pl` prints `MAJOR.MINOR.PATCH.BUILD`. The
first three come from the `VERSION` file; `BUILD` is
`git rev-list --count HEAD`. Call it with `--base` or `--build` to get just
one segment.

### Local dry-run of the nightly pruner

```bash
node .github/workflows/scripts/prune-nightlies.mjs --dry-run
```

(Requires `gh` CLI and a GitHub auth token.) Prints the keep/drop plan
without touching any releases.

## ❤️ Support

If this project saves you time or money, consider supporting its development:

[![GitHub Sponsors](https://img.shields.io/badge/GitHub-Sponsor-EA4AAA?logo=githubsponsors)](https://github.com/sponsors/Hawkynt)
[![PayPal](https://img.shields.io/badge/PayPal-Donate-00457C?logo=paypal)](https://www.paypal.me/hawkynt)

## 📜 License

Licensed under LGPL-3.0-or-later — see [LICENSE](LICENSE).
