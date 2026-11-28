import js from "@eslint/js";
import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import checkFile from "eslint-plugin-check-file";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    rules: {
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
      "object-shorthand": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-console": "error",
      "no-debugger": "error",
      "no-alert": "error",
      "no-duplicate-imports": "error",
      "no-self-compare": "error",
      "no-template-curly-in-string": "error",
      "no-unneeded-ternary": "error",
      "no-useless-return": "error",
      "no-else-return": "warn",
      "prefer-template": "warn",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { sonarjs },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "typeLike", format: ["PascalCase"] },
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "function",
          format: ["camelCase", "PascalCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "parameter",
          format: ["camelCase", "PascalCase"],
          leadingUnderscore: "allow",
        },
        { selector: "enumMember", format: ["PascalCase", "UPPER_CASE"] },
      ],
      "sonarjs/no-identical-conditions": "error",
      "sonarjs/no-identical-expressions": "error",
      "sonarjs/no-duplicated-branches": "error",
      "sonarjs/no-redundant-boolean": "error",
      "sonarjs/no-redundant-jump": "error",
      "sonarjs/no-inverted-boolean-check": "error",
      "sonarjs/no-unused-collection": "error",
      "sonarjs/no-gratuitous-expressions": "error",
      "max-params": ["error", 5],
      "sonarjs/cognitive-complexity": ["warn", 15],
      "sonarjs/no-identical-functions": "warn",
      "sonarjs/no-collapsible-if": "warn",
      "sonarjs/prefer-single-boolean-return": "warn",
      "sonarjs/no-duplicate-string": ["warn", { threshold: 5 }],
      complexity: ["warn", 15],
      "max-depth": ["warn", 4],
      "no-nested-ternary": "warn",
    },
  },
  {
    files: [
      "frontend/src/**/*.{ts,tsx}",
      "frontend/test/**/*.{ts,tsx}",
      "backend/src/**/*.ts",
      "backend/test/**/*.ts",
    ],
    plugins: { "check-file": checkFile },
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        { "**/*.{ts,tsx}": "KEBAB_CASE" },
        { ignoreMiddleExtensions: true },
      ],
      "check-file/folder-naming-convention": [
        "error",
        {
          "backend/src/**/": "KEBAB_CASE",
          "frontend/src/!(app)/**/": "KEBAB_CASE",
        },
      ],
    },
  },
  {
    files: ["frontend/**/*.tsx"],
    plugins: { "react-hooks": hooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    files: [
      "**/*.test.ts",
      "**/*.spec.ts",
      "backend/test/**/*.ts",
      "frontend/test/**/*.ts",
    ],
    rules: {
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/cognitive-complexity": "off",
      "sonarjs/no-identical-functions": "off",
      complexity: "off",
      "max-depth": "off",
      "max-params": "off",
    },
  },
  {
    files: [
      "backend/src/cleanup-attachments.ts",
      "backend/src/db/migrate-sqlite-to-pg.ts",
    ],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
    rules: {
      "no-console": "off",
    },
  },
);
