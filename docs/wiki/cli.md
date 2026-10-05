# 命令参考

[← 返回首页](./Home.md)

通用约定：所有命令以 **`process.cwd()` 为项目根**，不会向上查找父目录；断点文件固定为 `.ai-continue/current.md`。

命令的使用者：`init` 偏人（一次性接入）；`start` / `status` / `done` / `park` / `resume` 主要由 **AI 按引导调用**（PRD/TRD 双确认且用户许可动工后 start、会话开始 status、验收获认可后 done、插单先 park、恢复挂起 resume），人随时可手动跑兜底，TTY 下交互确认代替 `--accepted`。另有钩子管道命令 `hook` / `hooks`（行为详见 [hooks](./hooks.md)）。

---

## `aic init [-y]`

项目初始化：注入 AI 引导 + 铺设 PRD/TRD 模板。幂等，可重复执行。

流程：

1. 引导注入（详见 [guide-injection](./guide-injection.md)）：
   - 无候选引导文件 → 确认后创建 `AGENTS.md` 写入引导；拒绝则打印全文供手动粘贴。
   - 有候选 → 已含引导的跳过；无引导的列为追加目标；标记未闭合的跳过并警告。
   - 多目标且非 `-y` → 选序号（回车默认第一个）；单目标且非 `-y` → 确认。
2. 铺模板：建 `.ai-continue/templates/`，写入 `prd.md` 与 `trd.md`；**存在即跳过**（尊重项目自定义）。
3. `--hooks`：铺设三客户端（Claude Code / Codex / ZCode）钩子配置，幂等、只增删自身条目；前置要求本项目已安装 aicflow，缺失则跳过并警告；输出明示 Codex 须 `/hooks` 信任及其 ask 降级（详见 [hooks](./hooks.md)）。
4. 带任务名参数（`aic init <任务名>`）→ 报错提示改用 `aic start`，退出码 1。

---

## `aic start [任务名] [-y]`

开始一个新任务：创建 current.md（状态文件出生）。**PRD/TRD 不经此命令**——大任务由 AI 按引导先建文档、双确认且用户许可动工后再 start，指针随后写入 frontmatter。

流程：

1. `readCurrent` 发现已存在 `current.md` → 打印当前任务名（结构损坏时打印"（结构异常，见 aic status）"）并提示"请先 aic done（已完成）或 aic park（挂起未完成）"，**直接返回，不覆盖**（退出码 0）。
2. 任务名来自参数；未给且非 `-y` 时交互询问；最终为空 → 退出码 1。**`-y` 不提供默认任务名**。
3. 写 `current.md`：frontmatter 含 `task`/`updated`（**不含 spec 指针**），章节为「## 待办」「## 下一步」。
4. 引导检查：未检测到 AI 引导时打印一行提示，建议 `aic init`（不阻塞、不交互）。
5. `parked/` 非空 → 追加一行 `注意：还有 N 个挂起任务（aic resume 可恢复）。`（堵"任务烂在 parked/ 里"的遗忘路径）。
6. 传 `--spec` → 报错说明 PRD/TRD 由 AI 按引导生成（隐藏选项截获，退出码 1）。

---

## `aic status`

查看当前任务进度与下一步。**AI 会话开始时执行的命令**：要么给出可继续的状态，要么给出明确的修复提示。

**无任务分支**：`parked/` 为空时输出 `尚未开始任务：请先运行 aic start <任务名>`（现状不变）；`parked/` 非空时改为两行——`尚未开始任务：可 aic start <任务名> 开新任务` + `有 N 个挂起任务，可 aic resume 恢复`。退出码仍为 1（"无任务"语义不变，挂起提示是附加行）。注意：hooks 的 SessionStart 注入不走 status 命令，其无任务文案由 `handlers.ts` 独立输出，两处措辞须同步维护。

输出结构：

```
任务：<task>
更新时间：<updated 或 未知>
进度：<done>/<total> 已完成（<状态>）
需求：<spec 指针>                        ← 仅当 frontmatter 有 spec；悬空时附 ⚠ 警告
验收：已记录 / 未记录                    ← PRD 可读时显示（判据：「## 验收」有 checkbox 条目）

下一步：
  <下一步内容>                           ← 未设置且任务未完成时显示填写建议

待办：
  [x] 已完成条目
  [ ] 未完成条目
```

状态字段：无待办条目 → `尚无待办条目`；全部勾选 → `全部完成，可验收后 aic done 归档`；否则 → `进行中`。

结构校验失败（退出码 2）时逐条打印 `parse` 错误，指引修复 `current.md`。

---

## `aic done [-f | --force] [--accepted] [--abandoned]`

归档当前任务：**整组移动**到 `.ai-continue/archive/<时间戳>-<slug>/`——`current.md` 必归档，有 spec 指针时整个需求目录（PRD/TRD）一并移入（归档内改名 `spec/`）。**移动以指针值为准**，不按任务名重算。带 `--abandoned` 时目录名追加 `-abandoned` 后缀（`archive/<时间戳>-<slug>-abandoned/`），与"做完"在历史上一眼可辨；CLI 不碰文件内容，git 下是纯 rename。

流程（按顺序的门禁）：

1. `--accepted` 与 `--abandoned` 同时给出 → 拒绝，退出码 1。
2. 未开始任务 → 退出码 1。
3. `parse` 结构异常且非 `--force` → 打印错误，退出码 2（`--abandoned` 也照常校验）。
4. 有未完成待办且非 `--force` 且非 `--abandoned` → 列出并 `confirm`（默认 N）；取消则正常退出。`--abandoned` 本身就是放弃声明，未完成确认是噪音，豁免。
5. **验收门禁**（仅当 spec 指针存在且非 `--force` 且非 `--abandoned`；放弃无验收可言）：
   - PRD 读不到（指针悬空）→ 拒绝，退出码 1；
   - PRD「## 验收」章节没有 checkbox 记录（模板空骨架不算）→ 拒绝并提示先逐条自检落盘，退出码 1；
   - 无 `--accepted`：终端是 TTY（人手动跑）→ 交互确认代替；非 TTY（AI 跑）→ 拒绝并提示"先输出验收报告、获用户认可后带 --accepted 重试"，退出码 1。
   - `--accepted` 语义 = AI 声明"验收已获用户认可"，CLI 无法验证声明的真实性，强制的是证据链（验收记录）与显式动作。
6. 整组归档；指针悬空（仅 `--force` 可达）时仅归档 current.md 并打印 ⚠；`--force` 下解析失败时归档名任务段回退 `task`。

无 PRD 的小任务不设验收门禁（分级豁免）：未完成确认通过即可归档。`-f/--force` 跳过全部门禁。

收尾提示：`parked/` 非空时补 `或 aic resume 恢复挂起的任务（N 个）。`——done 完正是"开新任务还是捡旧的"的决策点；否则输出原有的 `可运行 aic start <新任务名> 开始下一个任务。`

---

## `aic park [-f | --force]`

挂起当前任务：current.md + spec 指针所指需求目录**整组移动**到 `.ai-continue/parked/<时间戳>-<slug>/`。纯 rename、不碰文件内容（「## 备注」等草稿区随卡同行）；**不碰代码**——工作区半成品改动原样保留，处置（commit/stash/不动）完全由用户自行决定，CLI 不提示不建议、AI 不参与。

- 无任务 → 退出码 1。
- 结构异常且无 `-f` → 打印错误、退出码 2（与 done 一致）；`-f` 下 slug 回退 `task`、无法读指针则只移 current.md 并 ⚠ 提示（与 done 一致）。
- **无确认交互**：park 可逆、不产生"完成"声明，未完成确认是噪音；AI 非交互可无障碍执行。
- 成功输出单行：`已挂起任务：<task> → <目录>（可 aic resume 恢复）`。

挂起与放弃构成完整出口语义：**做完（done --accepted）/ 暂存（park）/ 放弃（done --abandoned）**。

---

## `aic resume [选择]`

恢复挂起的任务：`parked/<目录>/current.md` 移回 `.ai-continue/current.md`；有 spec 时 `parked/<目录>/spec/` 移回**指针所指定的路径**（指针是唯一真相）。

- 没有挂起任务 → 退出码 1。
- **current.md 已存在 → 拒绝**（退出码 1），提示"已有进行中的任务 xxx，先 aic done 或 aic park"。状态迁移显式，不做隐式 auto-park。
- 无参数：恰好 1 个挂起 → **直接恢复**（确认环节放对话层，命令层保持确定性）；多个 → 列出清单（新→旧）、TTY 问序号默认 1、非 TTY 打印清单并退出码 1（AI 看清单后带选择器重试）。
- 选择器：纯数字按清单序号；否则按任务名/目录名做**唯一**子串匹配，命中 0 个或多个都报错并列出候选。
- **指针路径冲突 → 拒绝**（fail-closed，尚未移动任何文件）：报错点名成因——`specs/<目录>/ 已存在——可能是挂起期间有同名任务建过档，请确认目录归属后处理（不覆盖、不自动改名）。`
- **恢复后输出 mini-status**：任务名、进度、挂起时间（取自目录名时间戳前缀）、「下一步」、行动提示（重读 PRD/TRD、核对下一步仍成立）。恢复时顺带 parse 一次，结构有问题不拦截（文件自挂起那一刻就没变过），只 ⚠ 建议跑 `aic status`。

---

## `aic hook <事件> --client <id>` 与 `aic hooks [--remove]`

钩子管道与接入管理，完整行为（三层防线、能力矩阵、安装/卸载）见 [hooks](./hooks.md)。

- `aic hook`：由客户端钩子配置调用（配置直指轻量入口 `dist/hook.js`），stdin 收 payload、stdout 出决策/注入 JSON；也可手动喂样例 payload 调试。正常路径恒退出码 0（拦截/注入语义由 stdout 表达），参数错误 → 1。
- `aic hooks`：查看/重铺三客户端接入状态（等价 `aic init --hooks` 的铺设动作）。
- `aic hooks --remove`：按 `dist/hook.js` 特征移除自身条目；用户自有钩子与 ZCode `hooks.enabled` 不动。

---

## 退出码矩阵

| 命令 | 0 | 1 | 2 |
|---|---|---|---|
| `init` | 正常完成 / 已存在跳过 / 用户拒绝注入 / 钩子缺失跳过并警告 | 带任务名参数 | — |
| `start` | 正常完成 / 已有任务跳过 | 任务名为空 / 传 `--spec` | — |
| `status` | 正常输出（含指针悬空警告；无任务且有挂起时两行提示仍为 1） | 未开始任务 | current.md 结构异常（附修复提示） |
| `done` | 归档完成（含 `--abandoned`）/ 用户取消归档 | 未开始任务 / `--accepted` 与 `--abandoned` 互斥 / 验收门禁拒绝（悬空、无验收记录、缺 `--accepted`） | 结构异常且未 `--force` |
| `park` | 挂起完成 | 未开始任务 | 结构异常且未 `--force` |
| `resume` | 恢复完成 | 无挂起任务 / 已有进行中任务 / 多挂起未给选择（非 TTY）/ 选择未命中或多命中 / 指针路径冲突 | — |
| `hook` | 正常处理（含 ask/注入/静默放行与 fail-open） | 事件名或 client 参数错误 | — |
| `hooks` | 查看 / 铺设 / 卸载完成 | 未安装 aicflow（铺设路径缺失） | — |
| 任意 | — | 顶层未捕获异常（仅打印 message） | — |

退出码是给 AI 客户端的协议：`1` = 没有任务可续或门禁拒绝，`2` = 状态文件坏了需要先修。spec 指针悬空属于警告，**不影响退出码**。修改任何命令时不要破坏这套语义。
