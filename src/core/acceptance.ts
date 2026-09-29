/**
 * 「## 验收」章节是否已有逐条记录（至少一行 checkbox）。
 * 骨架模板自带空章节，只认章节会被空章节骗过，因此必须查到实际条目。
 */
export function hasAcceptanceRecord(content: string): boolean {
  const section = content.match(/^##\s+验收\s*$/m);
  if (!section || section.index === undefined) {
    return false;
  }
  const rest = content.slice(section.index + section[0].length);
  const next = rest.match(/^##\s+/m);
  const body = next && next.index !== undefined ? rest.slice(0, next.index) : rest;
  return /^\s*-\s+\[/m.test(body);
}
