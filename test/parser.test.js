const assert = require("node:assert");
const { test } = require("node:test");
const Parser = require("tree-sitter");
const PlainText = require("..");

function parse(source, oldTree = null) {
  const parser = new Parser();
  parser.setLanguage(PlainText);
  return parser.parse(source, oldTree);
}

function shape(source) {
  return parse(source).rootNode.toString();
}

test("parses empty and single-line documents", () => {
  assert.strictEqual(shape(""), "(document)");
  assert.strictEqual(shape("Plain text."), "(document (paragraph (line)))");
});

test("groups nonblank lines into paragraphs", () => {
  assert.strictEqual(
    shape("first\nsecond\n\nthird\n\t \nfourth"),
    "(document (paragraph (line) (line)) (paragraph (line)) (paragraph (line)))",
  );
});

test("accepts LF, CRLF, and CR line endings", () => {
  for (const ending of ["\n", "\r\n", "\r"]) {
    const tree = parse(`first${ending}second${ending}${ending}third${ending}`);
    assert.strictEqual(tree.rootNode.hasError, false);
    assert.strictEqual(
      tree.rootNode.toString(),
      "(document (paragraph (line) (line)) (paragraph (line)))",
    );
  }
});

test("treats whitespace-only lines as paragraph separators", () => {
  const tree = parse("alpha\n \t \nbeta\n\t");
  assert.strictEqual(tree.rootNode.hasError, false);
  assert.strictEqual(tree.rootNode.toString(), "(document (paragraph (line)) (paragraph (line)))");
});

test("preserves Unicode, punctuation, and long lines", () => {
  const longLine = `${"zażółć🙂—".repeat(10000)}!`;
  const tree = parse(`Punctuation: []{}() / \\ " ' — …\n${longLine}`);
  assert.strictEqual(tree.rootNode.hasError, false);
  assert.strictEqual(
    tree.rootNode.namedDescendantForPosition({ row: 1, column: 0 }).text,
    longLine,
  );
});

test("accepts leading and trailing blank lines without named separator nodes", () => {
  const tree = parse("\n\t\r\nalpha\r\n \t ");
  assert.strictEqual(tree.rootNode.hasError, false);
  assert.strictEqual(tree.rootNode.toString(), "(document (paragraph (line)))");
});

test("updates paragraph boundaries incrementally", () => {
  const source = "first\nsecond\n\nthird";
  const oldTree = parse(source);
  oldTree.edit({
    startIndex: 12,
    oldEndIndex: 13,
    newEndIndex: 12,
    startPosition: { row: 1, column: 6 },
    oldEndPosition: { row: 2, column: 0 },
    newEndPosition: { row: 1, column: 6 },
  });
  const tree = parse("first\nsecond\nthird", oldTree);
  assert.strictEqual(tree.rootNode.hasError, false);
  assert.strictEqual(tree.rootNode.toString(), "(document (paragraph (line) (line) (line)))");
});
