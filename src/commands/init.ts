import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { findGuideFiles, guideText, scanGuide } from '../core/guide.js';
import { layTemplates } from '../core/docs.js';
import { confirm, ask } from '../core/prompt.js';
import { installHooks } from '../core/hook/install.js';
import { HOOK_EVENTS } from '../core/hook/payload.js';

/** 项目初始化：注入 AI 引导 + 铺 PRD/TRD 模板，幂等可重跑；--hooks 时铺设三客户端钩子配置 */
export async function runInit(yes: boolean, hooks: boolean): Promise<void> {
  await injectGuide(yes);
  await layTemplates(process.cwd());
  if (hooks) {
    const { outcomes, pkgMissing } = await installHooks(process.cwd(), HOOK_EVENTS);
    if (pkgMissing) {
      console.error('⚠ 未找到 node_modules/aicflow/dist/hook.js，已跳过钩子铺设：请先安装 aicflow 再运行 aic init --hooks。');
    } else {
      for (const o of outcomes) {
        const added = o.added.length > 0 ? `已写入 ${o.added.join('、')}` : '已全部存在，跳过';
        console.log(`钩子 ${o.client} → ${o.file}：${added}`);
      }
      console.log('注意（Codex）：钩子需在 Codex CLI 内执行 /hooks 审阅并信任后才会运行；且 Codex 不支持批准上抛（ask），过程防线降级为模型可见提醒。');
    }
  }
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

  const targets: string[] = [];
  for (const name of candidates) {
    const content = await readFile(path.join(cwd, name), 'utf8');
    const scan = scanGuide(content);
    if (scan.kind === 'present') {
      console.log(`${name} 已包含 AI 引导，跳过。`);
    } else if (scan.kind === 'malformed') {
      console.log(`⚠ ${name} 的引导标记未闭合（有 start 无 end），跳过，请手动处理。`);
    } else {
      targets.push(name);
    }
  }
  if (targets.length === 0) {
    return;
  }

  console.log('将写入以下 AI 引导内容：\n');
  console.log(guide);
  console.log('');

  let target = targets[0];
  if (targets.length > 1 && !yes) {
    const list = targets.map((t, i) => `${i + 1}. ${t}`).join('  ');
    const answer = await ask(`应用到哪个文件？${list}`);
    const idx = Number(answer) - 1;
    if (Number.isInteger(idx) && idx >= 0 && idx < targets.length) {
      target = targets[idx];
    }
  } else if (!yes) {
    if (!(await confirm(`是否将引导追加到 ${target} 末尾？`))) {
      console.log('已跳过引导注入。');
      return;
    }
  }

  const content = await readFile(path.join(cwd, target), 'utf8');
  const sep = content.endsWith('\n') ? '\n' : '\n\n';
  await appendFile(path.join(cwd, target), `${sep}${guide}\n`, 'utf8');
  console.log(`已将 AI 引导追加到 ${target}。`);
}
