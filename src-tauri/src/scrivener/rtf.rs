//! Minimal RTF reader for Scrivener documents: text, bold/italic and the
//! paragraph formatting the editor supports. Everything else is dropped.
use crate::model::doc::{Block, Doc, Inline};
use crate::model::marks::Marks;
use crate::model::para_attrs::{Align, ParaAttrs};

/// Groups whose whole content is metadata, never document text.
const SKIP_DESTINATIONS: &[&str] = &[
    "fonttbl", "colortbl", "stylesheet", "info", "pict", "header", "headerl", "headerr", "headerf", "footer",
    "footerl", "footerr", "footerf", "footnote", "listtable", "listoverridetable", "rsidtbl", "generator",
    "xmlnstbl", "themedata", "colorschememapping", "latentstyles", "datastore", "object", "fldinst",
    "filetbl", "revtbl", "annotation", "atnid", "atnauthor",
];

const CP1252: [char; 32] = [
    '€', '\u{81}', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', '\u{8d}', 'Ž', '\u{8f}',
    '\u{90}', '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', '\u{9d}', 'ž', 'Ÿ',
];

fn cp1252(b: u8) -> char {
    match b {
        0x80..=0x9f => CP1252[(b - 0x80) as usize],
        _ => b as char,
    }
}

/// A raw byte outside control words: UTF-8 when it forms a valid sequence, else cp1252.
fn decode_raw(src: &[u8], i: usize) -> (char, usize) {
    let b = src[i];
    if b < 0x80 {
        return (b as char, 1);
    }
    let len = match b {
        0xc0..=0xdf => 2,
        0xe0..=0xef => 3,
        0xf0..=0xf7 => 4,
        _ => 0,
    };
    if len > 0 {
        if let Some(c) = src.get(i..i + len).and_then(|s| std::str::from_utf8(s).ok()).and_then(|s| s.chars().next()) {
            return (c, len);
        }
    }
    (cp1252(b), 1)
}

#[derive(Clone, Copy)]
struct Group {
    marks: Marks,
    skip: bool,
    /// Fallback characters that follow each `\uN`.
    uc: usize,
}

#[derive(Default)]
struct Para {
    align: Option<Align>,
    sl: i32,
    slmult: bool,
    sb: Option<i32>,
    sa: Option<i32>,
    fi: i32,
}

impl Para {
    fn attrs(&self) -> ParaAttrs {
        let line_height = match (self.sl, self.slmult) {
            (0, _) => None,
            (sl, true) => ParaAttrs::clamp_line(sl.unsigned_abs() as f64 / 240.0),
            // Exact spacing in twips, relative to a 12pt line, to the nearest 0.05.
            (sl, false) => ParaAttrs::clamp_line((sl.unsigned_abs() as f64 / 20.0 / 12.0 * 20.0).round() / 20.0),
        };
        ParaAttrs {
            text_align: self.align,
            line_height,
            space_before: self.sb.and_then(|v| ParaAttrs::clamp_before(v as f64 / 20.0)),
            space_after: self.sa.and_then(|v| ParaAttrs::clamp_after(v as f64 / 20.0)),
            indent: ParaAttrs::clamp_indent(self.fi as f64 / 567.0),
        }
    }
}

struct Reader {
    blocks: Vec<Block>,
    content: Vec<Inline>,
    para: Para,
    stack: Vec<Group>,
    cur: Group,
    skip_chars: usize,
}

pub fn rtf_to_doc(src: &[u8]) -> Doc {
    let mut r = Reader {
        blocks: Vec::new(),
        content: Vec::new(),
        para: Para::default(),
        stack: Vec::new(),
        cur: Group { marks: Marks::default(), skip: false, uc: 1 },
        skip_chars: 0,
    };
    let mut i = 0;
    while i < src.len() {
        match src[i] {
            b'{' => {
                r.stack.push(r.cur);
                i += 1;
            }
            b'}' => {
                if let Some(g) = r.stack.pop() {
                    r.cur = g;
                }
                i += 1;
            }
            b'\\' => i = r.control(src, i + 1),
            b'\r' | b'\n' => i += 1,
            _ => {
                let (c, len) = decode_raw(src, i);
                r.text(c);
                i += len;
            }
        }
    }
    if !r.content.is_empty() {
        r.cur.skip = false;
        r.end_paragraph();
    }
    Doc::new(r.blocks)
}

impl Reader {
    fn text(&mut self, c: char) {
        if self.cur.skip {
            return;
        }
        if self.skip_chars > 0 {
            self.skip_chars -= 1;
            return;
        }
        let marks = self.cur.marks;
        if let Some(Inline::Text { text, marks: m }) = self.content.last_mut() {
            if *m == marks {
                text.push(c);
                return;
            }
        }
        self.content.push(Inline::Text { text: c.to_string(), marks });
    }

    fn end_paragraph(&mut self) {
        if self.cur.skip {
            return;
        }
        let content = std::mem::take(&mut self.content);
        let plain: String = content
            .iter()
            .map(|i| match i {
                Inline::Text { text, .. } => text.as_str(),
                Inline::HardBreak => "\n",
            })
            .collect();
        let block = if matches!(plain.trim(), "#" | "*" | "***" | "* * *") {
            Block::Separator
        } else {
            Block::Paragraph { attrs: self.para.attrs(), content }
        };
        self.blocks.push(block);
    }

    /// Parses the control word/symbol after a backslash at `i`; returns the next index.
    fn control(&mut self, src: &[u8], mut i: usize) -> usize {
        let Some(&c) = src.get(i) else { return i };
        if c.is_ascii_alphabetic() {
            let start = i;
            while i < src.len() && src[i].is_ascii_alphabetic() {
                i += 1;
            }
            let word = std::str::from_utf8(&src[start..i]).unwrap_or("");
            let num_start = i;
            if i < src.len() && (src[i] == b'-' || src[i].is_ascii_digit()) {
                i += 1;
                while i < src.len() && src[i].is_ascii_digit() {
                    i += 1;
                }
            }
            let param = std::str::from_utf8(&src[num_start..i]).ok().and_then(|s| s.parse::<i32>().ok());
            if src.get(i) == Some(&b' ') {
                i += 1;
            }
            self.word(word, param);
            return i;
        }
        match c {
            b'\'' => {
                let byte = src.get(i + 1..i + 3).and_then(|h| std::str::from_utf8(h).ok()).and_then(|h| u8::from_str_radix(h, 16).ok());
                match byte {
                    Some(b) => {
                        self.text(cp1252(b));
                        i + 3
                    }
                    None => i + 1,
                }
            }
            b'*' => {
                self.cur.skip = true;
                i + 1
            }
            b'~' => {
                self.text('\u{a0}');
                i + 1
            }
            b'_' => {
                self.text('\u{2011}');
                i + 1
            }
            b'-' => i + 1,
            b'\n' | b'\r' => {
                self.end_paragraph();
                i + 1
            }
            _ => {
                // `\\`, `\{`, `\}` and any other escaped symbol.
                self.text(c as char);
                i + 1
            }
        }
    }

    fn word(&mut self, w: &str, p: Option<i32>) {
        if SKIP_DESTINATIONS.contains(&w) {
            self.cur.skip = true;
            return;
        }
        if self.cur.skip {
            return;
        }
        let on = p.map_or(true, |n| n != 0);
        match w {
            "par" | "sect" | "page" | "row" => self.end_paragraph(),
            "line" => self.content.push(Inline::HardBreak),
            "tab" | "cell" => self.text('\t'),
            "b" => self.cur.marks.bold = on,
            "i" => self.cur.marks.italic = on,
            "plain" => self.cur.marks = Marks::default(),
            "pard" => self.para = Para::default(),
            "ql" => self.para.align = None,
            "qc" => self.para.align = Some(Align::Center),
            "qr" => self.para.align = Some(Align::Right),
            "qj" => self.para.align = Some(Align::Justify),
            "sl" => self.para.sl = p.unwrap_or(0),
            "slmult" => self.para.slmult = p == Some(1),
            "sb" => self.para.sb = p,
            "sa" => self.para.sa = p,
            "fi" => self.para.fi = p.unwrap_or(0),
            "uc" => self.cur.uc = p.unwrap_or(1).max(0) as usize,
            "u" => {
                if let Some(n) = p {
                    let code = if n < 0 { n + 65536 } else { n };
                    if let Some(c) = u32::try_from(code).ok().and_then(char::from_u32) {
                        self.text(c);
                    }
                    self.skip_chars = self.cur.uc;
                }
            }
            "emdash" => self.text('—'),
            "endash" => self.text('–'),
            "lquote" => self.text('‘'),
            "rquote" => self.text('’'),
            "ldblquote" => self.text('“'),
            "rdblquote" => self.text('”'),
            "bullet" => self.text('•'),
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::doc::{Block, Inline};
    use crate::model::marks::Marks;
    use crate::model::para_attrs::{Align, ParaAttrs};

    fn t(s: &str) -> Inline { Inline::text(s) }
    fn m(s: &str, k: Marks) -> Inline { Inline::marked(s, k) }
    fn p(c: Vec<Inline>) -> Block { Block::paragraph(c) }
    fn doc(s: &str) -> Vec<Block> { rtf_to_doc(s.as_bytes()).content }

    #[test]
    fn text_marks_breaks_and_hex_escapes() {
        let d = doc(r"{\rtf1\ansi{\fonttbl{\f0 Times;}}\f0 Ol\'e1 {\b mundo}\par Linha\line dois\par}");
        assert_eq!(d, vec![
            p(vec![t("Olá "), m("mundo", Marks::BOLD)]),
            p(vec![t("Linha"), Inline::HardBreak, t("dois")]),
        ]);
    }

    #[test]
    fn groups_restore_marks_and_plain_resets() {
        let d = doc(r"{\rtf1 a{\i b}c\b d\b0 e\i f\plain g\par}");
        assert_eq!(d, vec![p(vec![t("a"), m("b", Marks::ITALIC), t("c"), m("d", Marks::BOLD), t("e"), m("f", Marks::ITALIC), t("g")])]);
    }

    #[test]
    fn unicode_escapes_and_fallback_chars() {
        assert_eq!(doc(r"{\rtf1\uc1 caf\u233?\par}"), vec![p(vec![t("café")])]);
        // Built via `format!` (rather than typed literally) because "\u" followed by four hex
        // digits gets silently rewritten to the character it denotes by an unrelated tooling
        // layer outside this crate; splitting the digits into a format argument avoids that.
        let em_dash_escape = format!("{{\\rtf1\\uc0 \\u{}x\\par}}", 8212);
        assert_eq!(rtf_to_doc(em_dash_escape.as_bytes()).content, vec![p(vec![t("—x")])]);
        assert_eq!(doc(r"{\rtf1 \u-3913?\par}"), vec![p(vec![t("\u{f0b7}")])]);
        assert_eq!(rtf_to_doc("{\\rtf1 ação\\par}".as_bytes()).content, vec![p(vec![t("ação")])]);
        assert_eq!(doc(r"{\rtf1 \emdash\ \ldblquote x\rdblquote\par}"), vec![p(vec![t("— “x”")])]);
    }

    #[test]
    fn paragraph_formatting() {
        let d = doc(r"{\rtf1\pard\qc\sl360\slmult1\sb240\sa120\fi720 T\par}");
        let want = ParaAttrs { text_align: Some(Align::Center), line_height: Some(1.5), space_before: Some(12),
            space_after: Some(6), indent: Some(1.27) };
        assert_eq!(d, vec![Block::Paragraph { attrs: want, content: vec![t("T")] }]);
        let exact = doc(r"{\rtf1\pard\sl288 T\par}");
        let Block::Paragraph { attrs, .. } = &exact[0] else { panic!() };
        assert_eq!(attrs.line_height, Some(1.2));
    }

    #[test]
    fn paragraph_formatting_persists_until_pard() {
        let d = doc(r"{\rtf1\qc A\par B\par\pard C\par}");
        let center = ParaAttrs { text_align: Some(Align::Center), ..Default::default() };
        assert_eq!(d, vec![
            Block::Paragraph { attrs: center, content: vec![t("A")] },
            Block::Paragraph { attrs: center, content: vec![t("B")] },
            p(vec![t("C")]),
        ]);
    }

    #[test]
    fn ignorable_destinations_leak_nothing() {
        let d = doc(r"{\rtf1{\*\generator Foo;}{\stylesheet{\s0\qc\b Normal;}}{\info{\title X}}{\*\expandedcolortbl;;}Texto\par}");
        assert_eq!(d, vec![p(vec![t("Texto")])]);
    }

    #[test]
    fn scene_markers_become_separators() {
        let d = doc(r"{\rtf1 A\par #\par  * * * \par ***\par B\par}");
        assert_eq!(d, vec![p(vec![t("A")]), Block::Separator, Block::Separator, Block::Separator, p(vec![t("B")])]);
    }

    #[test]
    fn malformed_input_never_panics() {
        assert_eq!(doc(r"{\rtf1 {\b abc"), vec![p(vec![m("abc", Marks::BOLD)])]);
        let _ = doc(r"}}}\'zz\u\uc\'");
        let _ = rtf_to_doc(&[0xff, 0xfe, b'\\', b'u', b'9', b'9', b'9', b'9', b'9', b'9', b'9', b'9', b'9', b'9', b'9']);
        assert_eq!(doc(""), vec![]);
    }
}
