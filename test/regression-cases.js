const assert = require("node:assert/strict");

const GROUP_LINES = 1024;
const CHUNK = 4096;

function pointAt(source, index) {
  const prefix = source.slice(0, index);
  return { row: prefix.split("\n").length - 1, column: index - prefix.lastIndexOf("\n") - 1 };
}

function editedTree(tree, before, after) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let suffix = 0;
  while (
    suffix < before.length - start &&
    suffix < after.length - start &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  )
    suffix++;
  const oldEnd = before.length - suffix;
  const newEnd = after.length - suffix;
  tree.edit({
    startIndex: start,
    oldEndIndex: oldEnd,
    newEndIndex: newEnd,
    startPosition: pointAt(before, start),
    oldEndPosition: pointAt(before, oldEnd),
    newEndPosition: pointAt(after, newEnd),
  });
}

function geometry(node) {
  const children = node.children.flatMap(geometry);
  return node.isNamed
    ? [
        {
          type: node.type,
          start: node.startIndex,
          end: node.endIndex,
          from: [node.startPosition.row, node.startPosition.column],
          to: [node.endPosition.row, node.endPosition.column],
          children,
        },
      ]
    : children;
}

function release(...resources) {
  for (const resource of resources) resource?.delete?.();
}

function logIs(message, type) {
  return message === type || message.startsWith(`${type} `);
}

function incremental(parser, before, after, optionsFor, beforeRanges, afterRanges) {
  const old = parser.parse(
    before,
    null,
    beforeRanges ? { includedRanges: beforeRanges } : undefined,
  );
  let next, fresh;
  try {
    assert.equal(old.rootNode.hasError, false, before);
    editedTree(old, before, after);
    const options = optionsFor(old, after, afterRanges);
    next = parser.parse(after, old, options);
    fresh = parser.parse(after, null, afterRanges ? { includedRanges: afterRanges } : undefined);
    assert.equal(next.rootNode.hasError, false, after);
    assert.equal(fresh.rootNode.hasError, false, after);
    assert.deepEqual(geometry(next.rootNode), geometry(fresh.rootNode), after);
    return { old, next, fresh, options };
  } catch (error) {
    release(old, next, fresh);
    throw error;
  }
}

function registerPlainTextRegressions(test, createParser, optionsFor) {
  test("preserves semantic paragraph and line geometry across edits and EOF forms", () => {
    const parser = createParser();
    try {
      for (const ending of ["\n", "\r\n", "\r"]) {
        for (const suffix of ["", ending, `${ending}${ending}\t `]) {
          const before = `first${ending}second${ending}${ending}third${suffix}`;
          for (const after of [
            before.replace(`second${ending}${ending}`, `second${ending}`),
            before.replace("second", `sec${ending}ond`),
            before.replace("first", "first updated"),
            before.replace("third", ""),
          ]) {
            for (const [original, updated] of [
              [before, after],
              [after, before],
            ]) {
              const result = incremental(parser, original, updated, optionsFor);
              release(result.old, result.next, result.fresh);
            }
          }
        }
      }
    } finally {
      release(parser);
    }
  });

  test("preserves long whitespace-only separators and leading line whitespace", () => {
    const parser = createParser();
    try {
      for (const count of [CHUNK - 1, CHUNK, CHUNK + 1, CHUNK * 2]) {
        const spaces = " ".repeat(count);
        for (const source of [
          `${spaces}\nfirst\n`,
          `first\n${spaces}\nsecond\n`,
          `first\n${spaces}`,
          `${spaces}content\n`,
        ]) {
          const tree = parser.parse(source);
          try {
            assert.equal(tree.rootNode.hasError, false, `${count}: ${source.slice(-30)}`);
            const lines = tree.rootNode.descendantsOfType("line");
            assert.deepEqual(
              lines.map((line) => line.text),
              source.includes("content")
                ? [`${spaces}content`]
                : source.includes("second")
                  ? ["first", "second"]
                  : ["first"],
            );
          } finally {
            release(tree);
          }
        }
      }
    } finally {
      release(parser);
    }
  });

  for (const bytes of [1 << 20, 8 << 20]) {
    test(`bounds the first Enter to one line group in a ${bytes / (1 << 20)} MiB paragraph`, (t) => {
      const parser = createParser();
      const count = Math.floor(bytes / 5);
      const before = "line\n".repeat(count);
      const after = `li\nne${before.slice(4)}`;
      const old = parser.parse(before);
      let next, fresh;
      try {
        assert.equal(old.rootNode.hasError, false);
        editedTree(old, before, after);
        const options = optionsFor(old, after);
        let steps = 0,
          consumed = 0;
        parser.setLogger((message) => {
          if (logIs(message, "process")) steps++;
          if (logIs(message, "consume")) consumed++;
        });
        next = parser.parse(after, old, options);
        parser.setLogger(null);
        assert.equal(next.rootNode.hasError, false);
        assert.equal(next.rootNode.endIndex, after.length);
        const groupCount = Math.ceil(count / GROUP_LINES);
        assert.ok(
          steps < 4 * (GROUP_LINES + groupCount) + 128,
          `${steps} parser steps for ${count} rows`,
        );
        assert.ok(
          consumed < 5 * GROUP_LINES * 8,
          `${consumed} lexer advances for ${before.length} characters`,
        );
        fresh = parser.parse(after);
        assert.equal(fresh.rootNode.hasError, false);
        for (const row of [
          0,
          1,
          2,
          GROUP_LINES - 1,
          GROUP_LINES,
          GROUP_LINES + 1,
          Math.floor(count / 2),
          count,
        ]) {
          const from = { row, column: 0 },
            to = { row: row + 1, column: 0 };
          const sample = (tree) =>
            tree.rootNode
              .descendantsOfType("line", from, to)
              .filter((node) => node.startPosition.row === row)
              .map(geometry);
          assert.deepEqual(sample(next), sample(fresh), `row ${row}`);
        }
        assert.deepEqual(
          next.rootNode
            .descendantsOfType("line", { row: 0, column: 0 }, { row: 2, column: 0 })
            .filter((node) => node.startPosition.row < 2)
            .map((node) => node.text),
          ["li", "ne"],
        );
        t.diagnostic(`${count} rows: ${steps} parser steps, ${consumed} lexer advances`);
      } finally {
        parser.setLogger(null);
        release(old, next, fresh, parser);
      }
    });
  }

  test("realigns document hints after adding and deleting the first paragraph", (t) => {
    const parser = createParser();
    const count = 4097;
    const before = "paragraph\n\n".repeat(count);
    const expanded = `added\n\n${before}`;
    try {
      for (const [original, updated, expected] of [
        [before, expanded, count + 1],
        [expanded, before, count],
      ]) {
        const old = parser.parse(original);
        let next, fresh;
        try {
          editedTree(old, original, updated);
          const options = optionsFor(old, updated);
          let steps = 0,
            consumed = 0;
          parser.setLogger((message) => {
            if (logIs(message, "process")) steps++;
            if (logIs(message, "consume")) consumed++;
          });
          next = parser.parse(updated, old, options);
          parser.setLogger(null);
          fresh = parser.parse(updated);
          assert.equal(next.rootNode.hasError, false);
          assert.deepEqual(geometry(next.rootNode), geometry(fresh.rootNode));
          assert.equal(next.rootNode.descendantsOfType("paragraph").length, expected);
          assert.ok(steps < count / 8, `${steps} parser steps for ${count} paragraphs`);
          assert.ok(consumed < 128 * 11, `${consumed} lexer advances for ${count} paragraphs`);
          t.diagnostic(
            `${original === before ? "add" : "delete"}: ${steps} parser steps, ${consumed} lexer advances`,
          );
        } finally {
          parser.setLogger(null);
          release(old, next, fresh);
        }
      }
    } finally {
      release(parser);
    }
  });

  test("reuses unchanged rows when appending a line at EOF", (t) => {
    const parser = createParser();
    const count = 4097;
    const before = "line\n".repeat(count);
    const after = `${before}x`;
    const old = parser.parse(before);
    let next, fresh;
    try {
      editedTree(old, before, after);
      const options = optionsFor(old, after);
      let steps = 0;
      parser.setLogger((message) => {
        if (logIs(message, "process")) steps++;
      });
      next = parser.parse(after, old, options);
      parser.setLogger(null);
      fresh = parser.parse(after);
      assert.equal(next.rootNode.hasError, false);
      assert.deepEqual(geometry(next.rootNode), geometry(fresh.rootNode));
      const lines = next.rootNode.descendantsOfType("line");
      assert.equal(lines.length, count + 1);
      assert.equal(lines.at(-1).text, "x");
      assert.ok(steps < count / 8, `${steps} parser steps for ${count} unchanged rows`);
      t.diagnostic(`EOF append: ${steps} parser steps`);
    } finally {
      parser.setLogger(null);
      release(old, next, fresh, parser);
    }
  });

  test("realigns document hints after editing leading blanks outside the first paragraph", (t) => {
    const parser = createParser();
    const count = 4097;
    const before = `\n\n${"p\n\n".repeat(count)}`;
    const after = `x\n\n${before}`;
    const old = parser.parse(before);
    let next, fresh;
    try {
      editedTree(old, before, after);
      const options = optionsFor(old, after);
      let steps = 0;
      parser.setLogger((message) => {
        if (logIs(message, "process")) steps++;
      });
      next = parser.parse(after, old, options);
      parser.setLogger(null);
      fresh = parser.parse(after);
      assert.equal(next.rootNode.hasError, false);
      assert.equal(fresh.rootNode.hasError, false);
      assert.deepEqual(geometry(next.rootNode), geometry(fresh.rootNode));
      assert.equal(next.rootNode.descendantsOfType("paragraph").length, count + 1);
      assert.ok(steps < count, `${steps} parser steps for ${count} unchanged paragraphs`);
      t.diagnostic(`Leading-blank edit: ${steps} parser steps`);
    } finally {
      parser.setLogger(null);
      release(old, next, fresh, parser);
    }
  });

  test("keeps fragments bounded through 300 first-row Enter edits", (t) => {
    const parser = createParser();
    let source = `short\n${"line\n".repeat(Math.floor((1 << 18) / 5))}`;
    let tree = parser.parse(source);
    const fragmentTypes = ["document_fragment", "paragraph_fragment", "line_fragment"];
    const initialFragments = tree.rootNode.descendantsOfType(fragmentTypes).length;
    let maximumFragments = initialFragments,
      maximumConsumed = 0;
    try {
      for (let iteration = 0; iteration < 300; iteration++) {
        const updated = `x\n${source}`;
        editedTree(tree, source, updated);
        const options = optionsFor(tree, updated);
        let consumed = 0;
        parser.setLogger((message) => {
          if (logIs(message, "consume")) consumed++;
        });
        let next;
        try {
          next = parser.parse(updated, tree, options);
        } finally {
          parser.setLogger(null);
        }
        release(tree);
        tree = next;
        source = updated;
        assert.equal(tree.rootNode.hasError, false, `iteration ${iteration}`);
        const fragments = tree.rootNode.descendantsOfType(fragmentTypes).length;
        maximumFragments = Math.max(maximumFragments, fragments);
        maximumConsumed = Math.max(maximumConsumed, consumed);
        assert.ok(
          fragments <= initialFragments + 128,
          `${fragments} fragments after ${iteration + 1} Enter edits`,
        );
        assert.ok(consumed < CHUNK * 16, `${consumed} lexer advances at iteration ${iteration}`);
        if ((iteration + 1) % 50 === 0) {
          const fresh = parser.parse(source);
          try {
            assert.equal(fresh.rootNode.hasError, false);
            assert.deepEqual(
              geometry(tree.rootNode),
              geometry(fresh.rootNode),
              `iteration ${iteration}`,
            );
          } finally {
            release(fresh);
          }
        }
      }
      t.diagnostic(
        `300 Enter edits: fragments ${initialFragments}→${maximumFragments}, max ${maximumConsumed} lexer advances`,
      );
    } finally {
      parser.setLogger(null);
      release(tree, parser);
    }
  });

  test("keeps long-row character edits local with unchanged semantic line spans", (t) => {
    const parser = createParser();
    const before = `${"x".repeat(8 << 20)}\r\n`;
    const base = parser.parse(before);
    try {
      for (const [label, index, replacement, removed] of [
        ["insert", 1, "y", 0],
        ["same-width", CHUNK + 2, "z", 1],
        ["astral", CHUNK - 1, "😀", 0],
      ]) {
        const after = before.slice(0, index) + replacement + before.slice(index + removed);
        const old = typeof base.copy === "function" ? base.copy() : parser.parse(before);
        let next, fresh;
        try {
          editedTree(old, before, after);
          const options = optionsFor(old, after);
          let consumed = 0;
          parser.setLogger((message) => {
            if (logIs(message, "consume")) consumed++;
          });
          next = parser.parse(after, old, options);
          parser.setLogger(null);
          fresh = parser.parse(after);
          assert.equal(next.rootNode.hasError, false);
          assert.deepEqual(geometry(next.rootNode), geometry(fresh.rootNode));
          const line = next.rootNode.descendantsOfType("line")[0];
          assert.equal(line.text, after.slice(0, -2));
          assert.equal(line.endIndex, after.length - 2);
          assert.ok(consumed < CHUNK * 4, `${label}: ${consumed} lexer advances for an 8 MiB row`);
          t.diagnostic(`${label}: ${consumed} lexer advances`);
        } finally {
          parser.setLogger(null);
          release(old, next, fresh);
        }
      }
    } finally {
      release(base, parser);
    }
  });

  test("drops unsafe hint boundaries when edits join a surrogate pair or CRLF", () => {
    const parser = createParser();
    const lead = "x".repeat(CHUNK - 1);
    try {
      for (const [before, after] of [
        [`${lead}\ud83dX\ude00tail\n`, `${lead}😀tail\n`],
        [`${lead}\rX\nnext\r\n`, `${lead}\r\nnext\r\n`],
      ]) {
        for (const [original, updated] of [
          [before, after],
          [after, before],
        ]) {
          const result = incremental(parser, original, updated, optionsFor);
          for (const boundary of result.options?.includedRanges?.slice(0, -1) || []) {
            const previous = updated.charCodeAt(boundary.endIndex - 1),
              following = updated.charCodeAt(boundary.endIndex);
            assert.ok(!(previous === 13 && following === 10));
            assert.ok(
              !(
                previous >= 0xd800 &&
                previous <= 0xdbff &&
                following >= 0xdc00 &&
                following <= 0xdfff
              ),
            );
          }
          release(result.old, result.next, result.fresh);
        }
      }
    } finally {
      release(parser);
    }
  });

  test("preserves included-range holes while adding reuse hints", () => {
    const parser = createParser();
    const first = `${"first ".repeat(2000)}\r\n`,
      gap = "EXCLUDED content\r\n",
      last = "second\r\n";
    const before = first + gap + last;
    const ranges = (source) => [
      {
        startIndex: 0,
        startPosition: pointAt(source, 0),
        endIndex: source.indexOf("EXCLUDED"),
        endPosition: pointAt(source, source.indexOf("EXCLUDED")),
      },
      {
        startIndex: source.indexOf("second"),
        startPosition: pointAt(source, source.indexOf("second")),
        endIndex: source.length,
        endPosition: pointAt(source, source.length),
      },
    ];
    const union = (items) => {
      const result = [];
      for (const item of items) {
        const previous = result.at(-1);
        if (previous && previous[1] === item.startIndex) previous[1] = item.endIndex;
        else result.push([item.startIndex, item.endIndex]);
      }
      return result;
    };
    try {
      for (const after of [
        before.replace("first", "changed"),
        before.replace("EXCLUDED content", "EXCLUDED longer 😀 content"),
      ]) {
        const result = incremental(
          parser,
          before,
          after,
          optionsFor,
          ranges(before),
          ranges(after),
        );
        try {
          assert.deepEqual(union(result.options.includedRanges), union(ranges(after)));
          assert.deepEqual(
            result.next.rootNode.descendantsOfType("line").map((node) => node.text),
            [after.slice(0, after.indexOf("\r\n")), "second"],
          );
        } finally {
          release(result.old, result.next, result.fresh);
        }
      }
    } finally {
      release(parser);
    }
  });
}

module.exports = { registerPlainTextRegressions };
