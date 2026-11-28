# univerkit

[English](./README.md) | 简体中文

univerkit 是一组基于 Univer 的开源应用组件，提炼自实际应用开发中的通用需求。你可以在自己的应用中按需使用，
也可以把它们作为实现参考。每个组件以独立的 npm 包发布，并通过 peer 依赖使用你项目中的
[Univer Office SDK](https://github.com/dream-num/univer)。

## 组件

### HTML 数据绑定

把普通 HTML、CSS、JavaScript 页面连接到 Univer 表格数据。页面通过 HTML 属性展示单元格、绑定表单控件，
也可以用脚本读写单元格、订阅变化；数据同步与公式计算由 Univer 完成。在应用中渲染页面从
`@univerkit/html-view-renderer` 开始。

- [`@univerkit/binding-engine`](./packages/binding-engine/README.zh-CN.md)
- [`@univerkit/html-view`](./packages/html-view/README.zh-CN.md)
- [`@univerkit/html-view-renderer`](./packages/html-view-renderer/README.zh-CN.md)

### 比较视图

以只读双栏形式比较 Sheet、Doc、Slide、Base 和 Board 的两个版本，并标出差异。

- [`@univerkit/unit-comparison-viewer`](./packages/unit-comparison-viewer/README.zh-CN.md)

## 使用方式

1. 按组件的 README 安装对应的包，并安装它声明的 Univer SDK peer 依赖。
2. 按组件的 README 和文档完成集成；各组件的 API、配置和示例都在各自的包里。
3. 升级时查看组件的 `CHANGELOG.md`，破坏性变更会附上迁移步骤。

## 相关链接

- [Univer Office SDK](https://github.com/dream-num/univer)
- [Univer 文档](https://docs.univer.ai/zh-CN)

## 参与贡献

欢迎通过 [GitHub issues](https://github.com/dream-num/univerkit/issues) 反馈问题、通过 pull request
提交修改。开发流程见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可证

以 [Apache-2.0](./LICENSE) 许可发布。依赖 Univer Pro 的组件遵循
[Univer 许可规则](https://docs.univer.ai/zh-CN/server/license)，详见各组件的 README。
