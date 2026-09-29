import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const AI_DIR = '.ai-continue';
export const CURRENT_FILE = path.join(AI_DIR, 'current.md');
export const ARCHIVE_DIR = path.join(AI_DIR, 'archive');

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

/** current.md 出生模板。spec 指针不在此处生成：大任务的 PRD/TRD 首肯后由 AI 写入 frontmatter */
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

export interface ArchiveResult {
  /** 归档目录的相对路径 */
  dir: string;
  /** 指针悬空时记录缺失的 spec 值，归档仍继续 */
  specMissing: string | null;
}

export async function archiveTask(cwd: string, task: string, spec: string | null): Promise<ArchiveResult> {
  const name = `${timestamp()}-${slugify(task)}`;
  const root = path.join(cwd, ARCHIVE_DIR, name);
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
