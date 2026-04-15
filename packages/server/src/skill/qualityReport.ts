import type { SkillIssue, SkillQualityDimension, SkillQualityReport } from "@agentic/shared";

function scoreByIssueWeight(issues: SkillIssue[]): number {
  let deduction = 0;
  for (const issue of issues) {
    if (issue.severity === "high") {
      deduction += 18;
      continue;
    }
    if (issue.severity === "warning") {
      deduction += 8;
      continue;
    }
    deduction += 3;
  }
  return Math.max(0, 100 - deduction);
}

function verdictFromScore(score: number): SkillQualityReport["verdict"] {
  if (score >= 80) {
    return "ready";
  }
  if (score >= 55) {
    return "needs_review";
  }
  return "risky";
}

export function buildQualityReport(params: {
  issues: SkillIssue[];
  hasContextGap?: boolean;
  kindCoverage?: number;
  source?: "user_goal_only" | "run_events";
}): SkillQualityReport {
  const source = params.source ?? "run_events";
  const baseScore = scoreByIssueWeight(params.issues);

  let coverageScore: number;
  let contextScore: number;
  let coverageReason: string;
  let contextReason: string;

  if (source === "user_goal_only") {
    coverageScore = 72;
    contextScore = 78;
    coverageReason = "Generate 步未使用 run 观测，仅基于 userGoal 评估（Plan 步已承担观测提炼）";
    contextReason = "无 run 尾部上下文；以 userGoal 自洽性与脚本/策略命中为主";
  } else {
    const kindCoverage = params.kindCoverage ?? 0;
    const hasContextGap = params.hasContextGap ?? false;
    coverageScore = Math.min(100, 40 + kindCoverage * 20);
    contextScore = hasContextGap ? 65 : 95;
    coverageReason = "基于观测 kind 覆盖度评估信息完整性";
    contextReason = hasContextGap ? "上下文被裁剪，建议人工复核" : "上下文充足";
  }

  const score = Math.round(baseScore * 0.6 + coverageScore * 0.2 + contextScore * 0.2);

  const dimensions: SkillQualityDimension[] = [
    {
      name: "safety",
      score: baseScore,
      reason: "基于风险规则与静态检查命中情况评分",
    },
    {
      name: "coverage",
      score: coverageScore,
      reason: coverageReason,
    },
    {
      name: "context_fitness",
      score: contextScore,
      reason: contextReason,
    },
  ];

  const suggestions = Array.from(
    new Set(
      params.issues
        .map((issue) => issue.suggestion)
        .filter((x): x is string => Boolean(x && x.trim().length > 0)),
    ),
  ).slice(0, 8);

  return {
    score,
    verdict: verdictFromScore(score),
    dimensions,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}
