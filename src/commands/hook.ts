import { dispatchHook, toHookEvent } from '../core/hook/dispatch.js';
import { CLIENT_IDS, type ClientId } from '../core/hook/clients.js';
import { ExitCode } from '../core/exit.js';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * 钩子管道入口：由各客户端钩子配置调用（stdin 收 payload，stdout 出决策/注入）。
 * 输出与异常语义见 core/hook/dispatch.ts——fail-open，任何异常放行。
 */
export async function runHook(eventArg: string, clientArg: string): Promise<void> {
  const event = toHookEvent(eventArg);
  if (!event || !CLIENT_IDS.includes(clientArg as ClientId)) {
    console.error('用法：aic hook <SessionStart|UserPromptSubmit|PreToolUse> --client <claude|codex|zcode>');
    process.exitCode = ExitCode.NoTaskOrRejected;
    return;
  }
  const out = await dispatchHook(event, clientArg as ClientId, await readStdin(), process.cwd());
  if (out) {
    console.log(out);
  }
}
