import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
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
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
