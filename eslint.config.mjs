import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated WASM engine bindings (Rust -> wasm-bindgen output). Not authored
    // here; linting them only produces noise. (QA 2)
    "src/lib/engine/**",
    "engine/pkg/**",
  ]),
  {
    // React Compiler rules (eslint-plugin-react-hooks v6, pulled in by
    // eslint-config-next) are intentionally downgraded to warnings. This codebase
    // relies on documented, deliberate patterns the rules flag as errors:
    //   - Firestore onSnapshot subscription hooks that setState in the effect
    //     (the correct way to sync an external store) and reset state on a
    //     dependency change (useTimer, useRoom, useServerGame, ...).
    //   - The voice hooks (useVoiceWebRTC / useVoiceRoom) whose effect/cleanup
    //     logic is explicitly do-not-touch (see CLAUDE.md).
    // Keeping them as warnings preserves the signal without failing the lint gate
    // or forcing a risky refactor of working code. Revisit when/if adopting the
    // React Compiler wholesale. (QA 1)
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;
