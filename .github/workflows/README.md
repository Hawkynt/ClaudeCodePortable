# CI/CD Pipeline — ClaudeCodePortable

> Everything in this folder is the automated pipeline for this repository.
> Workflows live here, their helper scripts live in `scripts/`.

## What this does

Three workflows, one shared build block, three helper scripts:

| File                       | Trigger                             | Purpose                                 |
|----------------------------|-------------------------------------|-----------------------------------------|
| `ci.yml`                   | push + PR + `workflow_call`         | Build & test on every change            |
| `release.yml`              | tag push `v*` + manual dispatch     | Cut a signed GitHub Release from a tag  |
| `nightly.yml`              | successful CI run on `master`/`main`| Publish `nightly-YYYY-MM-DD` prerelease |
| `_build.yml`               | `workflow_call` (internal)          | Shared artifact-build block             |
| `scripts/version.pl`       | invoked by the workflows            | Compute `X.Y.Z.BUILD`                   |
| `scripts/update-changelog.mjs` | invoked by the workflows        | Bucketise commits into CHANGELOG.md     |
| `scripts/prune-nightlies.mjs`  | invoked by the workflows        | 3-gen (GFS) retention of nightlies      |

## How it works

```
                push / PR
                    │
                    ▼
            ┌───────────────┐
            │    ci.yml     │──► tests + smoke on ubuntu + windows + macOS
            └───┬───────┬───┘
                │       │
    tag v* ─────┤       │  on success on master/main
                ▼       ▼
        ┌──────────┐  ┌─────────────┐
        │ release  │  │  nightly    │
        │  .yml    │  │   .yml      │
        └────┬─────┘  └─────┬───────┘
             │              │
             ▼              ▼
        (both call _build.yml to produce the zip)
             │              │
             ▼              ▼
     GH Release v1.2.3   nightly-YYYY-MM-DD (prerelease)
                                │
                                ▼
                     scripts/prune-nightlies.mjs
                     (GFS: 7 daily + 4 weekly + 3 monthly)
```

## What it's for

- Every PR is built and tested on ubuntu + windows + macOS before it can merge.
- Every merge to `master`/`main` produces a **tested** nightly prerelease that downstream users can pin.
- Every `v*` tag cuts a proper release.
- Old nightlies are auto-pruned on a **Grandfather-Father-Son** schedule — the most recent week is kept day-by-day, the month by week, the quarter by month.

## Why it's built this way

- **No cron triggers.** Scheduled builds run against whatever happened to be at HEAD on Sunday — they fire silently and can ship broken code. Event-driven triggers (push / PR / tag / `workflow_run`) only fire when something actually changed.
- **Release calls CI via `workflow_call`.** Tag pushes don't retrigger `on: push` workflows, so the release pipeline invokes the same test matrix explicitly. Tests and releases stay in lockstep with zero copy-paste.
- **Nightly builds from the `workflow_run` payload's SHA**, not branch tip — so a nightly is always a build of code CI actually validated.
- **`_build.yml` is shared**, not duplicated between `release.yml` and `nightly.yml`. Changes to the build recipe happen in one place.
- **3-generation (GFS) retention**, not "keep last N". Last-N deletes old evidence on busy days; GFS guarantees at least one build per week for a month and one per month for a quarter, even under heavy churn.
- **Version script is authoritative.** `MAJOR.MINOR.PATCH` comes from the `VERSION` file (or csproj `<Version>` for .NET repos); build number comes from `git rev-list --count HEAD`. No date-based versions, no manual bumping.

## Scripts

### `version.pl`

Computes the release version. Works for any repo with either a `VERSION` file or a csproj at root / one level deep.

```
perl .github/workflows/scripts/version.pl          # 1.0.0.123
perl .github/workflows/scripts/version.pl --base   # 1.0.0
perl .github/workflows/scripts/version.pl --build  # 123
perl .github/workflows/scripts/version.pl --stamp  # writes X.Y.Z.BUILD into every csproj
```

Resolution order for the base version: `VERSION` file → first `<Version>` tag in any root-level csproj → `Directory.Build.props`.

### `update-changelog.mjs`

Prepends a new section to `CHANGELOG.md`. Commit-subject convention:

| Prefix | Bucket  |
|--------|---------|
| `+`    | Added   |
| `*`    | Changed |
| `#`    | Fixed   |
| `-`    | Removed |
| `!`    | TODO    |
| _any_  | Other   |

```
node .github/workflows/scripts/update-changelog.mjs --release v1.2.3
node .github/workflows/scripts/update-changelog.mjs --nightly --version 1.0.0.123
```

### `prune-nightlies.mjs`

GFS retention with `DAILY_KEEP=7`, `WEEKLY_KEEP=4`, `MONTHLY_KEEP=3`. Zero inputs beyond `--dry-run`.

```
node .github/workflows/scripts/prune-nightlies.mjs            # deletes old nightlies
node .github/workflows/scripts/prune-nightlies.mjs --dry-run  # prints keep/drop plan
```

Promotion-based tiering: daily slots claim the 7 newest; weekly slots claim the newest release of each of the 4 next oldest ISO weeks (skipping weeks the daily tier already covers); monthly slots do the same for months. Each release ends up in at most one tier, so gaps in activity don't waste retention.

## Who maintains this

Every repo in the CompressionWorkbench / PNGCrushCS / AnythingToGif / ClaudeCodePortable family owns its own copy of this pipeline. When changing it:

1. Prototype the change in this repo's `.github/workflows/`.
2. Verify via `workflow_dispatch` (all workflows support it).
3. Mirror to the other repos.

## Release artifacts

| Artifact                                       | Produced by          |
|------------------------------------------------|----------------------|
| `ClaudeCodePortable-<version>.zip`             | release              |
| `ClaudeCodePortable-nightly-<YYYY-MM-DD>.zip`  | nightly (prerelease) |
