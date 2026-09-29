# 架构与代码地图

[← 返回首页](./Home.md)

## 分层结构

```
src/
├── index.ts          # CLI 入口：commander 定义 3 个命令 + 顶层错误兜底
├── commands/         # 每个命令一个入口函数，只做流程编排与终端输出
│   ├── init.ts       #   runInit() + 私有 injectGuide()
│   ├── status.ts     #   runStatus()
│   └── done.ts       #   runDone()
└── core/             # 纯逻辑层，与 commander 无耦合
    ├── breakpoint.ts #   断点文件的常量、类型、渲染、解析校验、读写、归档
    ├── guide.ts      #   AI 引导文案、引导文件探测、幂等标记
    └── prompt.ts     #   readline 封装：ask() / confirm()
```

依赖方向：`index.ts → commands/* → core/*`。core 内部互不依赖，commands 只引用 core。

## 文件与关键导出

### `src/index.ts`
- commander `program`：`aic init [task] [-y]` / `aic status` / `aic done [-f]`，版本 0.1.0。
- `parseAsync().catch()`：**所有未捕获异常的统一出口**——打印 `err.message` 到 stderr 后 `exit(1)`。所以 core 里除 ENOENT 外的 IO 错误会以退出码 1 结束且无堆栈。

### `src/core/breakpoint.ts`
- 常量：`BREAKPOINT_DIR = '.ai-continue'`、`CURRENT_FILE = '.ai-continue/current.md'`、`ARCHIVE_DIR = '.ai-continue/archive'`。
- 类型：`TodoItem {text, done}`、`Breakpoint {task, updated, todos, context}`、`ParseResult`（ok 判别联合）。
- `formatNow(date?)`：本地时间 `YYYY-MM-DD HH:mm`。
- `renderTemplate(task)`：新建断点文件的初始模板（含初始 `updated`）。
- `parse(content)`：**唯一的格式裁判**，返回错误数组。规则详见 [breakpoint-format](./breakpoint-format.md)。
- `readCurrent(cwd)`：读文件；ENOENT → `null`（表示"未初始化"），其他错误直接抛出。
- `writeCurrent(cwd, content)`：`mkdir -p` 后写文件。
- `archiveCurrent(cwd, task)`：把 `current.md` rename 到 `archive/` 下，文件名 = `时间戳-安全化任务名.md`，返回相对路径。

### `src/core/guide.ts`
- `GUIDE_FILES`：探测顺序 `CLAUDE.md > AGENTS.md > .cursorrules > GEMINI.md`。
- `GUIDE_START` / `GUIDE_END`：HTML 注释标记，包围整个注入块。
- `guideText()`：引导文案全文（三段：会话开始 / 阶段完成或会话结束前 / 任务全部完成）。
- `findGuideFiles(cwd)`：返回存在的候选引导文件名列表。
- `hasGuide(content)`：`content.includes(GUIDE_START)`，幂等判断。

### `src/core/prompt.ts`
- `ask(question, fallback?)`：读一行输入，空输入回退 fallback。
- `confirm(question, fallback=false)`：y/yes 判定，提示 `[y/N]` 或 `[Y/n]`。

## 三条数据流

1. **会话开始（读）**：AI 客户端（被注入的引导驱动）→ `aic status` → `readCurrent` → `parse` → 人类可读的任务/进度/上下文输出 → AI 与用户确认后继续。
2. **工作过程（写，绕过 CLI）**：AI **直接编辑** `.ai-continue/current.md`，CLI 不提供编辑命令。这是刻意设计：编辑路径零依赖、任意客户端可用；格式被改坏的风险由 `parse` 的结构校验兜底（`aic status` 退出码 2 会给出具体修复提示）。
3. **任务结束（归档）**：`aic done` → `parse` 校验 + 未完成确认 → `archiveCurrent` rename 到 `archive/`。

## 设计决策

| 决策 | 理由 |
|---|---|
| 工具无模型依赖、无服务端 | 所有智能在用户 AI 客户端；CLI 只做状态存取与校验，可离线、可审计 |
| 校验单一出口（`parse`） | status 用它展示、done 用它拦截、init 用它读任务名，三处行为一致 |
| 引导注入用标记做幂等 | 重复 `aic init` 不会重复注入同一份引导 |
| 进度更新不经命令 | AI 直接编辑文件，避免为编辑行为设计 CLI 协议 |
| 所有路径基于 `process.cwd()`，**不向上查找父目录** | 简单可预期；代价是在项目子目录里运行会得到"尚未初始化" |
| `.gitignore` 不忽略 `.ai-continue/` | 断点随仓库提交，团队成员 / 其他会话都能看到任务状态 |

## 边界行为清单（改代码 / 排查前先看）

- `readCurrent` 只把 ENOENT 当"未初始化"；权限错误等其他 IO 异常直接抛到顶层 `exit(1)`。
- `init` 时已存在 `current.md`：只提示当前任务名并正常退出（退出码 0），**绝不覆盖**；结构损坏时任务名显示为"（结构异常，见 aic status）"。
- `init -y` 且有多个待注入引导文件：**静默注入第一个**（按探测顺序中第一个不含标记的），不询问。
- 引导追加的分隔符：目标文件末尾无换行 → 补 `\n\n`；已有换行 → 补 `\n`。
- `init -y` 没有默认任务名——任务名仍必须提供，否则退出码 1。
- `done --force` 在结构损坏时拿不到解析结果（data=null），归档文件名的任务段回退为 `task`。
- `parse` 对首行用 `trim()` 判断 `---`（允许行首空白），但闭合的 `---` 必须是整行精确匹配（`indexOf('---', 1)`）。
- 同名 `##` 章节出现多次时内容会**合并**进同一个 key（`splitSections` 只在首次出现时建数组）。
- 「## 待办」「## 上下文」之外的章节**允许存在且被忽略**，不报错。
- `updated` 缺失时 `aic status` 显示"未知"，不影响退出码。
