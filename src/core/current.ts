import { mkdir, rmdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const AI_DIR = '.ai-continue';
export const CURRENT_FILE = path.join(AI_DIR, 'current.md');
export const ARCHIVE_DIR = path.join(AI_DIR, 'archive');
export const PARKED_DIR = path.join(AI_DIR, 'parked');

export interface TodoItem {
  text: string;
  done: boolean;
}

export interface TaskState {
  task: string;
  updated: string | null;
  /** 需求档案目录指针，形如 `specs/<任务>/`，相对 .ai-continue/；小任务可缺省 */
  spec: string | null;
  /** 「## 下一步」：当前最要紧的动作，自由文本 */
  next: string;
  todos: TodoItem[];
}

export type ParseResult =
  | { ok: true; data: TaskState }
  | { ok: false; errors: string[] };

export function formatNow(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

function timestamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/** 任务名 → 文件系统安全的 slug（归档目录命名用；specs 目录名由 AI 按引导同样的规则自取） */
export function slugify(task: string): string {
  return task.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'task';
}

/** current.md 出生模板。spec 指针不在此处生成：大任务的 PRD/TRD 确认后由 AI 写入 frontmatter */
export function renderTemplate(task: string): string {
  return [
    '---',
    `task: ${task}`,
    `updated: ${formatNow()}`,
    '---',
    '',
    '## 待办',
    '',
    '## 下一步',
    '',
    '',
  ].join('\n');
}

const CHECK_RE = /^\s*-\s+\[( |x|X)\]\s*(.*)$/;

export function parse(content: string): ParseResult {
  const errors: string[] = [];
  const lines = content.split(/\r?\n/);

  if (lines[0]?.trim() !== '---') {
    return { ok: false, errors: ['文件必须以 frontmatter 开始（首行为 ---）'] };
  }
  const end = lines.indexOf('---', 1);
  if (end === -1) {
    return { ok: false, errors: ['frontmatter 未闭合（缺少第二个 ---）'] };
  }

  const meta: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) {
      meta[m[1]] = m[2].trim();
    }
  }
  if (!meta.task) {
    errors.push('frontmatter 缺少非空 task 字段');
  }

  const sections = splitSections(lines.slice(end + 1));
  if (!sections.has('待办')) {
    errors.push('缺少「## 待办」章节');
  }

  const todos: TodoItem[] = [];
  for (const line of sections.get('待办') ?? []) {
    if (!line.trim()) {
      continue;
    }
    const m = line.match(CHECK_RE);
    if (!m) {
      errors.push(`待办中存在非 checkbox 行：「${line.trim()}」（格式应为 - [ ] 文字 或 - [x] 文字）`);
      continue;
    }
    const text = m[2].trim();
    if (!text) {
      continue;
    }
    todos.push({ text, done: m[1].toLowerCase() === 'x' });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const next = (sections.get('下一步') ?? []).join('\n').trim();
  return {
    ok: true,
    data: {
      task: meta.task,
      updated: meta.updated ?? null,
      spec: meta.spec?.trim() || null,
      next,
      todos,
    },
  };
}

function splitSections(body: string[]): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of body) {
    const m = line.match(/^##\s+(.*)$/);
    if (m) {
      current = m[1].trim();
      if (!sections.has(current)) {
        sections.set(current, []);
      }
    } else if (current) {
      sections.get(current)!.push(line);
    }
  }
  return sections;
}

export async function readCurrent(cwd: string): Promise<string | null> {
  try {
    return await readFile(path.join(cwd, CURRENT_FILE), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw e;
  }
}

export async function writeCurrent(cwd: string, content: string): Promise<void> {
  await mkdir(path.join(cwd, AI_DIR), { recursive: true });
  await writeFile(path.join(cwd, CURRENT_FILE), content, 'utf8');
}

export function specDirPath(cwd: string, spec: string): string {
  return path.resolve(cwd, AI_DIR, spec);
}

export function prdFilePath(cwd: string, spec: string): string {
  return path.join(specDirPath(cwd, spec), 'prd.md');
}

export interface MoveResult {
  /** 归档/挂起目录的相对路径 */
  dir: string;
  /** 指针悬空时记录缺失的 spec 值，移动仍继续 */
  specMissing: string | null;
}

export type TaskGroupDest = 'archive' | 'parked';

/** park 与 done 共用的整组移动：current.md + spec 指针所指需求目录，纯 rename、不碰文件内容 */
export async function moveTaskGroup(
  cwd: string,
  task: string,
  spec: string | null,
  dest: TaskGroupDest,
  abandoned = false,
): Promise<MoveResult> {
  const suffix = dest === 'archive' && abandoned ? '-abandoned' : '';
  const name = `${timestamp()}-${slugify(task)}${suffix}`;
  const root = path.join(cwd, dest === 'archive' ? ARCHIVE_DIR : PARKED_DIR, name);
  await mkdir(root, { recursive: true });
  await rename(path.join(cwd, CURRENT_FILE), path.join(root, 'current.md'));

  let specMissing: string | null = null;
  if (spec) {
    try {
      // 以 frontmatter 指针为准移动需求目录（含 prd.md/trd.md），不按任务名重算
      await rename(specDirPath(cwd, spec), path.join(root, 'spec'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        specMissing = spec;
      } else {
        throw e;
      }
    }
  }
  return { dir: path.relative(cwd, root), specMissing };
}

export async function archiveTask(cwd: string, task: string, spec: string | null, abandoned = false): Promise<MoveResult> {
  return moveTaskGroup(cwd, task, spec, 'archive', abandoned);
}

export interface ParkedEntry {
  /** parked 下的目录名，形如 2026-10-05_121433-<slug>，时间戳前缀即挂起时间 */
  name: string;
}

/** 列出挂起任务（新→旧）；目录名自带时间戳前缀，字典序倒序即新→旧 */
export async function listParked(cwd: string): Promise<ParkedEntry[]> {
  try {
    const entries = await readdir(path.join(cwd, PARKED_DIR), { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => ({ name: e.name }))
      .sort((a, b) => b.name.localeCompare(a.name));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw e;
  }
}

export interface ResumeResult {
  task: string | null;
  spec: string | null;
  /** 指针目标目录已存在 → 整体拒绝（fail-closed，不覆盖、不自动改名），记录冲突的指针值 */
  specConflict: string | null;
  /** 指针所指需求目录缺失 → 仍恢复 current.md，记录缺失的指针值 */
  specMissing: string | null;
  /** 挂起卡结构异常的错误列表（不拦截恢复——文件自挂起那一刻就没变过） */
  parseErrors: string[] | null;
}

/** 把 parked/<name>/ 整组移回：spec 目录按指针路径归位，current.md 最后归位（指针是唯一真相） */
export async function resumeTask(cwd: string, name: string): Promise<ResumeResult> {
  const root = path.join(cwd, PARKED_DIR, name);
  const cardPath = path.join(root, 'current.md');
  let content: string;
  try {
    content = await readFile(cardPath, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`挂起目录里没有任务卡（current.md），无法恢复：${name}。请检查 .ai-continue/parked/${name}/ 里的内容。`);
    }
    throw e;
  }
  const parsed = parse(content);
  const data = parsed.ok ? parsed.data : null;
  const spec = data?.spec ?? null;

  const result: ResumeResult = {
    task: data?.task ?? null,
    spec,
    specConflict: null,
    specMissing: null,
    parseErrors: parsed.ok ? null : parsed.errors,
  };

  if (spec) {
    // 冲突先实测目标目录，存在即整体拒绝——此刻尚未移动任何文件
    try {
      await stat(specDirPath(cwd, spec));
      result.specConflict = spec;
      return result;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw e;
      }
    }
  }

  // 先落 spec，再落任务卡：任一步失败都不留半成品（卡还在 parked/，重跑即可）
  if (spec) {
    const srcSpec = path.join(root, 'spec');
    let srcExists = true;
    try {
      await stat(srcSpec);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw e;
      }
      srcExists = false;
    }
    if (srcExists) {
      // 目标父目录可能缺失（git 不追踪空目录，提交过 parked/ 的仓库 fresh clone 后没有 specs/），先补齐
      await mkdir(path.dirname(specDirPath(cwd, spec)), { recursive: true });
      await rename(srcSpec, specDirPath(cwd, spec));
    } else {
      result.specMissing = spec;
    }
  }
  await rename(cardPath, path.join(cwd, CURRENT_FILE));
  // 只删得动空目录：残留说明有意外内容，留给用户现场处理
  await rmdir(root).catch(() => undefined);
  return result;
}
