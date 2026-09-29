import { parse, readCurrent } from '../core/breakpoint.js';

export async function runStatus(): Promise<void> {
  const content = await readCurrent(process.cwd());
  if (content === null) {
    console.error('尚未初始化：请先运行 aic init [任务名]');
    process.exitCode = 1;
    return;
  }

  const result = parse(content);
  if (!result.ok) {
    console.error('断点文件结构异常，请按以下提示修复 .ai-continue/current.md：');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exitCode = 2;
    return;
  }

  const { task, updated, todos, context } = result.data;
  const doneCount = todos.filter((t) => t.done).length;

  let state: string;
  if (todos.length === 0) {
    state = '尚无待办条目';
  } else if (doneCount === todos.length) {
    state = '全部完成，可执行 aic done 归档';
  } else {
    state = '进行中';
  }

  console.log(`任务：${task}`);
  console.log(`更新时间：${updated ?? '未知'}`);
  console.log(`进度：${doneCount}/${todos.length} 已完成（${state}）`);
  console.log('');
  console.log('待办：');
  if (todos.length === 0) {
    console.log('  （空）');
  }
  for (const t of todos) {
    console.log(`  [${t.done ? 'x' : ' '}] ${t.text}`);
  }
  console.log('');
  console.log('上下文：');
  const ctx = context || '（空）';
  for (const line of ctx.split('\n')) {
    console.log(`  ${line}`);
  }
}
