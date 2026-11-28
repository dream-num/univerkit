# Unit Comparison Viewer 示例

[English](./README.md) | 简体中文

一个独立的前端示例应用，演示如何结合 Tailwind CSS v4 和 `@univerjs/preset-sheets-core` 集成 `@univerkit/unit-comparison-viewer`，无需启动后端服务。

示例使用 `@univerjs-pro/sheets-history` 的 `SheetsUnitComparisonAdapter` 对比两版 Q4 运营预算工作簿，展示了以下能力：

- 只读双栏 Univer Sheet 视图，支持联动滚动与选区同步
- 插入行对齐空隙（右侧版本插入 `Security & Compliance` 行）
- 可折叠的结构化差异侧边栏，支持工作表/工作簿范围切换与搜索
- 公式差异栏（`=SUM(B3:B6)` 对比 `=SUM(B3:B7)`）以及内容/格式展示模式切换
- 内置多语言（`en-US` / `zh-CN`）与浅色/暗色主题切换

## 启动方式

在仓库根目录执行：

```bash
pnpm install
pnpm build
pnpm --filter @univerkit/example-unit-comparison-viewer-basic dev
```

打开 <http://127.0.0.1:3031/>。点击顶部按钮可切换语言（`English` / `中文`）和主题（`Light` / `Dark`），也可通过 URL 参数 `?lang=zh-CN&theme=dark` 指定。

## 代码结构

```text
examples/unit-comparison-viewer-basic/
├── index.html
├── vite.config.ts
└── src/
    ├── App.tsx                     # 宿主外框、语言与暗色模式切换
    ├── create-comparison-univer.ts # 基于 UniverSheetsCorePreset 的只读 UnitComparisonUniverFactory
    ├── demo-comparison.ts          # 使用 SheetsUnitComparisonAdapter 计算差异的示例工作簿
    ├── main.tsx                    # React 入口
    └── styles.css                  # Tailwind CSS v4 + @univerkit/unit-comparison-viewer/styles.css
```
