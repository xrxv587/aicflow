export type HookEvent = 'SessionStart' | 'UserPromptSubmit' | 'PreToolUse';

export const HOOK_EVENTS: HookEvent[] = ['SessionStart', 'UserPromptSubmit', 'PreToolUse'];

export interface HookPayload {
  /** 会话/项目根目录：以 payload.cwd 为准（三家钩子命令的工作目录语义不一致），缺省回退 process.cwd() */
  cwd: string;
  toolName?: string;
  /** PreToolUse 涉及的文件路径；apply_patch 类工具可能一次补丁改多个文件；非编辑事件无此字段 */
  filePaths?: string[];
  prompt?: string;
}

/** 从 apply_patch 的补丁文本提取文件路径（Codex：路径在补丁头行，不在 tool_input.file_path） */
export function pathsFromPatch(command: string): string[] {
  const out: string[] = [];
  for (const m of command.matchAll(/\*\*\* (?:Update|Add|Delete|Move) File: (.+)/g)) {
    const p = m[1].trim();
    // Move File 形如 "Move File: a -> b"，两个路径都算
    for (const part of p.split('->')) {
      const t = part.trim();
      if (t) {
        out.push(t);
      }
    }
  }
  return out;
}

export function normalize(event: HookEvent, raw: unknown, fallbackCwd: string): HookPayload {
  const r = (raw ?? {}) as Record<string, unknown>;
  const cwd = typeof r.cwd === 'string' && r.cwd ? r.cwd : fallbackCwd;
  const payload: HookPayload = { cwd, filePaths: [] };
  if (event === 'UserPromptSubmit' && typeof r.prompt === 'string') {
    payload.prompt = r.prompt;
  }

  if (event === 'PreToolUse') {
    if (typeof r.tool_name === 'string') {
      payload.toolName = r.tool_name;
    }
    const input = (r.tool_input ?? {}) as Record<string, unknown>;
    if (typeof input.file_path === 'string') {
      // Claude Code / ZCode 的 Edit/Write
      payload.filePaths = [input.file_path];
    } else if (typeof input.command === 'string') {
      // Codex 的 apply_patch：路径在补丁文本里；解析不出（格式漂移）保持空数组，由 fail-safe 判定拦下
      payload.filePaths = pathsFromPatch(input.command);
    }
  }
  return payload;
}

/** 事件名归一化：配置里大小写/格式不一（pretooluse / PreToolUse） */
export function toHookEvent(name: string): HookEvent | null {
  const key = name.toLowerCase().replace(/[^a-z]/g, '');
  const map: Record<string, HookEvent> = {
    sessionstart: 'SessionStart',
    userpromptsubmit: 'UserPromptSubmit',
    pretooluse: 'PreToolUse',
  };
  return map[key] ?? null;
}
