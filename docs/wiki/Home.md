# ai-continue 项目 Wiki

> 本目录是本仓库的权威文档。AI 会话接手本仓库时，请先读完本页再读 [architecture](./architecture.md)，动手改代码前再看一遍 [development](./development.md) 的注意事项。

**一句话**：`aic` 是一个 Node.js CLI 工具，通过「断点文件 + 注入到项目引导文档的 AI 引导」，让 Claude Code / Cursor 等 AI 编码客户端在新会话里自动续上未完成的任务。**工具本身不调用任何模型 API**，所有"智能"由用户的 AI 客户端提供。

## 快速事实

| 项 | 值 |
|---|---|
| 包名 / CLI 命令 | `ai-continue` / `aic` |
| 当前版本 | 0.1.0 |
| 语言 / 模块体系 | TypeScript，纯 ESM（`"type": "module"`，module=NodeNext） |
| 运行时依赖 | 仅 `commander` ^15 |
| Node 版本要求 | >= 18 |
| 包管理器 | yarn（有 yarn.lock） |
| 测试 | 暂无，`typecheck` 是唯一自动检查 |
| License | MIT |

## 页面导航

| 页面 | 内容 |
|---|---|
| [architecture](./architecture.md) | 代码地图、三条数据流、设计决策、边界行为清单 |
| [cli](./cli.md) | `init` / `status` / `done` 的完整行为、交互流程、退出码矩阵 |
| [breakpoint-format](./breakpoint-format.md) | 断点文件格式规范、解析与校验规则、归档命名规则 |
| [guide-injection](./guide-injection.md) | AI 引导文案内容、注入流程、幂等标记、升级迁移的坑 |
| [development](./development.md) | 环境与脚本、ESM 约定、yarn link 本地联调、改动注意事项 |

## 核心工作循环

```
┌─ 会话开始 ─────────────────────────────────┐
│ AI 按引导执行 aic status                     │
│   → 知道：任务是什么、做到哪、还剩什么         │
│   → 与用户确认后继续执行未完成部分             │
│                                             │
│ 阶段工作完成 / 会话结束前                     │
│   → AI 直接编辑 .ai-continue/current.md      │
│     更新待办勾选与上下文备注                   │
└─ 断点留在项目里，下次会话重复这个循环 ──────────┘
```

## 仓库内特殊文件说明

- `NOT_AGENTS.md`：**已删除**（2026-09-29）。它曾是团队 AGENTS.md 空白模板，其规则从未并入工具代码；需要时从 git 初始提交找回，详见 [development 的历史注记](./development.md)。
- `.ai-continue/`：本仓库自身没有这个目录，断点文件由使用方项目生成。注意 `.gitignore` **没有**忽略它——断点默认随 Git 提交，设计意图是让团队共享任务状态。
- `.joycode/`：本机 AI 客户端的本地目录，与本工具无关，不参与构建。

## 当前待决事项（2026-09-29）

- 是否在注入引导文案中加入「新需求先复述理解、分级门禁确认后再编码」的规则。目前 `guide.ts` 的确认逻辑只覆盖"续做旧任务"（先确认是否继续），**新任务路线没有任何引导**。未落地，改动时先和团队对齐。
