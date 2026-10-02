//! Character and place sheets ("Fichas"): one template per kind, and the sheets that follow it.
use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

pub const SHEETS_VERSION: u32 = 1;
/// Longest name or field label kept, in characters.
pub const LABEL_MAX: usize = 120;
/// Most options a select field keeps.
pub const OPTIONS_MAX: usize = 50;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SheetKind {
    Character,
    Place,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FieldType {
    /// One line of text.
    Input,
    /// Free text over several lines.
    Textarea,
    /// One of `options`.
    Select,
    /// Yes or no.
    Boolean,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Field {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub ty: FieldType,
    /// Choices of a select field; empty for the other types.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(untagged)]
pub enum FieldValue {
    Bool(bool),
    Text(String),
}

impl FieldValue {
    /// The value as the field's type holds it; None when it says nothing (empty text, unknown option).
    pub fn fit(self, field: &Field) -> Option<FieldValue> {
        let fitted = match (field.ty, self) {
            (FieldType::Boolean, FieldValue::Bool(b)) => FieldValue::Bool(b),
            (FieldType::Boolean, FieldValue::Text(t)) => FieldValue::Bool(!t.trim().is_empty()),
            (FieldType::Select, FieldValue::Text(t)) if field.options.contains(&t) => FieldValue::Text(t),
            (FieldType::Select, _) => return None,
            (FieldType::Input, FieldValue::Text(t)) => FieldValue::Text(t.lines().map(str::trim).collect::<Vec<_>>().join(" ")),
            (_, FieldValue::Text(t)) => FieldValue::Text(t),
            (_, FieldValue::Bool(b)) => FieldValue::Text(if b { "Sim".into() } else { String::new() }),
        };
        match &fitted {
            FieldValue::Text(t) if t.trim().is_empty() => None,
            _ => Some(fitted),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Sheet {
    pub id: String,
    pub kind: SheetKind,
    pub name: String,
    /// By field id; only fields of the kind's template, each fitted to its type.
    #[serde(default)]
    pub values: BTreeMap<String, FieldValue>,
}

impl Sheet {
    /// Drops values of fields the template no longer has and fits the rest to their type.
    pub fn conform(&mut self, template: &[Field]) {
        let old = std::mem::take(&mut self.values);
        for (id, value) in old {
            if let Some(field) = template.iter().find(|f| f.id == id) {
                if let Some(v) = value.fit(field) {
                    self.values.insert(id, v);
                }
            }
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Templates {
    pub character: Vec<Field>,
    pub place: Vec<Field>,
}

impl Templates {
    pub fn of(&self, kind: SheetKind) -> &[Field] {
        match kind {
            SheetKind::Character => &self.character,
            SheetKind::Place => &self.place,
        }
    }

    pub fn of_mut(&mut self, kind: SheetKind) -> &mut Vec<Field> {
        match kind {
            SheetKind::Character => &mut self.character,
            SheetKind::Place => &mut self.place,
        }
    }
}

fn field(id: &str, label: &str, ty: FieldType, options: &[&str]) -> Field {
    Field { id: id.into(), label: label.into(), ty, options: options.iter().map(|o| o.to_string()).collect() }
}

impl Default for Templates {
    /// Starter templates for a book that has none yet; the writer edits them freely.
    fn default() -> Self {
        use FieldType::*;
        Templates {
            character: vec![
                field("papel", "Papel", Select, &["Protagonista", "Antagonista", "Coadjuvante", "Figurante"]),
                field("idade", "Idade", Input, &[]),
                field("aparencia", "Aparência", Textarea, &[]),
                field("personalidade", "Personalidade", Textarea, &[]),
                field("vivo", "Vivo", Boolean, &[]),
            ],
            place: vec![
                field("tipo", "Tipo", Select, &["Cidade", "Construção", "Região", "Natureza", "Outro"]),
                field("descricao", "Descrição", Textarea, &[]),
                field("real", "Existe no mundo real", Boolean, &[]),
            ],
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Sheets {
    pub version: u32,
    #[serde(default)]
    pub templates: Templates,
    /// Characters and places together, in creation order.
    #[serde(default)]
    pub sheets: Vec<Sheet>,
}

impl Default for Sheets {
    fn default() -> Self {
        Sheets { version: SHEETS_VERSION, templates: Templates::default(), sheets: Vec::new() }
    }
}

impl Sheets {
    pub fn find_mut(&mut self, id: &str) -> Option<&mut Sheet> {
        self.sheets.iter_mut().find(|s| s.id == id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn select() -> Field {
        field("f", "Papel", FieldType::Select, &["A", "B"])
    }

    #[test]
    fn values_fit_their_field_type() {
        let boolean = field("f", "Vivo", FieldType::Boolean, &[]);
        assert_eq!(FieldValue::Text("sim".into()).fit(&boolean), Some(FieldValue::Bool(true)));
        assert_eq!(FieldValue::Bool(true).fit(&field("f", "x", FieldType::Textarea, &[])), Some(FieldValue::Text("Sim".into())));
        assert_eq!(FieldValue::Bool(false).fit(&field("f", "x", FieldType::Input, &[])), None);
        assert_eq!(FieldValue::Text("B".into()).fit(&select()), Some(FieldValue::Text("B".into())));
        assert_eq!(FieldValue::Text("C".into()).fit(&select()), None);
        assert_eq!(
            FieldValue::Text("um\n dois".into()).fit(&field("f", "x", FieldType::Input, &[])),
            Some(FieldValue::Text("um dois".into()))
        );
        assert_eq!(FieldValue::Text("  ".into()).fit(&field("f", "x", FieldType::Textarea, &[])), None);
    }

    #[test]
    fn conform_drops_values_of_removed_fields() {
        let mut s = Sheet { id: "s".into(), kind: SheetKind::Character, name: "Ana".into(), values: BTreeMap::new() };
        s.values.insert("f".into(), FieldValue::Text("A".into()));
        s.values.insert("gone".into(), FieldValue::Text("x".into()));
        s.conform(&[select()]);
        assert_eq!(s.values.len(), 1);
        assert_eq!(s.values["f"], FieldValue::Text("A".into()));
    }

    #[test]
    fn json_keeps_bools_and_texts_apart() {
        let mut s = Sheet { id: "s".into(), kind: SheetKind::Place, name: "Vael".into(), values: BTreeMap::new() };
        s.values.insert("a".into(), FieldValue::Bool(true));
        s.values.insert("b".into(), FieldValue::Text("true".into()));
        let back: Sheet = serde_json::from_str(&serde_json::to_string(&s).unwrap()).unwrap();
        assert_eq!(back, s);
    }
}
