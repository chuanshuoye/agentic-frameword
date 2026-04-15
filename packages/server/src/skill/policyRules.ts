import type { SkillIssue } from "@agentic/shared";
import type { NormalizedSkillBundle } from "./fileTree.js";

export const SKILL_RULES_VERSION = "2026-04-harness-v1";

const RISKY_COMMAND_PATTERNS: Array<{ re: RegExp; code: SkillIssue["code"]; message: string }> = [
  { re: /\brm\s+-rf\b/i, code: "risky_command_rm_rf", message: "检测到高风险删除命令 rm -rf" },
  { re: /\bchmod\s+777\b/i, code: "risky_command_chmod_777", message: "检测到高风险权限命令 chmod 777" },
  { re: /\bcurl\b[\s\S]{0,120}\|\s*(bash|sh)\b/i, code: "risky_command_pipe_shell", message: "检测到直接管道执行脚本" },
];

function hasScriptInvocation(content: string): boolean {
  return /\b(?:bash|sh|python3?|node)\s+(?:\.\/)?scripts\/[^\s`"'|&;]+|\b(?:\.\/)?scripts\/[^\s`"'|&;]+/i.test(
    content,
  );
}

function findFilePathForContent(bundle: NormalizedSkillBundle, content: string): string | undefined {
  const f = bundle.files.find((x) => x.content === content);
  return f?.path;
}

export function runPolicyRules(bundles: NormalizedSkillBundle[]): SkillIssue[] {
  const issues: SkillIssue[] = [];
  for (const bundle of bundles) {
    let skillMdHasRiskyCommand = false;
    for (const file of bundle.files) {
      if (file.path.startsWith(".cursor/") || file.path.startsWith(".claude/")) {
        issues.push({
          code: "path_should_be_relative",
          severity: "warning",
          location: `${bundle.format}:${file.path}`,
          message: "建议使用相对 skill 目录内路径，避免写死宿主根目录前缀",
          suggestion: "将路径改为 SKILL.md 或 scripts/xxx.sh 等相对路径",
        });
      }
      for (const pattern of RISKY_COMMAND_PATTERNS) {
        if (pattern.re.test(file.content)) {
          if (file.path === "SKILL.md" || file.path.endsWith("/SKILL.md")) {
            skillMdHasRiskyCommand = true;
          }
          issues.push({
            code: pattern.code,
            severity: "high",
            location: `${bundle.format}:${file.path}`,
            message: pattern.message,
            suggestion: "增加人工确认步骤、最小化作用域，并在文档中声明风险与回退方案",
          });
        }
      }
    }
    const skillMd = bundle.files.find((f) => f.path === "SKILL.md" || f.path.endsWith("/SKILL.md"));
    if (skillMd && !/(前置条件|Prerequisites)/i.test(skillMd.content)) {
      issues.push({
        code: "missing_prerequisites_section",
        severity: "warning",
        location: `${bundle.format}:${findFilePathForContent(bundle, skillMd.content) ?? "SKILL.md"}`,
        message: "SKILL.md 缺少前置条件说明",
        suggestion: "增加前置环境、依赖版本、权限需求等说明",
      });
    }
    if (skillMd && skillMdHasRiskyCommand) {
      const hasScriptFile = bundle.files.some((f) => f.path.startsWith("scripts/"));
      const scriptized = hasScriptFile && hasScriptInvocation(skillMd.content);
      if (!scriptized) {
        issues.push({
          code: "risky_command_not_scriptized",
          severity: "high",
          location: `${bundle.format}:${skillMd.path}`,
          message: "检测到高风险操作但未脚本化封装",
          suggestion: "将高风险命令封装到 scripts/* 并在 SKILL.md 明确调用与回退命令",
        });
      }
    }
  }
  return issues;
}
