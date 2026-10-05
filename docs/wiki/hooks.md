# hooks 加固（防绕过）

[← 返回首页](./Home.md)

把工作流最常被绕过的三个环节从"引导软约束"升级为"客户端级防线"。定位：**可选加固层**——核心 CLI 客户端无关，本层按客户端能力适配；防**失误性绕过**，不防对抗性绕过（Bash `echo >`/`sed -i` 类写入不做检测，如实明示）。

## 三层防线

| 层 | 钩子事件 | 行为 | 强度 |
|---|---|---|---|
| 入口提醒 | `UserPromptSubmit` | 消息命中触发词（中英偏宽表）→ 注入"先复述分级；大任务 PRD/TRD 双确认"提醒 | 提醒 |
| 过程上抛 | `PreToolUse`（Edit/Write/ApplyPatch） | 无 `.ai-continue/current.md` 的项目内文件编辑 → Claude/ZCode 返回 `ask` 上抛用户批准；Codex 降级为模型可见提醒 | 用户拍板 / 提醒 |
| 会话续接 | `SessionStart` | 注入 `aic status` 三态（任务报告 / 无任务 / 结构异常修复提示） | 注入 |

排除路径（不触发 ask）：`.ai-continue/`、`.git/`、`node_modules/`、`.zcode/`、`.claude/`、`.codex/`；项目外路径不拦；路径无法解析按拦截处理（fail-safe）。有进行中任务时一切静默。

## 能力矩阵（2026-10-04 按官方文档核对）

| 能力 | Claude Code | ZCode | Codex |
|---|---|---|---|
| SessionStart / UserPromptSubmit 注入 | ✅ | ✅（需 `hooks.enabled: true`） | ✅（默认启用） |
| PreToolUse **ask** | ✅ | ✅ | ❌ 官方明确"ask 被解析但不支持"→ 降级 additionalContext |
| 文件路径来源 | `tool_input.file_path` | 同 Claude Code | `apply_patch` 补丁文本头（解析 `*** Update/Add File:`） |
| 项目级配置 | `.claude/settings.json` | `.zcode/config.json` | `.codex/hooks.json` 或 config.toml `[hooks]` |
| 项目根变量 | `${CLAUDE_PROJECT_DIR}` | 同左 | 无；配置命令用 `$(git rev-parse --show-toplevel)` |
| 使用门槛 | 无 | 无 | 须在 CLI 内 `/hooks` 审阅信任；项目须受信任 |

客户端演进较快，本表核对日期见页首；行为漂移时先更新此表再改代码。

## 命令

- `aic init --hooks`：铺设三客户端钩子配置（幂等；已存在即跳过；只增删 `dist/hook.js` 特征的自身条目，绝不触碰用户已有钩子）。前置条件：本项目 `node_modules/aicflow` 已安装。输出中明示 Codex 的信任步骤与 ask 降级。
- `aic hooks`：查看/重铺当前接入状态；`aic hooks --remove` 按特征移除自身条目（ZCode 的 `hooks.enabled` 与用户条目不动）。
- `aic hook <event> --client <id>`：钩子管道入口，由客户端配置调用（`dist/hook.js` 轻量入口，不经 commander），也可手动喂 payload 调试。

## 实现要点

- `src/core/hook/`：`payload.ts`（归一化：cwd 以 payload 为准）、`paths.ts`（排除清单）、`trigger.ts`（触发词）、`handlers.ts`（三事件处理）、`clients.ts`（输出格式分支）、`dispatch.ts`（fail-open 分发）、`install.ts`（三客户端配置读写）。
- **fail-open**：任何异常 → 放行（exit 0）＋ stderr 一行日志。钩子 bug 绝不锁死编辑。
- **性能**：轻量入口自身开销 ~16ms（总时长由 Node 进程启动主导，Intel Mac 实测 ~110ms）。若未来需要更低，方向是单文件打包，不是加代码。
- 退出码：`aic hook` 参数错误 → 1；正常路径恒 0（拦截/注入语义由 stdout JSON 表达，不用退出码 2——那是各家客户端的阻断约定，我们 deny 已明确不做）。

## 设计依据

需求与方案讨论全文见 `product-requirement/hooks.md` 与 `.ai-continue/specs/hooks-防绕过/`（PRD/TRD）。核心决策：不做 deny（小改动不强迫走流程）、ask 把决定权还给用户、触发词偏宽（误报代价低）、SessionStart 始终注入、"一个大脑三张嘴"（决策逻辑单一实现，只有 I/O 格式按客户端分支）。
