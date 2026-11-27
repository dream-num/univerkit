# univerkit

Open-source application components built on Univer, published as `@univerkit/*` packages.

## Scope

This repository holds standalone application components built on Univer that are worth reusing. A
component fits here when it is:

- standalone: usable outside the application it came from; logic tied to one product, such as its
  HTTP contract or host integration, stays in that application;
- application-level: a complete feature in its own right, not a Univer plugin or plugin
  enhancement, which belongs in the Univer SDK.

## Dependencies

- Declare Univer SDK packages (`@univerjs/*`, `@univerjs-pro/*`) as `peerDependencies`, import them
  through their public exports, and keep their code out of the build output.
- Depend on published packages only. Applications depend on univerkit; univerkit never depends on an
  application.
- Keep browser code and Node.js code in separate packages.
- A package that depends on `@univerjs-pro/*` states in both READMEs that using it follows the
  [Univer license terms](https://docs.univer.ai/server/license).

## Versioning and compatibility

- Each package follows semver and is versioned on its own. A breaking change to its public API bumps
  the major version.
- Record every user-facing change with a changeset (`pnpm changeset`); a breaking change's changeset
  describes the migration steps. Changesets generate each package's `CHANGELOG.md`. Packages that
  must share one version are listed under `fixed` in `.changeset/config.json`.
- The `peerDependencies` range declares the Univer versions a package supports. When a Univer
  release needs code changes, publish a new version and move the range; keep the range to versions
  the package is tested against.
- Feedback and contributions go through GitHub issues and pull requests.

## Layout

- `packages/<name>/`: a publishable package named `@univerkit/<name>`, declaring
  `"license": "Apache-2.0"`, with its user documentation in `README.md` and `docs/`.
- `examples/<component>-<scenario>/`: a runnable example, declared `"private": true`.
- `docs/`: how to develop, release, and document this repository.
- `.changeset/`: pending changesets and their configuration.

## Language

- Every README comes in an English `README.md` and Simplified Chinese `README.zh-CN.md` pair. Write
  and update documentation following [docs/documentation.md](./docs/documentation.md).
- This file, the root `docs/`, code, identifiers, comments, commit messages, and PR titles are in
  English.

## Done

A change is done when its documentation and changeset are updated, and `pnpm check` (format,
typecheck, build) and `pnpm test` pass; CI runs the same two commands.
