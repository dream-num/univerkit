# Unit Comparison Viewer Example

English | [简体中文](./README.zh-CN.md)

A standalone browser example showing how to integrate `@univerkit/unit-comparison-viewer` with Tailwind CSS v4 and `@univerjs/preset-sheets-core`. No backend server is required.

It compares two versions of a sample Q4 operating budget workbook using `SheetsUnitComparisonAdapter` from `@univerjs-pro/sheets-history`, demonstrating:

- Side-by-side read-only Univer Sheet panes with synchronized scrolling and selection
- Row-insertion gap alignment (`Security & Compliance` inserted into the right revision)
- Collapsible structural diff sidebar with Worksheet / Workbook scope switcher and search
- Formula diff strip (`=SUM(B3:B6)` vs. `=SUM(B3:B7)`) and value / formatting display modes
- Switching built-in locales (`en-US` / `zh-CN`) and Light / Dark mode

## Start

From the repository root, run:

```bash
pnpm install
pnpm build
pnpm --filter @univerkit/example-unit-comparison-viewer-basic dev
```

Open <http://127.0.0.1:3031/>. Use the header buttons to toggle language (`English` / `中文`) or theme (`Light` / `Dark`), or pass `?lang=zh-CN&theme=dark` in the URL.

## Code layout

```text
examples/unit-comparison-viewer-basic/
├── index.html
├── vite.config.ts
└── src/
    ├── App.tsx                     # Viewer host shell, locale & dark-mode controls
    ├── create-comparison-univer.ts # Read-only UnitComparisonUniverFactory using UniverSheetsCorePreset
    ├── demo-comparison.ts          # Sample workbook revisions compared via SheetsUnitComparisonAdapter
    ├── main.tsx                    # React entrypoint
    └── styles.css                  # Tailwind CSS v4 + @univerkit/unit-comparison-viewer/styles.css
```
