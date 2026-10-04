import type { HookEvent } from './payload.js';

export type ClientId = 'claude' | 'codex' | 'zcode';

export const CLIENT_IDS: ClientId[] = ['claude', 'codex', 'zcode'];

export type HookOutput =
  | { kind: 'silent' }
  | { kind: 'ask'; reason: string }
  | { kind: 'context'; text: string };

/**
 * 把处理结果渲染为客户端的钩子输出 JSON（stdout，exit 0）；silent → null（无输出直接放行）。
 * 三家同源：ask 走 hookSpecificOutput.permissionDecision，注入走 hookSpecificOutput.additionalContext。
 * Codex 官方文档明确 ask 被解析但不支持（钩子记为失败、工具调用继续），降级为 additionalContext 模型可见提醒。
 */
export function renderOutput(client: ClientId, event: HookEvent, out: HookOutput): string | null {
  if (out.kind === 'silent') {
    return null;
  }
  if (out.kind === 'ask') {
    if (client === 'codex') {
      // reason 已自带 [ai-continue] 前缀（ASK_REASON）
      return JSON.stringify({
        hookSpecificOutput: { hookEventName: event, additionalContext: out.reason },
      });
    }
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: event,
        permissionDecision: 'ask',
        permissionDecisionReason: out.reason,
      },
    });
  }
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: event, additionalContext: out.text },
  });
}
