import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findGuideFiles, guideText, scanGuide } from './guide.js';

test('guideText 以 start 标记开头、以 end 标记结尾', () => {
  const t = guideText();
  assert.ok(t.startsWith('<!-- ai-continue:guide:start -->'));
  assert.ok(t.endsWith('<!-- ai-continue:guide:end -->'));
});

test('guideText 含工作流关键协议：aic start、PRD/TRD 双首肯、验收归档', () => {
  const t = guideText();
  assert.ok(t.includes('aic start <任务名>'));
  assert.ok(t.includes('npx aic'));
  assert.ok(t.includes('PRD 交用户首肯'));
  assert.ok(t.includes('TRD 交用户首肯'));
  assert.ok(t.includes('templates/prd.md'));
  assert.ok(t.includes('templates/trd.md'));
  assert.ok(t.includes('先验收，后归档'));
  assert.ok(t.includes('aic done --accepted'));
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
