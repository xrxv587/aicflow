import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWatchedPath } from './paths.js';
import { isNewRequirementPrompt } from './trigger.js';
import { normalize, pathsFromPatch, toHookEvent, type HookEvent } from './payload.js';
import { renderOutput } from './clients.js';
import { handlePreToolUse, handleSessionStart, handleUserPromptSubmit } from './handlers.js';
import { dispatchHook } from './dispatch.js';
import { installHooks, removeHooks } from './install.js';

const EVENTS: HookEvent[] = ['SessionStart', 'UserPromptSubmit', 'PreToolUse'];

test('isWatchedPath：排除清单、项目内外与路径缺失', () => {
  const cwd = '/proj';
  assert.equal(isWatchedPath(cwd, 'src/a.ts'), true);
  assert.equal(isWatchedPath(cwd, '/proj/.ai-continue/current.md'), false);
  assert.equal(isWatchedPath(cwd, 'node_modules/x.js'), false);
  assert.equal(isWatchedPath(cwd, '.zcode/config.json'), false);
  assert.equal(isWatchedPath(cwd, '../outside/f.ts'), false);
  assert.equal(isWatchedPath(cwd, undefined), true, '路径缺失 fail-safe 判定拦截');
});

test('触发词：中英文正例与负例（偏宽表）', () => {
  const yes = [
    '我有个新需求：登录支持手机号',
    '我们开始一个新功能吧',
    '帮我做个新任务：导出报表',
    '加一个新特性：暗色模式',
    'please add a new feature for login',
    'Start a new task when ready',
    'implement a new feature: export',
  ];
  const no = ['继续修这个 bug', '把 README 的错别字改一下', '运行一下测试', '今天天气如何'];
  for (const p of yes) {
    assert.ok(isNewRequirementPrompt(p), `应命中：${p}`);
  }
  for (const p of no) {
    assert.ok(!isNewRequirementPrompt(p), `不应命中：${p}`);
  }
});

test('payload：file_path、apply_patch 多文件与 Move、prompt、事件名归一化', () => {
  const p1 = normalize('PreToolUse', { cwd: '/p', tool_name: 'Edit', tool_input: { file_path: '/p/src/a.ts' } }, '/fb');
  assert.equal(p1.cwd, '/p');
  assert.deepEqual(p1.filePaths, ['/p/src/a.ts']);

  const patch = '*** Begin Patch\n*** Update File: src/a.ts\n+x\n*** Add File: docs/b.md\n+y\n*** Move File: old.ts -> new.ts\n*** End Patch';
  assert.deepEqual(pathsFromPatch(patch), ['src/a.ts', 'docs/b.md', 'old.ts', 'new.ts']);

  const p2 = normalize('PreToolUse', { tool_input: { command: patch } }, '/p');
  assert.equal(p2.filePaths?.length, 4);

  const p3 = normalize('UserPromptSubmit', { prompt: '新需求 x' }, '/p');
  assert.equal(p3.prompt, '新需求 x');

  assert.equal(toHookEvent('pretooluse'), 'PreToolUse');
  assert.equal(toHookEvent('UserPromptSubmit'), 'UserPromptSubmit');
  assert.equal(toHookEvent('nope'), null);
});

test('renderOutput：ask 仅 Claude/ZCode；Codex 降级为 additionalContext；silent 无输出', () => {
  const ask = JSON.parse(renderOutput('claude', 'PreToolUse', { kind: 'ask', reason: 'R' })!);
  assert.equal(ask.hookSpecificOutput.permissionDecision, 'ask');
  const zc = JSON.parse(renderOutput('zcode', 'PreToolUse', { kind: 'ask', reason: 'R' })!);
  assert.equal(zc.hookSpecificOutput.permissionDecision, 'ask');
  const cx = JSON.parse(renderOutput('codex', 'PreToolUse', { kind: 'ask', reason: 'R' })!);
  assert.equal(cx.hookSpecificOutput.additionalContext.includes('R'), true);
  assert.equal(cx.hookSpecificOutput.permissionDecision, undefined);
  const ctx = JSON.parse(renderOutput('zcode', 'SessionStart', { kind: 'context', text: 'T' })!);
  assert.equal(ctx.hookSpecificOutput.additionalContext, 'T');
  assert.equal(renderOutput('claude', 'PreToolUse', { kind: 'silent' }), null);
});

test('handlers：无任务编辑 ask、有任务放行、排除路径放行、触发词注入、SessionStart 三态', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const tmp = await fs.mkdtemp('aic-hook-test-');
  try {
    assert.equal((await handlePreToolUse({ cwd: tmp, filePaths: ['src/a.ts'] })).kind, 'ask');
    assert.equal((await handlePreToolUse({ cwd: tmp, filePaths: ['.ai-continue/current.md'] })).kind, 'silent');
    assert.equal((await handlePreToolUse({ cwd: tmp, filePaths: [] })).kind, 'ask', '路径解析失败 fail-safe 拦截');

    await fs.mkdir(path.join(tmp, '.ai-continue'), { recursive: true });
    await fs.writeFile(path.join(tmp, '.ai-continue/current.md'), '坏文件', 'utf8');
    assert.equal((await handlePreToolUse({ cwd: tmp, filePaths: ['src/a.ts'] })).kind, 'silent', '任务存在即放行（结构问题归 status 管）');

    assert.equal(handleUserPromptSubmit({ cwd: tmp, filePaths: [] }).kind, 'silent');
    assert.equal(handleUserPromptSubmit({ cwd: tmp, filePaths: [], prompt: '新需求' }).kind, 'context');

    assert.equal((await handleSessionStart({ cwd: '/tmp/不存在目录' })).kind, 'context');
    const broken = await handleSessionStart({ cwd: tmp });
    assert.ok(broken.kind === 'context' && broken.text.includes('结构异常'));
    await fs.writeFile(path.join(tmp, '.ai-continue/current.md'), '---\ntask: t\n---\n\n## 待办\n- [ ] a\n', 'utf8');
    const ok = await handleSessionStart({ cwd: tmp });
    assert.ok(ok.kind === 'context' && ok.text.includes('当前任务：t'));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('dispatch：fail-open（坏 JSON 放行）、空 stdin 正常处理', async () => {
  assert.equal(await dispatchHook('PreToolUse', 'claude', '{bad json', '/tmp'), null);
  const out = await dispatchHook('SessionStart', 'claude', '', '/tmp/不存在');
  assert.ok(out !== null && out.includes('没有进行中的任务'));
});

test('install/remove：三客户端配置生成、幂等、保留用户条目、卸载还原', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const tmp = await fs.mkdtemp('aic-hook-install-');
  try {
    // 模拟 aicflow 已安装 + 用户已有钩子条目
    await fs.mkdir(path.join(tmp, 'node_modules/aicflow/dist'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'node_modules/aicflow/dist/hook.js'), '', 'utf8');
    await fs.mkdir(path.join(tmp, '.claude'), { recursive: true });
    await fs.writeFile(
      path.join(tmp, '.claude/settings.json'),
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-own.sh' }] }] } }, null, 2),
      'utf8',
    );

    const { outcomes, pkgMissing } = await installHooks(tmp, EVENTS);
    assert.equal(pkgMissing, false);
    assert.equal(outcomes.length, 3);

    const claude = JSON.parse(await fs.readFile(path.join(tmp, '.claude/settings.json'), 'utf8'));
    assert.equal(claude.hooks.PreToolUse.length, 2, '用户条目 + aic 条目');
    const ours = claude.hooks.PreToolUse.find((e: { hooks: Array<{ command: string }> }) => e.hooks.some((h) => h.command.includes('dist/hook.js')));
    assert.ok(ours && ours.matcher === 'Edit|Write|ApplyPatch|apply_patch');
    assert.ok(ours.hooks[0].command.includes('${CLAUDE_PROJECT_DIR}'));

    const zcode = JSON.parse(await fs.readFile(path.join(tmp, '.zcode/config.json'), 'utf8'));
    assert.equal(zcode.hooks.enabled, true);
    assert.ok(zcode.hooks.events.PreToolUse[0].hooks[0].command.includes('${CLAUDE_PROJECT_DIR}'));

    const codex = JSON.parse(await fs.readFile(path.join(tmp, '.codex/hooks.json'), 'utf8'));
    assert.ok(codex.hooks.PreToolUse[0].hooks[0].command.includes('git rev-parse --show-toplevel'));

    // 幂等：重铺不重复
    const again = await installHooks(tmp, EVENTS);
    assert.ok(again.outcomes.every((o) => o.added.length === 0 && o.skipped.length === 3));
    const claude2 = JSON.parse(await fs.readFile(path.join(tmp, '.claude/settings.json'), 'utf8'));
    assert.equal(claude2.hooks.PreToolUse.length, 2);

    // 卸载：aic 条目移除，用户条目保留
    const removed = await removeHooks(tmp);
    const claude3 = JSON.parse(await fs.readFile(path.join(tmp, '.claude/settings.json'), 'utf8'));
    assert.equal(claude3.hooks.PreToolUse.length, 1);
    assert.equal(claude3.hooks.PreToolUse[0].hooks[0].command, 'my-own.sh');
    assert.deepEqual(Object.keys(claude3.hooks).sort(), ['PreToolUse'], '空的 UserPromptSubmit/SessionStart 键被清除');
    const zcode3 = JSON.parse(await fs.readFile(path.join(tmp, '.zcode/config.json'), 'utf8'));
    assert.equal(zcode3.hooks.enabled, true, 'enabled 不动');
    assert.deepEqual(zcode3.hooks.events, {}, 'ZCode 事件表清空');
    assert.ok(removed.some((o) => o.client === 'claude' && o.removed.includes('PreToolUse')));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('install：未安装 aicflow 时全部跳过并返回 pkgMissing', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const tmp = await fs.mkdtemp('aic-hook-nopkg-');
  try {
    const { outcomes, pkgMissing } = await installHooks(tmp, EVENTS);
    assert.equal(pkgMissing, true);
    assert.ok(outcomes.every((o) => !o.installed));
    await assert.rejects(fs.access(path.join(tmp, '.claude/settings.json')));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
