# Contributing

Thanks for your interest in univerkit. Report bugs and request features through
[GitHub issues](https://github.com/dream-num/univerkit/issues), and propose changes through pull
requests.

## Development

Requires Node.js 24 or later and pnpm (the version is pinned in `package.json`).

```sh
pnpm install
pnpm check   # format, typecheck, build
pnpm test
```

Run `pnpm format` to fix formatting.

## Pull requests

- Keep each pull request focused on one change, and write the title and commit messages in English.
- Update the package documentation in the same pull request; see
  [docs/documentation.md](./docs/documentation.md).
- Add a changeset for every user-facing change to a package by running `pnpm changeset`.
- Make sure `pnpm check` and `pnpm test` pass.

## License

By contributing, you agree that your contributions are licensed under the
[Apache-2.0 License](./LICENSE).
