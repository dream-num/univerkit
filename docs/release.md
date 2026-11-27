# Release

How packages in this repository are versioned and published.

## Versioning

Changesets drive versions and changelogs:

1. Every pull request that changes a package adds a changeset with `pnpm changeset`.
2. Before a release, run `pnpm changeset version` on a branch. It bumps the affected packages,
   writes their `CHANGELOG.md`, and consumes the changesets. Open a pull request with the result and
   merge it into `main`.
3. Packages listed under `fixed` in `.changeset/config.json` always share one version.

The repository is in prerelease mode (`.changeset/pre.json`), so versions take the form
`X.Y.Z-rc.N` and publish under the `rc` dist-tag. Run `pnpm changeset pre exit` before the
`changeset version` that should produce a stable release.

## Publishing

Packages publish to the registry in each package's `publishConfig.registry`.

1. Open **Actions → Release → Run workflow** on `main` with `dry_run` enabled. The run checks, tests,
   and packs every package, and uploads the tarballs for review.
2. Run it again with `dry_run` disabled. It publishes every package whose version is not yet in the
   registry and pushes a Git tag for each, such as `@univerkit/html-view@1.0.0-rc.1`.

The workflow authenticates with the organization `NPM_TOKEN` secret.
