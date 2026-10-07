module.exports = grammar({
  name: "plain_text",
  extras: () => [],
  inline: ($) => [$._line],
  conflicts: ($) => [[$.paragraph], [$.document]],
  // The more tokens are never emitted. Their valid-symbol flags tell the
  // scanner whether an internal newline/separator can continue this group.
  externals: ($) => [
    $._text_fragment,
    $._long_space,
    $._group_end,
    $._group_more,
    $._document_group_end,
    $._document_more,
    $._document_eof,
  ],
  rules: {
    document: ($) =>
      seq(
        repeat($._blank_line),
        repeat(seq(alias($._document_fragment, "document_fragment"), repeat($._blank_line))),
        optional($._blank_tail),
        $._document_eof,
      ),
    // A positive separator anchors each group, including a short edited group
    // that ends at an old boundary. There is no serialized row-count phase.
    _document_fragment: ($) =>
      seq(
        $.paragraph,
        optional($._paragraphs_64),
        repeat(alias($._long_space, "line_fragment")),
        $._document_group_end,
      ),
    _paragraphs_64: ($) => bounded($._paragraphs_8, 8),
    _paragraphs_8: ($) => bounded($._following_paragraph, 8),
    _following_paragraph: ($) => seq(choice($._separator, $._document_more), $.paragraph),
    _separator: ($) => repeat1($._blank_line),
    paragraph: ($) => repeat1(alias($._paragraph_fragment, "paragraph_fragment")),
    _paragraph_fragment: ($) => seq($._line, optional($._lines_256), $._group_end),
    _lines_256: ($) => bounded($._lines_16, 16),
    _lines_16: ($) => bounded($._following_line, 16),
    _following_line: ($) => seq(choice($._line_ending, $._group_more), $._line),
    _line: ($) => choice(alias($._short_line, $.line), alias($._long_line, $.line)),
    // Keep ordinary rows as internal leaves rather than allocating external
    // scanner state for every physical line.
    _short_line: () => /[ \t]{0,127}[^ \t\r\n][^\r\n]{0,127}/,
    _long_line: ($) =>
      choice(
        $._continued_line,
        seq(
          repeat1(alias($._long_space, "line_fragment")),
          choice($._short_line, $._continued_line),
        ),
      ),
    _continued_line: ($) => seq($._short_line, repeat1(alias($._text_fragment, "line_fragment"))),
    _blank_line: ($) => seq(repeat(alias($._long_space, "line_fragment")), /[ \t]*(?:\r\n|\n|\r)/),
    _blank_tail: ($) =>
      choice(/[ \t]+/, seq(repeat1(alias($._long_space, "line_fragment")), optional(/[ \t]+/))),
    _line_ending: () => /\r\n|\n|\r/,
  },
});
function bounded(element, count) {
  return prec.right(seq(element, ...Array.from({ length: count - 1 }, () => optional(element))));
}
