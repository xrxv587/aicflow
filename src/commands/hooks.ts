import { installHooks, removeHooks } from '../core/hook/install.js';
import { HOOK_EVENTS } from '../core/hook/payload.js';

/**
 * `aic hooks`：查看/卸载客户端钩子接入。铺设走 `aic init --hooks`。
 */
export async function runHooks(remove: boolean): Promise<void> {
  const cwd = process.cwd();
  if (remove) {
    const outcomes = await removeHooks(cwd);
    for (const o of outcomes) {
      if (o.missing) {
        console.log(`${o.client}：无配置文件（${o.file}），跳过。`);
      } else if (o.removed.length === 0) {
        console.log(`${o.client}：没有发现 aic 钩子条目（${o.file}）。`);
      } else {
        console.log(`${o.client}：已移除 ${o.removed.join('、')}（${o.file}）。`);
      }
    }
    console.log('卸载完成。ZCode 的 hooks.enabled 与用户自有钩子条目保持不动。');
    return;
  }

  const { outcomes, pkgMissing } = await installHooks(cwd, HOOK_EVENTS);
  if (pkgMissing) {
    console.error('未找到 node_modules/aicflow/dist/hook.js：请先在本项目安装 aicflow（npm/yarn install），再运行 aic init --hooks。');
    process.exitCode = 1;
    return;
  }
  for (const o of outcomes) {
    const added = o.added.length > 0 ? `已写入 ${o.added.join('、')}` : '已全部存在，跳过';
    console.log(`${o.client} → ${o.file}：${added}`);
  }
  console.log('\n注意（Codex）：钩子需在 Codex CLI 内执行 /hooks 审阅并信任后才会运行；项目须受信任（项目级 .codex/ 配置才会加载）。');
  console.log('注意（Codex）：该客户端不支持批准上抛（ask），过程防线自动降级为模型可见提醒。');
}
