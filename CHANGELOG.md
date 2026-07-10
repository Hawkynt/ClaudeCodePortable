# Changelog

## v20260605 (2026-06-05)

### Added
- allow bypassing permissions to be enabled/disabled # fixing off-by-one for session count + session menu not automatically closing when no more session left after delete/move + allow copying sessions (50c0326)
- support for the latest "claude.exe" aside "cli.js" (c1bdc1c)
- badges (7f1c4a4)
- images, key navigation, doctor (e575980)
- CI/CD and tests (1e207c9)
- initial version (2054775)

### Changed
- document the dispatch-driven release flow and the new pipeline layout in README, CONTRIBUTING and CHANGELOG (e513977)
- adopt the hawkynt-standard CI/CD quartett (ci + _build + nightly + release) + shared _build.yml packaging block so nightly and release never diverge * release is manual-dispatch only and tags the dated marker vYYYYMMDD instead of building from v* tag pushes * nightly tags switch from nightly-YYYY-MM-DD to nightly-YYYYMMDD * pipeline helper scripts move from scripts/ to .github/workflows/scripts/ (shared template versions) (8134d13)
- standardize the README to the house style (canonical badge block); drop vanity scope numbers (6be062d)
- docs (2356d61)
- gate nightly on CI and share the test matrix with release (6363057)

### Fixed
- CI screenshots (7d822fd)

All notable changes to ClaudeCodePortable are documented here. Entries are
prepended automatically by the nightly and release workflows; see
[`.github/workflows/scripts/update-changelog.mjs`](./.github/workflows/scripts/update-changelog.mjs).

## [Unreleased]

_Populated on the next nightly build._
