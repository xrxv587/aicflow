import { archiveCurrent, parse, readCurrent } from '../core/breakpoint.js';
import { confirm } from '../core/prompt.js';

export async function runDone(force: boolean): Promise<void> {
  const content = await readCurrent(process.cwd());
  if (content === null) {
    console.error('尚未初始化：没有可归档的任务');
    process.exitCode = 1;
    return;
  }

  const result = parse(content);
  if (!result.ok && !force) {
    console.error('断点文件结构异常，先修复后再归档（或使用 --force 跳过校验）：');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exitCode = 2;
    return;
  }

  const data = result.ok ? result.data : null;
  const undone = data ? data.todos.filter((t) => !t.done) : [];
  if (undone.length > 0 && !force) {
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

  const archived = await archiveCurrent(process.cwd(), data?.task ?? 'task');
  console.log(`已归档到 ${archived}`);
  console.log('可运行 aic init [新任务名] 开始下一个任务。');
}
