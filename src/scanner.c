#include <stddef.h>
#include <stdint.h>

#include "tree_sitter/parser.h"

enum TokenType {
  TEXT_FRAGMENT,
  LONG_SPACE,
  GROUP_END,
  GROUP_MORE,
  DOCUMENT_GROUP_END,
  DOCUMENT_MORE,
  DOCUMENT_EOF
};
enum { CHUNK_LIMIT = 4096 };
static bool space(int32_t c) { return c == ' ' || c == '\t'; }
static bool newline(int32_t c) { return c == '\r' || c == '\n'; }
static void take_newline(TSLexer* lexer) {
  int32_t c = lexer->lookahead;
  lexer->advance(lexer, false);
  if (c == '\r' && lexer->lookahead == '\n') lexer->advance(lexer, false);
}
static bool document_end(TSLexer* lexer, const bool* valid) {
  if (!valid[DOCUMENT_MORE] || lexer->eof(lexer) ||
      lexer->is_at_included_range_start(lexer))
    return true;
  unsigned prefix = 0;
  while (space(lexer->lookahead) && prefix < CHUNK_LIMIT) {
    lexer->advance(lexer, false);
    prefix++;
  }
  return prefix == CHUNK_LIMIT || newline(lexer->lookahead) ||
         lexer->eof(lexer);
}
void* tree_sitter_plain_text_external_scanner_create(void) { return NULL; }
void tree_sitter_plain_text_external_scanner_destroy(void* payload) {
  (void)payload;
}
unsigned tree_sitter_plain_text_external_scanner_serialize(void* payload,
                                                           char* buffer) {
  (void)payload;
  (void)buffer;
  return 0;
}
void tree_sitter_plain_text_external_scanner_deserialize(void* payload,
                                                         const char* buffer,
                                                         unsigned length) {
  (void)payload;
  (void)buffer;
  (void)length;
}
bool tree_sitter_plain_text_external_scanner_scan(void* payload, TSLexer* lexer,
                                                  const bool* valid) {
  (void)payload;
  if (lexer->eof(lexer)) {
    if (valid[GROUP_END]) {
      lexer->result_symbol = GROUP_END;
      return true;
    }
    if (valid[DOCUMENT_GROUP_END]) {
      lexer->result_symbol = DOCUMENT_GROUP_END;
      return true;
    }
    if (valid[DOCUMENT_EOF]) {
      lexer->result_symbol = DOCUMENT_EOF;
      return true;
    }
    return false;
  }
  if (valid[GROUP_END] && newline(lexer->lookahead)) {
    take_newline(lexer);
    lexer->mark_end(lexer);
    bool end = !valid[GROUP_MORE] || lexer->eof(lexer) ||
               lexer->is_at_included_range_start(lexer);
    unsigned prefix = 0;
    while (!end && space(lexer->lookahead) && prefix < CHUNK_LIMIT) {
      lexer->advance(lexer, false);
      prefix++;
    }
    end = end || prefix == CHUNK_LIMIT || newline(lexer->lookahead) ||
          lexer->eof(lexer);
    if (end) {
      lexer->result_symbol = GROUP_END;
      return true;
    }
    return false;
  }
  if (valid[TEXT_FRAGMENT] && !newline(lexer->lookahead)) {
    unsigned count = 0;
    while (!lexer->eof(lexer) && !newline(lexer->lookahead) &&
           count < CHUNK_LIMIT) {
      lexer->advance(lexer, false);
      count++;
      if (lexer->is_at_included_range_start(lexer)) break;
    }
    if (!count) return false;
    lexer->mark_end(lexer);
    lexer->result_symbol = TEXT_FRAGMENT;
    return true;
  }
  if ((valid[LONG_SPACE] || valid[DOCUMENT_GROUP_END]) &&
      space(lexer->lookahead)) {
    unsigned count = 0;
    while (space(lexer->lookahead) && count < CHUNK_LIMIT) {
      lexer->advance(lexer, false);
      count++;
      if (lexer->is_at_included_range_start(lexer)) break;
    }
    lexer->mark_end(lexer);
    if (valid[LONG_SPACE] &&
        (count >= 128 || lexer->is_at_included_range_start(lexer))) {
      lexer->result_symbol = LONG_SPACE;
      return true;
    }
    if (!valid[DOCUMENT_GROUP_END] ||
        (!newline(lexer->lookahead) && !lexer->eof(lexer)))
      return false;
    if (newline(lexer->lookahead)) take_newline(lexer);
    lexer->mark_end(lexer);
    if (document_end(lexer, valid)) {
      lexer->result_symbol = DOCUMENT_GROUP_END;
      return true;
    }
    return false;
  }
  if (valid[DOCUMENT_GROUP_END] && newline(lexer->lookahead)) {
    take_newline(lexer);
    lexer->mark_end(lexer);
    if (document_end(lexer, valid)) {
      lexer->result_symbol = DOCUMENT_GROUP_END;
      return true;
    }
  }
  return false;
}
