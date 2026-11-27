# Documentation

Rules for documentation in this repository. They apply to contributors and agents.

## Where documentation lives

- Root `README.md`: an overall introduction and an index by feature that links to each package's
  README. Package details stay in the package.
- `packages/<name>/README.md` and `packages/<name>/docs/`: everything a user needs to use the
  package.
- `packages/<name>/CHANGELOG.md`: release notes, generated from changesets.
- `docs/`: repository-wide principles for development, release, and documentation.

Plans, investigations, and progress notes stay outside the repository.

## README pairs

Every README, at the root and in each package, comes in a pair: English `README.md` and Simplified
Chinese `README.zh-CN.md`. The pair has the same structure and content, links to each other at the
top, and is updated in the same change.

## Package documentation

A package's documentation lets a user install it, use it, and understand every public API without
reading its source.

`README.md` is the entry point. It explains what the package does, when to use it, and where to
start, and links to every page in `docs/`. A package that depends on `@univerjs-pro/*` states there
that using it follows the [Univer license terms](https://docs.univer.ai/server/license).

Cover these topics. A small package can use sections in its README; a larger one splits them into
focused pages in `docs/`.

| Topic                      | Content                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| Getting started            | A minimal working example and its expected result                            |
| Installation               | Installation commands, peer dependencies, and supported environments         |
| Usage                      | Common tasks, setup, integration, and cleanup where needed                   |
| Configuration              | Options, defaults, valid values, and their effects                           |
| API                        | Every public export, method, event, and integration point                    |
| Limits and troubleshooting | Known limits, common errors, and how to resolve them                         |
| Migration                  | Steps a user takes when a change requires updating their code or stored data |

## Writing for users

- Use plain language, and explain package-specific terms before using them.
- Address the reader as "you" and write instructions as direct steps.
- Explain what the user can do, what they provide, and what result to expect.
- State prerequisites before the steps that need them.
- Start examples with the common case, and explain advanced options separately.
- Include imports and required setup in runnable examples, and mark any placeholder the user
  replaces.
- Explain internal details only when they affect usage, behavior, or limits.

## Documenting the API

For each public API, describe its purpose, inputs, types, defaults, return value, and failure
behavior, plus side effects, lifecycle requirements, and constraints where they apply. Give a
working example and link to related APIs or guides.

Check descriptions against the public exports and implementation, and run the examples against the
local package. Link to an existing explanation instead of copying it.

## Keeping documentation current

- Update documentation in the same change as the behavior or API it describes, and describe the
  behavior in the checkout. Mark experimental APIs and their limits.
- Add a changeset for every user-facing change to a package (`pnpm changeset`). For a breaking
  change, the changeset gives the migration steps.
- Keep examples small and focused. Leave out file inventories, test counts, and other snapshots that
  do not help users.
- Check local links and run changed examples.
