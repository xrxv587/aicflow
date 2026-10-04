/**
 * 新需求触发词（偏宽表）：误报代价只是一段提醒，漏报代价是流程被绕过，不对称故从宽。
 * 中英文各覆盖"新需求/新功能/新任务"与常见开始/实现句式。
 */
const TRIGGER_RE = new RegExp(
  [
    '新需求',
    '新功能',
    '新任务',
    '新特性',
    '开始.{0,6}(需求|功能|任务|特性)',
    '(加|做|写|开发|实现|整)一个?(新)?(功能|需求|任务|特性|模块)',
    'new (feature|requirement|task)',
    'start (a )?(new )?(feature|task|requirement)',
    'implement (a )?(new )?feature',
  ].join('|'),
  'i',
);

export function isNewRequirementPrompt(prompt: string | undefined): boolean {
  if (!prompt) {
    return false;
  }
  return TRIGGER_RE.test(prompt);
}
