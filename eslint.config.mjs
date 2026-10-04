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
    // The Laravel dump is a read-only reference of the source app (gitignored,
    // 168 MB of third-party PHP + jQuery). It is not part of this codebase.
    "public/Upload_Code/**",
    "public/gfx/**",
    "public/sfx/**",
    // Go engine: not ours to lint.
    "engine/**",
  ]),
]);

export default eslintConfig;
