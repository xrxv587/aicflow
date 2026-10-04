# aicflow

[English](./README.md) | 简体中文

AI 协作工作流工具。通过「注入 AI 引导 + PRD/TRD 文档 + 任务状态 + 验收归档」，让 Claude Code / Cursor 等 AI 客户端先与你达成需求与技术共识再编码，跨会话自动续接未完成任务，完成后整组归档留痕。工具本身不调用任何模型 API。

## 两层设计

CLI 只做三件事：**工件**（引导与模板的铺设）、**状态**（current.md 生命周期）、**门禁**（验收拦截与归档）。工作流本身——何时共识、何时建档、何时能编码——全部写在注入到 AGENTS.md 的引导里，由 AI 遵循执行。

**收到新需求**

- AI 复述理解，只问会改变做法的问题
- 小改动：一句话对齐 → `aic start` → 直接做
- 大任务：先确认目标 / 边界 / 验收，然后
  - AI 用模板写 PRD → 用户首肯
  - AI 调研代码库写 TRD → 用户首肯
  - `aic start <任务名>` + 写指针 → 编码

**会话开始（含跨会话续接）**

- 执行 `aic status` 续上当前任务
- 执行中：AI 直接编辑 current.md 与 PRD/TRD

**任务完成**

- 待办全部完成 ≠ 任务完成
- 按 PRD 验收标准逐条自检，证据写入 PRD「验收」区
- 验收报告获用户认可 → `aic done --accepted`
- current + PRD + TRD 整组归档留痕

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
| `aic init [-y] [--hooks]` | 项目初始化：把 AI 引导注入项目根的引导文件（CLAUDE.md / AGENTS.md / .cursorrules / GEMINI.md，一个都没有时询问是否新建 AGENTS.md），并铺设 PRD/TRD 模板到 `.ai-continue/templates/`。幂等可重跑，已存在即跳过。`--hooks` 同时铺设 Claude Code / Codex / ZCode 三客户端钩子加固配置（见下节） |
| `aic start [任务名] [-y]` | 开始一个新任务：创建 `.ai-continue/current.md`（已有任务需先 `aic done`）。PRD/TRD 不经此命令，由 AI 按引导先建文档、双首肯后再 start |
| `aic status` | 输出当前任务、进度、下一步、需求指针与验收状态；AI 会话开始时执行它来续上任务 |
| `aic done [-f] [--accepted]` | 归档当前任务：current.md 与需求目录（PRD/TRD）整组移入 `.ai-continue/archive/`。有 PRD 的任务设**验收门禁**：PRD「## 验收」区须有逐条自检记录，且需 `--accepted` 声明验收已获用户认可；`-f` 跳过全部门禁 |
| `aic hook <事件> --client <id>` / `aic hooks [--remove]` | 钩子管道与接入管理，见下节 |

`status` 退出码：`0` 正常；`1` 未开始任务；`2` current.md 结构异常（输出具体修复提示）。

## 钩子加固（可选）

引导是软约束；钩子把最常被绕过的三个环节升级为客户端级防线（防失误性绕过，不防对抗）：**会话开始**自动注入 `aic status` 报告、**新需求消息**触发分级提醒、**无任务时的文件编辑**上抛用户批准（Claude Code / ZCode 走 `ask`；Codex 官方不支持 ask，降级为模型可见提醒）。支持 Claude Code / Codex / ZCode 三客户端。`aic init --hooks` 铺设（幂等、只动自身条目），`aic hooks --remove` 卸载。核心 CLI 保持客户端无关，详见 [docs/wiki/hooks.md](./docs/wiki/hooks.md)。

## 文件约定

```
.ai-continue/
├── current.md               # 任务状态卡：小、必读、高频改写
├── templates/
│   ├── prd.md               # 需求文档模板（init 铺设，可自定义）
│   └── trd.md               # 技术方案模板（同上）
├── specs/<任务>/
│   ├── prd.md               # 需求侧：已确认（目标/边界/验收标准）+ 未确认 + 验收
│   └── trd.md               # 技术侧：方案、选型、影响范围、步骤、风险
└── archive/<时间戳>-<任务>/  # done 归档：current.md + spec/{prd,trd}.md
```

`.ai-continue/current.md`（任务状态卡）：

```markdown
---
task: 重构登录模块
updated: 2026-09-29 14:30
spec: specs/login-refactor/     # 可选，大任务由 AI 建档后写入
---

## 待办
- [x] 拆出 API 层
- [ ] 处理 token 刷新

## 下一步
在 src/api/auth.ts 加 refresh 拦截器
```

PRD/TRD 由 AI 复制模板生成（CLI 不生成、不解析内容），CLI 依赖的格式不变量只有两条：frontmatter 的 `spec:` 指针指向存在的目录；PRD「## 验收」区有 checkbox 条目（归档门禁判据，空骨架不算）。

## 开发

```bash
yarn dev <命令>      # tsx 直跑，如 yarn dev status
yarn typecheck
yarn test
yarn build
```

## 项目文档（Wiki）

架构、命令行为、文件格式、引导注入机制、开发注意事项见 [docs/wiki/](./docs/wiki/Home.md)。AI 会话接手本仓库时请先读 [docs/wiki/Home.md](./docs/wiki/Home.md)。
