import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const BREAKPOINT_DIR = '.ai-continue';
export const CURRENT_FILE = path.join(BREAKPOINT_DIR, 'current.md');
export const ARCHIVE_DIR = path.join(BREAKPOINT_DIR, 'archive');

export interface TodoItem {
  text: string;
  done: boolean;
}

export interface Breakpoint {
  task: string;
  updated: string | null;
  todos: TodoItem[];
  context: string;
}

export type ParseResult =
  | { ok: true; data: Breakpoint }
  | { ok: false; errors: string[] };

export function formatNow(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

function timestamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

export function renderTemplate(task: string): string {
  return [
    '---',
    `task: ${task}`,
    `updated: ${formatNow()}`,
    '---',
    '',
    '## 待办',
    '',
    '## 上下文',
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
  if (!sections.has('上下文')) {
    errors.push('缺少「## 上下文」章节');
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

  const context = (sections.get('上下文') ?? []).join('\n').trim();
  return { ok: true, data: { task: meta.task, updated: meta.updated ?? null, todos, context } };
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
  await mkdir(path.join(cwd, BREAKPOINT_DIR), { recursive: true });
  await writeFile(path.join(cwd, CURRENT_FILE), content, 'utf8');
}

export async function archiveCurrent(cwd: string, task: string): Promise<string> {
  const safe = task.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'task';
  const name = `${timestamp()}-${safe}.md`;
  const dir = path.join(cwd, ARCHIVE_DIR);
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, name);
  await rename(path.join(cwd, CURRENT_FILE), target);
  return path.relative(cwd, target);
}
