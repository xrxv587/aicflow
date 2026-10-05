# 文件格式规范

[← 返回首页](./Home.md)

目录布局（均在 `.ai-continue/` 下）：

```
.ai-continue/
├── current.md               # 任务状态卡：小、必读、高频改写
├── templates/
│   ├── prd.md               # 需求文档模板（init 铺设，存在即跳过，可自定义）
│   └── trd.md               # 技术方案模板（同上）
├── specs/<任务>/
│   ├── prd.md               # 需求侧：已确认 + 未确认 + 验收
│   └── trd.md               # 技术侧：方案、选型、影响范围、步骤、风险
├── parked/<时间戳>-<任务>/   # park 挂起：current.md + spec/{prd,trd}.md 整组，可 resume 恢复（可多个并存）
└── archive/<时间戳>-<任务>[-abandoned]/  # done 归档：current.md + spec/{prd,trd}.md；-abandoned 后缀 = 放弃归档标记
```

## current.md（CLI 解析，唯一被校验的文件）

```markdown
---
task: 重构登录模块
updated: 2026-09-29 14:30
spec: specs/login-refactor/
---

## 待办
- [x] 拆出 API 层
- [ ] 处理 token 刷新

## 下一步
在 src/api/auth.ts 加 refresh 拦截器，方案见 TRD 实施步骤 3
```

- frontmatter：`task` 必填非空；`updated` 可选（约定 `YYYY-MM-DD HH:mm` 本地时间，缺失显示"未知"）；`spec` 可选（相对 `.ai-continue/` 的目录，如 `specs/login-refactor/`，**由 AI 建档后写入**，CLI 不生成）。key 匹配 `^(\w+):`。
- 「## 待办」**唯一必填章节**；checkbox 正则：`/^\s*-\s+\[( |x|X)\]\s*(.*)$/`——空行合法跳过；非 checkbox 非空行**报错**（退出码 2 的主要来源）；`- [ ]` 空文字静默忽略；`[X]` 大写也算完成。
- 「## 下一步」：自由文本（约定 1-3 行，精确到文件/函数）。
- 「## 备注」：草稿区（引导许可，非义务）——未走通的尝试、进行中的调查线索记 1-3 行；恢复任务时先核对再采信，问题解决后删除。
- 「## 待办」「## 下一步」之外的章节一律忽略、不校验（「## 备注」因此无需解析器支持）。
- 解析器边界：首行必须 `---`（允许行首空白）；闭合 `---` 整行精确匹配；同名 `##` 章节出现多次时内容合并到第一个；任务名含换行会破坏 frontmatter（传入前自行避免）。

## PRD / TRD（AI 按模板生成，CLI 只认两条不变量）

由 AI 复制 `.ai-continue/templates/` 下的模板到 `specs/<任务>/` 生成，**CLI 不生成、不解析内容**；模板即格式权威（在 `src/core/docs.ts`）。CLI 依赖的全部格式约定：

1. current.md frontmatter 的 `spec:` 指针指向存在的目录（status 悬空警告）；
2. PRD「## 验收」区有 checkbox 条目（`hasAcceptanceRecord`，done 门禁判据；模板自带的空章节不算）。

PRD 三区语义（引导约束）：

- **「已确认」**= 用户背书的承诺（目标/边界/验收标准），AI 不得擅自修改；需求变更唯一通道：先进「未确认」→ 用户确认 → 上移。
- **「未确认」**= 暂存区：疑问、倾向、已验证未背书的发现；确认后上移，判定无关则删。
- **「验收」**= 出口证据：待办全部完成后，AI 按验收标准逐条自检写入（`- [x] 标准 —— 通过，证据：…`）。

TRD 章节：方案概述 / 设计决策与选型（含理由）/ 影响范围（文件/模块）/ 实施步骤 / 风险与应对。执行中方案级调整先改 TRD 再动代码。

## 目录命名与归档

- specs 目录名由 AI 按引导自取：任务名把空格与 `\ / : * ? " < > |` 替换为 `-`；同名目录已存在时先与用户确认是否同一任务。
- `slugify(task)`（CLI 侧同规则）：替换非法字符与空白、去首尾 `-`、截断 40 字符、空回退 `task`——仅用于归档目录命名。
- 归档目录：`archive/YYYY-MM-DD_HHMMSS-<slug>/`，内含 `current.md` 与 `spec/`（原 `specs/<任务>/` 整目录按**指针值**移入，含 prd.md/trd.md 及 AI 添加的任何附加文件）；带 `--abandoned` 时为 `archive/YYYY-MM-DD_HHMMSS-<slug>-abandoned/`。
- 挂起目录：`parked/YYYY-MM-DD_HHMMSS-<slug>/`（命名规则与 archive 完全一致，无 `-abandoned` 后缀——挂起无"完成/放弃"声明语义），内含 `current.md` 与 `spec/`；恢复时 spec 目录按 current.md frontmatter 的指针值移回原路径。时间戳前缀即挂起时间（`aic resume` 的 mini-status 展示用），可多个并存。
