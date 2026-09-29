import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse, readCurrent, renderTemplate, writeCurrent } from '../core/current.js';
import { findGuideFiles, scanGuide } from '../core/guide.js';
import { ask } from '../core/prompt.js';

/**
 * 开始一个新任务：创建 current.md（状态文件出生）。
 * PRD/TRD 不经此命令：大任务由 AI 按引导先建文档、双首肯后再 start，指针随后写入 frontmatter。
 */
export async function runStart(taskArg: string | undefined, yes: boolean): Promise<void> {
  const existing = await readCurrent(process.cwd());
  if (existing !== null) {
    const parsed = parse(existing);
    const name = parsed.ok ? parsed.data.task : '（结构异常，见 aic status）';
    console.log(`已有进行中的任务：${name}。如需开新任务，请先执行 aic done。`);
    return;
  }

  let task = taskArg?.trim() ?? '';
  if (!task && !yes) {
    task = await ask('请输入任务名：');
  }
  if (!task) {
    console.error('任务名不能为空：aic start [任务名]');
    process.exitCode = 1;
    return;
  }

  await writeCurrent(process.cwd(), renderTemplate(task));
  console.log('已创建 .ai-continue/current.md');
  console.log(`任务：${task}`);

  await warnIfNoGuide();
  console.log('任务已开始。AI 会话开始时执行 `aic status` 即可续上任务。');
}

/** 引导未注入时提醒一次：没有引导，AI 下次会话不知道要执行 aic status */
async function warnIfNoGuide(): Promise<void> {
  const cwd = process.cwd();
  const files = await findGuideFiles(cwd);
  for (const name of files) {
    const content = await readFile(path.join(cwd, name), 'utf8');
    if (scanGuide(content).kind === 'present') {
      return;
    }
  }
  console.log('提示：未检测到 AI 引导，建议运行 `aic init` 注入，否则 AI 会话无法自动续上任务。');
}
