// A browser textarea turns every CRLF into LF. The Raw editor compares and edits
// the LF form, and writes back with the file's own line endings, so opening a
// Windows-style file is not an edit and saving it does not rewrite every line.

// CRLF when the file has any, the same rule the engine uses for new lines.
export const detectEol = (text) => (/\r\n/.test(String(text)) ? "\r\n" : "\n");

export const toLf = (text) => String(text).replace(/\r\n/g, "\n");

// lf: text from the editor. A file that mixed endings comes back with the
// dominant one on every line, which is the one thing a textarea cannot keep.
export const withEol = (lf, eol) => (eol === "\r\n" ? String(lf).replace(/\r?\n/g, "\r\n") : String(lf));
