import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [".aws-sam/**", "dist/**", "node_modules/**", "frontend/config.js"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The frontend is plain browser ES modules with no build step or type checking.
    files: ["frontend/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        console: "readonly",
        document: "readonly",
        Uint8Array: "readonly",
        window: "readonly",
      },
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    files: ["**/*.{ts,tsx,js}"],
    rules: {
      curly: ["error", "all"],
      "no-console": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: ["const", "let", "var"], next: "*" },
        { blankLine: "never", prev: ["const", "let", "var"], next: ["const", "let", "var"] },
        { blankLine: "always", prev: "*", next: "return" },
        { blankLine: "always", prev: "*", next: ["if", "for", "while", "switch", "try"] },
        { blankLine: "always", prev: ["if", "for", "while", "switch", "try"], next: "*" },
      ],
    },
  },
);
