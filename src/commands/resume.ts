import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { listParked, parse, readCurrent, resumeTask, PARKED_DIR } from '../core/current.js';
import { ask } from '../core/prompt.js';
import { ExitCode } from '../core/exit.js';

interface Candidate {
  name: string;
  task: string;
}

/** 从挂起卡读任务名；读不到（结构异常/文件缺失）就回退目录名，不阻断清单 */
async function describe(cwd: string, name: string): Promise<Candidate> {
  let task = name;
  try {
    const content = await readFile(path.join(cwd, PARKED_DIR, name, 'current.md'), 'utf8');
    const parsed = parse(content);
    if (parsed.ok) {
      task = parsed.data.task;
    }
  } catch {
    // 回退目录名
  }
  return { name, task };
}

function parkedAt(name: string): string | null {
  const m = name.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})(\d{2})-/);
  return m ? `${m[1]} ${m[2]}:${m[3]}:${m[4]}` : null;
}

function printList(candidates: Candidate[]): void {
  console.log('挂起的任务（新→旧）：');
  candidates.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.task}（${c.name}）`);
  });
}

/**
 * 恢复挂起任务。唯一挂起直接恢复（确认放对话层）；状态迁移显式，不做隐式 auto-park。
 * 指针路径冲突 fail-closed：拒绝、点名成因，不覆盖、不自动改名。
 */
export async function runResume(selection: string | undefined): Promise<void> {
  const cwd = process.cwd();

  const existing = await readCurrent(cwd);
  if (existing !== null) {
    const parsed = parse(existing);
    const name = parsed.ok ? parsed.data.task : '（结构异常，见 aic status）';
    console.error(`已有进行中的任务 ${name}，先 aic done 或 aic park 再恢复。`);
    process.exitCode = ExitCode.NoTaskOrRejected;
    return;
  }

  const parked = await listParked(cwd);
  if (parked.length === 0) {
    console.error('没有挂起的任务。');
    process.exitCode = ExitCode.NoTaskOrRejected;
    return;
  }

  const candidates = await Promise.all(parked.map((p) => describe(cwd, p.name)));

  let name: string;
  if (!selection) {
    if (candidates.length === 1) {
      name = candidates[0].name;
    } else if (process.stdin.isTTY) {
      printList(candidates);
      const answer = (await ask('恢复哪一个（序号，回车默认 1）：')).trim();
      const idx = answer === '' ? 1 : Number.parseInt(answer, 10);
      if (!Number.isInteger(idx) || idx < 1 || idx > candidates.length) {
        console.error(`无效序号：${answer}`);
        process.exitCode = ExitCode.NoTaskOrRejected;
        return;
      }
      name = candidates[idx - 1].name;
    } else {
      printList(candidates);
      console.error('有多个挂起任务：请带任务名或序号重试，如 aic resume <任务名>。');
      process.exitCode = ExitCode.NoTaskOrRejected;
      return;
    }
  } else if (/^\d+$/.test(selection)) {
    // 纯数字优先按精确任务名匹配（纯数字名的任务也有权按名选中），否则按清单序号
    const byName = candidates.filter((c) => c.task === selection);
    if (byName.length === 1) {
      name = byName[0].name;
    } else {
      const idx = Number.parseInt(selection, 10);
      if (idx < 1 || idx > candidates.length) {
        console.error(`序号超出范围：${selection}（共 ${candidates.length} 个挂起任务）`);
        process.exitCode = ExitCode.NoTaskOrRejected;
        return;
      }
      name = candidates[idx - 1].name;
    }
  } else {
    const hits = candidates.filter(
      (c) => c.task.includes(selection) || c.name.includes(selection),
    );
    if (hits.length === 0) {
      console.error(`没有匹配「${selection}」的挂起任务：`);
      printList(candidates);
      process.exitCode = ExitCode.NoTaskOrRejected;
      return;
    }
    if (hits.length > 1) {
      console.error(`「${selection}」命中 ${hits.length} 个挂起任务，请给出更长的名字：`);
      printList(hits);
      process.exitCode = ExitCode.NoTaskOrRejected;
      return;
    }
    name = hits[0].name;
  }

  const result = await resumeTask(cwd, name);
  if (result.specConflict) {
    console.error(
      `恢复中止：spec 指针路径冲突——${result.specConflict} 已存在——可能是挂起期间有同名任务建过档，` +
        '请确认目录归属后处理（不覆盖、不自动改名）。',
    );
    process.exitCode = ExitCode.NoTaskOrRejected;
    return;
  }

  const task = result.task ?? '（无法读取任务名，建议跑 aic status 检查）';
  const state = result.parseErrors ? null : await currentState(cwd);
  const at = parkedAt(name);
  console.log(`已恢复任务：${task}${state ? `（进度 ${state.progress}，挂起于 ${at ?? '未知'}）` : ''}`);
  if (result.specMissing) {
    console.log(`⚠ 需求目录缺失，仅恢复了 current.md：${result.specMissing}`);
  }
  if (state?.next) {
    console.log('下一步：');
    for (const line of state.next.split('\n')) {
      console.log(`  ${line}`);
    }
  }
  if (result.parseErrors) {
    console.log('⚠ 挂起卡结构异常（挂起时就已如此，未受恢复影响），建议跑 aic status 查看修复建议。');
  }
  console.log('');
  console.log('提示：挂起期间代码可能已被其他任务修改，请先重读 PRD/TRD，');
  console.log('并核对「下一步」仍成立，再继续编码（aic status 查看完整状态）。');
}

/** 恢复后的 current.md 状态：进度 + 下一步（mini-status 用） */
async function currentState(cwd: string): Promise<{ progress: string; next: string } | null> {
  const content = await readCurrent(cwd);
  if (content === null) {
    return null;
  }
  const parsed = parse(content);
  if (!parsed.ok) {
    return null;
  }
  const done = parsed.data.todos.filter((t) => t.done).length;
  return {
    progress: `${done}/${parsed.data.todos.length}`,
    next: parsed.data.next,
  };
}
