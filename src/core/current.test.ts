import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { archiveTask, listParked, moveTaskGroup, parse, renderTemplate, resumeTask, slugify } from './current.js';

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

// ---- park / resume ----

async function makeTmp(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'aic-current-test-'));
}

async function seedTask(cwd: string, content: string): Promise<void> {
  await mkdir(path.join(cwd, '.ai-continue'), { recursive: true });
  await writeFile(path.join(cwd, '.ai-continue/current.md'), content, 'utf8');
}

test('park → resume 往返：整组移动、内容零篡改、指针按原路径归位', async () => {
  const cwd = await makeTmp();
  try {
    await seedTask(cwd, WITH_SPEC);
    await mkdir(path.join(cwd, '.ai-continue/specs/login-refactor'), { recursive: true });
    await writeFile(path.join(cwd, '.ai-continue/specs/login-refactor/prd.md'), '# PRD 原文', 'utf8');

    const moved = await moveTaskGroup(cwd, '重构登录模块', 'specs/login-refactor/', 'parked');
    assert.ok(moved.dir.startsWith('.ai-continue/parked/'));
    assert.ok(moved.dir.endsWith('-重构登录模块'));
    assert.equal(moved.specMissing, null);
    assert.equal(await readFile(path.join(cwd, '.ai-continue/current.md'), 'utf8').then(() => '存在', () => '缺失'), '缺失');
    const parkedCard = await readFile(path.join(cwd, moved.dir, 'current.md'), 'utf8');
    assert.equal(parkedCard, WITH_SPEC, '挂起卡内容零篡改');
    assert.equal(await readFile(path.join(cwd, moved.dir, 'spec/prd.md'), 'utf8'), '# PRD 原文');

    const parked = await listParked(cwd);
    assert.equal(parked.length, 1);

    const resumed = await resumeTask(cwd, parked[0].name);
    assert.equal(resumed.task, '重构登录模块');
    assert.equal(resumed.specConflict, null);
    assert.equal(resumed.specMissing, null);
    assert.equal(resumed.parseErrors, null);
    assert.equal(await readFile(path.join(cwd, '.ai-continue/current.md'), 'utf8'), WITH_SPEC);
    assert.equal(await readFile(path.join(cwd, '.ai-continue/specs/login-refactor/prd.md'), 'utf8'), '# PRD 原文');
    assert.equal((await listParked(cwd)).length, 0, '挂起目录清空');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('listParked：新→旧排序（时间戳前缀字典序倒序）', async () => {
  const cwd = await makeTmp();
  try {
    const parkedDir = path.join(cwd, '.ai-continue/parked');
    for (const name of ['2026-10-01_000001-a', '2026-10-03_000002-b', '2026-10-02_000003-c']) {
      await mkdir(path.join(parkedDir, name), { recursive: true });
      await writeFile(path.join(parkedDir, name, 'current.md'), '---\ntask: x\n---\n\n## 待办\n', 'utf8');
    }
    const parked = await listParked(cwd);
    assert.deepEqual(parked.map((p) => p.name), ['2026-10-03_000002-b', '2026-10-02_000003-c', '2026-10-01_000001-a']);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('listParked：parked/ 不存在返回空数组', async () => {
  const cwd = await makeTmp();
  try {
    assert.deepEqual(await listParked(cwd), []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('resume 指针冲突 fail-closed：拒绝恢复，两侧文件都不动', async () => {
  const cwd = await makeTmp();
  try {
    await seedTask(cwd, WITH_SPEC);
    const moved = await moveTaskGroup(cwd, '重构登录模块', 'specs/login-refactor/', 'parked');
    // 挂起期间有同名任务建过档
    await mkdir(path.join(cwd, '.ai-continue/specs/login-refactor'), { recursive: true });
    await writeFile(path.join(cwd, '.ai-continue/specs/login-refactor/prd.md'), '# 挂起期间的新任务', 'utf8');

    const resumed = await resumeTask(cwd, path.basename(moved.dir));
    assert.equal(resumed.specConflict, 'specs/login-refactor/');
    // current.md 仍未恢复，挂起组原样保留
    await assert.rejects(readFile(path.join(cwd, '.ai-continue/current.md'), 'utf8'));
    assert.equal((await listParked(cwd)).length, 1);
    assert.equal(await readFile(path.join(cwd, '.ai-continue/specs/login-refactor/prd.md'), 'utf8'), '# 挂起期间的新任务');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('park 指针悬空：仅移 current.md，specMissing 记录指针值；resume 同样容错', async () => {
  const cwd = await makeTmp();
  try {
    const dangling = WITH_SPEC.replace('spec: specs/login-refactor/', 'spec: specs/ghost/');
    await seedTask(cwd, dangling);
    const moved = await moveTaskGroup(cwd, '重构登录模块', 'specs/ghost/', 'parked');
    assert.equal(moved.specMissing, 'specs/ghost/');

    const parked = await listParked(cwd);
    const resumed = await resumeTask(cwd, parked[0].name);
    assert.equal(resumed.specMissing, 'specs/ghost/');
    assert.equal(resumed.task, '重构登录模块');
    assert.equal(await readFile(path.join(cwd, '.ai-continue/current.md'), 'utf8'), dangling);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('resume：目标父目录 specs/ 缺失（fresh clone）时自动补齐，spec 照常归位', async () => {
  const cwd = await makeTmp();
  try {
    await seedTask(cwd, WITH_SPEC);
    await mkdir(path.join(cwd, '.ai-continue/specs/login-refactor'), { recursive: true });
    await writeFile(path.join(cwd, '.ai-continue/specs/login-refactor/prd.md'), '# PRD 原文', 'utf8');
    const moved = await moveTaskGroup(cwd, '重构登录模块', 'specs/login-refactor/', 'parked');
    // 模拟 fresh clone：specs/ 目录随 spec 移空后被 git 丢弃
    await rm(path.join(cwd, '.ai-continue/specs'), { recursive: true, force: true });

    const resumed = await resumeTask(cwd, path.basename(moved.dir));
    assert.equal(resumed.specMissing, null, '父目录缺失 ≠ 指针悬空，不得误报');
    assert.equal(resumed.specConflict, null);
    assert.equal(await readFile(path.join(cwd, '.ai-continue/specs/login-refactor/prd.md'), 'utf8'), '# PRD 原文');
    assert.equal(await readFile(path.join(cwd, '.ai-continue/current.md'), 'utf8'), WITH_SPEC);
    assert.equal((await listParked(cwd)).length, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('resume：挂起目录缺任务卡 → 报可读错误，不裸抛 ENOENT', async () => {
  const cwd = await makeTmp();
  try {
    const junk = path.join(cwd, '.ai-continue/parked/2026-10-05_000000-junk');
    await mkdir(junk, { recursive: true });
    await writeFile(path.join(junk, 'notes.txt'), '不是任务卡的杂物', 'utf8');

    await assert.rejects(
      resumeTask(cwd, '2026-10-05_000000-junk'),
      /没有任务卡/,
      '错误信息要能让人看懂下一步该干什么',
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('done --abandoned：归档目录带 -abandoned 后缀；parked 目标不受 abandoned 影响', async () => {
  const cwd = await makeTmp();
  try {
    await seedTask(cwd, WITH_SPEC);
    const archived = await archiveTask(cwd, '重构登录模块', null, true);
    assert.ok(archived.dir.startsWith('.ai-continue/archive/'));
    assert.ok(archived.dir.endsWith('-abandoned'));

    await seedTask(cwd, WITH_SPEC);
    const parked = await moveTaskGroup(cwd, '重构登录模块', null, 'parked', true);
    assert.ok(!parked.dir.endsWith('-abandoned'), '挂起无"完成/放弃"声明语义，不加后缀');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
