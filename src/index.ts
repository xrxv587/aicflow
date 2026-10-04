#!/usr/bin/env node

import { Command, Option } from 'commander';
import { runInit } from './commands/init.js';
import { runStart } from './commands/start.js';
import { runStatus } from './commands/status.js';
import { runDone } from './commands/done.js';
import { runHook } from './commands/hook.js';
import { runHooks } from './commands/hooks.js';
import { ExitCode } from './core/exit.js';

const program = new Command();

program
  .name('aic')
  .description('AI 协作工作流工具：PRD/TRD 共识先行、断点续接、验收归档全程留痕')
  .version('0.1.0');

program
  .command('init')
  .description('项目初始化：注入 AI 引导并铺设 PRD/TRD 模板（幂等，可重复执行）')
  .argument('[task]', '（不支持）开任务请用 aic start')
  .option('-y, --yes', '跳过询问')
  .option('--hooks', '同时铺设客户端钩子配置（Claude Code / Codex / ZCode，防绕过加固）')
  .action((task, options) => {
    if (task !== undefined) {
      console.error('aic init 不创建任务，请使用 aic start <任务名>');
      process.exitCode = ExitCode.NoTaskOrRejected;
      return;
    }
    return runInit(options.yes, options.hooks ?? false);
  });

program
  .command('start')
  .description('开始一个新任务：创建断点文件（已有任务需先 aic done）')
  .argument('[task]', '任务名')
  .option('-y, --yes', '跳过所有询问，使用默认值')
  .addOption(new Option('--spec', '（已移除）PRD/TRD 由 AI 按引导生成').hideHelp())
  .action((task, options) => {
    if (options.spec) {
      console.error('aic start 不再接受 --spec：PRD/TRD 由 AI 按引导用模板生成，双首肯后再 aic start');
      process.exitCode = ExitCode.NoTaskOrRejected;
      return;
    }
    return runStart(task, options.yes);
  });

program
  .command('status')
  .description('查看当前任务进度与下一步（AI 会话开始时执行）')
  .action(() => runStatus());

program
  .command('done')
  .description('归档当前任务（有 PRD 的任务需先验收并获用户认可）')
  .option('-f, --force', '跳过验收、未完成确认与结构校验')
  .option('--accepted', '声明验收已获用户认可（有 PRD 的任务归档必填）')
  .action((options) => runDone(options.force, options.accepted ?? false));

program
  .command('hook')
  .description('钩子管道入口：由客户端钩子配置调用（stdin 收 payload，stdout 出决策/注入）')
  .argument('<event>', 'SessionStart | UserPromptSubmit | PreToolUse')
  .requiredOption('--client <id>', 'claude | codex | zcode')
  .action((event, options) => runHook(event, options.client));

program
  .command('hooks')
  .description('客户端钩子接入管理：查看/重铺（--remove 卸载）；铺设走 aic init --hooks')
  .option('--remove', '移除 aic 铺设的钩子条目（用户自有钩子与配置不动）')
  .action((options) => runHooks(options.remove ?? false));

program.parseAsync().catch((err: Error) => {
  console.error(err.message);
  process.exit(ExitCode.NoTaskOrRejected);
});
