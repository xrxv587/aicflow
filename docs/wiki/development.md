# 开发指南

[← 返回首页](./Home.md)

## 环境与脚本

- Node >= 18，包管理器 yarn（仓库带 yarn.lock）。
- 运行时依赖只有 `commander`；开发依赖：`typescript`、`tsx`、`@types/node`。测试用 Node 内置 node:test，**零额外依赖**。

```bash
yarn install
yarn dev <命令>      # tsx 直跑源码，如 yarn dev status
yarn typecheck       # tsc --noEmit
yarn test            # node:test 跑 core 层单测（26 例）
yarn build           # tsc 编译到 dist/
```

单测覆盖 `parse`、引导文案与识别、模板内容与铺设幂等、验收记录判定、钩子（payload 归一化/触发词/路径排除/客户端输出/安装卸载幂等）（`src/core/*.test.ts`）。改这些逻辑必须补用例；命令层（commands/）靠手动冒烟——在临时目录走完整流程（见下），验证退出码（1=未开始任务或门禁拒绝、2=结构坏）与归档结构，务必覆盖"验收拒绝 → `--accepted` 归档"路径。

钩子冒烟补充（临时目录，模拟 node_modules/aicflow 已安装后）：

```bash
aic init -y --hooks                            # 三份配置生成；重跑应全部"已存在跳过"
echo '{"tool_input":{"file_path":"/abs/src/a.ts"}}' | aic hook pretooluse --client zcode
# 无任务 → ask JSON；建任务后同 payload → 无输出（静默放行）
echo '{"prompt":"我有个新需求"}' | aic hook userpromptsubmit --client claude   # 注入提醒
echo 'bad-json' | aic hook pretooluse --client zcode                            # fail-open 静默
aic hooks --remove                             # 自身条目移除、用户条目保留
```

注意：钩子轻量入口是 `dist/hook.js`（不经 commander，自身开销 ~16ms，总时长由 Node 启动主导）；真机客户端联测（ZCode/Claude Code/Codex 实际触发）需要对应客户端环境，按 [hooks](./hooks.md) 能力矩阵逐项核对。

## ESM / NodeNext 约定

`package.json` 是 `"type": "module"`，tsconfig 为 `module: nodenext` + `moduleResolution: nodenext`。因此：

- **源码里的相对导入必须写 `.js` 后缀**（`import { runStart } from './commands/start.js'`）——指向编译后的文件名，TS 会映射回 `.ts`。漏写会通过 typecheck 但构建产物运行时报错。
- 只用 Node 内置模块 + commander。

## 构建产物与 bin

- `yarn build` 输出到 `dist/`（已 gitignore），结构镜像 `src/`（含 *.test.ts，无害）。
- `package.json` 的 `bin.aic` 指向 `dist/index.js`；`src/index.ts` 首行有 shebang。模块解析基于脚本自身路径，从任意 cwd 调 `node <repo>/dist/index.js` 都能跑（冒烟测试就这么做）。

## 本地联调（模拟 AI 全流程）

```bash
yarn install && yarn build && yarn link

# 到任意测试项目目录：
aic init -y                                  # 注入引导 + 铺 PRD/TRD 模板
# 模拟 AI：复制模板建档（大任务，PRD/TRD 双首肯后）：
mkdir -p .ai-continue/specs/试任务
cp .ai-continue/templates/prd.md .ai-continue/specs/试任务/prd.md
cp .ai-continue/templates/trd.md .ai-continue/specs/试任务/trd.md
aic start 试任务 -y
# 模拟 AI：把 spec: specs/试任务/ 写进 current.md frontmatter
aic status                                   # 应显示需求与"验收：未记录"
aic done --accepted                          # 应被拒（无验收记录）
# 模拟 AI：在 PRD「## 验收」区写入 "- [x] …" 后：
aic done --accepted                          # 归档：current + prd + trd 三件齐全

yarn unlink
```

联调引导注入时注意覆盖 `injectGuide` 全部分支：无引导文件 / 单个 / 多个 / 已含引导 / 有 start 无 end（malformed 跳过）；`layTemplates` 覆盖首铺与已存在跳过。

## 改动注意事项（按模块）

- **改引导文案（guide.ts）**：只影响之后的注入，已注入文件不自动更新；start/end 标记措辞是识别锚点，不可改动。
- **改模板（docs.ts）**：PRD 的「## 验收」章节名与 checkbox 形态是 done 门禁判据，动了门禁就失效；模板变更不影响已铺设的项目（存在即跳过）。
- **改格式规则（current.ts 的 parse）**：收紧规则会让存量状态文件突然变成"结构异常"；`status` / `done` / `start` 三处都吃 `parse` 的结果；改动要补 `current.test.ts` 用例。
- **改退出码**：`1` = 无任务/门禁拒绝、`2` = 结构坏，是给 AI 客户端的协议（见 [cli](./cli.md)），别顺手改语义。
- **改门禁判据（acceptance.ts）**：记住教训——**章节存在 ≠ 有记录**（模板自带空「## 验收」章节，只查章节会被空骨架骗过，冒烟测试抓到过）。
- **新增依赖**：本工具的卖点是轻（运行时仅 commander，测试零依赖），新增前先掂量。

## 历史注记

- **2026-09-29 全量重写**：按两层架构（CLI＝工件/状态/门禁，引导＝工作流）推翻旧实现。旧设计中 `aic init <任务名> --spec` 由 CLI 生成 spec 骨架、引导带版本化升级机制——均已废除；spec.md 演化为 AI 按模板生成的 prd.md + trd.md。旧代码可从 git 历史找回。
- 版本号从 0.1.0 重新起步（用户明确：未投入使用，不写兼容/升级逻辑，不擅改版本号）。
