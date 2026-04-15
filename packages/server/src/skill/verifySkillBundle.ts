import type { SkillIssue } from "@agentic/shared";
import type { NormalizedSkillBundle } from "./fileTree.js";

function parseMarkdownSections(markdown: string): Set<string> {
  const sections = new Set<string>();
  const re = /^\s{0,3}#{1,6}\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    sections.add(m[1].toLowerCase());
  }
  return sections;
}

function hasAnySection(sections: Set<string>, candidates: string[]): boolean {
  return candidates.some((name) => {
    const lower = name.toLowerCase();
    for (const section of sections) {
      if (section.includes(lower)) {
        return true;
      }
    }
    return false;
  });
}

function extractCommandLines(content: string): string[] {
  const lines = content.split("\n");
  const commands: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (
      line.startsWith("$ ") ||
      line.startsWith("npm ") ||
      line.startsWith("pnpm ") ||
      line.startsWith("yarn ") ||
      line.startsWith("node ")
    ) {
      commands.push(line.replace(/^\$\s*/, ""));
    }
  }
  return commands;
}

function normalizeScriptPath(raw: string): string {
  return raw.replace(/^\.?\//, "");
}

function extractScriptReferences(content: string): Set<string> {
  const refs = new Set<string>();
  const patterns = [
    /\b(?:bash|sh|python3?|node)\s+((?:\.\/)?scripts\/[^\s`"'|&;]+)/g,
    /\b((?:\.\/)?scripts\/[^\s`"'|&;]+)\b/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      refs.add(normalizeScriptPath(m[1]));
    }
  }
  return refs;
}

export function verifySkillBundles(bundles: NormalizedSkillBundle[]): SkillIssue[] {
  const issues: SkillIssue[] = [];
  for (const bundle of bundles) {
    const skillMd = bundle.files.find((f) => f.path === "SKILL.md" || f.path.endsWith("/SKILL.md"));
    if (!skillMd) {
      continue;
    }
    const sections = parseMarkdownSections(skillMd.content);
    if (!hasAnySection(sections, ["何时使用", "when to use", "用途"])) {
      issues.push({
        code: "missing_usage_section",
        severity: "warning",
        location: `${bundle.format}:${skillMd.path}`,
        message: "SKILL.md 缺少何时使用/用途章节",
        suggestion: "补充触发条件、适用边界与不适用场景",
      });
    }
    if (!hasAnySection(sections, ["前置条件", "prerequisites", "依赖"])) {
      issues.push({
        code: "missing_prereq_section",
        severity: "warning",
        location: `${bundle.format}:${skillMd.path}`,
        message: "SKILL.md 缺少前置条件/依赖章节",
        suggestion: "补充运行环境、依赖、权限边界",
      });
    }
    if (!hasAnySection(sections, ["步骤", "instructions", "执行流程"])) {
      issues.push({
        code: "missing_steps_section",
        severity: "high",
        location: `${bundle.format}:${skillMd.path}`,
        message: "SKILL.md 缺少可执行步骤章节",
        suggestion: "提供可按顺序执行的步骤清单与输入输出约束",
      });
    }
    if (!hasAnySection(sections, ["失败处理", "fallback", "troubleshooting"])) {
      issues.push({
        code: "missing_failure_handling_section",
        severity: "warning",
        location: `${bundle.format}:${skillMd.path}`,
        message: "SKILL.md 缺少失败处理/回退说明",
        suggestion: "补充失败场景、回滚办法与人工介入条件",
      });
    }

    const commands = extractCommandLines(skillMd.content);
    if (commands.length === 0) {
      issues.push({
        code: "no_parseable_commands",
        severity: "info",
        location: `${bundle.format}:${skillMd.path}`,
        message: "未识别到可解析命令行，执行步骤可能不够具体",
        suggestion: "补充示例命令或明确每步操作输入输出",
      });
    }

    const scriptFiles = new Set(
      bundle.files
        .map((f) => normalizeScriptPath(f.path))
        .filter((path) => path.startsWith("scripts/")),
    );
    const referencedScripts = extractScriptReferences(skillMd.content);
    const hasScriptsSection = hasAnySection(sections, ["scripts", "脚本"]);

    if (hasScriptsSection && referencedScripts.size === 0) {
      issues.push({
        code: "scripts_section_without_commands",
        severity: "warning",
        location: `${bundle.format}:${skillMd.path}`,
        message: "SKILL.md 包含 Scripts 章节但未检测到脚本调用命令",
        suggestion: "在 Scripts 章节补充 scripts/* 的可执行命令示例",
      });
    }

    for (const scriptPath of referencedScripts) {
      if (!scriptFiles.has(scriptPath)) {
        issues.push({
          code: "referenced_script_missing",
          severity: "high",
          location: `${bundle.format}:${skillMd.path}`,
          message: `SKILL.md 引用的脚本不存在: ${scriptPath}`,
          suggestion: "补充对应脚本文件，或移除无效引用",
        });
      }
    }

    if (scriptFiles.size > 0 && !hasScriptsSection) {
      issues.push({
        code: "script_files_without_documentation",
        severity: "warning",
        location: `${bundle.format}:${skillMd.path}`,
        message: "检测到 scripts/* 文件，但 SKILL.md 缺少 Scripts 章节说明",
        suggestion: "增加 Scripts 章节，说明每个脚本的用途、参数和调用方式",
      });
    }
  }
  return issues;
}
