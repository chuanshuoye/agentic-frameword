import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 从 monorepo 根目录加载 `.env`。
 * 约定：调用方位于 `packages/<name>/src/*.ts` 或 `apps/<name>/src/*.ts`，
 * 相对根目录为 `../../../.env`。
 */
export function loadMonorepoDotenv(entryUrl: string | URL): void {
  const href = typeof entryUrl === "string" ? entryUrl : entryUrl.href;
  const dir = dirname(fileURLToPath(href));
  const rootEnv = resolve(dir, "../../../.env");
  if (existsSync(rootEnv)) {
    config({ path: rootEnv, override: false });
  }
}
