const { test } = require("node:test");
const Parser = require("tree-sitter");
const PlainText = require("..");
const { registerPlainTextRegressions } = require("./regression-cases");

registerPlainTextRegressions(
  test,
  () => {
    const parser = new Parser();
    parser.setLanguage(PlainText);
    return parser;
  },
  (...args) => PlainText.parseOptions(...args),
);
