# tree-sitter-plain-text

Parses plain text into paragraphs and lines with Tree-sitter.

## Features

- **Grammars**: provides a Tree-sitter grammar.
- **Paragraphs**: groups consecutive nonblank lines into stable paragraph nodes.
- **Line endings**: accepts LF, CRLF, and CR input.
- **Text**: preserves Unicode, punctuation, indentation, and trailing whitespace.
- **Bindings**: supports Node-API, source, and WebAssembly builds.
- **Incremental parsing**: aligns bounded groups and long-line fragments after character and newline edits.

## Installation

```sh
npm install tree-sitter @lumine-code/tree-sitter-plain-text
```

## Usage

```js
const Parser = require("tree-sitter");
const PlainText = require("@lumine-code/tree-sitter-plain-text");

const parser = new Parser();
parser.setLanguage(PlainText);
const tree = parser.parse("First paragraph.\n\nSecond paragraph.\n");
```

Named paragraph and line nodes keep their complete semantic spans. Anonymous document_fragment, paragraph_fragment and line_fragment nodes provide reusable structure, so find semantic nodes with descendantsOfType() rather than assuming they are direct namedChildren.

After applying tree.edit(), pass PlainText.parseOptions(tree, updatedSource) as the third parser.parse() argument. The helper visits shallow groups and edited descendants, retains nearby alignment anchors, and protects UTF-16 pairs and CRLF. Its third argument accepts existing semantic includedRanges; added cuts never fill excluded gaps or remove source text. Without a current source string it preserves the caller's ranges and adds no alignment cuts.

Groups contain at most 257 lines or 65 paragraphs and may end early at edited old-tree boundaries. Long-line continuations and whitespace fragments consume at most 4096 Unicode codepoints. Ordinary short lines remain internal lexer tokens, and the external scanner keeps no serialized row counter. Repeated tiny fragments are consolidated with bounded metadata-only edits that change no source characters.

Editors can use queries/parse-boundaries.scm with parseBoundariesMaxStartDepth set to 1, expanding only edited containers. Setting parseBoundariesInjections to true enables the same hints inside an injected plain-text document; semantic ownership remains unchanged.

## Building

```sh
npm install
npm test
npm run build:wasm
npm run test:wasm
```

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
