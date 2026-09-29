import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, renderTemplate, slugify } from './current.js';

const WITH_SPEC = [
  '---',
  'task: 重构登录模块',
  'updated: 2026-09-29 14:30',
  'spec: specs/login-refactor/',
  '---',
  '',
  '## 待办',
  '- [x] 拆出 API 层',
  '- [ ] 处理 token 刷新',
  '',
  '## 下一步',
  '在 src/api/auth.ts 加 refresh 拦截器',
  '',
].join('\n');

test('parse：spec 指针、下一步与待办', () => {
  const r = parse(WITH_SPEC);
  assert.ok(r.ok);
  assert.equal(r.data.spec, 'specs/login-refactor/');
  assert.equal(r.data.next, '在 src/api/auth.ts 加 refresh 拦截器');
  assert.equal(r.data.todos.length, 2);
  assert.equal(r.data.todos[0].done, true);
});

test('parse 忽略「## 待办」「## 下一步」之外的章节', () => {
  const r = parse(['---', 'task: x', '---', '', '## 待办', '- [ ] a', '', '## 上下文', '多余章节被忽略', ''].join('\n'));
  assert.ok(r.ok);
  assert.equal(r.data.spec, null);
  assert.equal(r.data.next, '');
});

test('parse 缺少「## 待办」报错', () => {
  const r = parse(['---', 'task: x', '---', '', '## 下一步', 'a', ''].join('\n'));
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => e.includes('待办')));
});

test('parse 待办中的非 checkbox 行报错，空 checkbox 与 [X] 大写按约定处理', () => {
  const r = parse([
    '---', 'task: x', '---', '',
    '## 待办',
    '- [x] 正常条目',
    '这是一行废话',
    '- [ ]',
    '- [X] 大写也算完成',
    '',
  ].join('\n'));
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => e.includes('非 checkbox')));
});

test('parse 首行不是 frontmatter 直接报错', () => {
  const r = parse('# 标题\n\n---\ntask: x\n---\n');
  assert.ok(!r.ok);
});

test('renderTemplate：出生不带 spec 指针（由 AI 建档后写入），含待办与下一步', () => {
  const t = renderTemplate('新任务');
  assert.ok(t.startsWith('---\ntask: 新任务\nupdated: '));
  assert.ok(t.includes('## 待办'));
  assert.ok(t.includes('## 下一步'));
  assert.ok(!t.includes('spec:'));
});

test('slugify：非法字符与空白转连字符、去首尾、超长截断、空回退 task', () => {
  assert.equal(slugify('重构 登录:模块?'), '重构-登录-模块');
  assert.equal(slugify('  --前后多余--  '), '前后多余');
  assert.equal(slugify('a'.repeat(50)).length, 40);
  assert.equal(slugify('???'), 'task');
});
