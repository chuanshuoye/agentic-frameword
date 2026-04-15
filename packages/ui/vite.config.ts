import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env"), override: false });

function trimBase(v: string | undefined): string | undefined {
  const t = v?.trim();
  if (!t) {
    return undefined;
  }
  return t.replace(/\/$/, "");
}

const apiBase =
  trimBase(process.env.AGENTIC_BASE_URL) ??
  trimBase(process.env.VITE_API_BASE) ??
  "http://127.0.0.1:8787";

const serverToken =
  (process.env.VITE_AGENTIC_SERVER_TOKEN ?? process.env.AGENTIC_SERVER_TOKEN ?? "").trim();

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_API_BASE": JSON.stringify(apiBase),
    "import.meta.env.VITE_AGENTIC_SERVER_TOKEN": JSON.stringify(serverToken),
  },
  server: {
    port: 5173,
  },
});
