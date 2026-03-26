import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/*.js", "**/*.jsx"],
  },
  {
    rules: {
      // Allow explicit any with caution — project has several intentional uses
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow unused vars prefixed with _
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Allow empty catch blocks (used in fallback patterns)
      "no-empty": ["error", { allowEmpty: true }],
      // Allow non-null assertions with caution
      "@typescript-eslint/no-non-null-assertion": "warn",
      // Enforce consistent type imports
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },
);
