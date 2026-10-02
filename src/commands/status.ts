import { readFile } from 'node:fs/promises';
import { parse, prdFilePath, readCurrent } from '../core/current.js';
import { hasAcceptanceRecord } from '../core/acceptance.js';
import { ExitCode } from '../core/exit.js';

export async function runStatus(): Promise<void> {
  const cwd = process.cwd();
  const content = await readCurrent(cwd);
  if (content === null) {
    console.error('尚未开始任务：请先运行 aic start <任务名>');
    process.exitCode = ExitCode.NoTaskOrRejected;
    return;
  }

  const result = parse(content);
  if (!result.ok) {
    console.error('断点文件结构异常，请按以下提示修复 .ai-continue/current.md：');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exitCode = ExitCode.MalformedState;
    return;
  }

  const { task, updated, spec, next, todos } = result.data;
  const doneCount = todos.filter((t) => t.done).length;
  const finished = todos.length > 0 && doneCount === todos.length;

  let state: string;
  if (todos.length === 0) {
    state = '尚无待办条目';
  } else if (finished) {
    state = '全部完成，可验收后 aic done 归档';
  } else {
    state = '进行中';
  }

  console.log(`任务：${task}`);
  console.log(`更新时间：${updated ?? '未知'}`);
  console.log(`进度：${doneCount}/${todos.length} 已完成（${state}）`);
  if (spec) {
    try {
      const prd = await readFile(prdFilePath(cwd, spec), 'utf8');
      console.log(`需求：${spec}`);
      console.log(`验收：${hasAcceptanceRecord(prd) ? '已记录' : '未记录'}`);
    } catch {
      console.log(`需求：${spec}（⚠ 目录或 prd.md 缺失）`);
    }
  }

  console.log('');
  console.log('下一步：');
  if (next) {
    for (const line of next.split('\n')) {
      console.log(`  ${line}`);
    }
  } else if (!finished) {
    console.log('  （未设置，建议写明当前最要紧的动作，精确到文件/函数）');
  }

  console.log('');
  console.log('待办：');
  if (todos.length === 0) {
    console.log('  （空）');
  }
  for (const t of todos) {
    console.log(`  [${t.done ? 'x' : ' '}] ${t.text}`);
  }
}
