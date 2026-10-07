const js = require("@eslint/js");
const globals = require("globals");
const eslintConfigPrettier = require("eslint-config-prettier");

module.exports = [
  {
    ignores: ["build/**", "node_modules/**", "src/**"],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        grammar: "readonly",
        alias: "readonly",
        choice: "readonly",
        optional: "readonly",
        prec: "readonly",
        repeat: "readonly",
        repeat1: "readonly",
        seq: "readonly",
      },
    },
  },
  eslintConfigPrettier,
];
