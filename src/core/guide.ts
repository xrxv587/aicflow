import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const GUIDE_FILES = ['CLAUDE.md', 'AGENTS.md', '.cursorrules', 'GEMINI.md'];

export const GUIDE_START = '<!-- ai-continue:guide:start -->';
export const GUIDE_END = '<!-- ai-continue:guide:end -->';

export function guideText(): string {
  return [
    GUIDE_START,
    '## AI 任务断点（ai-continue）',
    '',
    '本项目使用 `aic` 管理跨会话任务断点，断点文件为 `.ai-continue/current.md`。',
    '',
    '### 会话开始时',
    '1. 执行 `aic status` 查看当前任务、进度与上下文备注；命令失败时按提示处理。',
    '2. 若存在未完成待办，先与用户确认是否继续该任务，再开始工作。',
    '',
    '### 阶段工作完成或会话结束前',
    '直接编辑 `.ai-continue/current.md`：',
    '- 勾选、新增或调整「## 待办」下的条目，格式固定为 `- [ ] 文字`（未完成）/ `- [x] 文字`（已完成）。',
    '- 把关键决策、踩坑、涉及文件等写入「## 上下文」，供下次会话恢复。',
    '- 将 frontmatter 中 `updated` 更新为当前时间（格式 `YYYY-MM-DD HH:mm`）。',
    '- 只修改内容，保持 frontmatter 与两个章节的结构不变。',
    '',
    '### 任务全部完成时',
    '执行 `aic done` 归档断点文件。',
    GUIDE_END,
  ].join('\n');
}

export async function findGuideFiles(cwd: string): Promise<string[]> {
  const found: string[] = [];
  for (const name of GUIDE_FILES) {
    try {
      await readFile(path.join(cwd, name), 'utf8');
      found.push(name);
    } catch {
      // 不存在则跳过
    }
  }
  return found;
}

export function hasGuide(content: string): boolean {
  return content.includes(GUIDE_START);
}
