/**
 * 进程退出码：给 AI 客户端的机器可读协议（见 docs/wiki/cli.md 退出码矩阵）。
 * 数值是公开契约，改动会破坏已注入引导下 AI 的判断逻辑，勿动。
 */
export enum ExitCode {
  /** 正常完成（含"已有任务跳过"等软结果） */
  Ok = 0,
  /** 没有可操作对象（未开始任务），或门禁拒绝（验收未通过 / 缺 --accepted / 旧用法拦截 / 顶层异常兜底） */
  NoTaskOrRejected = 1,
  /** 状态文件 current.md 结构异常，需先按提示修复再继续 */
  MalformedState = 2,
}
