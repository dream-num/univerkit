# univerkit

English | [简体中文](./README.zh-CN.md)

univerkit is a set of open-source application components built on Univer, distilled from common
needs in real application development. Use them in your own application as needed, or as a
reference for your own implementation. Each component is published as its own npm package and uses
the [Univer Office SDK](https://github.com/dream-num/univer) in your project as a peer dependency.

## Components

### HTML data binding

Connect plain HTML, CSS, and JavaScript pages to Univer sheet data. Pages show cells and bind form
controls through HTML attributes, or read, write, and subscribe to cells from scripts; Univer handles
data sync and formula calculation. To render pages in an application, start with
`@univerkit/html-view-renderer`.

- `@univerkit/binding-engine`
- `@univerkit/html-view`
- `@univerkit/html-view-renderer`

### Comparison viewer

Compare two versions of a Sheet, Doc, Slide, Base, or Board side by side, read-only, with the
differences highlighted.

- `@univerkit/unit-comparison-viewer`

These components are being migrated; documentation links will be added once they are published.

## Usage

1. Install the component's packages as described in its README, along with the Univer SDK peer
   dependencies it declares.
2. Integrate it by following its README and documentation; each component's API, configuration, and
   examples live in its own package.
3. When upgrading, read the component's `CHANGELOG.md`; breaking changes come with migration steps.

## Links

- [Univer Office SDK](https://github.com/dream-num/univer)
- [Univer documentation](https://docs.univer.ai)

## Contributing

Report problems through [GitHub issues](https://github.com/dream-num/univerkit/issues) and propose
changes through pull requests. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development
workflow.

## License

Licensed under [Apache-2.0](./LICENSE). Components that depend on Univer Pro follow the
[Univer license terms](https://docs.univer.ai/server/license); see each component's README.
