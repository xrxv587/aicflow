#!/usr/bin/env node
/**
 * 钩子专用轻量入口（不经 commander）：客户端钩子配置直接指向 dist/hook.js，
 * 省掉 CLI 框架加载（性能预算 <100ms/次，实测见 development.md）。
 * 参数：hook.js <event> --client <claude|codex|zcode>
 */
import { runHook } from './commands/hook.js';

const args = process.argv.slice(2);
let client = '';
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--client' && args[i + 1]) {
    client = args[++i];
  } else if (args[i].startsWith('--client=')) {
    client = args[i].slice('--client='.length);
  }
}
runHook(args[0] ?? '', client).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
