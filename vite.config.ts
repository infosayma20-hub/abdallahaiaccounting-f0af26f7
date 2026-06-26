import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

const appReleaseId = "test-update-popup-2026-05-17-19-30";
const appBuildTime = `${appReleaseId}:${new Date().toISOString()}`;

function appVersionPlugin(): Plugin {
  return {
    name: "amwali-app-version",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "app-version.json",
        source: JSON.stringify({ buildTime: appBuildTime }, null, 2),
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_BUILD_TIME__: JSON.stringify(appBuildTime),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    appVersionPlugin(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/date-fns")) return "vendor-date-fns";
          if (id.includes("node_modules/lucide-react")) return "vendor-lucide";
          if (id.includes("node_modules/@radix-ui")) return "vendor-radix";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
