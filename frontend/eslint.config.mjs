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
    // Assets de Tesseract auto-hospedados (fase 6): bundles de terceros
    // minificados que se sirven tal cual desde /public/tesseract.
    "public/tesseract/**",
  ]),
]);

export default eslintConfig;
