import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse, readCurrent, renderTemplate, writeCurrent } from '../core/breakpoint.js';
import { findGuideFiles, guideText, hasGuide } from '../core/guide.js';
import { ask, confirm } from '../core/prompt.js';

export async function runInit(taskArg: string | undefined, yes: boolean): Promise<void> {
  const existing = await readCurrent(process.cwd());
  if (existing !== null) {
    const parsed = parse(existing);
    const name = parsed.ok ? parsed.data.task : '（结构异常，见 aic status）';
    console.log(`已初始化过，当前任务：${name}。如需开新任务，请先执行 aic done。`);
    return;
  }

  let task = taskArg?.trim() ?? '';
  if (!task && !yes) {
    task = await ask('请输入任务名：');
  }
  if (!task) {
    console.error('任务名不能为空：aic init [任务名]');
    process.exitCode = 1;
    return;
  }

  await writeCurrent(process.cwd(), renderTemplate(task));
  console.log('已创建 .ai-continue/current.md');
  console.log(`任务：${task}`);

  await injectGuide(yes);
  console.log('初始化完成。AI 会话开始时执行 `aic status` 即可续上任务。');
}

async function injectGuide(yes: boolean): Promise<void> {
  const cwd = process.cwd();
  const guide = guideText();
  const candidates = await findGuideFiles(cwd);

  if (candidates.length === 0) {
    const create = yes || (await confirm('未找到 AI 引导文件（CLAUDE.md / AGENTS.md / .cursorrules / GEMINI.md），是否创建 AGENTS.md 并写入引导？'));
    if (!create) {
      console.log('已跳过引导注入。可将以下内容手动加入你的 AI 引导文件：');
      console.log(guide);
      return;
    }
    await writeFile(path.join(cwd, 'AGENTS.md'), `# AGENTS.md\n\n${guide}\n`, 'utf8');
    console.log('已创建 AGENTS.md 并写入 AI 引导。');
    return;
  }

  const pending: string[] = [];
  for (const name of candidates) {
    const content = await readFile(path.join(cwd, name), 'utf8');
    if (hasGuide(content)) {
      console.log(`${name} 已包含引导，跳过。`);
    } else {
      pending.push(name);
    }
  }
  if (pending.length === 0) {
    return;
  }

  console.log('将注入以下 AI 引导内容：\n');
  console.log(guide);
  console.log('');

  let target = pending[0];
  if (pending.length > 1 && !yes) {
    const list = pending.map((n, i) => `${i + 1}. ${n}`).join('  ');
    const answer = await ask(`注入到哪个文件？${list}`, pending[0]);
    const idx = Number(answer) - 1;
    if (Number.isInteger(idx) && idx >= 0 && idx < pending.length) {
      target = pending[idx];
    }
  } else if (!yes) {
    const okToAppend = await confirm(`是否将引导追加到 ${target} 末尾？`);
    if (!okToAppend) {
      console.log('已跳过引导注入。');
      return;
    }
  }

  const content = await readFile(path.join(cwd, target), 'utf8');
  const sep = content.endsWith('\n') ? '\n' : '\n\n';
  await appendFile(path.join(cwd, target), `${sep}${guide}\n`, 'utf8');
  console.log(`已将 AI 引导追加到 ${target}。`);
}
