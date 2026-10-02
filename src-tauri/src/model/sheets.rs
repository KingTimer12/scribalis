//! Sheets ("Fichas"): characters, places and abilities. Each kind has one template, and its
//! sheets follow it.
use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};

use crate::text::normalize::fold;

pub const SHEETS_VERSION: u32 = 1;
/// Longest name, field label, option or tag kept, in characters.
pub const LABEL_MAX: usize = 120;
/// Most options a select field keeps, and most tags or references a field holds.
pub const OPTIONS_MAX: usize = 50;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum SheetKind {
    Character,
    Place,
    Ability,
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
    /// Other sheets of kind `target`: one, or several when `multiple`.
    Reference,
    /// Free labels; the ones already used in the field are offered again.
    Tags,
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
    /// Kind a reference field points at; None for the other types.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target: Option<SheetKind>,
    /// A reference field that holds several sheets.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub multiple: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(untagged)]
pub enum FieldValue {
    Bool(bool),
    Text(String),
    /// Tags, or the ids of a multiple reference.
    List(Vec<String>),
}

/// Kind of every sheet by id, to check references.
pub type KindIndex = HashMap<String, SheetKind>;

/// Tags trimmed, cut, without repeats (ignoring case and accents) and capped.
fn clean_tags(tags: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for t in tags {
        let t: String = t.trim().chars().take(LABEL_MAX).collect();
        if !t.is_empty() && out.len() < OPTIONS_MAX && !out.iter().any(|o| fold(o) == fold(&t)) {
            out.push(t);
        }
    }
    out
}

impl FieldValue {
    fn texts(self) -> Vec<String> {
        match self {
            FieldValue::Bool(_) => Vec::new(),
            FieldValue::Text(t) => vec![t],
            FieldValue::List(l) => l,
        }
    }

    /// The value as the field's type holds it; None when it says nothing (empty text, unknown
    /// option, no tags, no existing sheet of the target kind).
    pub fn fit(self, field: &Field, kinds: &KindIndex) -> Option<FieldValue> {
        let fitted = match (field.ty, self) {
            (FieldType::Boolean, FieldValue::Bool(b)) => FieldValue::Bool(b),
            (FieldType::Boolean, v) => FieldValue::Bool(v.texts().iter().any(|t| !t.trim().is_empty())),
            (FieldType::Select, FieldValue::Text(t)) if field.options.contains(&t) => FieldValue::Text(t),
            (FieldType::Select, FieldValue::List(l)) => FieldValue::Text(l.into_iter().find(|t| field.options.contains(t))?),
            (FieldType::Select, _) => return None,
            (FieldType::Tags, FieldValue::Text(t)) => FieldValue::List(clean_tags(t.split(',').map(String::from))),
            (FieldType::Tags, v) => FieldValue::List(clean_tags(v.texts())),
            (FieldType::Reference, v) => {
                let target = field.target?;
                let mut ids: Vec<String> = Vec::new();
                for id in v.texts() {
                    if kinds.get(&id) == Some(&target) && !ids.contains(&id) && ids.len() < OPTIONS_MAX {
                        ids.push(id);
                    }
                }
                if field.multiple {
                    FieldValue::List(ids)
                } else {
                    FieldValue::Text(ids.into_iter().next()?)
                }
            }
            (FieldType::Input, FieldValue::Text(t)) => FieldValue::Text(t.lines().map(str::trim).collect::<Vec<_>>().join(" ")),
            (_, FieldValue::Text(t)) => FieldValue::Text(t),
            (_, FieldValue::List(l)) => FieldValue::Text(l.join(", ")),
            (_, FieldValue::Bool(b)) => FieldValue::Text(if b { "Sim".into() } else { String::new() }),
        };
        match &fitted {
            FieldValue::Text(t) if t.trim().is_empty() => None,
            FieldValue::List(l) if l.is_empty() => None,
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

/// References and plain values never turn into each other: ids are not text, and text is not ids.
fn same_family(a: &Field, b: &Field) -> bool {
    (a.ty == FieldType::Reference) == (b.ty == FieldType::Reference)
}

impl Sheet {
    /// Follows `template`: values of fields it no longer has go, the rest fit their (maybe new)
    /// type. `previous` is the template the values were written for.
    pub fn conform(&mut self, template: &[Field], previous: &[Field], kinds: &KindIndex) {
        let old = std::mem::take(&mut self.values);
        for (id, value) in old {
            let Some(field) = template.iter().find(|f| f.id == id) else { continue };
            if previous.iter().find(|f| f.id == id).is_some_and(|p| !same_family(p, field)) {
                continue;
            }
            if let Some(v) = value.fit(field, kinds) {
                self.values.insert(id, v);
            }
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Templates {
    #[serde(default = "starter_character")]
    pub character: Vec<Field>,
    #[serde(default = "starter_place")]
    pub place: Vec<Field>,
    /// Books made before abilities existed get the starter template.
    #[serde(default = "starter_ability")]
    pub ability: Vec<Field>,
}

impl Templates {
    pub fn of(&self, kind: SheetKind) -> &[Field] {
        match kind {
            SheetKind::Character => &self.character,
            SheetKind::Place => &self.place,
            SheetKind::Ability => &self.ability,
        }
    }

    pub fn of_mut(&mut self, kind: SheetKind) -> &mut Vec<Field> {
        match kind {
            SheetKind::Character => &mut self.character,
            SheetKind::Place => &mut self.place,
            SheetKind::Ability => &mut self.ability,
        }
    }
}

fn field(id: &str, label: &str, ty: FieldType, options: &[&str]) -> Field {
    Field {
        id: id.into(),
        label: label.into(),
        ty,
        options: options.iter().map(|o| o.to_string()).collect(),
        target: None,
        multiple: false,
    }
}

fn reference(id: &str, label: &str, target: SheetKind, multiple: bool) -> Field {
    Field { target: Some(target), multiple, ..field(id, label, FieldType::Reference, &[]) }
}

// Starter templates for a book that has none yet; the writer edits them freely.

fn starter_character() -> Vec<Field> {
    use FieldType::*;
    vec![
        field("papel", "Papel", Select, &["Protagonista", "Antagonista", "Coadjuvante", "Figurante"]),
        field("idade", "Idade", Input, &[]),
        reference("nascimento", "Nascimento", SheetKind::Place, false),
        field("aparencia", "Aparência", Textarea, &[]),
        field("personalidade", "Personalidade", Tags, &[]),
        reference("habilidades", "Habilidades", SheetKind::Ability, true),
        field("vivo", "Vivo", Boolean, &[]),
    ]
}

fn starter_place() -> Vec<Field> {
    use FieldType::*;
    vec![
        field("tipo", "Tipo", Select, &["Cidade", "Construção", "Região", "Natureza", "Outro"]),
        field("descricao", "Descrição", Textarea, &[]),
        field("real", "Existe no mundo real", Boolean, &[]),
    ]
}

fn starter_ability() -> Vec<Field> {
    use FieldType::*;
    vec![
        field("tipo", "Tipo", Select, &["Magia", "Técnica", "Dom", "Objeto"]),
        field("descricao", "Descrição", Textarea, &[]),
        field("limite", "Custo ou limite", Textarea, &[]),
        field("marcas", "Marcas", Tags, &[]),
    ]
}

impl Default for Templates {
    fn default() -> Self {
        Templates { character: starter_character(), place: starter_place(), ability: starter_ability() }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Sheets {
    pub version: u32,
    #[serde(default)]
    pub templates: Templates,
    /// Every kind together, in creation order.
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

    pub fn kinds(&self) -> KindIndex {
        self.sheets.iter().map(|s| (s.id.clone(), s.kind)).collect()
    }

    /// Every sheet follows its kind's template again (after a sheet was deleted, so references
    /// to it go away).
    pub fn conform_all(&mut self) {
        let kinds = self.kinds();
        let templates = self.templates.clone();
        for sheet in &mut self.sheets {
            let t = templates.of(sheet.kind);
            sheet.conform(t, t, &kinds);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn select() -> Field {
        field("f", "Papel", FieldType::Select, &["A", "B"])
    }

    fn none() -> KindIndex {
        KindIndex::new()
    }

    #[test]
    fn values_fit_their_field_type() {
        let k = none();
        let boolean = field("f", "Vivo", FieldType::Boolean, &[]);
        assert_eq!(FieldValue::Text("sim".into()).fit(&boolean, &k), Some(FieldValue::Bool(true)));
        assert_eq!(FieldValue::Bool(true).fit(&field("f", "x", FieldType::Textarea, &[]), &k), Some(FieldValue::Text("Sim".into())));
        assert_eq!(FieldValue::Bool(false).fit(&field("f", "x", FieldType::Input, &[]), &k), None);
        assert_eq!(FieldValue::Text("B".into()).fit(&select(), &k), Some(FieldValue::Text("B".into())));
        assert_eq!(FieldValue::Text("C".into()).fit(&select(), &k), None);
        assert_eq!(
            FieldValue::Text("um\n dois".into()).fit(&field("f", "x", FieldType::Input, &[]), &k),
            Some(FieldValue::Text("um dois".into()))
        );
        assert_eq!(FieldValue::Text("  ".into()).fit(&field("f", "x", FieldType::Textarea, &[]), &k), None);
    }

    #[test]
    fn tags_never_repeat_and_text_splits_at_commas() {
        let k = none();
        let tags = field("t", "Personalidade", FieldType::Tags, &[]);
        let list = |v: &[&str]| FieldValue::List(v.iter().map(|s| s.to_string()).collect());
        assert_eq!(list(&[" Corajosa ", "corajosa", "Calma", "", "CALMA"]).fit(&tags, &k), Some(list(&["Corajosa", "Calma"])));
        assert_eq!(FieldValue::Text("leal, teimosa".into()).fit(&tags, &k), Some(list(&["leal", "teimosa"])));
        assert_eq!(list(&[]).fit(&tags, &k), None);
        assert_eq!(list(&["a", "b"]).fit(&field("f", "x", FieldType::Input, &[]), &k), Some(FieldValue::Text("a, b".into())));
    }

    #[test]
    fn references_keep_only_existing_sheets_of_the_target_kind() {
        let mut k = none();
        k.insert("p1".into(), SheetKind::Place);
        k.insert("p2".into(), SheetKind::Place);
        k.insert("c1".into(), SheetKind::Character);
        let one = reference("n", "Nascimento", SheetKind::Place, false);
        let many = reference("v", "Visitou", SheetKind::Place, true);
        let ids = |v: &[&str]| FieldValue::List(v.iter().map(|s| s.to_string()).collect());
        assert_eq!(FieldValue::Text("p1".into()).fit(&one, &k), Some(FieldValue::Text("p1".into())));
        assert_eq!(FieldValue::Text("c1".into()).fit(&one, &k), None);
        assert_eq!(ids(&["gone", "p2", "p1"]).fit(&one, &k), Some(FieldValue::Text("p2".into())));
        assert_eq!(ids(&["p1", "c1", "p1", "p2"]).fit(&many, &k), Some(ids(&["p1", "p2"])));
        assert_eq!(FieldValue::Text("p2".into()).fit(&many, &k), Some(ids(&["p2"])));
    }

    #[test]
    fn conform_drops_removed_fields_and_never_turns_ids_into_text() {
        let mut k = none();
        k.insert("p1".into(), SheetKind::Place);
        let mut s = Sheet { id: "s".into(), kind: SheetKind::Character, name: "Ana".into(), values: BTreeMap::new() };
        s.values.insert("f".into(), FieldValue::Text("A".into()));
        s.values.insert("gone".into(), FieldValue::Text("x".into()));
        s.values.insert("n".into(), FieldValue::Text("p1".into()));
        let before = [select(), reference("n", "Nascimento", SheetKind::Place, false)];
        let after = [select(), field("n", "Nascimento", FieldType::Input, &[])];
        s.conform(&after, &before, &k);
        assert_eq!(s.values.len(), 1);
        assert_eq!(s.values["f"], FieldValue::Text("A".into()));
    }

    #[test]
    fn json_keeps_bools_texts_and_lists_apart() {
        let mut s = Sheet { id: "s".into(), kind: SheetKind::Ability, name: "Fogo".into(), values: BTreeMap::new() };
        s.values.insert("a".into(), FieldValue::Bool(true));
        s.values.insert("b".into(), FieldValue::Text("true".into()));
        s.values.insert("c".into(), FieldValue::List(vec!["x".into()]));
        let back: Sheet = serde_json::from_str(&serde_json::to_string(&s).unwrap()).unwrap();
        assert_eq!(back, s);
    }

    #[test]
    fn an_older_file_without_abilities_gets_their_starter_template() {
        let json = r#"{"version":1,"templates":{"character":[],"place":[]},"sheets":[]}"#;
        let sheets: Sheets = serde_json::from_str(json).unwrap();
        assert!(sheets.templates.character.is_empty());
        assert_eq!(sheets.templates.ability, starter_ability());
    }
}
