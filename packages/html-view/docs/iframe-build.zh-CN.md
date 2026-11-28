# iframe 页面程序的构建与交付

[架构](architecture.zh-CN.md) · [view API](render.zh-CN.md)

## 背景与约束

`renderHtmlView` 接收应用的容器、模板和 Engine 加载函数。页面绑定、通信和检查所需的
iframe 程序由 SDK 提供，与 SDK 版本一起交付。每次渲染变化的是模板、连接 token 和数据。
应用不负责部署这份固定程序，也不需要传入脚本文本、URL 或配置 SDK 构建插件。

模板在不具有宿主同源权限的 sandbox iframe 中运行。宿主不能直接给页面挂载函数，
MessagePort 也不能传递函数；宿主可以将脚本写进 `srcdoc`，由 iframe 自己执行。
因此页面侧需要一份包含依赖、可独立执行的浏览器程序。

入口 `src/iframe/entry.ts` 组装 Client、DOM 绑定与 Inspector。它依赖其他模块，直接读取
这个 TypeScript 文件的文本不能得到完整程序。构建采用 IIFE，封装依赖与局部变量，
作为 classic script 放在模板脚本之前，让作者脚本可以立即使用 `window.univerBinding`。

## 采用的方案

**先打包 iframe 程序，再通过 `?raw` 将脚本文本内置到宿主 SDK。**

```text
src/iframe/entry.ts + 页面侧依赖
    → 自包含 IIFE
.generated/iframe.js
    → host/render.ts 通过 ?raw 读取文本
/render 的 ESM、CJS 与类型声明
```

宿主源码中的依赖是显式的：

```ts
import iframeProgram from "../../.generated/iframe.js?raw";
```

这个 import 位于 `src/host/render.ts`。SDK 构建将它转换成脚本文本，使用方的构建器
不需要认识 `?raw`。宿主把文本交给文档生成器，页面代码只在 iframe 中执行。

## 方案取舍

| 方案                                       | 特点与代价                                                 | 决定                     |
| ------------------------------------------ | ---------------------------------------------------------- | ------------------------ |
| A：打包脚本后生成普通字符串模块，再 import | 依赖关系明确，源码不依赖资源导入语法；需要维护模块生成步骤 | 可行备选                 |
| B：打包为内部 JS 文件，再用 `?raw` 导入    | 复用仓库已有 Vite 的文本资源能力；仍须显式安排两阶段构建   | 已采用                   |
| 显式虚拟模块                               | 可以提供脚本文本，但增加自定义插件、类型声明和开发工具约定 | 当前无需引入             |
| 外部脚本 URL                               | 需要处理资源部署、版本配对、路径及消费构建器支持           | 不符合应用零资源配置目标 |
| 同源 iframe 中直接传函数                   | 可以减少通信与交付步骤，但改变模板访问宿主的权限边界       | 不采用                   |
| 占位函数抛错，由构建插件替换实现           | 源码行为与构建产物不同，真实依赖隐藏在插件中               | 不采用                   |

A 和 B 都需要先打包页面依赖。选择 B 是因为 SDK 已使用 Vite，可以直接表达脚本资源依赖，
同时保持通用包构建器的职责。这里不将 iframe 程序拆成独立发布包：两侧协议和脚本随同一 SDK
版本交付；`host`、`iframe`、`shared` 目录与独立构建入口已经表达执行边界。

## 构建职责与不变量

包内 `scripts/build.mjs` 依次执行 `buildIframeProgram()` 和通用 `buildPackage()`。
通用构建器只负责公开入口的 ESM、CJS 与声明生成。

- 第一阶段从本次 `src/iframe/entry.ts` 构建，不读取本包旧 `dist`。页面依赖必须打入脚本，不能套用宿主库将裸包依赖 external 的规则。
- 输出必须是一个非空脚本，没有外部或动态 imports、附带资源或其他 chunk；否则构建失败。
- 构建开始先清理中间产物，失败后不能使用旧脚本。中间目录与 `dist` 分开，宿主构建清理 `dist` 不影响本次输入。
- `.generated/iframe.js` 不提交、不独立发布。公开入口包含文本，消费侧不复制文件或加载资源 URL。
- 类型声明不暴露 `?raw` 或生成目录。源码的资源类型声明只帮助类型检查，不能代替真实产物构建。
- iframe 程序在模板脚本之前执行；文档生成必须保留连接 token 与 script 结束标签转义。

包内 `pnpm build` 自动执行两个阶段，`pnpm test` 自动准备 iframe 程序。
构建测试验证自包含产物、依赖变化后的重建和失败清理；浏览器测试验证真实页面启动与交互。
架构测试约束 `host → shared`、`iframe → shared`，防止两侧实现相互调用。

## 开发与发布边界

`?raw` 只跟踪生成文件，不会自动跟踪 iframe 的原始依赖。若增加源码 watch，必须显式安排：
页面依赖变化 → 重建 iframe 程序 → 更新中间文件 → 重建宿主。

发布包不包含源码、中间文件或 source map。
