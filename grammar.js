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

    paragraph: ($) => repeat1(seq($.line, choice($._line_ending, eof()))),

    line: () => /[ \t]*[^ \t\r\n][^\r\n]*/,

    _line_ending: () => /\r\n|\n|\r/,
    _blank_line: () => /[ \t]*(?:\r\n|\n|\r)/,
    _blank_tail: () => /[ \t]+/,
  },
});
