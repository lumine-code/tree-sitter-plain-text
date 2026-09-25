# tree-sitter-plain-text

Parses plain text into paragraphs and lines with Tree-sitter.

## Features

- **Grammars**: provides a Tree-sitter grammar.
- **Paragraphs**: groups consecutive nonblank lines into stable paragraph nodes.
- **Line endings**: accepts LF, CRLF, and CR input.
- **Text**: preserves Unicode, punctuation, indentation, and trailing whitespace.
- **Bindings**: supports Node-API, source, and WebAssembly builds.

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

## Building

```sh
npm install
npm test
npm run build:wasm
```

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
