import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findGuideFiles, guideText, scanGuide } from './guide.js';

test('guideText 以 start 标记开头、以 end 标记结尾', () => {
  const t = guideText();
  assert.ok(t.startsWith('<!-- ai-continue:guide:start -->'));
  assert.ok(t.endsWith('<!-- ai-continue:guide:end -->'));
});

test('guideText 标题跟随项目名（防更名回退：20a6d4c 曾把包名改为 aicflow）', () => {
  const t = guideText();
  assert.ok(t.includes('## AI 工作流（aicflow）'));
  assert.ok(!t.includes('ai-continue）'));
});

test('guideText 含工作流关键协议：aic start、PRD/TRD 双确认、验收归档', () => {
  const t = guideText();
  assert.ok(t.includes('aic start <任务名>'));
  assert.ok(t.includes('npx aic'));
  assert.ok(t.includes('PRD 交用户确认'));
  assert.ok(t.includes('TRD 交用户确认'));
  assert.ok(t.includes('templates/prd.md'));
  assert.ok(t.includes('templates/trd.md'));
  assert.ok(t.includes('先验收，后归档'));
  assert.ok(t.includes('aic done --accepted'));
  assert.ok(!t.includes('首肯'), '措辞统一：一律用「确认」');
});

test('guideText 含插入新需求协议：park/resume、放弃归档、禁 force 处理未完成', () => {
  const t = guideText();
  assert.ok(t.includes('插入新需求'));
  assert.ok(t.includes('aic park'));
  assert.ok(t.includes('aic resume'));
  assert.ok(t.includes('aic done --abandoned'));
  assert.ok(t.includes('不得用 `aic done --force` 处理未完成任务'));
});

test('guideText 含动工闸门：TRD 确认 ≠ 动工许可', () => {
  const t = guideText();
  assert.ok(t.includes('TRD 确认 ≠ 动工许可'));
  assert.ok(t.includes('是否可以开始实施'));
});

test('guideText 含「## 备注」草稿区许可与挂起恢复确认', () => {
  const t = guideText();
  assert.ok(t.includes('## 备注'));
  assert.ok(t.includes('status 提示有挂起任务时，与用户确认是否恢复'));
});

test('scanGuide：无引导 → none', () => {
  assert.equal(scanGuide('# 项目\n内容\n').kind, 'none');
});

test('scanGuide：已有引导 → present（幂等跳过的依据）', () => {
  const content = `# 项目\n\n${guideText()}\n后文`;
  assert.equal(scanGuide(content).kind, 'present');
});

test('scanGuide：有 start 无 end → malformed', () => {
  assert.equal(scanGuide('# x\n<!-- ai-continue:guide:start -->\n正文').kind, 'malformed');
});

test('findGuideFiles：只返回存在的引导文件', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const tmp = await fs.mkdtemp('aic-guide-test-');
  try {
    await fs.writeFile(path.join(tmp, 'CLAUDE.md'), '# c\n', 'utf8');
    const found = await findGuideFiles(tmp);
    assert.deepEqual(found, ['CLAUDE.md']);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
