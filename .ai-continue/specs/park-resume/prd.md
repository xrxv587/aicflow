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

## 验收
> 按「已确认 · 验收标准」逐条自检：`- [x] 标准 —— 通过，证据：…`。全部通过并获用户认可后才可 `aic done --accepted`。
