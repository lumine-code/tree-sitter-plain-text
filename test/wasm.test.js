const { before, test } = require("node:test");
const path = require("node:path");
const { Parser, Language } = require("web-tree-sitter");
const PlainText = require("..");
const { registerPlainTextRegressions } = require("./regression-cases");

let language;
before(async () => {
  await Parser.init();
  language = await Language.load(path.join(__dirname, "..", "tree-sitter-plain-text.wasm"));
});

registerPlainTextRegressions(
  test,
  () => {
    const parser = new Parser();
    parser.setLanguage(language);
    return parser;
  },
  (...args) => PlainText.parseOptions(...args),
);
