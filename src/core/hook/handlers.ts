import { readCurrent, parse } from '../current.js';
import { isWatchedPath } from './paths.js';
import { isNewRequirementPrompt } from './trigger.js';
import type { HookPayload } from './payload.js';
import type { HookOutput } from './clients.js';

const ASK_REASON =
  '[ai-continue] 当前没有进行中的任务。请先 `aic start <任务名>`（大任务按 AGENTS.md 引导先建 PRD/TRD 并双首肯）；若确认只是小改动，可直接允许本次编辑。';

const PROMPT_REMINDER =
  '[ai-continue] 检测到可能的新需求。请先复述理解并分级：小改动（单文件、无歧义）一句话对齐后 `aic start <任务名>` 即可开工；大任务（跨会话/多文件）按 AGENTS.md 引导建 PRD/TRD 文档、获用户双首肯后再编码。';

/** PreToolUse：有任务静默放行；无任务且路径在拦截范围 → ask 上抛（Codex 由 renderOutput 降级为提醒） */
export async function handlePreToolUse(p: HookPayload): Promise<HookOutput> {
  const fps = p.filePaths ?? [];
  const watched = fps.length === 0 || fps.some((f) => isWatchedPath(p.cwd, f));
  if (!watched) {
    return { kind: 'silent' };
  }
  const current = await readCurrent(p.cwd);
  if (current !== null) {
    return { kind: 'silent' };
  }
  return { kind: 'ask', reason: ASK_REASON };
}

/** UserPromptSubmit：触发词命中注入流程提醒，否则静默 */
export function handleUserPromptSubmit(p: HookPayload): HookOutput {
  if (!isNewRequirementPrompt(p.prompt)) {
    return { kind: 'silent' };
  }
  return { kind: 'context', text: PROMPT_REMINDER };
}

/** SessionStart：始终注入任务状态三态（有任务 / 无任务 / 结构异常） */
export async function handleSessionStart(p: HookPayload): Promise<HookOutput> {
  const content = await readCurrent(p.cwd);
  if (content === null) {
    return {
      kind: 'context',
      text: '[ai-continue] 当前没有进行中的任务。收到新需求时先分级：小改动一句话对齐 + `aic start <任务名>`；大任务按 AGENTS.md 引导建 PRD/TRD 双首肯后再编码。',
    };
  }
  const result = parse(content);
  if (!result.ok) {
    const errs = result.errors.map((e) => `- ${e}`).join('\n');
    return {
      kind: 'context',
      text: `[ai-continue] .ai-continue/current.md 结构异常，请先修复（aic status 可看逐条提示）：\n${errs}`,
    };
  }
  const { task, next, todos } = result.data;
  const done = todos.filter((t) => t.done).length;
  const lines = [
    `[ai-continue] 当前任务：${task}（进度 ${done}/${todos.length}）`,
    next ? `下一步：${next.split('\n')[0]}` : '下一步：（未设置，建议写明当前最要紧的动作）',
  ];
  return { kind: 'context', text: lines.join('\n') };
}
