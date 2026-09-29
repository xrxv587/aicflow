# 架构与代码地图

[← 返回首页](./Home.md)

## 两层设计

```
CLI（aic）＝工件 + 状态 + 门禁              AGENTS.md 引导＝工作流规范
├─ init：注入引导 + 铺 PRD/TRD 模板         ├─ 入口：复述→分级→共识
├─ start：current.md 出生                   ├─ PRD：AI 起草→用户首肯
├─ status：读取 + 校验                      ├─ TRD：AI 调研代码库起草→用户首肯
└─ done：验收门禁 + 归档                    ├─ 续接：会话开始 aic status
                                           ├─ 执行：直接编辑文件
                                           └─ 出口：先验收后归档
```

判断归属的尺子：**CLI 解析/拦截什么，什么就留在命令里；CLI 只读不写的，生成权归 AI**。current.md 是被 parse 的状态文件，出生结构由代码保证（start）；PRD/TRD 只被读（指针存在性、验收记录），由 AI 按引导复制模板生成。

## 分层结构

```
src/
├── index.ts          # CLI 入口：commander 定义 4 个命令 + 顶层错误兜底
├── commands/         # 每个命令一个入口函数，只做流程编排与终端输出
│   ├── init.ts       #   runInit() + 私有 injectGuide()（注入引导，幂等）
│   ├── start.ts      #   runStart()（开新任务：建 current.md）
│   ├── status.ts     #   runStatus()
│   └── done.ts       #   runDone()
└── core/             # 纯逻辑层，与 commander 无耦合（*.test.ts 为单测）
    ├── current.ts    #   current.md 的常量、类型、渲染、解析校验、读写、整组归档
    ├── docs.ts       #   PRD/TRD 模板常量 + layTemplates()（铺设，存在即跳过）
    ├── guide.ts      #   引导文案、块识别（none/present/malformed）
    ├── acceptance.ts #   hasAcceptanceRecord()（验收门禁判据）
    └── prompt.ts     #   readline 封装：ask() / confirm()
```

依赖方向：`index.ts → commands/* → core/*`。core 内部只有 docs.ts → current.ts 单向依赖（复用 `AI_DIR`）；commands 只引用 core。

## 文件与关键导出

### `src/index.ts`
- commander `program`：`aic init [-y]` / `aic start [task] [-y]` / `aic status` / `aic done [-f] [--accepted]`，版本 0.1.0。
- 旧用法拦截：`aic init <任务名>` 与 `aic start --spec` 均在 action 里报错并给中文指引（`--spec` 为隐藏选项，仅为截获报错）。
- `parseAsync().catch()`：**所有未捕获异常的统一出口**——打印 `err.message` 到 stderr 后 `exit(1)`。

### `src/core/current.ts`
- 常量：`AI_DIR`、`CURRENT_FILE`、`ARCHIVE_DIR`。
- 类型：`TodoItem`、`TaskState {task, updated, spec, next, todos}`、`ParseResult`。
- `slugify(task)`：仅用于归档目录命名；specs 目录名由 AI 按引导的同类规则自取。
- `renderTemplate(task)`：current.md 出生模板，**不含 spec 指针**（由 AI 建档后写入 frontmatter）。
- `parse(content)`：**唯一的格式裁判**，规则详见 [format](./format.md)。
- `readCurrent` / `writeCurrent`：读写 current.md；ENOENT → `null` 表示未开始任务。
- `specDirPath` / `prdFilePath`：把 frontmatter 的 `spec` 值解析为绝对路径（相对 `.ai-continue/`）。
- `archiveTask(cwd, task, spec)`：整组归档 → `archive/<时间戳>-<slug>/{current.md, spec/}`；**以指针值为准移动需求目录**（不按任务名重算，避免与 AI 自取的目录名不一致）；指针悬空时返回 `specMissing` 不阻断。

### `src/core/docs.ts`
- `PRD_TEMPLATE` / `TRD_TEMPLATE`：模板全文（占位符 `<需求名>`、`<任务名>`、`<YYYY-MM-DD HH:mm>`）。
- `layTemplates(cwd)`：铺设到 `.ai-continue/templates/`，存在即跳过（尊重项目自定义）。

### `src/core/guide.ts`
- `GUIDE_FILES`：探测顺序 `CLAUDE.md > AGENTS.md > .cursorrules > GEMINI.md`。
- `guideText()`：引导全文（工作流四段：收到新需求 / 会话开始 / 执行中 / 先验收后归档）。
- `scanGuide(content)`：`none` / `present`（跳过）/ `malformed`（有 start 无 end，跳过并警告）。标记无版本号。

### `src/core/acceptance.ts`
- `hasAcceptanceRecord(content)`：「## 验收」章节内是否有 checkbox 条目——**模板自带的空章节不算**，门禁判据是条目而非章节存在。

### `src/core/prompt.ts`
- `ask(question, fallback?)`、`confirm(question, fallback=false)`：readline 封装。

## 数据流（四条）

1. **需求入口（对话 + AI 建档，CLI 只出生状态）**：AI 按引导确认目标/边界/验收 → 复制模板写 `specs/<任务>/prd.md` → 用户首肯 → AI 调研后写 `trd.md` → 用户首肯 → `aic start <任务名>` → AI 把 `spec:` 指针写入 frontmatter → 编码。小改动一句话对齐 + `aic start` 即做，不建文档。
2. **会话开始（读）**：AI 执行 `aic status` → 读 current.md → parse → 输出任务/进度/下一步/需求与验收状态 → 确认后从「下一步」接续。PRD/TRD 按需再读。
3. **执行中（写，绕过 CLI）**：AI 直接编辑 current.md（待办、下一步、updated）；需求类发现写 PRD「未确认」，动「已确认」须先经用户；方案级调整先改 TRD。格式被改坏由 `parse` 校验兜底（status 退出码 2）。
4. **结束（验收 → 归档）**：AI 按 PRD 验收标准逐条自检并写「验收」区 → 输出验收报告获用户认可 → `aic done --accepted` → 结构校验 + 未完成确认 + **验收门禁** → `archiveTask` 整组移动。

## 设计决策

| 决策 | 理由 |
|---|---|
| 两层：CLI 管工件/状态/门禁，引导管工作流 | 智能在 AI 客户端；CLI 越界生成内容（旧 `--spec`）会把工作流判断搬进命令 |
| start/done 是命令而非 AI 自由编辑 | 它们是状态机（无任务→进行中→已归档）的迁移边；边留在命令里才有单任务守卫与硬门禁 |
| PRD/TRD 由 AI 复制模板生成 | CLI 只读不写；复制优于重打（漂移率低）；模板是仓库文件，项目可自定义 |
| 门禁 fail-closed | 格式漂移最多导致被拦下修正，不会放水未验收任务 |
| 归档以指针为准移动目录 | AI 自取的目录名与 slugify 可能不一致，指针是唯一真相 |
| 工具无模型依赖、无服务端 | 所有智能在用户 AI 客户端；CLI 只做状态存取与校验 |
| 校验单一出口（`parse`） | status / done / start 三处行为一致 |
| 所有路径基于 `process.cwd()`，**不向上查找** | 简单可预期；子目录运行会得到"尚未开始任务" |
| `.gitignore` 不忽略 `.ai-continue/` | 断点与需求文档随仓库提交，团队共享 |

## 边界行为清单（改代码 / 排查前先看）

- `readCurrent` 只把 ENOENT 当"未开始任务"；其他 IO 异常抛到顶层 `exit(1)`。
- `start` 已存在 current.md：只提示任务名并正常退出（退出码 0），**绝不覆盖**；结构损坏时显示"（结构异常，见 aic status）"。
- `start -y` 没有默认任务名——不带任务名照样退出码 1。
- `start` 不注入引导、不建 PRD/TRD；检测不到引导时打印一行提示建议 `aic init`。
- `init` 带任务名参数：报错提示改用 `aic start`，退出码 1。
- 引导注入与模板铺设均为"存在即跳过"；引导标记未闭合（有 start 无 end）的文件跳过并警告，绝不盲改。
- `status` 的 spec 指针悬空只**警告**，不改退出码（current.md 本身结构合法）。
- `done --force` 拿不到解析结果时归档名任务段回退 `task`；指针悬空时仅归档 current.md 并提示。
- `done` 的门禁顺序：未完成确认 → PRD 可读性 → 验收记录存在 → `--accepted`/TTY 确认；**无 PRD 的任务不设验收门禁**（分级豁免）。
- 验收判据是「## 验收」章节内的 checkbox 条目，不是章节存在——模板自带空章节，只查章节会被空骨架骗过。
- `parse` 首行用 `trim()` 判断 `---`，闭合 `---` 必须整行精确匹配；同名 `##` 章节内容合并；「待办」之外允许多余章节。
