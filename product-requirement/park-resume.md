# 方案 A：任务挂起与恢复（aic park / aic resume）

- 状态：设计稿，待拍板（见文末「待决策」）
- 日期：2026-10-02
- 背景：当前是严格单任务状态机，插单只有 `aic done --force` 一条路，且 force 归档不留"未完成"标记、无法恢复，污染留痕历史

## 1. 状态机变化

```
现在：  无任务 ──start──> 进行中 ──done──> 归档（终态）

方案A：  无任务 ──start──> 进行中 ──done──> 归档（终态）
                          │  ↑
                        park  resume
                          ↓  │
                         挂起（可多个并存，非终态）
```

核心不变量保持不变：**current.md 这个槽位永远最多一个任务**。"进行中"依然严格单任务，插单不是多任务并行，而是"把当前任务完整移出去、腾出槽位"。挂起目录允许多个并存。

## 2. 命令行为

### `aic park`（挂起当前任务）

- 无任务 → 退出码 1。
- current.md 结构异常且无 `-f` → 打印错误、退出码 2（与 done 一致）；`-f` 下 slug 回退 `task`、无法读指针则只移 current.md 并 ⚠ 提示（与 done 一致）。
- 正常路径：把 current.md + spec 指针指向的需求目录**整组移动**到 `parked/`，**不改动文件内容**——park 是纯 rename，CLI 不碰 current.md 内容（与 archiveTask 行为一致）。
- **无任何确认交互**。理由：park 本身就是"这任务没做完"的正常表达，未完成确认是噪音；操作完全可逆、不产生"完成"声明，不像 done 需要防误触。AI 在非 TTY 下可无障碍执行。
- 完成后打印：`已挂起任务 xxx → .ai-continue/parked/<时间戳>-<slug>/，可 aic resume 恢复`。

### `aic resume [选择]`

- 没有挂起任务 → 退出码 1。
- **current.md 已存在 → 拒绝**（退出码 1），提示"已有进行中的任务 xxx，先 aic done 或 aic park"。不做隐式 auto-park——状态迁移必须显式。（"自动交换"留作以后的 `--swap` 扩展，第一版不做。）
- 无参数：
  - 恰好 1 个挂起 → **直接恢复**（打印恢复内容）；
  - 多个 → 列出清单（新→旧）、TTY 问序号默认 1、非 TTY 打印清单并退出码 1，让 AI 看清单后带选择器重试。
- 选择器：纯数字按清单序号；否则按任务名/目录名做**唯一**子串匹配，命中 0 个或多个都报错并列出候选。数字会因新挂起而漂移，子串匹配给 AI 更稳的抓手。
- 恢复动作：`parked/<目录>/current.md` 移回 `.ai-continue/current.md`；若有 spec，`parked/<目录>/spec/` 移回**指针所指定的路径**（如 `specs/login-refactor/`——指针是唯一真相，从 archiveTask 原样继承）。
- **恢复时指针路径冲突 → 拒绝**（fail-closed）：如挂起期间新任务建了同名 specs 目录。不覆盖、不自动改名，报错让用户决定。
- 恢复后顺带 parse 一次，结构有问题不拦截（文件从挂起那一刻就没变过），只 ⚠ 提示跑 `aic status` 看修复建议。

### `aic status` 的小改动

无任务且 `parked/` 非空时，在"尚未开始任务"后面补一行：`有 N 个挂起任务，可 aic resume 恢复`。这是会话续接的关键一环——AI 开场跑 status，否则发现不了被挂起的工作。有进行中任务时不提挂起（避免噪音）。

## 3. 存储结构

```
.ai-continue/
├── current.md
├── parked/
│   └── 2026-10-02_143005-login-refactor/   # 命名规则与 archive 完全一致
│       ├── current.md                       # 原样，未完成待办都在
│       └── spec/{prd.md, trd.md}           # 整组随行，PRD「未确认」里的中途发现也在
├── specs/
├── templates/
└── archive/
```

实现：把 `archiveTask(cwd, task, spec)` 参数化为 `moveTaskGroup(cwd, task, spec, 'archive' | 'parked')`，park 与 done 共用同一套移动逻辑，归档侧零行为变化。随 Git 提交、团队共享的语义不变。

## 4. 引导文案（guideText）改动

在「收到新需求时」和「会话开始时」之间加一小节：

> ### 插入新需求（任务切换）
> 当前有进行中任务而新需求更紧急时：`aic park` 挂起当前任务（断点与文档整组保存、可随时恢复），`aic start` 开新任务；插入任务完成后 `aic resume` 恢复原任务，从「## 下一步」接续。**不得用 `aic done --force` 处理未完成任务**——force 归档在历史上看起来像"已完成"。

「会话开始时」加一条：status 提示有挂起任务时，与用户确认是否恢复。

已知限制（沿用现状）：引导只影响之后的注入，已注入的项目要手动删旧块重跑 init。

## 5. 波及面与工作量

| 改动 | 内容 |
|---|---|
| `core/current.ts` | `PARKED_DIR` 常量、`moveTaskGroup` 重构、`listParked()`、`resumeTask()`（含冲突检测），约 100 行 |
| `commands/` | `park.ts`、`resume.ts` 两个编排函数，status.ts 加一行提示，约 120 行 |
| `index.ts` | 注册两个命令 |
| 测试 | `current.test.ts` 补 park/resume/listParked 用例（挂起→恢复往返、指针冲突、多挂起、无内容篡改） |
| 文档 | README 双语命令表与文件布局、wiki 五页：cli.md（命令节+退出码矩阵）、format.md（目录布局）、architecture.md（状态机+数据流）、Home.md（工作循环）、guide-injection.md（引导变五节）、development.md（冒烟流程加 park→resume 路径） |

代码量约 300 行以内（含测试），文档更新量与代码相当。退出码协议不变：park 的 1/2、resume 的 1 沿用"1=没有可操作对象或拒绝、2=状态坏了"的既有语义，AI 客户端无新概念。

## 6. 待决策

1. **park 要不要加确认**：建议不加（可逆、无声明性、AI 非交互友好）；如担心误触可加 TTY 确认默认 Y。
2. **resume 恰好一个挂起时要不要直接恢复**：建议直接恢复，确认环节放在对话层（AI 问用户"要恢复吗"），命令层保持确定性。
3. **`aic done --abandoned` 要不要一起做**：park 落地后"force 归档半成品"就只剩"确定不要了"的场景，`--abandoned`（归档时打放弃标记）与 park 正好构成完整的出口语义（放弃 vs 暂存），一起做很顺；不做也不影响 park 本身。
