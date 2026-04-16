import type { SessionProviderId } from "@agentic/shared";
import { createClaudeIngestProvider } from "./claudeProvider.js";
import { createCursorIngestProvider } from "./cursorProvider.js";
import type { SessionIngestProvider } from "./types.js";

export type SessionProviderRoots = {
  cursorProjectsRoot: string;
  claudeProjectsRoot: string;
};

export function createSessionIngestRegistry(roots: SessionProviderRoots): {
  get(id: SessionProviderId): SessionIngestProvider;
  listIds(): SessionProviderId[];
} {
  const cursor = createCursorIngestProvider(roots.cursorProjectsRoot);
  const claude = createClaudeIngestProvider(roots.claudeProjectsRoot);
  const map: Record<SessionProviderId, SessionIngestProvider> = {
    cursor,
    claude,
  };
  return {
    get(id: SessionProviderId) {
      return map[id];
    },
    listIds() {
      return ["cursor", "claude"];
    },
  };
}
