import { normalize, toHookEvent, type HookEvent } from './payload.js';
import { renderOutput, type ClientId } from './clients.js';
import { handlePreToolUse, handleSessionStart, handleUserPromptSubmit } from './handlers.js';

/**
 * 钩子分发核心（可单测）：stdin 文本 → 归一化 → 事件处理 → 客户端格式输出。
 * fail-open：任何异常放行（返回 null）并 stderr 记一行日志——钩子 bug 绝不阻断编辑。
 */
export async function dispatchHook(
  event: HookEvent,
  client: ClientId,
  stdinText: string,
  fallbackCwd: string,
): Promise<string | null> {
  try {
    const trimmed = stdinText.trim();
    const raw = trimmed ? (JSON.parse(trimmed) as unknown) : {};
    const payload = normalize(event, raw, fallbackCwd);
    const out =
      event === 'PreToolUse'
        ? await handlePreToolUse(payload)
        : event === 'UserPromptSubmit'
          ? handleUserPromptSubmit(payload)
          : await handleSessionStart(payload);
    return renderOutput(client, event, out);
  } catch (e) {
    console.error(`[ai-continue hook] fail-open：${(e as Error).message}`);
    return null;
  }
}

export { toHookEvent };
