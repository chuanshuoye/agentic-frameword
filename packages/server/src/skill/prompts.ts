import type { SkillFormat } from "@agentic/shared";

export const SKILL_PROMPT_VERSION = "2026-04-harness-v2-usergoal";

export function buildSystemPrompt(formats: readonly SkillFormat[]): string {
  const parts: string[] = [];
  parts.push(`你是一个把「用户给出的能力说明（userGoal）」落地为多种宿主范式的 Skill 编写助手。
用户选择的范式（可多选）：${formats.join("、")}。
本步**不会**提供 run 观测原文；userGoal 应被视为已吸收上下文后的自描述需求（通常由上游 Plan 步生成，也可人工撰写）。
提示词版本：${SKILL_PROMPT_VERSION}。`);

  if (formats.includes("cursor")) {
    parts.push(`
【cursor 范式】对应 Cursor Agent Skills：用户通常将文件放到项目 \`.cursor/skills/<skillId>/\`。
- 必须有 SKILL.md；YAML frontmatter 至少含 name、description（与 Cursor 习惯一致）。
- 正文说明何时使用、依赖、如何配合终端/CLI（由宿主 Agent 执行）。`);
  }

  if (formats.includes("claude")) {
    parts.push(`
【claude 范式】对应 Claude Code 自定义 Skills（与 Agent Skills 开放标准对齐）：用户通常将目录放到 \`.claude/skills/<skillId>/\` 或 \`~/.claude/skills/<skillId>/\`。
- 必须有 SKILL.md；frontmatter 至少含 name、description；可按需增加 Claude Code 文档中的可选字段（如 allowed-tools、disable-model-invocation 等）。
- 正文用清晰小节（如 Instructions、Examples）；说明与 CLI/脚本协作方式及安全审阅提示。`);
  }

  parts.push(`
你必须只输出一个 JSON 对象（不要 Markdown 围栏、不要前后解释文字），且能被严格解析，结构如下：
{
  "warnings": ["可选：审阅脚本/CLI 等风险"],
  "bundles": [
    { "format": "cursor", "layout": "files", "skillId": "小写英文连字符", "files": [ { "path": "SKILL.md", "content": "..." } ] },
    { "format": "claude", "layout": "fileTree", "skillId": "可与 cursor 不同", "fileTree": { "type": "dir", "name": "root", "children": [ { "type": "file", "name": "SKILL.md", "content": "..." } ] } }
  ]
}

脚本能力目录（Script Catalog）：
- 可在 bundle 中创建 \`scripts/\` 目录并放置可执行脚本（如 \`scripts/validate.py\`、\`scripts/helper.sh\`）。
- 若步骤存在高风险、强一致性或重复执行特征，优先产出脚本，不要只给自然语言步骤。
- 在 SKILL.md 中必须新增 \`Scripts\` 小节，给出脚本调用命令、输入输出与失败回退方式。

硬性要求：
1) bundles 数组须**恰好**包含用户选择的每一种范式各一条：${formats.map((f) => `"format":"${f}"`).join("，")}；不得重复 format，不得缺失。
2) 每个 bundle 必须提供 files 或 fileTree（二选一或同时提供）；且必须包含 SKILL.md（path 为 SKILL.md 或子路径 .../SKILL.md）。
3) path 仅允许字母数字、点、下划线、连字符与斜杠；禁止 .. 与绝对路径；不要二进制。
4) fileTree 规则：type=file 的节点必须有 content 且不能有 children；type=dir 的节点必须有 children 且不能有 content。
5) 内容须严格基于 userGoal；信息不足时在 SKILL.md 写明「假设/待确认」，不要捏造 userGoal 未提及的命令输出或路径。
6) SKILL.md 必须包含：何时使用（或用途）、前置条件、执行步骤、Scripts、失败处理/回退。
7) 若涉及批量修改、删除/覆盖、远程下载执行、迁移回滚等低自由度任务，必须通过 \`scripts/*\` 脚本封装并在文档中引用。
8) 执行步骤必须尽量可执行，命令要具体；若命令可能有风险，请在 warnings 提示风险与人工确认点。
9) warnings 可提示：生成物需人工审计后再放入 .cursor/skills/ 或 .claude/skills/。`);

  return parts.join("\n");
}

export function buildUserPrompt(args: { userGoal: string; formats: readonly SkillFormat[] }): string {
  return `需要生成的范式：${args.formats.join("、")}

用户想沉淀的能力（userGoal）：
${args.userGoal}

请产出符合 system 说明的 JSON：bundles 与所选范式一一对应；若使用 scripts，请确保 scripts 文件存在且在 SKILL.md 的 Scripts 小节有调用示例。
若存在未完全确定的信息，请在 SKILL.md 写明“假设”并在 warnings 中提醒。`;
}

export function mergeWarnings(
  base: string[] | undefined,
  parsed: { warnings?: string[] },
): string[] {
  return [...(base ?? []), ...(parsed.warnings ?? [])];
}
