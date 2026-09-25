const assert = require("node:assert");
const { test } = require("node:test");
const PlainText = require(".");

test("loads the grammar through the Node-API binding", () => {
  assert.strictEqual(PlainText.name, "plain_text");
  assert.ok(PlainText.language);
  assert.ok(Array.isArray(PlainText.nodeTypeInfo));
});
