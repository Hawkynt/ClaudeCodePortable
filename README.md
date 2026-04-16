# ClaudePortable

![License](https://img.shields.io/github/license/Hawkynt/ClaudeCodePortable)
![Language](https://img.shields.io/github/languages/top/Hawkynt/ClaudeCodePortable?color=purple)
[![Last Commit](https://img.shields.io/github/last-commit/Hawkynt/ClaudeCodePortable?branch=main)](https://github.com/Hawkynt/ClaudeCodePortable/commits/main)
[![GitHub release](https://img.shields.io/github/v/release/Hawkynt/ClaudeCodePortable)](https://github.com/Hawkynt/ClaudeCodePortable/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Hawkynt/ClaudeCodePortable/total)](https://github.com/Hawkynt/ClaudeCodePortable/releases)

> A self-contained, portable distribution of [Claude Code](https://docs.anthropic.com/claude/code)
with multi-profile support, a keyboard-driven session picker, cross-platform
bootstrap scripts, and Windows Explorer integration. Drop the folder on any
USB stick, cloud share, or working directory and run `Claude.bat` (Windows)
or `claude.sh` (Linux/macOS) — no admin rights required.

## Features

- **Portable runtimes**: Node.js (+ npm/npx), Git, Bash, Perl (+ cpan), Python (+ pip), and
  PowerShell 7 are downloaded on first run into `app/`, each with SHA256
  verification against pinned versions.
- **Multi-profile**: keep independent Claude accounts side-by-side under
  `profiles/<name>/`. Each profile has its own login, settings, session
  history, npm cache, and npm-global.
- **Session picker**: inside any project directory, the launcher shows
  previous sessions with relative timestamps, message counts, and the first
  and last user prompt of each. Resume with a keypress.
- **Profile picker**: switch or manage profiles interactively from the
  session menu. Create / delete / rename profiles in place.
- **Windows Explorer integration**: cascading *"Open Claude Code"* entry in
  the folder right-click menu with one sub-entry per profile.
- **Daily auto-update**: checks for a newer `@anthropic-ai/claude-code` once
  per calendar day, per profile.
- **Zero external deps**: the launcher is plain ES-module JavaScript; no
  `node_modules`, no build step.

## Layout

```
ClaudePortable/
├── Claude.bat            ← Windows bootstrap (installs Node, runs launcher)
├── claude.sh             ← Linux/macOS bootstrap
├── README.md
├── LICENSE
├── .gitignore
├── launcher/             ← ES-module launcher (all logic)
│   ├── launcher.mjs      ← entry point
│   ├── paths.mjs         ← tool versions, URLs, SHA256, path resolution
│   ├── install.mjs       ← SHA256-verified downloads + extraction
│   ├── profiles.mjs      ← profile CRUD + email lookup
│   ├── sessions.mjs      ← .jsonl scanning + delete/move
│   ├── registry.mjs      ← Windows Explorer submenu via reg.exe
│   ├── args.mjs          ← CLI flag parser
│   ├── ui.mjs            ← ANSI colors, raw-mode input, prompts, relative time
│   ├── session-menu.mjs  ← cyan / green picker
│   └── profile-menu.mjs  ← magenta / cyan picker
├── app/                  ← auto-installed portable runtimes (git-ignored)
│   ├── node/
│   ├── git/              ← MinGit (Windows only; standalone `git`)
│   ├── bash/             ← PortableGit (Windows only; bash + coreutils + bundled perl)
│   ├── perl/             ← relocatable-perl (Linux/macOS only)
│   ├── python/           ← Python embeddable (Windows) / python-build-standalone (others)
│   └── powershell/       ← PowerShell 7
└── profiles/             ← per-profile data (git-ignored)
    └── default/
        ├── claude-config/     ← CLAUDE_CONFIG_DIR (sessions, settings, .claude.json)
        ├── npm-cache/
        └── npm-global/        ← @anthropic-ai/claude-code lives here
```

Only `launcher/`, `Claude.bat`, `claude.sh`, this README, and the
license/gitignore are checked in. `app/` and `profiles/` are populated at
runtime and must never be committed.

## Getting started

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
| `--new`                                                 | skip the session menu, start a new session                                                                                                                                                                                         |
| `--continue` / `-c` / `--resume-last`                   | skip menu, resume last session                                                                                                                                                                                                     |
| `--resume <id>`                                         | skip menu, resume a specific session                                                                                                                                                                                               |
| `-p`, `--print`, `--prompt`                             | claude-native; skips the menu automatically                                                                                                                                                                                        |

Any flag not recognized by the launcher is forwarded to `claude` verbatim.

### Environment variables

| variable               | effect                                              |
| ---------------------- | --------------------------------------------------- |
| `CLAUDE_PROFILE`       | fallback profile name when `--profile` is not given |
| `CLAUDE_SKIP_MENU=1`   | skip the session menu, pass `--continue`            |
| `CLAUDE_SKIP_MENU=new` | skip the session menu, start a new session          |

## Session menu

| key                               | action                                    |
| --------------------------------- | ----------------------------------------- |
| `Enter`                           | resume the most recently changed session  |
| `Esc`                             | start a new session                       |
| `1`-`9`, `A`-`Z` (minus reserved) | resume a specific session                 |
| `D` then `<key>`                  | delete a session (with `y/N` confirm)     |
| `M` then `<key>`                  | move a session to another profile         |
| `P`                               | open the profile picker                   |
| `Q`                               | quit the launcher without starting Claude |

## Profile picker

| key              | action                                                                |
| ---------------- | --------------------------------------------------------------------- |
| `Enter`          | use `default` (or the first profile if none is named `default`)       |
| `Esc`            | abort                                                                 |
| digit / letter   | pick a specific profile                                               |
| `N`              | create a new profile (prompts for a name)                             |
| `D` then `<key>` | delete a profile (double confirm; removes all sessions + credentials) |
| `R` then `<key>` | rename a profile (rename to `default` = make default)                 |
| `X`              | register (or refresh) the Explorer context menu                       |
| `U`              | unregister the Explorer context menu                                  |
| `Q`              | quit                                                                  |

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

Every push to `main` triggers `.github/workflows/nightly.yml`, which:

1. Runs the full test suite.
2. Builds `ClaudePortable-nightly-YYYY-MM-DD.zip`.
3. Publishes it as a GitHub pre-release with tag `nightly-YYYY-MM-DD`.
   Pushing again on the same day overwrites the existing nightly.
4. Prunes old nightlies with a promotion-based Grandfather-Father-Son
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

### Cutting a versioned release (optional)

1. Bump `VERSION` if you want a new major/minor/patch base.
2. Tag the release: `git tag v1.0.0 && git push --tags`.
3. `.github/workflows/release.yml` builds `ClaudePortable-<version>.zip`
   and attaches it to an auto-generated GitHub release.

### Version format

`scripts/version.pl` prints `MAJOR.MINOR.PATCH.BUILD`. The first three
come from the `VERSION` file; `BUILD` is `git rev-list --count HEAD`.
Call it with `--base` or `--build` to get just one segment.

### Local dry-run of the nightly pruner

```bash
node scripts/prune-nightlies.mjs --dry-run
```

(Requires `gh` CLI and a GitHub auth token.) Prints the keep/drop plan
without touching any releases.

## License

LGPL 2.1. See [LICENSE](./LICENSE).
