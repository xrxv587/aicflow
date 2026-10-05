import { readFile } from 'node:fs/promises';
import { archiveTask, listParked, parse, prdFilePath, readCurrent } from '../core/current.js';
import { confirm } from '../core/prompt.js';
import { hasAcceptanceRecord } from '../core/acceptance.js';
import { ExitCode } from '../core/exit.js';

async function readPrd(cwd: string, spec: string): Promise<string | null> {
  try {
    return await readFile(prdFilePath(cwd, spec), 'utf8');
  } catch {
    return null;
  }
}

export async function runDone(force: boolean, accepted: boolean, abandoned: boolean): Promise<void> {
  const cwd = process.cwd();

  if (accepted && abandoned) {
    console.error('「--accepted」与「--abandoned」互斥：验收归档与放弃归档只能选一个。');
    process.exitCode = ExitCode.NoTaskOrRejected;
    return;
  }

  const content = await readCurrent(cwd);
  if (content === null) {
    console.error('尚未开始任务：没有可归档的任务');
    process.exitCode = ExitCode.NoTaskOrRejected;
    return;
  }

  const result = parse(content);
  if (!result.ok && !force) {
    console.error('断点文件结构异常，先修复后再归档（或使用 --force 跳过校验）：');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exitCode = ExitCode.MalformedState;
    return;
  }

  const data = result.ok ? result.data : null;
  const undone = data ? data.todos.filter((t) => !t.done) : [];
  // --abandoned 本身就是放弃声明，未完成确认是噪音；结构校验仍照常
  if (undone.length > 0 && !force && !abandoned) {
    console.log(`仍有 ${undone.length} 项未完成：`);
    for (const t of undone) {
      console.log(`  [ ] ${t.text}`);
    }
    const ok = await confirm('确定归档当前任务吗？');
    if (!ok) {
      console.log('已取消。');
      return;
    }
  }

  // 出口门禁：有 PRD 的任务必须先验收并获用户认可才能归档；放弃归档豁免（放弃无验收可言）
  if (data?.spec && !force && !abandoned) {
    const prd = await readPrd(cwd, data.spec);
    if (prd === null) {
      console.error(`需求目录或 prd.md 缺失：${data.spec}。修复指针后重试，或使用 --force 跳过。`);
      process.exitCode = ExitCode.NoTaskOrRejected;
      return;
    }
    if (!hasAcceptanceRecord(prd)) {
      console.error('prd.md 缺少「## 验收」记录：先按「已确认 · 验收标准」逐条自检并写入 PRD，再归档（--force 可跳过）。');
      process.exitCode = ExitCode.NoTaskOrRejected;
      return;
    }
    if (!accepted) {
      if (process.stdin.isTTY) {
        const ok = await confirm('验收标准已逐条通过并获用户认可，确定归档？');
        if (!ok) {
          console.log('已取消。');
          return;
        }
      } else {
        console.error('有 PRD 的任务归档需要 --accepted：先向用户输出验收报告，获明确认可后再执行（--force 可跳过）。');
        process.exitCode = ExitCode.NoTaskOrRejected;
        return;
      }
    }
  }

  const archived = await archiveTask(cwd, data?.task ?? 'task', data?.spec ?? null, abandoned);
  if (abandoned) {
    console.log(`已放弃并归档任务：${data?.task ?? 'task'} → ${archived.dir}（未完成，历史带放弃标记）`);
  } else {
    console.log(`已归档到 ${archived.dir}`);
  }
  if (archived.specMissing) {
    console.log(`⚠ 需求目录缺失，仅归档了 current.md：${archived.specMissing}`);
  }
  const parkedCount = (await listParked(cwd)).length;
  if (parkedCount > 0) {
    console.log(`或 aic resume 恢复挂起的任务（${parkedCount} 个）。`);
  } else {
    console.log('可运行 aic start <新任务名> 开始下一个任务。');
  }
}
