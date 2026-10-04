import path from 'node:path';

/** PreToolUse 拦截排除清单：工作流自身目录与客户端/工具目录 */
const EXCLUDED_DIRS = ['.ai-continue', '.git', 'node_modules', '.zcode', '.claude', '.codex'];

/**
 * 编辑路径是否落在拦截范围：项目（cwd）之内，且不在排除清单。
 * 路径本身缺失（无法解析）按在范围内处理——fail-safe：宁可多问一次，不放过无任务编辑。
 */
export function isWatchedPath(cwd: string, filePath: string | undefined): boolean {
  if (!filePath) {
    return true;
  }
  const rel = path.relative(path.resolve(cwd), path.resolve(cwd, filePath));
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    // 项目根本身或项目之外的路径不拦（如客户端配置、用户主目录下的文件）
    return false;
  }
  const segs = rel.split(path.sep);
  return !segs.some((s) => EXCLUDED_DIRS.includes(s));
}
