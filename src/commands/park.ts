import { moveTaskGroup, parse, readCurrent } from '../core/current.js';
import { ExitCode } from '../core/exit.js';

/**
 * 挂起当前任务：current.md + spec 整组移入 parked/，纯移动、不碰代码。
 * 无确认交互——park 可逆、不产生"完成"声明，未完成确认是噪音；AI 非交互可无障碍执行。
 */
export async function runPark(force: boolean): Promise<void> {
  const cwd = process.cwd();
  const content = await readCurrent(cwd);
  if (content === null) {
    console.error('尚未开始任务：没有可挂起的任务');
    process.exitCode = ExitCode.NoTaskOrRejected;
    return;
  }

  const result = parse(content);
  if (!result.ok && !force) {
    console.error('断点文件结构异常，先修复后再挂起（或使用 --force 跳过校验）：');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exitCode = ExitCode.MalformedState;
    return;
  }

  const task = result.ok ? result.data.task : 'task';
  const spec = result.ok ? result.data.spec : null;
  const moved = await moveTaskGroup(cwd, task, spec, 'parked');
  console.log(`已挂起任务：${task} → ${moved.dir}（可 aic resume 恢复）`);
  if (moved.specMissing) {
    console.log(`⚠ 需求目录缺失，仅挂起了 current.md：${moved.specMissing}`);
  }
}
