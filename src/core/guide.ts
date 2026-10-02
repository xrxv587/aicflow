import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const GUIDE_FILES = ['CLAUDE.md', 'AGENTS.md', '.cursorrules', 'GEMINI.md'];

const START_MARK = '<!-- ai-continue:guide:start -->';
const END_MARK = '<!-- ai-continue:guide:end -->';

export function guideText(): string {
  return [
    START_MARK,
    '## AI 工作流（ai-continue）',
    '',
    '本项目使用 `aic` 管理需求与任务：`.ai-continue/current.md` 是任务状态，`.ai-continue/specs/<任务>/` 存放需求文档（PRD）与技术方案（TRD），任务完成后整组归档留痕。',
    '',
    '调用方式：统一用 `npx aic <子命令>`（全局已安装时 `aic` 亦可；下文 `aic xxx` 均同此写法）。',
    '',
    '### 收到新需求时（先共识，后编码）',
    '1. 先复述你对需求的理解，只提出会改变做法的澄清问题。',
    '2. 小改动（单文件、无歧义）：一句话对齐后 `aic start <任务名>` 开工即可，不建文档。',
    '3. 大任务（跨会话/多文件）按序执行，每步未获用户首肯不得进入下一步：',
    '   1. 与用户确认目标、边界（不做什么）、验收标准；',
    `   2. 复制 \`.ai-continue/templates/prd.md\` 到 \`.ai-continue/specs/<任务>/prd.md\`（目录名取任务名，把空格与 \\ / : * ? " < > | 替换为 -；同名目录已存在时先与用户确认是否同一任务），把共识写入「## 已确认」区，**PRD 交用户首肯**；`,
    '   3. 调研代码库后，复制 `.ai-continue/templates/trd.md` 到同目录 `trd.md`，写清方案概述、设计决策与选型（含理由）、影响范围（文件/模块）、实施步骤、风险与应对，**TRD 交用户首肯**；',
    '   4. 执行 `aic start <任务名>`，随后把 `spec: specs/<任务>/` 写入 current.md 的 frontmatter，开始编码。',
    '',
    '### 会话开始时',
    '1. 执行 `aic status` 查看任务、进度与下一步；命令失败时按提示处理。',
    '2. 存在未完成待办时，先与用户确认是否继续，再从「## 下一步」接续执行。',
    '3. PRD/TRD 按需再读，不要开场全量读。',
    '',
    '### 执行中 / 阶段工作完成或会话结束前',
    '编辑 `.ai-continue/current.md`：',
    '- 更新「## 待办」checkbox（`- [ ] 文字` / `- [x] 文字`）。',
    '- 把「## 下一步」改写为当前最要紧的动作（精确到文件/函数）。',
    '- frontmatter `updated` 更新为当前时间（格式 `YYYY-MM-DD HH:mm`）；除 `updated` 与建档时写入的 `spec` 指针外，不改动 frontmatter 与章节结构。',
    '- 需求类疑问、倾向与已验证的发现写入 PRD「## 未确认」；「## 已确认」未经用户确认不得修改，确认后条目上移。',
    '- 方案级调整先改 TRD 并告知用户，再动代码。',
    '',
    '### 任务全部完成时（先验收，后归档）',
    '1. 待办全部完成 ≠ 任务完成。按 PRD「已确认 · 验收标准」逐条自检，把结果与证据写入 PRD「## 验收」区（`- [x] 标准 —— 通过，证据：…`）。',
    '2. 向用户输出验收报告；未通过的标准继续修复，或把分歧写入「未确认」请用户决策。',
    `3. 获用户明确认可后执行 \`aic done --accepted\`。无文档的小任务：一句话核对后 \`aic done\` 即可。`,
    END_MARK,
  ].join('\n');
}

export type GuideScan =
  | { kind: 'none' }
  /** 有 start 无 end：标记未闭合，不安全，跳过该文件 */
  | { kind: 'malformed' }
  | { kind: 'present' };

export function scanGuide(content: string): GuideScan {
  const startIdx = content.indexOf(START_MARK);
  if (startIdx === -1) {
    return { kind: 'none' };
  }
  if (content.indexOf(END_MARK, startIdx + START_MARK.length) === -1) {
    return { kind: 'malformed' };
  }
  return { kind: 'present' };
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
