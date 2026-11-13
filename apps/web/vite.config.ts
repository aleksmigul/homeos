import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const buildVersion = randomUUID();

export default defineConfig(({ command }) => ({
  define: { __BUILD_VERSION__: JSON.stringify(command === "build" ? buildVersion : "development") },
  plugins: [react(), {
    name: "homeos-build-version",
    generateBundle(_options, bundle) {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: buildVersion }) });
      const assets = Object.keys(bundle).filter(name => !name.endsWith(".map")).map(name => `/${name}`);
      const worker = readFileSync(new URL("./public/sw.js", import.meta.url), "utf8")
        .replace('"__HOMEOS_BUILD_VERSION__"', JSON.stringify(buildVersion))
        .replace("/* __HOMEOS_BUILD_ASSETS__ */ []", JSON.stringify(assets));
      this.emitFile({ type: "asset", fileName: "sw.js", source: worker });
    }
  }],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:4000", ws: true }
    }
  }
}));
