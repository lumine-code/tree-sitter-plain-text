const assert = require("node:assert");
const { test } = require("node:test");
const Parser = require("tree-sitter");
const PlainText = require("..");

function parse(source, oldTree = null) {
  const parser = new Parser();
  parser.setLanguage(PlainText);
  return parser.parse(
    source,
    oldTree,
    oldTree ? PlainText.parseOptions(oldTree, source) : undefined,
  );
}

function namedShape(node) {
  const children = node.children.flatMap(namedShape);
  return node.isNamed
    ? [`(${node.type}${children.length ? ` ${children.join(" ")}` : ""})`]
    : children;
}

const shape = (source) => namedShape(parse(source).rootNode).join(" ");
const paragraphNodes = (tree) => tree.rootNode.descendantsOfType("paragraph");
const lines = (paragraph) => paragraph.descendantsOfType("line");

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
      namedShape(tree.rootNode).join(" "),
      "(document (paragraph (line) (line)) (paragraph (line)))",
    );
  }
});

test("treats whitespace-only lines as paragraph separators", () => {
  const tree = parse("alpha\n \t \nbeta\n\t");
  assert.strictEqual(tree.rootNode.hasError, false);
  assert.strictEqual(
    namedShape(tree.rootNode).join(" "),
    "(document (paragraph (line)) (paragraph (line)))",
  );
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
  assert.strictEqual(namedShape(tree.rootNode).join(" "), "(document (paragraph (line)))");
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
  assert.strictEqual(
    namedShape(tree.rootNode).join(" "),
    "(document (paragraph (line) (line) (line)))",
  );
});

test("retains semantic lines and paragraph geometry at every group boundary", () => {
  for (const count of [1, 7, 8, 9, 63, 64, 65, 66, 127, 128, 129]) {
    for (const ending of ["\n", "\r\n", "\r"]) {
      const source = Array.from({ length: count }, (_, row) => `line ${row}`).join(ending);
      const tree = parse(`${source}${ending}${ending}last paragraph`);
      assert.strictEqual(tree.rootNode.hasError, false);
      assert.deepStrictEqual(
        paragraphNodes(tree).map((node) => node.type),
        ["paragraph", "paragraph"],
      );
      const paragraph = paragraphNodes(tree)[0];
      const paragraphLines = lines(paragraph);
      assert.strictEqual(paragraphLines.length, count);
      assert.ok(paragraphLines.every((node) => node.type === "line"));
      assert.strictEqual(paragraphLines[count - 1].text, `line ${count - 1}`);
      assert.strictEqual(paragraph.text, `${source}${ending}`);
    }
  }
});

test("reuses unchanged line groups when typing at the end of a large paragraph", () => {
  const parser = new Parser();
  parser.setLanguage(PlainText);
  const lineCount = 4097;
  const source = "line\n".repeat(lineCount);
  const oldTree = parser.parse(source);
  const end = oldTree.rootNode.endPosition;
  oldTree.edit({
    startIndex: source.length,
    oldEndIndex: source.length,
    newEndIndex: source.length + 1,
    startPosition: end,
    oldEndPosition: end,
    newEndPosition: { row: end.row, column: 1 },
  });

  let processCount = 0;
  parser.setLogger((message) => {
    if (message === "process") processCount++;
  });
  const updated = `${source}x`;
  const tree = parser.parse(updated, oldTree, PlainText.parseOptions(oldTree, updated));
  parser.setLogger(null);

  assert.strictEqual(tree.rootNode.hasError, false);
  const paragraphLines = lines(paragraphNodes(tree)[0]);
  assert.strictEqual(paragraphLines.length, lineCount + 1);
  assert.strictEqual(paragraphLines[lineCount].text, "x");
  assert.ok(
    processCount < lineCount / 8,
    `Incremental parse replayed ${processCount} states for ${lineCount} unchanged lines`,
  );
});

test("retains paragraph and blank-line geometry across internal groups", () => {
  for (const count of [1, 7, 8, 9, 63, 64, 65, 127, 128, 129]) {
    for (const ending of ["\n", "\r\n", "\r"]) {
      const paragraphs = Array.from({ length: count }, (_, index) => `paragraph ${index}`);
      for (const suffix of ["", `${ending}${ending}`, `${ending}${ending}\t `]) {
        const tree = parse(`${ending.repeat(65)}${paragraphs.join(ending.repeat(2))}${suffix}`);
        assert.strictEqual(tree.rootNode.hasError, false);
        assert.strictEqual(paragraphNodes(tree).length, count);
        assert.deepStrictEqual(
          paragraphNodes(tree).map((node) => [node.type, lines(node).length, node.text]),
          paragraphs.map((text, index) => [
            "paragraph",
            1,
            `${text}${index < count - 1 || suffix ? ending : ""}`,
          ]),
        );
      }
    }
  }
});

test("reuses unchanged paragraph groups for edits throughout a large document", () => {
  const parser = new Parser();
  parser.setLanguage(PlainText);
  const count = 4097;
  const source = "paragraph\n\n".repeat(count);
  for (const paragraphIndex of [0, Math.floor(count / 2), count - 1]) {
    const oldTree = parser.parse(source);
    const index = paragraphIndex * "paragraph\n\n".length;
    const position = { row: paragraphIndex * 2, column: 0 };
    oldTree.edit({
      startIndex: index,
      oldEndIndex: index + 1,
      newEndIndex: index + 1,
      startPosition: position,
      oldEndPosition: { row: position.row, column: 1 },
      newEndPosition: { row: position.row, column: 1 },
    });
    let processCount = 0;
    parser.setLogger((message) => {
      if (message === "process") processCount++;
    });
    const updated = `${source.slice(0, index)}P${source.slice(index + 1)}`;
    const tree = parser.parse(updated, oldTree, PlainText.parseOptions(oldTree, updated));
    parser.setLogger(null);
    assert.strictEqual(tree.rootNode.hasError, false);
    assert.deepStrictEqual(namedShape(tree.rootNode), namedShape(parser.parse(updated).rootNode));
    assert.strictEqual(paragraphNodes(tree).length, count);
    assert.strictEqual(paragraphNodes(tree)[paragraphIndex].text, "Paragraph\n");
    assert.ok(
      processCount < count / 8,
      `Incremental parse replayed ${processCount} states for ${count} unchanged paragraphs`,
    );
  }
});
