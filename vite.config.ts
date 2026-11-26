import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import assistant from "./api/assistant";
import supabase from "./api/supabase";

function localApi(): Plugin {
  return {
    name: "finance-local-api",
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.envDir, "");
      for (const key of [
        "SUPABASE_URL",
        "SUPABASE_PUBLISHABLE_KEY",
        "GROQ_API_KEY",
        "GROQ_TEXT_MODEL",
        "GROQ_VISION_MODEL",
        "FINANCE_PROPOSAL_SECRET",
      ]) {
        if (env[key] && !process.env[key]) process.env[key] = env[key];
      }
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (url.pathname === "/api/assistant") {
          void assistant(request, response);
          return;
        }
        if (url.pathname.startsWith("/backend/")) {
          url.searchParams.set("_path", url.pathname.slice("/backend/".length));
          request.url = "/api/supabase" + url.search;
          void supabase(request, response);
          return;
        }
        next();
      });
    },
  };
}

function versionServiceWorker(): Plugin {
  let outputDir: string;
  return {
    name: "version-service-worker",
    apply: "build",
    configResolved(config) {
      outputDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const html = await readFile(resolve(outputDir, "index.html"), "utf8");
      const worker = resolve(outputDir, "sw.js");
      const source = await readFile(worker, "utf8");
      const revision = createHash("sha256")
        .update(html)
        .update(source)
        .digest("hex")
        .slice(0, 16);
      await writeFile(worker, source.replace("__FINANCE_BUILD__", revision));
    },
  };
}
export default defineConfig({
  plugins: [react(), tailwindcss(), localApi(), versionServiceWorker()],
  server: { host: "0.0.0.0" },
});
