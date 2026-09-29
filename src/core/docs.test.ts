import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRD_TEMPLATE, TRD_TEMPLATE } from './docs.js';
import { hasAcceptanceRecord } from './acceptance.js';

test('PRD 模板：frontmatter 占位符与三区结构', () => {
  assert.ok(PRD_TEMPLATE.includes('requirement: <需求名>'));
  assert.ok(PRD_TEMPLATE.includes('created: <YYYY-MM-DD HH:mm>'));
  assert.ok(PRD_TEMPLATE.includes('## 已确认'));
  assert.ok(PRD_TEMPLATE.includes('### 目标'));
  assert.ok(PRD_TEMPLATE.includes('### 边界（不做什么）'));
  assert.ok(PRD_TEMPLATE.includes('### 验收标准'));
  assert.ok(PRD_TEMPLATE.includes('## 未确认'));
  assert.ok(PRD_TEMPLATE.includes('## 验收'));
});

test('PRD 模板出生时不含验收记录（空骨架不算已验收——门禁 fail-closed 的前提）', () => {
  assert.equal(hasAcceptanceRecord(PRD_TEMPLATE), false);
});

test('TRD 模板：五个章节齐全', () => {
  assert.ok(TRD_TEMPLATE.includes('task: <任务名>'));
  assert.ok(TRD_TEMPLATE.includes('## 方案概述'));
  assert.ok(TRD_TEMPLATE.includes('## 设计决策与选型（含理由）'));
  assert.ok(TRD_TEMPLATE.includes('## 影响范围（文件/模块）'));
  assert.ok(TRD_TEMPLATE.includes('## 实施步骤'));
  assert.ok(TRD_TEMPLATE.includes('## 风险与应对'));
});

test('layTemplates：铺设与幂等', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { layTemplates } = await import('./docs.js');
  const tmp = await fs.mkdtemp('aic-templates-test-');
  try {
    await layTemplates(tmp);
    const prd = await fs.readFile(path.join(tmp, '.ai-continue', 'templates', 'prd.md'), 'utf8');
    assert.ok(prd.includes('## 已确认'));
    // 自定义后的模板不被覆盖
    const customized = '# 自定义模板\n';
    await fs.writeFile(path.join(tmp, '.ai-continue', 'templates', 'trd.md'), customized, 'utf8');
    await layTemplates(tmp);
    const trd = await fs.readFile(path.join(tmp, '.ai-continue', 'templates', 'trd.md'), 'utf8');
    assert.equal(trd, customized);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
