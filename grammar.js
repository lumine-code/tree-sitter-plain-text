module.exports = grammar({
  name: "plain_text",

  extras: () => [],

  rules: {
    document: ($) =>
      seq(
        repeat($._blank_line),
        repeat(seq($.paragraph, repeat1($._blank_line))),
        optional($.paragraph),
        optional($._blank_tail),
      ),

    // Tree-sitter marks repetition branches as fragile and replays their
    // children on an edit. Bounded hidden groups let unchanged runs be reused
    // as a unit while keeping paragraph and line nodes unchanged for clients.
    paragraph: ($) => seq($._paragraph_line, repeat($._paragraph_lines_64)),

    _paragraph_lines_64: ($) =>
      prec.right(
        seq(
          $._paragraph_lines_8,
          ...Array.from({ length: 7 }, () => optional($._paragraph_lines_8)),
        ),
      ),

    _paragraph_lines_8: ($) =>
      prec.right(
        seq($._paragraph_line, ...Array.from({ length: 7 }, () => optional($._paragraph_line))),
      ),

    _paragraph_line: ($) => seq($.line, choice($._line_ending, eof())),

    line: () => /[ \t]*[^ \t\r\n][^\r\n]*/,

    _line_ending: () => /\r\n|\n|\r/,
    _blank_line: () => /[ \t]*(?:\r\n|\n|\r)/,
    _blank_tail: () => /[ \t]+/,
  },
});
