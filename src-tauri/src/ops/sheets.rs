//! Sheet operations: templates, creating, naming, filling in and deleting sheets.
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::ids::new_id;
use crate::model::sheets::{Field, FieldType, FieldValue, Sheet, SheetKind, Sheets, LABEL_MAX, OPTIONS_MAX};
use crate::storage::sheets_io::{read_sheets, write_sheets};

const NOT_FOUND: &str = "Ficha não encontrada";

/// A field as the template editor sends it; an empty id is a new field.
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FieldInput {
    #[serde(default)]
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub ty: FieldType,
    #[serde(default)]
    pub options: Vec<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SheetCreated {
    pub id: String,
    pub sheets: Sheets,
}

fn cut(text: &str, max: usize) -> String {
    text.trim().chars().take(max).collect()
}

fn edit<T>(dir: &Path, f: impl FnOnce(&mut Sheets) -> AppResult<T>) -> AppResult<T> {
    let mut sheets = read_sheets(dir)?;
    let out = f(&mut sheets)?;
    write_sheets(dir, &sheets)?;
    Ok(out)
}

pub fn load(dir: &Path) -> AppResult<Sheets> {
    read_sheets(dir)
}

/// Cleans the editor's fields: labels trimmed (never empty), ids unique, select options trimmed,
/// deduplicated and capped, no options on other types.
fn clean_fields(fields: Vec<FieldInput>) -> Vec<Field> {
    let mut out: Vec<Field> = Vec::with_capacity(fields.len());
    for f in fields {
        let id = if f.id.is_empty() || out.iter().any(|o| o.id == f.id) { new_id() } else { f.id };
        let label = match cut(&f.label, LABEL_MAX) {
            l if l.is_empty() => "Campo sem nome".to_string(),
            l => l,
        };
        let mut options: Vec<String> = Vec::new();
        if f.ty == FieldType::Select {
            for o in f.options.iter().map(|o| cut(o, LABEL_MAX)).filter(|o| !o.is_empty()) {
                if !options.contains(&o) && options.len() < OPTIONS_MAX {
                    options.push(o);
                }
            }
        }
        out.push(Field { id, label, ty: f.ty, options });
    }
    out
}

/// Replaces the kind's template; every sheet of that kind follows it (values of removed fields
/// go, the rest fit their new type).
pub fn set_template(dir: &Path, kind: SheetKind, fields: Vec<FieldInput>) -> AppResult<Sheets> {
    edit(dir, |sheets| {
        let template = clean_fields(fields);
        for sheet in sheets.sheets.iter_mut().filter(|s| s.kind == kind) {
            sheet.conform(&template);
        }
        *sheets.templates.of_mut(kind) = template;
        Ok(sheets.clone())
    })
}

pub fn create(dir: &Path, kind: SheetKind, name: &str) -> AppResult<SheetCreated> {
    edit(dir, |sheets| {
        let id = new_id();
        sheets.sheets.push(Sheet { id: id.clone(), kind, name: cut(name, LABEL_MAX), values: Default::default() });
        Ok(SheetCreated { id, sheets: sheets.clone() })
    })
}

pub fn rename(dir: &Path, id: &str, name: &str) -> AppResult<()> {
    edit(dir, |sheets| {
        let sheet = sheets.find_mut(id).ok_or_else(|| AppError::msg(NOT_FOUND))?;
        sheet.name = cut(name, LABEL_MAX);
        Ok(())
    })
}

/// Sets one field of a sheet, fitted to the field's type; `None` (or a value that says nothing) clears it.
pub fn set_value(dir: &Path, id: &str, field: &str, value: Option<FieldValue>) -> AppResult<()> {
    edit(dir, |sheets| {
        let kind = sheets.sheets.iter().find(|s| s.id == id).ok_or_else(|| AppError::msg(NOT_FOUND))?.kind;
        let def = sheets
            .templates
            .of(kind)
            .iter()
            .find(|f| f.id == field)
            .cloned()
            .ok_or_else(|| AppError::msg("Este campo não existe mais no molde"))?;
        let sheet = sheets.find_mut(id).expect("found above");
        match value.and_then(|v| v.fit(&def)) {
            Some(v) => sheet.values.insert(def.id, v),
            None => sheet.values.remove(&def.id),
        };
        Ok(())
    })
}

pub fn delete(dir: &Path, id: &str) -> AppResult<Sheets> {
    edit(dir, |sheets| {
        let before = sheets.sheets.len();
        sheets.sheets.retain(|s| s.id != id);
        if sheets.sheets.len() == before {
            return Err(AppError::msg(NOT_FOUND));
        }
        Ok(sheets.clone())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(id: &str, label: &str, ty: FieldType, options: &[&str]) -> FieldInput {
        FieldInput { id: id.into(), label: label.into(), ty, options: options.iter().map(|o| o.to_string()).collect() }
    }

    #[test]
    fn a_sheet_is_created_named_and_filled_in() {
        let dir = tempfile::tempdir().unwrap();
        let created = create(dir.path(), SheetKind::Character, "  Ana  ").unwrap();
        assert_eq!(created.sheets.sheets[0].name, "Ana");
        rename(dir.path(), &created.id, "Ana Lírio").unwrap();
        set_value(dir.path(), &created.id, "papel", Some(FieldValue::Text("Protagonista".into()))).unwrap();
        set_value(dir.path(), &created.id, "vivo", Some(FieldValue::Bool(true))).unwrap();
        set_value(dir.path(), &created.id, "papel", Some(FieldValue::Text("Rei".into()))).unwrap();
        let sheet = &load(dir.path()).unwrap().sheets[0];
        assert_eq!(sheet.name, "Ana Lírio");
        assert_eq!(sheet.values.len(), 1, "an unknown option clears the select");
        assert_eq!(sheet.values["vivo"], FieldValue::Bool(true));
    }

    #[test]
    fn a_field_outside_the_template_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let created = create(dir.path(), SheetKind::Place, "Vael").unwrap();
        let err = set_value(dir.path(), &created.id, "papel", Some(FieldValue::Text("x".into()))).unwrap_err();
        assert_eq!(err.to_string(), "Este campo não existe mais no molde");
        assert!(set_value(dir.path(), "nope", "tipo", None).is_err());
    }

    #[test]
    fn the_template_is_cleaned_and_every_sheet_of_its_kind_follows_it() {
        let dir = tempfile::tempdir().unwrap();
        let ana = create(dir.path(), SheetKind::Character, "Ana").unwrap().id;
        let vael = create(dir.path(), SheetKind::Place, "Vael").unwrap().id;
        set_value(dir.path(), &ana, "idade", Some(FieldValue::Text("30".into()))).unwrap();
        set_value(dir.path(), &ana, "aparencia", Some(FieldValue::Text("alta".into()))).unwrap();
        set_value(dir.path(), &vael, "descricao", Some(FieldValue::Text("porto".into()))).unwrap();
        let sheets = set_template(
            dir.path(),
            SheetKind::Character,
            vec![
                input("idade", "  ", FieldType::Boolean, &["x"]),
                input("", "Casa", FieldType::Select, &[" Norte ", "", "Norte", "Sul"]),
                input("idade", "Repetido", FieldType::Input, &[]),
            ],
        )
        .unwrap();
        let t = &sheets.templates.character;
        assert_eq!(t[0].label, "Campo sem nome");
        assert!(t[0].options.is_empty());
        assert_eq!(t[1].options, vec!["Norte", "Sul"]);
        assert!(!t[1].id.is_empty());
        assert_ne!(t[2].id, "idade", "a repeated id gets a new one");
        let ana = sheets.sheets.iter().find(|s| s.id == ana).unwrap();
        assert_eq!(ana.values.len(), 1);
        assert_eq!(ana.values["idade"], FieldValue::Bool(true));
        let vael = sheets.sheets.iter().find(|s| s.id == vael).unwrap();
        assert_eq!(vael.values["descricao"], FieldValue::Text("porto".into()), "places keep theirs");
    }

    #[test]
    fn deleting_removes_only_that_sheet() {
        let dir = tempfile::tempdir().unwrap();
        let a = create(dir.path(), SheetKind::Character, "A").unwrap().id;
        create(dir.path(), SheetKind::Character, "B").unwrap();
        let sheets = delete(dir.path(), &a).unwrap();
        assert_eq!(sheets.sheets.len(), 1);
        assert_eq!(sheets.sheets[0].name, "B");
        assert!(delete(dir.path(), &a).is_err());
    }
}
