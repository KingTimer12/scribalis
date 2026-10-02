//! Bold/italic runs and sheet mentions inside one markdown line. `*`, `**` and `***` toggle
//! italic, bold and both; `@[Name](id)` is a mention; `\` escapes `\ * { ! @`.
use crate::model::doc::{Inline, Marks, MentionAttrs};

const ESCAPABLE: [char; 5] = ['\\', '*', '{', '!', '@'];

fn run(toggle: Marks) -> &'static str {
    match (toggle.bold, toggle.italic) {
        (true, true) => "***",
        (true, false) => "**",
        (false, true) => "*",
        (false, false) => "",
    }
}

/// A character of a line, or a mention (which carries no marks).
#[derive(Clone)]
enum Piece<'a> {
    Char(char),
    Mention(&'a MentionAttrs),
}

/// One markdown string per line of the paragraph (lines split at hard breaks).
pub fn serialize(content: &[Inline]) -> Vec<String> {
    let mut lines = Vec::new();
    let mut pieces: Vec<(Piece, Marks)> = Vec::new();
    for inline in content {
        match inline {
            Inline::Text { text, marks } => pieces.extend(text.chars().map(|c| (Piece::Char(c), *marks))),
            Inline::HardBreak => lines.push(line_md(std::mem::take(&mut pieces))),
            Inline::Mention { attrs } => pieces.push((Piece::Mention(attrs), Marks::default())),
        }
    }
    lines.push(line_md(pieces));
    lines
}

fn mention_md(out: &mut String, m: &MentionAttrs) {
    out.push_str("@[");
    for c in m.label.chars() {
        if c == '\\' || c == ']' {
            out.push('\\');
        }
        out.push(c);
    }
    out.push_str("](");
    out.push_str(&m.id);
    out.push(')');
}

fn line_md(mut pieces: Vec<(Piece, Marks)>) -> String {
    // Whitespace takes the marks both neighbours share, so delimiters always
    // touch non-whitespace and nothing is left open at the end of the line.
    let solid: Vec<Option<Marks>> = pieces
        .iter()
        .map(|(p, m)| match p {
            Piece::Char(c) => (!c.is_whitespace()).then_some(*m),
            Piece::Mention(_) => Some(*m),
        })
        .collect();
    let mut left = vec![Marks::default(); pieces.len()];
    let mut last = None;
    for (i, s) in solid.iter().enumerate() {
        left[i] = last.unwrap_or_default();
        if s.is_some() { last = *s; }
    }
    let mut next = None;
    for i in (0..pieces.len()).rev() {
        if solid[i].is_some() {
            next = solid[i];
        } else {
            pieces[i].1 = left[i] & next.unwrap_or_default();
        }
    }

    let mut out = String::new();
    let mut open = Marks::default();
    for (i, (p, m)) in pieces.iter().enumerate() {
        out.push_str(run(open ^ *m));
        open = *m;
        match p {
            Piece::Mention(attrs) => mention_md(&mut out, attrs),
            Piece::Char(c) => {
                let next_is_bracket = matches!(pieces.get(i + 1), Some((Piece::Char('['), _)));
                if *c == '\\' || *c == '*' || (*c == '@' && next_is_bracket) { out.push('\\'); }
                out.push(*c);
            }
        }
    }
    out.push_str(run(open));

    let lead = out.len() - out.trim_start().len();
    if out[lead..].starts_with("{:") || out[lead..].starts_with("![") {
        out.insert(lead, '\\');
    }
    out
}

/// Text runs of one line; falls back to literal text when marks stay open.
pub fn parse_line(line: &str) -> Vec<Inline> {
    let (runs, open) = scan(line, true);
    if open.is_empty() { runs } else { scan(line, false).0 }
}

fn push(out: &mut Vec<Inline>, c: char, marks: Marks) {
    if let Some(Inline::Text { text, marks: m }) = out.last_mut() {
        if *m == marks {
            text.push(c);
            return;
        }
    }
    out.push(Inline::Text { text: c.to_string(), marks });
}

/// `@[label](id)` starting at `i` (which holds the `@`): the mention and the index after it.
fn mention_at(chars: &[char], i: usize) -> Option<(Inline, usize)> {
    if chars.get(i + 1) != Some(&'[') {
        return None;
    }
    let mut label = String::new();
    let mut j = i + 2;
    loop {
        match chars.get(j)? {
            '\\' => {
                label.push(*chars.get(j + 1)?);
                j += 2;
            }
            ']' => break,
            c => {
                label.push(*c);
                j += 1;
            }
        }
    }
    if chars.get(j + 1) != Some(&'(') {
        return None;
    }
    let start = j + 2;
    let len = chars[start..].iter().take_while(|c| c.is_ascii_alphanumeric() || **c == '_' || **c == '-').count();
    if len == 0 || chars.get(start + len) != Some(&')') {
        return None;
    }
    let id: String = chars[start..start + len].iter().collect();
    Some((Inline::Mention { attrs: MentionAttrs { id, label } }, start + len + 1))
}

fn scan(line: &str, with_marks: bool) -> (Vec<Inline>, Marks) {
    let chars: Vec<char> = line.chars().collect();
    let mut out = Vec::new();
    let mut open = Marks::default();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '\\' && chars.get(i + 1).is_some_and(|n| ESCAPABLE.contains(n)) {
            push(&mut out, chars[i + 1], open);
            i += 2;
            continue;
        }
        if c == '@' {
            if let Some((mention, next)) = mention_at(&chars, i) {
                out.push(mention);
                i = next;
                continue;
            }
        }
        if c == '*' {
            let n = chars[i..].iter().take_while(|&&x| x == '*').count();
            let toggle = match n {
                1 => Some(Marks::ITALIC),
                2 => Some(Marks::BOLD),
                3 => Some(Marks::BOLD | Marks::ITALIC),
                _ => None,
            };
            if let Some(toggle) = toggle.filter(|_| with_marks) {
                let opening = toggle & (open ^ toggle);
                let closing = toggle & open;
                let before = i.checked_sub(1).map(|j| chars[j]);
                let after = chars.get(i + n).copied();
                let solid = |x: Option<char>| x.is_some_and(|x| !x.is_whitespace());
                if (opening.is_empty() || solid(after)) && (closing.is_empty() || solid(before)) {
                    open = open ^ toggle;
                    i += n;
                    continue;
                }
            }
            for _ in 0..n { push(&mut out, '*', open); }
            i += n;
            continue;
        }
        push(&mut out, c, open);
        i += 1;
    }
    (out, open)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::doc::{Inline, Marks};

    const B: Marks = Marks::BOLD;
    const I: Marks = Marks::ITALIC;
    const BI: Marks = Marks { bold: true, italic: true };
    fn t(s: &str) -> Inline { Inline::text(s) }
    fn m(s: &str, k: Marks) -> Inline { Inline::marked(s, k) }
    fn line(c: &[Inline]) -> String { serialize(c).join("|") }

    #[test]
    fn writes_toggles() {
        assert_eq!(line(&[t("a "), m("b", B), t(" c")]), "a **b** c");
        assert_eq!(line(&[m("a", I), m("b", B)]), "*a***b**");
        assert_eq!(line(&[m("a", BI)]), "***a***");
        assert_eq!(line(&[m("a ", B), m("b", BI), t(" c")]), "**a *b*** c");
    }

    #[test]
    fn edge_whitespace_stays_outside_delimiters() {
        assert_eq!(line(&[t("a"), m(" b ", B), t("c")]), "a **b** c");
        assert_eq!(line(&[m("  ", B)]), "  ");
    }

    #[test]
    fn escapes_user_text() {
        assert_eq!(line(&[t("2 * 3 \\ 4")]), "2 \\* 3 \\\\ 4");
        assert_eq!(line(&[t("{: align=center}")]), "\\{: align=center}");
        assert_eq!(line(&[t("  ![](../x.png)")]), "  \\![](../x.png)");
        assert_eq!(line(&[t("***")]), "\\*\\*\\*");
        assert_eq!(line(&[m("*", B)]), "**\\***");
    }

    #[test]
    fn marks_close_before_hard_breaks() {
        assert_eq!(serialize(&[m("a", B), Inline::HardBreak, m("b", B)]), vec!["**a**", "**b**"]);
    }

    #[test]
    fn parses_what_it_writes() {
        let cases: Vec<Vec<Inline>> = vec![
            vec![t("a "), m("b", B), t(" c")],
            vec![m("a", I), m("b", B)],
            vec![m("a", BI)],
            vec![m("a ", B), m("b", BI), t(" c")],
            vec![t("2 * 3 \\ 4")],
            vec![t("{: align=center}")],
            vec![m("*", B), t("x")],
            vec![t("fim\\")],
            vec![m("negrito, ", B), m("itálico", BI), m(" e volta", B)],
        ];
        for c in cases {
            let s = line(&c);
            assert_eq!(parse_line(&s), c, "via {s:?}");
        }
    }

    #[test]
    fn legacy_text_keeps_its_characters() {
        assert_eq!(parse_line("2 * 3 = 6"), vec![t("2 * 3 = 6")]);
        assert_eq!(parse_line("a \\ b"), vec![t("a \\ b")]);
        assert_eq!(parse_line("*nota sem par"), vec![t("*nota sem par")]);
        assert_eq!(parse_line("**** quatro"), vec![t("**** quatro")]);
        assert_eq!(parse_line("isso acabou\\"), vec![t("isso acabou\\")]);
        assert_eq!(parse_line("um *dois* três"), vec![t("um "), m("dois", I), t(" três")]);
    }

    #[test]
    fn legacy_escape_loses_one_backslash_on_load() {
        // Accepted legacy behavior: a `\` before an escapable character is consumed
        // by the escape and does not survive the round trip through parse_line.
        assert_eq!(parse_line("a \\* b"), vec![t("a * b")]);
    }

    #[test]
    fn multibyte_char_next_to_delimiters_roundtrips() {
        assert_eq!(line(&[m("é", B), t("ã")]), "**é**ã");
        assert_eq!(parse_line("**é**ã"), vec![m("é", B), t("ã")]);
    }

    #[test]
    fn mentions_round_trip_next_to_marks_and_odd_labels() {
        let cases: Vec<Vec<Inline>> = vec![
            vec![t("Viu "), Inline::mention("x1a", "Ana"), t(" chegar.")],
            vec![m("Ela", B), t(" "), Inline::mention("x2", "Vael"), t(" "), m("ali", B)],
            vec![Inline::mention("x3", "Ra]ul \\ o"), t("!")],
            vec![t("email@[teste] e @ solto")],
        ];
        for c in cases {
            let s = line(&c);
            assert_eq!(parse_line(&s), c, "via {s:?}");
        }
        assert_eq!(line(&[t("a "), Inline::mention("x1", "Ana")]), "a @[Ana](x1)");
    }

    #[test]
    fn broken_mentions_stay_text() {
        assert_eq!(parse_line("@[Ana](x 1)"), vec![t("@[Ana](x 1)")]);
        assert_eq!(parse_line("@[Ana]"), vec![t("@[Ana]")]);
        assert_eq!(parse_line("@[sem fim"), vec![t("@[sem fim")]);
    }

    #[test]
    fn whitespace_between_same_marked_runs_merges_on_reparse() {
        assert_eq!(line(&[m("a", B), t(" "), m("b", B)]), "**a b**");
        assert_eq!(parse_line("**a b**"), vec![m("a b", B)]);
    }
}
