import type { SkillBundle, SkillFileTreeNode } from "@agentic/shared";
import { SkillGenerateError } from "./errors.js";

export type NormalizedSkillBundle = Omit<SkillBundle, "files"> & {
  files: Array<{ path: string; content: string }>;
};

function flattenTreeNode(node: SkillFileTreeNode, basePath: string, out: Array<{ path: string; content: string }>): void {
  const nextPath = basePath ? `${basePath}/${node.name}` : node.name;
  if (node.type === "file") {
    out.push({ path: nextPath, content: node.content ?? "" });
    return;
  }
  for (const child of node.children ?? []) {
    flattenTreeNode(child, nextPath, out);
  }
}

export function normalizeBundlesToFiles(bundles: SkillBundle[]): {
  bundles: NormalizedSkillBundle[];
  layoutUsed: "files" | "fileTree";
} {
  const normalized: NormalizedSkillBundle[] = [];
  let seenFileTree = false;
  for (const bundle of bundles) {
    if (bundle.files && bundle.files.length > 0) {
      normalized.push({
        ...bundle,
        files: bundle.files,
      });
      continue;
    }
    if (!bundle.fileTree) {
      throw new SkillGenerateError(422, "skill_files_missing", "bundle 缺少 files/fileTree");
    }
    seenFileTree = true;
    const files: Array<{ path: string; content: string }> = [];
    flattenTreeNode(bundle.fileTree, "", files);
    normalized.push({
      ...bundle,
      layout: bundle.layout ?? "fileTree",
      files,
    });
  }
  return {
    bundles: normalized,
    layoutUsed: seenFileTree ? "fileTree" : "files",
  };
}
