const MINIMUM_GAP = 1024;
const FRAGMENTS = new Set(["document_fragment", "paragraph_fragment", "line_fragment"]);

function splitsCharacter(source, index) {
  const previous = source.charCodeAt(index - 1);
  const next = source.charCodeAt(index);
  return (
    (previous === 13 && next === 10) ||
    (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff)
  );
}

function collectFragments(root) {
  const result = [];
  const pending = [root];
  const following = new Map();
  const initialized = new Set();
  while (pending.length) {
    const node = pending.pop();
    const type = node.type;
    const changed = node.hasChanges;
    if (FRAGMENTS.has(type)) {
      const container = type !== "line_fragment";
      if (container) {
        if (!initialized.has(type)) {
          initialized.add(type);
          following.set(type, node.startIndex);
        }
        if (!changed && !following.has(type)) continue;
      }
      result.push({
        startIndex: node.startIndex,
        endIndex: node.endIndex,
        startPosition: node.startPosition,
        endPosition: node.endPosition,
      });
      if (container) {
        if (changed) following.set(type, node.endIndex);
        else if (node.endIndex - following.get(type) >= MINIMUM_GAP) following.delete(type);
      }
      if (!changed) continue;
    }
    const children = node.children;
    for (let index = children.length - 1; index >= 0; index--) pending.push(children[index]);
  }
  return result;
}

function compactions(fragments, source, limits) {
  const result = [];
  let first = null,
    last = null,
    count = 0;
  for (const fragment of fragments) {
    const length = fragment.endIndex - fragment.startIndex;
    if (length <= 0 || length >= MINIMUM_GAP) {
      first = last = null;
      count = 0;
      continue;
    }
    if (
      !first ||
      last.endIndex !== fragment.startIndex ||
      fragment.endIndex - first.startIndex > 4096
    ) {
      first = fragment;
      count = 0;
    }
    last = fragment;
    if (++count !== 64) continue;
    if (
      limits.some(
        (range) => first.startIndex >= range.startIndex && last.endIndex <= range.endIndex,
      ) &&
      !splitsCharacter(source, first.startIndex) &&
      !splitsCharacter(source, last.endIndex)
    ) {
      result.push({
        startIndex: first.startIndex,
        oldEndIndex: last.endIndex,
        newEndIndex: last.endIndex,
        startPosition: first.startPosition,
        oldEndPosition: last.endPosition,
        newEndPosition: last.endPosition,
      });
      if (result.length === 8) break;
    }
    first = last = null;
    count = 0;
  }
  return result;
}

// Capture shallow reusable groups and descend only into edited ones. This is
// proportional to group count, not the number of physical lines in the file.
module.exports = function parseOptions(tree, source, includedRanges) {
  if (!tree || typeof source !== "string") return includedRanges ? { includedRanges } : undefined;
  const root = tree.rootNode;
  const limits = includedRanges ?? [
    {
      startIndex: 0,
      startPosition: { row: 0, column: 0 },
      endIndex: root.endIndex,
      endPosition: root.endPosition,
    },
  ];
  let fragments = collectFragments(root);
  if (typeof tree.edit === "function") {
    const edits = compactions(fragments, source, limits);
    for (const edit of edits) tree.edit(edit);
    if (edits.length) fragments = collectFragments(tree.rootNode);
  }
  const boundaries = fragments
    .map((node) => ({ index: node.endIndex, position: node.endPosition }))
    .sort((a, b) => a.index - b.index);
  const result = [];
  let cursor = 0;
  for (const range of limits) {
    let index = range.startIndex,
      position = range.startPosition;
    while (cursor < boundaries.length && boundaries[cursor].index <= index) cursor++;
    while (cursor < boundaries.length && boundaries[cursor].index < range.endIndex) {
      const boundary = boundaries[cursor++];
      if (boundary.index - index < MINIMUM_GAP || splitsCharacter(source, boundary.index)) continue;
      result.push({
        startIndex: index,
        startPosition: position,
        endIndex: boundary.index,
        endPosition: boundary.position,
      });
      index = boundary.index;
      position = boundary.position;
    }
    if (index < range.endIndex)
      result.push({
        startIndex: index,
        startPosition: position,
        endIndex: range.endIndex,
        endPosition: range.endPosition,
      });
  }
  return { includedRanges: result };
};
module.exports.collectFragments = collectFragments;
