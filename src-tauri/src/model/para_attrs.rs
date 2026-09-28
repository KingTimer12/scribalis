//! Paragraph-level formatting: alignment, line height, spacing and first-line indent.
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Align {
    Center,
    Right,
    Justify,
}

impl Align {
    /// `left` (the default) and unknown values are `None`.
    pub fn parse(s: &str) -> Option<Align> {
        match s {
            "center" => Some(Align::Center),
            "right" => Some(Align::Right),
            "justify" => Some(Align::Justify),
            _ => None,
        }
    }
    pub fn as_str(self) -> &'static str {
        match self {
            Align::Center => "center",
            Align::Right => "right",
            Align::Justify => "justify",
        }
    }
}

/// Paragraph formatting; `None` means the app default.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "camelCase", from = "RawParaAttrs")]
pub struct ParaAttrs {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_align: Option<Align>,
    /// Line height multiplier.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_height: Option<f32>,
    /// Points.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub space_before: Option<u16>,
    /// Points.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub space_after: Option<u16>,
    /// First-line indent in centimeters.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub indent: Option<f32>,
}

fn round2(v: f64) -> f32 {
    ((v * 100.0).round() / 100.0) as f32
}

impl ParaAttrs {
    pub fn is_empty(&self) -> bool {
        *self == ParaAttrs::default()
    }
    pub fn clamp_line(v: f64) -> Option<f32> {
        v.is_finite().then(|| round2(v.clamp(1.0, 3.0)))
    }
    pub fn clamp_before(v: f64) -> Option<u16> {
        // 0 is the default top margin.
        v.is_finite().then(|| v.clamp(0.0, 96.0).round() as u16).filter(|&n| n > 0)
    }
    pub fn clamp_after(v: f64) -> Option<u16> {
        v.is_finite().then(|| v.clamp(0.0, 96.0).round() as u16)
    }
    pub fn clamp_indent(v: f64) -> Option<f32> {
        // No indent is the default.
        v.is_finite().then(|| round2(v.clamp(0.0, 5.0))).filter(|&n| n > 0.0)
    }
}

/// What the webview sends: any field may be null, a string or out of range.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct RawParaAttrs {
    text_align: Value,
    line_height: Value,
    space_before: Value,
    space_after: Value,
    indent: Value,
}

fn num(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse().ok(),
        _ => None,
    }
}

impl From<RawParaAttrs> for ParaAttrs {
    fn from(r: RawParaAttrs) -> Self {
        ParaAttrs {
            text_align: r.text_align.as_str().and_then(Align::parse),
            line_height: num(&r.line_height).and_then(ParaAttrs::clamp_line),
            space_before: num(&r.space_before).and_then(ParaAttrs::clamp_before),
            space_after: num(&r.space_after).and_then(ParaAttrs::clamp_after),
            indent: num(&r.indent).and_then(ParaAttrs::clamp_indent),
        }
    }
}
