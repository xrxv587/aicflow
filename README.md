# ai-continue

AI 跨会话任务断点工具。通过「断点文件 + AI 引导」，让 Claude Code / Cursor 等 AI 客户端在新的会话里自动续上未完成的任务。

## 工作机制

```
┌─ 会话开始 ──────────────────────────────────┐
│ AI 按引导执行 `aic status`                    │
│   → 知道：任务是什么、做到哪、还剩什么          │
│   → 继续执行未完成的部分                       │
│                                              │
│ 阶段工作完成 / 会话结束前                      │
│   → AI 直接编辑 `.ai-continue/current.md`     │
│     更新待办勾选与上下文备注                    │
└─ 断点留在项目里，下次会话重复这个循环 ──────────┘
```

工具本身不调用任何模型 API，模型能力完全由用户的 AI 客户端提供。

## 安装（本地开发）

```bash
yarn install
yarn build
yarn link
```

之后即可在任意项目目录使用 `aic` 命令。

## 命令

| 命令 | 说明 |
|---|---|
| `aic init [任务名] [-y]` | 初始化 `.ai-continue/current.md`，检测项目根的引导文件（CLAUDE.md / AGENTS.md / .cursorrules / GEMINI.md），确认后追加 AI 引导；没有引导文件时可创建 AGENTS.md |
| `aic status` | 输出当前任务、待办进度与上下文；AI 会话开始时执行它来续上任务 |
| `aic done [-f]` | 归档当前任务到 `.ai-continue/archive/`；有未完成项时会确认，`-f` 跳过确认与结构校验 |

`status` 退出码：`0` 正常；`1` 未初始化；`2` 断点文件结构异常（输出具体修复提示）。

## 断点文件约定

`.ai-continue/current.md`，Markdown 为主、少量固定结构：

```markdown
---
task: 重构登录模块
updated: 2026-09-29 14:30
---

## 待办
- [x] 拆出 API 层
- [ ] 处理 token 刷新

## 上下文
决策、踩坑、涉及文件等，供下次会话快速恢复。
```

约定：

- frontmatter：`task` 必填，`updated` 为最后更新时间（`YYYY-MM-DD HH:mm`）
- 「## 待办」：只允许 `- [ ]` / `- [x]` checkbox 行
- 「## 上下文」：自由 Markdown
- 进度更新不经过命令，AI 直接编辑文件，`aic status` 负责结构校验

## 开发

```bash
yarn dev <命令>      # tsx 直跑，如 yarn dev status
yarn typecheck
yarn build
```

## 项目文档（Wiki）

架构、命令行为、断点格式、引导注入机制与开发注意事项见 [docs/wiki/](./docs/wiki/Home.md)。AI 会话接手本仓库时请先读 [docs/wiki/Home.md](./docs/wiki/Home.md)。
