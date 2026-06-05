# CI/CD Pipeline — ClaudeCodePortable

> Everything in this folder is the automated pipeline for this repository.
> Workflows live here, their helper scripts live in `scripts/`.

## What this does

Three workflows, one shared build block, three helper scripts:

| File                            | Trigger                             | Purpose                                    |
|---------------------------------|-------------------------------------|--------------------------------------------|
| `ci.yml`                        | push + PR + `workflow_call`         | Unit tests + bootstrap smoke test on ubuntu/windows/macOS |
| `release.yml`                   | **manual dispatch**                 | Package + publish, then tag `vyyyyMMdd`  |
| `nightly.yml`                   | successful CI run on `main`/`master`| Publish `nightly-yyyyMMdd` prerelease    |
| `_build.yml`                    | `workflow_call` (internal)          | Builds the portable zip (shared packaging) |
| `scripts/version.pl`            | invoked by the workflows            | Compose `MAJOR.MINOR.PATCH.BUILD` from `VERSION` + commit count |
| `scripts/update-changelog.mjs`  | invoked by the workflows            | Bucketise commits into CHANGELOG.md        |
| `scripts/prune-nightlies.mjs`   | invoked by the workflows            | 3-gen (GFS) retention of nightlies         |

## How it works

```
                push / PR
                    │
                    ▼
            ┌───────────────┐
            │    ci.yml     │──► tests on ubuntu + windows + macOS
            └───┬───────┬───┘
                │       │
   dispatch ────┤       │  on success on main/master
                ▼       ▼
        ┌──────────┐  ┌─────────────┐
        │ release  │  │  nightly    │
        │  .yml    │  │   .yml      │
        └────┬─────┘  └─────┬───────┘
             │              │
             ▼              ▼
        (both call _build.yml, which zips the portable launcher)
             │              │
             ▼              ▼
  publish + tag vyyyyMMdd  nightly-yyyyMMdd (prerelease)
                                │
                                ▼
                       scripts/prune-nightlies.mjs
                       (GFS: 7 daily + 4 weekly + 3 monthly)
```

## What it's for

- Every PR is built and tested on ubuntu + windows + macOS before it can merge.
- Every merge to `main`/`master` produces a **tested** nightly prerelease.
- A **manual dispatch** cuts a stable release from artifacts built by `_build.yml`, then tags the dated `vyyyyMMdd` Release at that commit.
- Old nightlies are auto-pruned on a **Grandfather-Father-Son** schedule.

## Why it's built this way

- **No cron triggers.** Event-driven only — CI fires on PRs, nightlies fire when CI passes on main, stable releases fire on manual dispatch.
- **Files drive versions, never tags.** The root `VERSION` file holds `MAJOR.MINOR.PATCH`; `version.pl` appends the commit count. The repo-level Release/tag is the date marker `vyyyyMMdd`.
- **Release calls CI via `workflow_call`.** Calling ci.yml explicitly keeps tests and releases in lockstep with zero copy-paste.
- **Nightly builds from the `workflow_run` payload's SHA**, not branch tip — so a nightly is always a build of code CI actually validated.
- **`_build.yml` is the single packaging block**, shared by release and nightly so they never diverge.
- **3-generation (GFS) retention**, not "keep last N". GFS guarantees at least one build per week for a month and one per month for a quarter.

## Scripts

### `version.pl`

The one versioner, identical in every Hawkynt repo. This repo has no package
manifests, so the single-version mode applies: the root `VERSION` file is the
primary source and BUILD is the repo-wide commit count.

```
perl .github/workflows/scripts/version.pl          # "1.0.0.123"
perl .github/workflows/scripts/version.pl --base   # "1.0.0"
perl .github/workflows/scripts/version.pl --build  # "123"
```

> Stable releases are tagged with a **date marker** `vyyyyMMdd`, not a version.

### `update-changelog.mjs`

Prepends a new section to `CHANGELOG.md`. Commit-subject convention: `+` Added, `*` Changed, `#` Fixed, `-` Removed, `!` TODO, anything else → Other.

### `prune-nightlies.mjs`

GFS retention with `DAILY_KEEP=7`, `WEEKLY_KEEP=4`, `MONTHLY_KEEP=3`. Dry-run with `--dry-run`.

## Who maintains this

This pipeline follows the shared Hawkynt repo-family template
(`hawkynt-standard`). When changing it, prototype in the template then mirror
the change here.

## Release artifacts

| Artifact                                 | Produced by          |
|------------------------------------------|----------------------|
| `app-artifacts` (the portable zip)       | release + nightly    |
