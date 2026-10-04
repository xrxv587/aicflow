import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ClientId } from './clients.js';
import type { HookEvent } from './payload.js';

/** 识别"我们写的钩子条目"的特征串：命令里指向 aicflow 钩子轻量入口的调用 */
const SIG = 'dist/hook.js';

const EDIT_MATCHER = 'Edit|Write|ApplyPatch|apply_patch';

/** 三个事件在客户端配置里的 matcher（UserPromptSubmit/SessionStart 不过滤，判断在脚本内做） */
function matcherFor(event: HookEvent): string | undefined {
  return event === 'PreToolUse' ? EDIT_MATCHER : undefined;
}

/** 钩子命令：Claude/ZCode 用模板变量取项目根；Codex 无模板变量，官方推荐 git root shell 展开。
 *  指向轻量入口 hook.js（不经 commander），控制每次工具调用上的同步开销。 */
function hookCommand(client: ClientId, event: HookEvent): string {
  const target = client === 'codex'
    ? '"$(git rev-parse --show-toplevel)/node_modules/aicflow/dist/hook.js"'
    : '"${CLAUDE_PROJECT_DIR}/node_modules/aicflow/dist/hook.js"';
  return `node ${target} ${event.toLowerCase()} --client ${client}`;
}

interface ClientPlan {
  client: ClientId;
  /** 配置文件绝对路径 */
  file: string;
  /** 从已读 JSON 中取/建事件表（三家包裹层级不同：Claude/Codex 直挂 hooks 下，ZCode 在 hooks.events 下） */
  eventsOf: (obj: Record<string, unknown>) => Record<string, unknown>;
  /** ZCode 需要显式启用钩子运行器 */
  enable?: (obj: Record<string, unknown>) => void;
}

function plans(cwd: string): ClientPlan[] {
  return [
    {
      client: 'claude',
      file: path.join(cwd, '.claude', 'settings.json'),
      eventsOf: (obj) => {
        obj.hooks ??= {};
        return obj.hooks as Record<string, unknown>;
      },
    },
    {
      client: 'zcode',
      file: path.join(cwd, '.zcode', 'config.json'),
      eventsOf: (obj) => {
        obj.hooks ??= { events: {} };
        const hooks = obj.hooks as Record<string, unknown>;
        hooks.events ??= {};
        return hooks.events as Record<string, unknown>;
      },
      enable: (obj) => {
        const hooks = obj.hooks as Record<string, unknown>;
        hooks.enabled = true;
      },
    },
    {
      client: 'codex',
      file: path.join(cwd, '.codex', 'hooks.json'),
      eventsOf: (obj) => {
        obj.hooks ??= {};
        return obj.hooks as Record<string, unknown>;
      },
    },
  ];
}

type EventTable = Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>>;

function isOursEntry(entry: unknown): boolean {
  const e = entry as { hooks?: Array<{ command?: unknown }> };
  return Array.isArray(e?.hooks) && e.hooks.some((h) => typeof h.command === 'string' && h.command.includes(SIG));
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw e;
  }
}

export interface InstallOutcome {
  client: ClientId;
  file: string;
  /** false = 本地未装 aicflow，跳过（命令会指向不存在的路径） */
  installed: boolean;
  added: string[];
  skipped: string[];
}

/** 铺设三客户端钩子配置：幂等（已存在即跳过），只增删自己的条目，绝不触碰用户已有钩子 */
export async function installHooks(
  cwd: string,
  events: HookEvent[],
): Promise<{ outcomes: InstallOutcome[]; pkgMissing: boolean }> {
  const pkgPath = path.join(cwd, 'node_modules', 'aicflow', 'dist', 'hook.js');
  let pkgMissing = false;
  try {
    await access(pkgPath);
  } catch {
    pkgMissing = true;
  }

  const outcomes: InstallOutcome[] = [];
  for (const plan of plans(cwd)) {
    const outcome: InstallOutcome = { client: plan.client, file: path.relative(cwd, plan.file), installed: !pkgMissing, added: [], skipped: [] };
    if (pkgMissing) {
      outcomes.push(outcome);
      continue;
    }
    const obj = (await readJson(plan.file)) ?? {};
    const table = plan.eventsOf(obj) as EventTable;
    plan.enable?.(obj);
    for (const event of events) {
      const list = (table[event] ??= []);
      if (list.some(isOursEntry)) {
        outcome.skipped.push(event);
        continue;
      }
      list.push({ matcher: matcherFor(event), hooks: [{ type: 'command', command: hookCommand(plan.client, event) }] });
      outcome.added.push(event);
    }
    await mkdir(path.dirname(plan.file), { recursive: true });
    await writeFile(plan.file, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
    outcomes.push(outcome);
  }
  return { outcomes, pkgMissing };
}

export interface RemoveOutcome {
  client: ClientId;
  file: string;
  removed: string[];
  missing: boolean;
}

/** 卸载：按特征串精确移除自己写的条目；用户已有条目与 ZCode 的 enabled 设置不动 */
export async function removeHooks(cwd: string): Promise<RemoveOutcome[]> {
  const outcomes: RemoveOutcome[] = [];
  for (const plan of plans(cwd)) {
    const obj = await readJson(plan.file);
    if (obj === null) {
      outcomes.push({ client: plan.client, file: path.relative(cwd, plan.file), removed: [], missing: true });
      continue;
    }
    const table = plan.eventsOf(obj) as EventTable;
    const removed: string[] = [];
    for (const [event, list] of Object.entries(table)) {
      const kept = list.filter((e) => !isOursEntry(e));
      if (kept.length !== list.length) {
        removed.push(event);
      }
      if (kept.length === 0) {
        delete table[event];
      } else {
        table[event] = kept;
      }
    }
    if (removed.length > 0) {
      await writeFile(plan.file, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
    }
    outcomes.push({ client: plan.client, file: path.relative(cwd, plan.file), removed, missing: false });
  }
  return outcomes;
}
