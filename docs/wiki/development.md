# 开发指南

[← 返回首页](./Home.md)

## 环境与脚本

- Node >= 18，包管理器 yarn（仓库带 yarn.lock）。
- 运行时依赖只有 `commander`；开发依赖：`typescript`、`tsx`、`@types/node`。

```bash
yarn install
yarn dev <命令>      # tsx 直跑源码，如 yarn dev status
yarn typecheck       # tsc --noEmit，目前唯一的自动检查
yarn build           # tsc 编译到 dist/
```

**当前没有测试**（无测试框架、无测试文件）。改 `parse` / `breakpoint` 这类纯逻辑时，建议在临时目录手动构造坏文件验证 `aic status` 的退出码 2 路径，再提交。

## ESM / NodeNext 约定

`package.json` 是 `"type": "module"`，tsconfig 为 `module: nodenext` + `moduleResolution: nodenext`。因此：

- **源码里的相对导入必须写 `.js` 后缀**（`import { runInit } from './commands/init.js'`）——指向的是编译后的文件名，TS 会正确映射回 `.ts`。新增文件时照此办理，漏写会通过 typecheck 但构建产物运行时报错。
- 只用 Node 内置模块（`node:fs/promises`、`node:path`、`node:readline/promises`）+ commander，无其他依赖。

## 构建产物与 bin

- `yarn build` 输出到 `dist/`（已 gitignore），结构镜像 `src/`。
- `package.json` 的 `bin.aic` 指向 `dist/index.js`；`src/index.ts` 首行有 `#!/usr/bin/env node` shebang。

## 本地联调

```bash
yarn install && yarn build && yarn link   # 全局注册 aic

# 到任意测试项目目录：
aic init 试试断点 -y
aic status
aic done

yarn unlink                              # 用完解除
```

联调 `init` 的引导注入时注意：测试目录里放不同的引导文件组合（无 / 单个 / 多个 / 已含标记）能覆盖 `injectGuide` 的全部分支。

## 改动注意事项（按模块）

- **改引导文案（guide.ts）**：只影响之后的新注入，存量项目不会更新——见 [guide-injection](./guide-injection.md) 的升级坑。改 `GUIDE_FILES` 顺序或标记字符串属破坏性变更（标记变了会导致旧项目被重复注入）。
- **改格式规则（breakpoint.ts 的 parse）**：收紧规则会让存量断点文件突然变成"结构异常"，先想清楚迁移；`status` / `done` / `init` 三处都吃 `parse` 的结果。
- **改退出码**：`1` = 无任务、`2` = 结构坏，这是给 AI 客户端的协议（见 [cli](./cli.md)），别顺手改语义。
- **新增依赖**：本工具的卖点之一是轻（运行时仅 commander），新增前先掂量。

## 历史注记

仓库早期有一个 `NOT_AGENTS.md`（团队 AGENTS.md 空白模板，字段未填写），2026-09-29 删除。删除原因：其团队编码规约从未并入 `guideText()` 的注入引导——两者一直是两套东西（注入引导管断点循环，模板管团队规约），模板本身也无日常使用。规则文本需要时可从 git 初始提交（3d6a2d7）找回。
