# hooks 防绕过（aic hook / aic init --hooks）

- 状态：设计定稿 v1，待按 AGENTS.md 流程建 PRD/TRD 后开发
- 日期：2026-10-03
- 背景：2026-10-03 实现 park/resume 时，AGENTS.md 明确规定的大任务流程（PRD/TRD 建档＋双首肯）被 AI 判断性绕过——规则在场且清晰，但执行中被"设计文档已等价、建档是仪式感"的自作主张替换。用户决策：hooks 防绕过机制优先于 park/resume 开发。
- 定位约束（用户明确）：aic 是**通用 npm 包**，不是 ZCode 专属——至少先支持 Claude Code 与 Codex（ZCode 同步做，兼作 dogfood 环境）；核心 CLI 层保持客户端无关，hooks 只能是按客户端能力适配的加固层。

## 1. 目标

把工作流中最常被绕过的三个环节从"引导软约束"升级为"客户端级防线"：

1. **开场续接**：会话开始自动注入 `aic status`，不再依赖 AI 自觉执行；
2. **新需求分级**：用户提出新需求时注入分级/建档提醒，在决策点递上流程要求；
3. **编码前 start**：无任务状态的文件编辑上抛用户批准，堵"没 start 就写代码"。

防**失误性绕过**（规则在、被忽略），不防**对抗性绕过**（故意用 Bash echo/sed 绕开——如实写进文档，不做检测）。

## 2. 三层防线

| 层 | 钩子事件 | 行为 | 强度 |
|---|---|---|---|
| 入口提醒 | `UserPromptSubmit` | 消息匹配触发词 → 注入 additionalContext："先复述理解并分级；小改动一句话对齐＋`aic start`；大任务须 PRD/TRD 建档并双首肯后再编码（见 AGENTS.md 引导）" | 提醒（机制上限：不能阻止对话） |
| 过程上抛 | `PreToolUse`（matcher `Edit\|Write\|ApplyPatch`） | 无 `.ai-continue/current.md` 的文件编辑 → 返回 `ask` 权限决策，上抛用户批准；有任务 → 静默放行（exit 0） | **用户拍板** |
| 会话续接 | `SessionStart` | 始终注入 `aic status` 输出：退出码 0 → 状态报告；1 → "无任务"提醒（park/resume 落地后自动含挂起指引）；2 → 修复提示 | 注入 |

设计要点：

- **触发词偏宽**：中文（新需求/新功能/新任务/开始.{0,6}需求|功能|任务/加个功能…）＋英文（new feature / start a task…）。误报代价只是一段提醒，漏报代价是事故重演，不对称故偏宽。
- **不做 deny，做 ask**（用户决策 2026-10-03：小改动不应面对冗长流程）：`ask` 把"允许无任务编辑吗"上抛给流程真正的所有者——用户点一下"允许"即小改动过闸（等价于"一句话对齐"的电子版），拒绝即当场抓住跳流程。CLI 不替用户做主（deny），AI 不替用户做主（放行）。
- **ask 拦截范围从宽**：仓库内一切文件编辑，排除 `.ai-continue/`、`.zcode/`、`.claude/`、`.codex/`、`.git/`、`node_modules/`。摩擦仅一次点击，宽范围零额外成本，文档修改同样应有任务归属。
- **SessionStart 始终注入**：无任务时的"无任务"提醒正是防"开场忘了跑 status"的那一半场景。

## 3. 架构：一个大脑，三张嘴

```
核心（客户端无关）                     适配器（aic init --hooks 铺设 / aic hooks --remove 卸载）
──────────────────────────           ─────────────────────────────────────────────
aic hook <event> --client <x>         Claude Code → .claude/settings.json（合并保留已有配置）
  stdin 收钩子 payload，              Codex       → config.toml [hooks]（含 feature flag 处理）
  stdout 按客户端格式输出             ZCode       → .zcode/config.json（hooks.enabled: true）
  决策/上下文；
  决策逻辑单一实现：                  幂等可重跑，重跑不重复注册；
  - 查 current.md 存在性              卸载按客户端还原
  - 匹配触发词
  - 跑 aic status
```

- **`aic hook` 是 npm 包自带子命令**：包已装在项目里，钩子配置只是各客户端用自己的格式调用它；三份配置不产生三份逻辑。
- **fail-open**：钩子脚本任何异常 → 放行（exit 0）＋日志记录。钩子 bug 绝不能锁死仓库编辑。
- **性能**：钩子同步执行、挂在每次文件编辑上——`aic init --hooks` 生成的配置优先直指本地安装路径（不经 npx 冷启动），npx 形式为后备；开销目标 <100ms 级（TRD 实测定）。

## 4. 边界（不做什么）

- 不做 deny 硬拦。
- 不做 Bash 写入检测（`echo >`、`sed -i` 类绕过：防对抗不在目标内，检测噪音远大于收益）。
- 不验证"PRD 已获用户首肯"（机械不可判，读不到用户脑子；该环节靠流程纪律＋用户把关＋done 验收门禁）。
- v1 不做 `Stop` 事件收尾提醒。
- 不改 CLI 现有命令语义与退出码协议（0/1/2）。

## 5. TRD 阶段实测项（三家客户端）

1. Codex hooks 的 feature flag 开关方式与配置格式（`config.toml [hooks]` vs hooks.json）、payload 结构。
2. `ask` 决策支持度 → 出**能力矩阵**：ZCode（已确认支持）/ Claude Code / Codex（未知）；不支持处适配器自动降级为纯提醒（additionalContext），不降级为 deny。
3. 钩子内调用 aic 的性能（直指路径 vs npx）。
4. payload 取数差异：tool_name、tool_input.file_path（含路径越界判断：编辑是否落在项目内）、prompt 文本。

## 6. 验收标准（草案，PRD 阶段细化）

1. 无任务时编辑 `src/**` 文件 → 弹 ask，文案含"先 aic start；大任务先 PRD/TRD 建档"；用户允许后本次编辑可执行。
2. 有任务时编辑静默放行，无可感知延迟。
3. 用户消息含触发词（中/英）→ 会话注入分级提醒；不含触发词不注入。
4. SessionStart 注入 status 输出，退出码 0/1/2 三态各有正确呈现。
5. `aic init --hooks` 三客户端各自生成正确配置；重跑幂等不重复；`aic hooks --remove` 卸载后配置还原。
6. 钩子脚本人为制造异常 → fail-open 放行且有日志。
7. 排除路径（`.ai-continue/` 等）编辑不触发 ask。

## 7. 与其他工作的顺序

- 本任务**优先于** park/resume 重启（用户决策 2026-10-03；park/resume 设计见 [park-resume.md](./park-resume.md) v3，实现暂存于 git stash）。
- SessionStart 层在 park/resume 落地后**自动获得**挂起提示增强（它注入的是 `aic status` 输出本身，status 变则 hooks 变，无需改 hooks 代码）。

## 8. 已定决策记录

| 日期 | 决策 | 来源 |
|---|---|---|
| 2026-10-03 | 不做 deny 硬拦；过程层用 ask 上抛 | 用户："小改动不应走冗长流程" |
| 2026-10-03 | 通用定位：至少先支持 Claude Code 与 Codex；ZCode 同步做 | 用户："这个 npm 包并不是只给 ZCode 使用" |
| 2026-10-03 | 触发词偏宽、SessionStart 始终注入、fail-open、不做 Bash 检测 | 讨论收敛 |
| 2026-10-03 | 开发顺序：hooks → park/resume（从 stash 重启） | 用户："先撤销 park……然后按顺序开发" |

## 后续微调候选（2026-10-04 用户定调：先使用、观察后调整）

- **allow 疲劳软化**：用户频繁点"允许"时防线退化为注意力（设计哲学边界，不可再机械化）；若真实使用中出现无脑点允许，考虑同会话第 N 次 allow 后提醒文案升级。
- **真机联测补验**：ZCode / Claude Code / Codex 会话内实际触发（弹窗形态、注入呈现、Codex /hooks 信任流程）逐项过一遍能力矩阵——本轮仅完成输出格式与官方文档核对＋payload 级验证。
- **触发词噪音**：偏宽表实际使用后按需收窄（hooks-防绕过 PRD「未确认」区已记录）。
