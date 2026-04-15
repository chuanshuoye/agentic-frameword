import JSZip from "jszip";
import type { SkillBundle, SkillFileTreeNode } from "@agentic/shared";

export type SkillBundleFile = { path: string; content: string };

function flattenTree(node: SkillFileTreeNode, basePath: string, out: SkillBundleFile[]): void {
  const nextPath = basePath ? `${basePath}/${node.name}` : node.name;
  if (node.type === "file") {
    out.push({ path: nextPath, content: node.content ?? "" });
    return;
  }
  for (const child of node.children ?? []) {
    flattenTree(child, nextPath, out);
  }
}

export function bundleFiles(bundle: SkillBundle): SkillBundleFile[] {
  if (bundle.files && bundle.files.length > 0) {
    return bundle.files;
  }
  if (!bundle.fileTree) {
    return [];
  }
  const files: SkillBundleFile[] = [];
  flattenTree(bundle.fileTree, "", files);
  return files;
}

export async function downloadSkillBundlesZip(args: {
  bundles: SkillBundle[];
  zipName: string;
}): Promise<void> {
  const zip = new JSZip();
  for (const b of args.bundles) {
    const dir = `${b.format}/${b.skillId.replace(/[^\w.-]+/g, "_")}`;
    for (const f of bundleFiles(b)) {
      zip.file(`${dir}/${f.path}`, f.content);
    }
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = args.zipName;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}
