// Line endings in the Raw editor: opening is not an edit, and saving keeps them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { detectEol, toLf, withEol } from "../public/js/eol.mjs";

const CRLF = "# a\r\nfont-size = 13\r\ncursor-style = bar\r\n";
const LF = "# a\nfont-size = 13\ncursor-style = bar\n";

test("a CRLF file opens in the editor as its LF form, so it is not 'edited'", () => {
  assert.equal(detectEol(CRLF), "\r\n");
  assert.equal(toLf(CRLF), LF);
});

test("saving an unedited CRLF file writes the same bytes", () => {
  assert.equal(withEol(toLf(CRLF), detectEol(CRLF)), CRLF);
});

test("one edit in a CRLF file keeps every other line ending and the new line is CRLF too", () => {
  const edited = toLf(CRLF) + "# new\n";
  const saved = withEol(edited, detectEol(CRLF));
  assert.equal(saved, CRLF + "# new\r\n");
  assert.ok(!/[^\r]\n/.test(saved), "no bare LF");
});

test("an LF file is untouched by the round trip", () => {
  assert.equal(detectEol(LF), "\n");
  assert.equal(withEol(toLf(LF), "\n"), LF);
});

test("no trailing newline and empty text survive", () => {
  assert.equal(withEol(toLf("a\r\nb"), "\r\n"), "a\r\nb");
  assert.equal(withEol("", "\r\n"), "");
  assert.equal(detectEol(""), "\n");
});

test("text that already holds CRLF is not doubled", () => {
  assert.equal(withEol("a\r\nb\n", "\r\n"), "a\r\nb\r\n");
});
