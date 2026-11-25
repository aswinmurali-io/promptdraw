import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "lat.md"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    // src/core stays pure: no React, no DOM-bound UI code.
    // @lat: [[architecture#Layers]]
    files: ["src/core/**/*.ts"],
    rules: {
      // Ported Python names like use_text -> useText are not React hooks.
      "react-hooks/rules-of-hooks": "off",
      // Python line-boundary and sentinel characters (\x1c, \x01) are matched on purpose.
      "no-control-regex": "off",
      "no-restricted-imports": [
        "error",
        { patterns: ["react", "react-dom", "react/*", "react-dom/*", "../ui/*", "../ui"] },
      ],
    },
  },
);
