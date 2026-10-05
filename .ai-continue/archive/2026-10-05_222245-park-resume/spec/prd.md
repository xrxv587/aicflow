---
requirement: 任务挂起与恢复（park/resume）＋ 放弃归档 ＋ 动工闸门
created: 2026-10-05 00:37
---

## 已确认
> 经用户确认的需求共识。AI 不得擅自修改；变更须先进「## 未确认」并征得用户同意。

### 目标

为 aic 的严格单任务状态机补齐"未完成"的出口语义，并收紧动工纪律（权威设计：`product-requirement/park-resume.md` v4）：

1. **挂起/恢复**：`aic park` 把当前任务（current.md + spec 整组）移入 `.ai-continue/parked/`，可 `aic resume` 恢复；插单不再依赖 `aic done --force` 污染历史。
2. **放弃归档**：`aic done --abandoned` 归档确定作废的任务，归档目录带 `-abandoned` 后缀标记，与"做完"在历史上一眼可辨。
3. **动工闸门**：引导改为——TRD 确认 ≠ 动工许可，须用户明确说"可以实施"才 `aic start` 编码。
4. **hooks 补缺**：SessionStart 注入的无任务分支补挂起提示（hooks 落地后 AI 可能不再跑 `aic status`，挂起任务不能失去发现通道）。

### 边界（不做什么）

1. park **只移文档、不碰代码**：工作区半成品改动不提示、不建议、AI 不参与处置（commit/stash 与否由用户自行决定）；不做 git 脏区检测。
2. 不做 `--swap`（resume 时隐式 auto-park 当前任务）。
3. 不做完整"上下文总结保存/加载机制"；只加 current.md「## 备注」草稿区许可（格式零改动）。
4. 引导不新增"常驻义务"；恢复后重读 PRD/TRD 的纪律放 resume 命令输出，不进引导。
5. hooks 的 ASK_REASON / PROMPT_REMINDER 文案**不加**挂起提示（发现职责由 SessionStart 注入承担）。
6. npm 包名与 bin 名不一致问题（v3 文档 §9）范围外，单独处理。
7. 状态机不变量不变：current.md 槽位永远最多一个任务；"进行中"严格单任务。

### 验收标准

1. `aic park`：整组移动 current.md + spec 至 `parked/<时间戳>-<slug>/`，文件内容零篡改；单行输出；无任务退出码 1、结构异常退出码 2（无 `-f`）。
2. `aic resume`：恰好 1 个挂起直接恢复；多个列清单/选择器；指针路径冲突 fail-closed 拒绝；恢复后输出 mini-status（进度/下一步/挂起时间）+ 重读 PRD/TRD 提示；无挂起或有进行中任务退出码 1。
3. `aic done --abandoned`：归档目录名带 `-abandoned` 后缀；跳过验收门禁；与 `--accepted` 同时给出报错退出码 1；结构检查与普通 done 一致。
4. `aic status`：无任务且 parked 非空输出两行（含挂起数量提示），退出码仍 1。
5. hooks SessionStart：无任务且 parked 非空时，注入文案含挂起提示行，措辞与 status 对齐。
6. 联动修正：start 已有任务提示改"先 aic done 或 aic park"；start 成功且 parked 非空追加提示；done 收尾 parked 非空补 resume 提示。
7. 引导文案（guideText）：插单小节（park → start → resume，禁 force 处理未完成、放弃用 `--abandoned`）；会话开始确认恢复；「## 备注」许可；TRD 确认后须获用户明确动工许可才 `aic start`。
8. 单测覆盖：挂起→恢复往返、多挂起、指针冲突、无内容篡改、`-abandoned` 后缀、参数互斥、SessionStart 挂起提示；全量测试通过，冒烟走通 park → start → done → resume 与 done --abandoned 路径。
9. 文档同步：README 双语、wiki（cli/format/architecture/Home/guide-injection/development）、本仓库 AGENTS.md 手动重注入。
10. 措辞统一：注入与输出的面向用户的文案中「首肯」一律写作「确认」（guideText、hooks PROMPT_REMINDER、start.ts 等命令输出、README/wiki/AGENTS.md 随第 9 条同步；设计文档与 PRD 已先行替换）。

## 未确认
> 执行途中的疑问、倾向、已验证但未背书的发现。用户确认后上移到「## 已确认」，判定无关则删除。

### code-review（high）留观项（2026-10-05，用户决策：单会话使用，暂不修）

1. moveTaskGroup 同秒同名碰撞：archive 侧既有行为，park 经共用重构继承；单会话脚本化 park→resume→park 循环才可能触发。可加存在即递增后缀。
2. `abandoned` 参数在 dest='parked' 时静默忽略，参数形状误导调用方；可把后缀逻辑收进 archiveTask。
3. 挂起提示文案四处复制（done/start/status/handlers），措辞已现微漂移；可收敛为 core 共享常量。
4. resume 的 mini-status 与 status 重复实现进度/下一步提取；可共享助手防分叉。
5. 多客户端并发覆盖窗口（resume 选择等待期间他方建卡被覆盖）：用户确认不会多 agent 同仓操作，不修；若未来支持并发需给 current.md 恢复加 fail-closed 复查。

## 验收
> 按「已确认 · 验收标准」逐条自检：`- [x] 标准 —— 通过，证据：…`。全部通过并获用户认可后才可 `aic done --accepted`。

- [x] 1. park 整组移动/零篡改/单行输出/退出码 —— 通过，证据：current.test.ts「park → resume 往返」（内容字节相等）与「指针悬空」用例；冒烟 §1/§5 单行输出；park 无任务 exit=1（补验）、结构异常退出码 2 与 done 共用同一门禁分支
- [x] 2. resume 全路径 —— 通过，证据：冒烟 §7（多挂起非 TTY 列清单 exit=1）、§8（子串选择 + mini-status：进度 1/2、挂起时间、下一步、行动提示）；单测「指针冲突 fail-closed：拒绝且两侧不动」；补验无挂起 exit=1、已有进行中任务 exit=1
- [x] 3. done --abandoned —— 通过，证据：冒烟 §6（archive/2026-10-05_122639-抛弃任务-abandoned/）、§10（--accepted 与 --abandoned 互斥 exit=1）；current.test.ts「-abandoned 后缀」用例（parked 目标不受 abandoned 影响）；豁免验收门禁由 done.ts 门禁条件 `&& !abandoned` 保证，结构校验保持
- [x] 4. status 两行输出 —— 通过，证据：冒烟 §2（两行 + exit=1）；parked 为空时保持原文案（代码分支）
- [x] 5. hooks SessionStart 挂起提示 —— 通过，证据：hook.test.ts「SessionStart 无任务且 parked/ 非空 → 注入挂起提示」，断言文案与 status 措辞对齐；parked 为空不提挂起
- [x] 6. 三处联动修正 —— 通过，证据：冒烟 §3（start 提示"还有 1 个挂起任务"）、§4（start 已有任务提示"先 aic done（已完成）或 aic park（挂起未完成）"）、§6（done 收尾"或 aic resume 恢复挂起的任务（2 个）"）
- [x] 7. 引导文案 —— 通过，证据：guide.test.ts 四组断言（插入新需求协议、动工闸门「TRD 确认 ≠ 动工许可」、备注许可与恢复确认、「首肯」禁用）；本仓库 AGENTS.md 已删旧块重注入（grep 动工闸门/插入新需求 命中，「首肯」0 处）
- [x] 8. 单测与冒烟 —— 通过，证据：yarn test 36/36 全绿（新增 10 例：park/resume 往返、排序、parked 不存在、指针冲突、悬空指针、abandoned 后缀、SessionStart 挂起提示、引导 3 组）；冒烟 10 步 + 补验 3 步全过
- [x] 9. 文档同步 —— 通过，证据：README 双语（工作循环、命令表、文件布局）、wiki 六页（cli 命令节+park/resume 节+退出码矩阵、format parked/ 布局+备注区、architecture 状态机/数据流五条/边界清单、Home 工作循环+决策记录、guide-injection 五段、development 冒烟补插单路径）、AGENTS.md 重注入
- [x] 10. 措辞统一 —— 通过，证据：`grep -rn 首肯 src docs README* AGENTS.md product-requirement` 仅剩 3 处：guide.test.ts 的负向断言（防回归，有意保留）、product-requirement/hooks.md 的 3 处历史记述（2026-10-03 事件记录，非面向用户输出，保留历史原貌）

> 复审轮（2026-10-05，code-review high）：发现 5 项必修已全部修复并补 3 例单测（fresh-clone spec 父目录缺失自动补齐、缺任务卡友好报错、guide 标题更名防回退）＋命令层 2 项（纯数字名精确匹配优先、挂起时间显示到秒）；39/39 全绿，冒烟复核通过。留观 5 项记入「未确认」。
