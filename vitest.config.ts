import { defineConfig } from "vitest/config";

// The game logic under test is framework-free (no DOM, no React), so the node
// environment is enough. Node 20 exposes global `crypto` (getRandomValues +
// randomUUID), which shuffle/startHand rely on.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
