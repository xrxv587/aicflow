---
task: park-resume
updated: 2026-10-05 12:14
spec: specs/park-resume/
---

## 待办

- [x] core：current.ts 加 PARKED_DIR、moveTaskGroup（abandoned 后缀）、listParked、resumeTask；current.test.ts 补用例
- [x] commands：park.ts 单行输出、resume.ts 清单/选择器/mini-status、done.ts --abandoned、start.ts/status.ts 提示
- [x] hooks：SessionStart 无任务分支挂起提示 + hook.test.ts
- [x] 引导：插单小节、动工闸门、备注许可、「首肯」→「确认」清扫
- [x] index.ts 注册 park/resume
- [x] yarn build + 全量测试（36/36）+ 冒烟（park → start → done --abandoned → resume，13 步全过）
- [x] 文档：README 双语、wiki 六页、AGENTS.md 重注入
- [x] 按 PRD 10 条验收，出验收报告

## 下一步

code-review 5 项必修已修（fresh-clone spec 归位、缺卡友好报错、guide 标题 aicflow、纯数字名选择、秒级时间），39/39 全绿；验收报告待用户认可后 `aic done --accepted` 归档
