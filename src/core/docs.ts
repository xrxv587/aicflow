import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AI_DIR } from './current.js';

export const TEMPLATES_DIR = path.join(AI_DIR, 'templates');

export const PRD_TEMPLATE = `---
requirement: <需求名>
created: <YYYY-MM-DD HH:mm>
---

## 已确认
> 经用户确认的需求共识。AI 不得擅自修改；变更须先进「## 未确认」并征得用户同意。

### 目标

### 边界（不做什么）

### 验收标准

## 未确认
> 执行途中的疑问、倾向、已验证但未背书的发现。用户确认后上移到「## 已确认」，判定无关则删除。

## 验收
> 按「已确认 · 验收标准」逐条自检：\`- [x] 标准 —— 通过，证据：…\`。全部通过并获用户认可后才可 \`aic done --accepted\`。
`;

export const TRD_TEMPLATE = `---
task: <任务名>
created: <YYYY-MM-DD HH:mm>
---

## 方案概述

## 设计决策与选型（含理由）

## 影响范围（文件/模块）

## 实施步骤

## 风险与应对
`;

/** 铺 PRD/TRD 模板到 .ai-continue/templates/，存在即跳过（尊重项目自定义） */
export async function layTemplates(cwd: string): Promise<void> {
  const dir = path.join(cwd, TEMPLATES_DIR);
  await mkdir(dir, { recursive: true });
  const files: Array<[string, string]> = [
    ['prd.md', PRD_TEMPLATE],
    ['trd.md', TRD_TEMPLATE],
  ];
  for (const [name, content] of files) {
    const file = path.join(dir, name);
    const rel = path.join(TEMPLATES_DIR, name);
    try {
      await readFile(file, 'utf8');
      console.log(`模板已存在，跳过：${rel}`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw e;
      }
      await writeFile(file, content, 'utf8');
      console.log(`已创建模板：${rel}`);
    }
  }
}
