import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasAcceptanceRecord } from './acceptance.js';
import { PRD_TEMPLATE } from './docs.js';

test('hasAcceptanceRecord：验收章节需有 checkbox 条目才算记录（空骨架不算）', () => {
  assert.ok(hasAcceptanceRecord('## 已确认\nx\n\n## 验收\n- [x] 通过，证据：走查'));
  assert.ok(hasAcceptanceRecord('## 验收\n- [ ] 有一条即算，哪怕是未通过'));
  assert.ok(!hasAcceptanceRecord(PRD_TEMPLATE), '模板自带的空「## 验收」章节不应算已记录');
  assert.ok(!hasAcceptanceRecord('## 验收\n只有说明文字没有条目\n下一行'));
  assert.ok(!hasAcceptanceRecord('## 已确认\n提到验收两个字但不是章节\n'));
  assert.ok(!hasAcceptanceRecord('### 验收\n三级标题不算'));
  assert.ok(!hasAcceptanceRecord('## 验收\n只有说明文字\n\n## 未确认\n- [x] 后续章节的条目不算数'));
});
