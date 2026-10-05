# aicflow

English | [简体中文](./README.zh-CN.md)

An AI collaboration workflow tool. Through "injected AI guidance + PRD/TRD documents + task state + acceptance-gated archiving," it makes AI clients such as Claude Code / Cursor align with you on requirements and technical design before writing any code, automatically resume unfinished tasks across sessions, and archive the whole task group on completion for a full audit trail. The tool itself never calls any model API.

## Two-Layer Design

The CLI does only three things: **artifacts** (laying down the guidance and templates), **state** (the current.md lifecycle), and **gates** (acceptance checks and archiving). The workflow itself — when to reach consensus, when to create documents, when coding may begin — lives entirely in the guidance injected into AGENTS.md, and the AI is expected to follow it.

**New requirement received**

- The AI restates its understanding and asks only questions that would change the approach
- Small change: align in one sentence → `aic start` → go
- Big task: confirm goals / boundaries / acceptance first, then
  - AI writes the PRD from the template → user approves
  - AI investigates the codebase and writes the TRD → user approves
  - **Approval ≠ go-ahead**: only when the user explicitly says "implement it" → `aic start <task-name>` + write the pointer → code

**Intercutting a new requirement (task switching)**

- When something more urgent arrives, `aic park` suspends the current task (breakpoint + documents saved as a group) → `aic start` the new one
- When the inserted task is done, `aic resume` brings the original back
- Never use `aic done --force` on an unfinished task; for tasks that are dead for good, use `aic done --abandoned`

**Session start (incl. cross-session resume)**

- Run `aic status` to pick the task back up (with no task but parked ones present, it hints at `aic resume`)
- While executing: the AI edits current.md and the PRD/TRD directly

**Task completion**

- All todos done ≠ task complete
- Self-check each PRD acceptance criterion, recording evidence in the PRD "Acceptance" section
- Acceptance report approved by the user → `aic done --accepted`
- current + PRD + TRD archived as a group for the audit trail

## Installation (local development)

```bash
yarn install
yarn build
yarn link
```

After that, the `aic` command is available in any project directory.

## Commands

| Command | Description |
|---|---|
| `aic init [-y] [--hooks]` | Initialize a project: inject the AI guidance into a guidance file at the project root (CLAUDE.md / AGENTS.md / .cursorrules / GEMINI.md; asks whether to create AGENTS.md if none of them exists), and lay the PRD/TRD templates into `.ai-continue/templates/`. Idempotent — safe to re-run; anything that already exists is skipped. With `--hooks`, also lays hardening hook configs for Claude Code / Codex / ZCode (see below) |
| `aic start [task-name] [-y]` | Start a new task: creates `.ai-continue/current.md` (an existing task must be closed with `aic done` or suspended with `aic park` first). PRD/TRD do not go through this command — following the guidance, the AI creates the documents first and runs `start` only after both are approved and the user has green-lit implementation |
| `aic status` | Print the current task, progress, next step, requirement pointer, and acceptance status; the AI runs this at the start of a session to pick the task back up. With no task but a non-empty `parked/`, appends a suspension hint (exit code stays 1) |
| `aic done [-f] [--accepted] [--abandoned]` | Archive the current task: moves current.md and the spec directory (PRD/TRD) as a group into `.ai-continue/archive/`. Tasks that have a PRD carry an **acceptance gate**: the PRD "## Acceptance" section must contain a self-check record for each criterion, and `--accepted` must declare that the user has signed off on the acceptance; `--abandoned` archives a task as abandoned (for tasks dead for good — the archive directory gets an `-abandoned` suffix, skips the acceptance gate, mutually exclusive with `--accepted`); `-f` skips all gates |
| `aic park [-f]` | Suspend the current task: moves current.md and the spec directory as a group into `.ai-continue/parked/` (pure move, code untouched; restorable via `aic resume`). No confirmation prompt; prints a single line on success |
| `aic resume [selection]` | Resume a parked task: a single parked task resumes directly; with several, select by task-name substring or list number; prints progress and the next step after resuming. Pointer-path conflicts fail closed |
| `aic hook <event> --client <id>` / `aic hooks [--remove]` | Hook plumbing and management — see "Hooks Hardening" below |

`status` exit codes: `0` OK; `1` no task started; `2` malformed current.md (specific repair hints are printed).

## Hooks Hardening (optional)

Guidance is a soft constraint; hooks upgrade the three most-bypassed links into client-level defenses (guards against accidental bypass, not adversarial bypass): **session start** injects the `aic status` report automatically; **new-requirement prompts** trigger a triage reminder; **file edits with no task in progress** are escalated to the user for approval (`ask` on Claude Code / ZCode; Codex degrades to a model-visible reminder). Three clients are supported: Claude Code / Codex / ZCode. Install with `aic init --hooks` (idempotent, only touches its own entries), uninstall with `aic hooks --remove`. Core CLI stays client-agnostic; details in [docs/wiki/hooks.md](./docs/wiki/hooks.md).

## File Layout

```
.ai-continue/
├── current.md               # task state card: small, always read, frequently rewritten
├── templates/
│   ├── prd.md               # requirements-doc template (laid down by init, customizable)
│   └── trd.md               # technical-design template (same)
├── specs/<task>/
│   ├── prd.md               # requirements side: confirmed (goals/boundaries/acceptance criteria) + open items + acceptance
│   └── trd.md               # technical side: design, choices, impact scope, steps, risks
├── parked/<timestamp>-<task>/   # park suspension: current.md + spec as a group, restorable via resume (multiple may coexist)
└── archive/<timestamp>-<task>[-abandoned]/  # done archive: current.md + spec/{prd,trd}.md; -abandoned = abandoned-task marker
```

`.ai-continue/current.md` (the task state card):

```markdown
---
task: Refactor the login module
updated: 2026-09-29 14:30
spec: specs/login-refactor/     # optional; the AI writes this after creating the docs for a big task
---

## Todos
- [x] Extract the API layer
- [ ] Handle token refresh

## Next step
Add a refresh interceptor in src/api/auth.ts
```

PRD/TRD files are generated by the AI copying the templates (the CLI neither generates nor parses their content). The only two format invariants the CLI relies on: the frontmatter `spec:` pointer must reference an existing directory, and the PRD "## Acceptance" section must contain checkbox items (the criterion for the archiving gate — an empty skeleton doesn't count).

## Development

```bash
yarn dev <command>      # run directly with tsx, e.g. yarn dev status
yarn typecheck
yarn test
yarn build
```

## Project Docs (Wiki)

For architecture, command behavior, file formats, the guidance-injection mechanism, and development notes, see [docs/wiki/](./docs/wiki/Home.md). When an AI session takes over this repository, read [docs/wiki/Home.md](./docs/wiki/Home.md) first.
