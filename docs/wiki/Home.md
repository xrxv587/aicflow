# ai-continue 项目 Wiki

> 本目录是本仓库的权威文档。AI 会话接手本仓库时，请先读完本页再读 [architecture](./architecture.md)，动手改代码前再看一遍 [development](./development.md) 的注意事项。

**一句话**：`aic` 是一个 Node.js CLI 工具，采用两层设计——**CLI 管工件（引导/模板）、状态（current.md）、门禁（验收拦截/归档）；AGENTS.md 引导管工作流**（PRD/TRD 双首肯、先共识后编码、跨会话续接、先验收后归档）。让 AI 客户端按工作流协作，全程文档留痕。**工具本身不调用任何模型 API**。

## 快速事实

| 项 | 值 |
|---|---|
| 包名 / CLI 命令 | `ai-continue` / `aic` |
| 当前版本 | 0.1.0（2026-09-29 全量重写后起步；未发布，不写兼容/升级逻辑） |
| 语言 / 模块体系 | TypeScript，纯 ESM（`"type": "module"`，module=NodeNext） |
| 运行时依赖 | 仅 `commander` |
| Node 版本要求 | >= 18 |
| 包管理器 | yarn（有 yarn.lock） |
| 测试 | node:test + tsx 直跑（`yarn test`），零额外依赖 |
| License | MIT |

## 页面导航

| 页面 | 内容 |
|---|---|
| [architecture](./architecture.md) | 代码地图、数据流、设计决策、边界行为清单 |
| [cli](./cli.md) | `init` / `start` / `status` / `done` 的完整行为、交互流程、退出码矩阵 |
| [format](./format.md) | 目录布局、current.md 与 PRD/TRD 格式规范、解析规则、归档结构 |
| [hooks](./hooks.md) | 客户端钩子加固：三层防线、三客户端能力矩阵、安装与卸载 |
| [guide-injection](./guide-injection.md) | AI 引导内容与注入机制 |
| [development](./development.md) | 环境与脚本、ESM 约定、yarn link 本地联调、改动注意事项 |

## 核心工作循环

**收到新需求**

- AI 复述理解、只问会改变做法的问题
- 小改动：一句话对齐 → `aic start` → 直接做
- 大任务：确认目标 / 边界 / 验收
  - AI 复制模板写 PRD → 用户首肯
  - AI 调研代码库写 TRD → 用户首肯
  - `aic start` + 写 spec 指针 → 编码

**会话开始（含跨会话续接）**

- `aic status`：任务 / 进度 / 下一步 / 需求 / 验收
- 与用户确认后续做，从「## 下一步」接上

**执行中 / 会话结束前**

- AI 直接编辑 current.md（待办 / 下一步）
- 需求发现写 PRD「未确认」；方案调整先改 TRD

**待办全部完成 ≠ 任务完成**

- 按 PRD 验收标准逐条自检写「验收」区
- 验收报告获用户认可 → `aic done --accepted`
- current + PRD + TRD 整组归档留痕

## 仓库内特殊文件说明

- `.ai-continue/`：由使用方项目生成，**随 Git 提交**（`.gitignore` 没有忽略它）——断点与需求文档团队共享。2026-10 起本仓库自身也 dogfood：`specs/` 下是进行中任务的 PRD/TRD，`archive/` 是已归档任务的留痕。
- `.joycode/`：本机 AI 客户端的本地目录，与本工具无关，不参与构建。

## 设计决策记录

- **两层架构（2026-09-29 重写定稿）**：CLI＝工件＋状态＋门禁，引导＝工作流规范。判断某件事归属的尺子：CLI 解析/拦截什么，什么就留在命令里；CLI 只读不写的（PRD/TRD），生成权归 AI（按引导复制模板）。
- **PRD/TRD 双首肯**：大任务 PRD（需求共识）与 TRD（技术方案）都必须获用户首肯才能编码；文档放 `specs/<任务>/` 内，done 整组归档天然留痕，零归档代码。
- **门禁 fail-closed**：CLI 对文档格式的依赖只有两条不变量（`spec:` 指针目录存在、PRD「## 验收」区有 checkbox 条目）；格式漂移只会导致"被拦下修正"，不会放水。
- **版本与兼容**：未投入使用，版本从 0.1.0 起步，不写升级/兼容逻辑；引导与模板均为"存在即跳过"，需要更新时手动删除重跑 `aic init`。
- **hooks 加固（2026-10-04 落地）**：把开场续接 / 新需求分级 / 编码前 start 三个环节升级为客户端级防线（提醒＋ask 上抛＋注入），可选层、按客户端适配，详见 [hooks](./hooks.md)。防失误性绕过，不防对抗（Bash 写入检测明确不做）。
- **明确不做**：多任务并行、`--json` 输出、CLI 解析 PRD/TRD 内容。
