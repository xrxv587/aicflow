#!/usr/bin/env node

import { Command } from 'commander';
import { runInit } from './commands/init.js';
import { runStatus } from './commands/status.js';
import { runDone } from './commands/done.js';

const program = new Command();

program
  .name('aic')
  .description('AI 跨会话任务断点工具：让 AI 客户端通过断点文件续上未完成任务')
  .version('0.1.0');

program
  .command('init')
  .description('初始化断点文件，并将 AI 引导注入项目的引导文件')
  .argument('[task]', '任务名')
  .option('-y, --yes', '跳过所有询问，使用默认值')
  .action((task, options) => runInit(task, options.yes));

program
  .command('status')
  .description('查看当前任务进度与上下文（AI 会话开始时执行）')
  .action(() => runStatus());

program
  .command('done')
  .description('归档当前任务断点文件')
  .option('-f, --force', '跳过未完成确认与结构校验')
  .action((options) => runDone(options.force));

program.parseAsync().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
