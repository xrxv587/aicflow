---
task: park-resume
created: 2026-10-05 00:52
---

## 方案概述

按 `product-requirement/park-resume.md` v4 实施：状态机加"挂起"非终态（`parked/` 目录），新增 `aic park` / `aic resume`、`aic done --abandoned`，status 与 hooks SessionStart 双通道补挂起发现，引导加插单小节与动工闸门，全文「首肯」→「确认」。复用 2026-10-03 已验证过的 stash 实现（v3 主体），按 §11 策略取回并叠加 v4 增量。

## 设计决策与选型（含理由）

1. **`archiveTask` 参数化为 `moveTaskGroup(cwd, task, spec, dest: 'archive' | 'parked', abandoned?: boolean)`**：park 与 done 共用同一套整组移动逻辑（rename、指针为准、悬空容错），归档侧零行为变化；`abandoned` 仅在 `dest='archive'` 时给目录名追加 `-abandoned` 后缀（`archive/<时间戳>-<slug>-abandoned/`）。`archiveTask` 保留为薄包装，既有调用与测试不动。
2. **stash 取回机制**：`git checkout stash@{0} -- <文件>` 整文件取回。依据：`src/core/current.ts`、`current.test.ts`、`commands/{start,status,done}.ts`、`core/guide.ts`、`guide.test.ts` 自 stash 基点 a7a3139 后未被 hooks 提交改动，stash 版 = 基线 + v3 实现，可直接落。`index.ts`、README、wiki、AGENTS.md 基线已变，按当前文件手工改。取回后须对照 v4 增量核对（stash 无 `--abandoned`、无 handlers.ts 挂起提示、park 输出是旧版两行）。
3. **`--abandoned` 跳过未完成确认**：done 现有流程中 `undone>0` 时的 TTY confirm 对放弃场景是噪音（`--abandoned` 本身就是放弃声明），一并跳过；结构校验保留（异常仍退出码 2），`-f` 仍跳过全部。与 `--accepted` 互斥 → 报错退出码 1。
4. **resume 指针冲突检测 fail-closed**：恢复前 `stat` 指针目标目录（如 `specs/login-refactor/`），已存在即拒绝（退出码 1），报错点名成因与处理建议，不覆盖、不自动改名。指针是唯一真相（从 archiveTask 原样继承）。
5. **挂起时间来源**：parked 目录名的时间戳前缀（`YYYY-MM-DD_HHMMSS-slug`），resume 解析后用于 mini-status 的"挂起于"展示，不新增任何状态文件。
6. **发现双通道各自实现、措辞对齐**：status.ts 无任务分支与 handlers.ts SessionStart 无任务分支各自调 `listParked()`（一次 readdir），文案统一为 `有 N 个挂起任务，可 aic resume 恢复`；不抽公共文案模块（两处消费场景输出结构不同，抽共享反而耦合）。
7. **退出码沿用既有契约**（`ExitCode`，数值是公开协议勿动）：park 1（无任务）/ 2（结构异常无 -f）；resume 1（无挂起 / 已有任务 / 选择未命中 / 冲突拒绝）；`--abandoned` 互斥 1。

## 影响范围（文件/模块）

| 文件 | 改动 |
|---|---|
| `src/core/current.ts` | `PARKED_DIR`、`moveTaskGroup` 重构（archiveTask 薄包装）、`listParked()`、`resumeTask()`（冲突检测） |
| `src/commands/park.ts`（新） | 挂起：门禁同 done（结构/`-f`）、单行输出 |
| `src/commands/resume.ts`（新） | 清单/选择器/直接恢复、mini-status + 行动提示 |
| `src/commands/done.ts` | `--abandoned`（互斥、跳过验收门禁与未完成确认、后缀命名）、收尾 parked 提示 |
| `src/commands/start.ts` | 已有任务提示改"先 aic done 或 aic park"；成功且 parked 非空追加提示 |
| `src/commands/status.ts` | 无任务分支两行输出 |
| `src/core/hook/handlers.ts` | SessionStart 无任务分支补挂起提示 |
| `src/core/guide.ts` | 插单小节、动工闸门（3.4 改写）、「## 备注」许可、「首肯」→「确认」 |
| `src/index.ts` | 注册 park/resume；start 描述与 `--spec` 拦截文案措辞同步 |
| 测试 | `current.test.ts`、`hook.test.ts`、`guide.test.ts` |
| 文档 | `README.md`、`README.zh-CN.md`、wiki 六页（cli/format/architecture/Home/guide-injection/development）、本仓库 `AGENTS.md` 重注入 |

不影响：`init.ts`、`hooks.ts`/`hook.ts` 命令、hook 管道其余 handler、`acceptance.ts`、`docs.ts`。

## 实施步骤

1. **取回 stash**：`git checkout stash@{0} -- src/core/current.ts src/core/current.test.ts src/core/guide.ts src/core/guide.test.ts src/commands/start.ts src/commands/status.ts src/commands/done.ts`，构建跑测确认 v3 主体绿；stash 取回后即 `git stash drop`（内容已落盘，避免悬空引用）。
2. **core 层 v4 增量**：`current.ts` 加 `moveTaskGroup` 的 `abandoned` 后缀、核对 `listParked`/`resumeTask` 与 §2 语义一致（唯一挂起直接恢复放命令层，core 只提供清单与恢复原语）；`current.test.ts` 补 `--abandoned` 后缀用例。
3. **commands 层 v4 增量**：`park.ts` 输出改单行（stash 版是两行，删建议句）；`resume.ts` 核对 mini-status 文案；`done.ts` 加 `--abandoned`（互斥、跳过对应门禁、传后缀）与收尾 parked 提示；`start.ts` 提示语改写 + parked 提示。
4. **hooks**：`handlers.ts` SessionStart 无任务分支加 `listParked()` 检查与提示行；`hook.test.ts` 补用例。
5. **引导与措辞**：`guide.ts` 加插单小节（含 `--abandoned` 出口）、3.4 改写为动工闸门、「## 备注」许可；全局清扫「首肯」→「确认」（guideText、index.ts `--spec` 拦截文案、start.ts 注释与提示）。
6. **注册命令**：`index.ts` 加 park/resume。
7. **验证**：`yarn build` + 全量测试；冒烟——park → start（看提示）→ done --abandoned（看后缀目录）→ resume（看 mini-status 与冲突拒绝路径）。
8. **文档**：README 双语命令表与文件布局、wiki 六页、本仓库 AGENTS.md 删旧块重跑 `aic init`（含措辞替换）。
9. **验收**：按 PRD 10 条逐条自检写入 PRD「## 验收」，输出验收报告。

## 风险与应对

| 风险 | 应对 |
|---|---|
| stash 版与 v4 设计有偏差未被察觉（如 park 两行输出） | 步骤 1 取回后立即对照 §2 逐节核对；偏差在步骤 2-3 修正，不靠记忆 |
| resume 指针冲突在大小写不敏感文件系统（macOS 默认）漏检 | 冲突检测用 `fs.stat` 实测而非字符串比较；用例覆盖已存在目录场景 |
| `moveTaskGroup` 重构破坏归档行为 | `archiveTask` 薄包装保持签名不变，既有 `current.test.ts` 归档用例原样守护；done 全门禁用例回归 |
| hooks 注入文案与 status 文案将来漂移 | TRD 决策 6 已记录"措辞对齐"约定，wiki cli.md 退出码/文案矩阵标注两处同源语义 |
| `--abandoned` 与 `-f` 组合语义模糊 | 明确：`-f` 跳过结构校验（含放弃场景），`--abandoned` 只豁免验收/未完成门禁；用例覆盖三种组合 |
| AGENTS.md 重注入遗漏导致旧引导（无闸门）残留 | 收尾步骤显式执行删旧块 + `aic init`，验收第 7/9 条核对 |
