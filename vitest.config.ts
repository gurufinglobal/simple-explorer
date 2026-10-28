import { defineConfig } from "vitest/config";
import path from "node:path";
import nextEnv from "@next/env";

// Load before workers import application modules. Vite's dotenv loader is disabled
// so it cannot inject .env.local values that Next intentionally ignores in test.
Object.assign(process.env, { NODE_ENV: "test" });
nextEnv.loadEnvConfig(import.meta.dirname);

export default defineConfig({
  envDir: false,
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    setupFiles: ["tests/helpers/reset-query-cache.ts"],
    pool: "threads",
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/server/handlers/**/*.ts",
        "src/services/search/**/*.ts",
        "src/services/realtime/**/*.ts",
        "src/services/wallet/walletconnect-session.ts",
        "src/stores/wallet-session.store.ts",
      ],
      exclude: ["src/server/handlers/types.ts"],
      thresholds: {
        branches: 85,
        functions: 85,
        lines: 85,
        statements: 85,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
