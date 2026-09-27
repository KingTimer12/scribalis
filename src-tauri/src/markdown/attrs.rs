//! Kramdown-style attribute line written after a formatted paragraph:
//! `{: align=center line=1.5 before=12 after=6 indent=1.25}`.
use crate::model::doc::{Align, ParaAttrs};

/// Shortest decimal form: 2.0 → "2", 1.50 → "1.5".
fn num(v: f64) -> String {
    let s = format!("{v:.2}");
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

pub fn serialize(a: &ParaAttrs) -> Option<String> {
    let mut parts = Vec::new();
    if let Some(al) = a.text_align { parts.push(format!("align={}", al.as_str())); }
    if let Some(v) = a.line_height { parts.push(format!("line={}", num(v as f64))); }
    if let Some(v) = a.space_before { parts.push(format!("before={v}")); }
    if let Some(v) = a.space_after { parts.push(format!("after={v}")); }
    if let Some(v) = a.indent { parts.push(format!("indent={}", num(v as f64))); }
    (!parts.is_empty()).then(|| format!("{{: {}}}", parts.join(" ")))
}

/// `None` unless the whole line is `{: key=value …}`; bad values are skipped.
pub fn parse(line: &str) -> Option<ParaAttrs> {
    let inner = line.trim().strip_prefix("{:")?.strip_suffix('}')?;
    let mut a = ParaAttrs::default();
    for token in inner.split_whitespace() {
        let (key, value) = token.split_once('=')?;
        let n = value.parse::<f64>().ok();
        match key {
            "align" => a.text_align = Align::parse(value),
            "line" => a.line_height = n.and_then(ParaAttrs::clamp_line),
            "before" => a.space_before = n.and_then(ParaAttrs::clamp_before),
            "after" => a.space_after = n.and_then(ParaAttrs::clamp_after),
            "indent" => a.indent = n.and_then(ParaAttrs::clamp_indent),
            _ => {}
        }
    }
    Some(a)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::doc::{Align, ParaAttrs};

    fn full() -> ParaAttrs {
        ParaAttrs { text_align: Some(Align::Center), line_height: Some(1.5), space_before: Some(24),
            space_after: Some(0), indent: Some(1.25) }
    }

    #[test]
    fn writes_keys_in_fixed_order_and_trims_numbers() {
        assert_eq!(serialize(&full()).unwrap(), "{: align=center line=1.5 before=24 after=0 indent=1.25}");
        let two = ParaAttrs { line_height: Some(2.0), ..Default::default() };
        assert_eq!(serialize(&two).unwrap(), "{: line=2}");
        assert_eq!(serialize(&ParaAttrs::default()), None);
    }

    #[test]
    fn reads_any_order_and_roundtrips() {
        assert_eq!(parse("{: indent=1.25 after=0 before=24 line=1.5 align=center}"), Some(full()));
        assert_eq!(parse(&serialize(&full()).unwrap()), Some(full()));
        assert_eq!(parse("  {:  align=justify  }  "), Some(ParaAttrs { text_align: Some(Align::Justify), ..Default::default() }));
    }

    #[test]
    fn unknown_keys_and_bad_values_are_ignored_but_clamped() {
        assert_eq!(parse("{: cor=azul line=abc before=500}"),
            Some(ParaAttrs { space_before: Some(96), ..Default::default() }));
    }

    #[test]
    fn malformed_lines_are_not_attrs() {
        assert_eq!(parse("{: align=center"), None);
        assert_eq!(parse("{: sem igual}"), None);
        assert_eq!(parse("texto {: align=center}"), None);
        assert_eq!(parse("{ align=center}"), None);
    }

    #[test]
    fn line_height_1_15_serializes_correctly() {
        assert_eq!(serialize(&ParaAttrs { line_height: Some(1.15), ..Default::default() }).unwrap(), "{: line=1.15}");
    }
}
