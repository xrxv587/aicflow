---
task: hooks 防绕过
created: 2026-10-04 00:10
---

## 方案概述

npm 包新增 `aic hook <event> --client <claude|codex|zcode>` 子命令作为三家客户端共用的钩子入口：stdin 读入客户端 payload → 归一化 → 事件处理（查 current.md / 匹配触发词 / 组装 status）→ 按客户端各自的 JSON 格式输出决策或注入上下文。`aic init --hooks` 按客户端铺设配置（幂等合并、保留用户已有钩子），`aic hooks --remove` 卸载还原。决策逻辑单一实现，I/O 格式按客户端分支（"一个大脑，三张嘴"）。

## 调研结论：三客户端能力矩阵（2026-10-04，官方文档实测核对）

| 能力 | Claude Code | ZCode | Codex |
|---|---|---|---|
| SessionStart 注入上下文 | ✅ additionalContext（matcher 匹配 source） | ✅（同左，需 `hooks.enabled: true`） | ✅（默认启用；`[features].hooks=false` 才关闭） |
| UserPromptSubmit 注入 | ✅ additionalContext | ✅ | ✅（matcher 被忽略，脚本内判断） |
| PreToolUse **ask** | ✅ `permissionDecision:"ask"` | ✅ | ❌ **ask 被解析但不支持**（钩子记为失败、工具调用继续）→ 降级为 additionalContext 提醒 |
| PreToolUse 文件路径来源 | `tool_input.file_path`（Edit/Write） | 同 Claude Code | `tool_name:"apply_patch"`、路径在 `tool_input.command` 的 patch 文本里（需解析 patch 头） |
| 项目级配置位置 | `.claude/settings.json` | `.zcode/config.json`（workspace） | `.codex/hooks.json` 或 config.toml `[hooks]`（项目须受信任才加载） |
| 配置内取项目根 | `${CLAUDE_PROJECT_DIR}` 模板变量 | 同左 | 无模板变量；官方推荐 `$(git rev-parse --show-toplevel)` shell 展开 |
| 使用前信任 | 无 | 无 | **需在 CLI 里 `/hooks` 审阅并信任，钩子变更后须重新信任** |
| 钩子超时 | 默认 600s | 默认 60s | 默认 600s（秒单位） |

关键出处：Codex 官方 hooks 文档（事件、payload、决策支持、信任流）；Claude Code 官方 hooks 文档（ask 决策、注入、配置合并）；ZCode hooks 排障文档（本机）。

## 设计决策与选型（含理由）

1. **`aic hook` 做成主 CLI 子命令而非独立 bin**：先按 commander 常规子命令实现（node 启动＋commander ≈ 60-120ms，预算 <100ms 临界），实测超预算再拆独立轻量入口 `dist/hook.js`（避开 commander import）。不为未证实的性能问题预付复杂度。
2. **payload 归一化层**：`normalize(event, raw)` 产出 `{cwd, filePath?, prompt?, toolName?}`——Claude/ZCode 取 `tool_input.file_path`；Codex 从 `apply_patch` 的 patch 文本解析文件路径（`*** Update/Add File:` 头）。**用 `payload.cwd` 而非 `process.cwd()`** 定位项目（钩子命令的工作目录语义三家不一致）。
3. **PreToolUse 输出按客户端分支**：无任务且路径在拦截范围 → Claude/ZCode 返回 ask JSON（含指引文案）；Codex 返回 additionalContext 提醒（"ask 不支持，降级"——init 时对该客户端明示）。有任务 → exit 0 静默放行。路径判断：项目内且不在排除清单（`.ai-continue/`、`.git/`、`node_modules/`、`.zcode/`、`.claude/`、`.codex/`）。
4. **触发词匹配放脚本内而非 matcher**：中文正则（"新需求|新功能|新任务|开始.{0,6}(需求|功能|任务)…"＋英文 new feature/task 等）在 `aic hook` 里做——三家的 matcher 语义各不相同（exact-string vs regex vs 忽略），脚本内统一判断可移植且可单测。
5. **SessionStart 直接复用 core 的 readCurrent/parse 组装输出**（不 shell 调 `aic status`，省一次进程），注入文本＝status 的三种状态对应文案。
6. **fail-open 落实为代码结构**：`aic hook` 最外层 try/catch，任何异常 → exit 0 无输出（放行）＋stderr 一行日志（供客户端日志面板排查）。
7. **配置命令的路径解析**：Claude/ZCode 配置写 `node "${CLAUDE_PROJECT_DIR}/node_modules/aicflow/dist/index.js" hook …`；Codex 写 `node "$(git rev-parse --show-toplevel)/node_modules/aicflow/dist/index.js" hook …`（官方推荐姿势）。包未安装（路径不存在）→ `init --hooks` 前置检查并报错提示先安装。
8. **配置合并策略**：只增删自己写的条目（以 command 含 `aicflow/dist/index.js" hook` 特征识别），绝不触碰用户已有 hooks 数组其他条目；ZCode 侧补 `hooks.enabled: true`（已 true 不动）。卸载按同一特征精确移除。
9. **v1 目标平台 macOS/Linux**（command 型钩子走 shell；Windows 兼容留待后续，Codex 的 `commandWindows` 字段预留位）。

## 影响范围（文件/模块）

- 新增 `src/core/hook/`：`payload.ts`（归一化）、`handlers.ts`（三事件处理）、`clients.ts`（输出 JSON 格式化）、`trigger.ts`（触发词）、`paths.ts`（排除清单＋项目内判断）＋ 对应 `*.test.ts`
- 新增 `src/commands/hook.ts`（`aic hook` 编排）；新增 `src/commands/hooks.ts`（`aic hooks --remove`）
- 修改 `src/commands/init.ts`（`--hooks` 选项：铺三份配置）、`src/index.ts`（注册）
- 文档：README 双语（命令表）、wiki 新增 `hooks.md` 页、cli.md、architecture.md、Home.md、development.md（冒烟流程）
- 不动：parse 规则、退出码协议、现有四命令语义、模板

## 实施步骤

1. core/hook 五模块＋单测（归一化含 apply_patch 解析、触发词、路径排除、三客户端输出格式、fail-open）
2. `aic hook` 子命令＋index 注册；手工喂样例 payload 冒烟（三种事件 × 三家格式）
3. `init --hooks` 适配器＋`aic hooks --remove`；幂等与合并单测
4. **ZCode 实测**（本机可用）：临时项目目录装真钩子，验证 ask 弹窗、放行、SessionStart 注入、fail-open
5. Claude Code / Codex：本机若装有客户端则真机联测；没有则 payload 级验证＋官方文档逐字段核对，差距如实记录
6. 文档更新＋性能实测（`time` 采样钩子全程耗时，超 100ms 优化入口）
7. 按 PRD 验收标准逐条自检落盘 → 验收报告

## 风险与应对

- **Codex 信任流是隐藏步骤**：钩子装好但未 `/hooks` 信任 → 静默不生效。应对：`init --hooks` 对 Codex 输出加粗提示"须在 Codex CLI 内执行 /hooks 审阅信任"；文档同步。
- **Codex 项目不受信时项目级钩子不加载**：属 Codex 安全设计，无法绕过；init 输出与 wiki 注明。
- **apply_patch payload 格式非稳定接口**（官方文档自述 transcript 类似警告）：解析只依赖 `*** Update File:`/`*** Add File:` 头行，格式变化时 fail-open 兜底（解析失败按"项目内"处理并提醒）。
- **三客户端 hooks 演进快**（Claude Code 已有 32 事件、Codex 持续加字段）：归一化层收窄接触面，未知字段忽略；能力矩阵记入 wiki 注明核对日期，漂移时按矩阵更新。
- **性能超标**：实测超 100ms → 拆 `dist/hook.js` 轻量入口（决策 1 预留的优化路径）。
- **误拦用户手改文件的编辑器场景**：PreToolUse 只拦 AI 工具调用（Edit/Write/apply_patch），不涉及人类编辑器，无此风险；但 AI 在排除清单外的配置文件（如 tsconfig）上编辑会触发 ask——符合"文档也应有任务归属"的既定决策。
