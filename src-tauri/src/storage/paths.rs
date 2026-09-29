use std::path::{Component, Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::text::normalize::fold;

pub const ROOT_NAME: &str = "Scribalis";
pub const IMAGES_DIR: &str = "imagens";
/// Copy of `metadata.json` taken before the migration to tree version 2.
pub const BACKUP_META_FILE: &str = "metadata.antes-da-migracao.json";
pub const CHAPTERS_DIR: &str = "capitulos";
pub const META_FILE: &str = "metadata.json";
pub const AREA_DIR: &str = "area";
pub const AREA_FILE: &str = "area.json";
pub const AREA_FILES_DIR: &str = "arquivos";
pub const BOARD_DIR: &str = "quadro";
pub const BOARD_FILE: &str = "quadro.json";

/// Folder name for a book title: ascii letters/digits joined by dashes.
pub fn slugify(title: &str) -> String {
    let mut out = String::new();
    for c in fold(title).chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    let trimmed = out.trim_end_matches('-');
    if trimmed.is_empty() { "obra".to_string() } else { trimmed.to_string() }
}

/// `root/slug`, or `root/slug-2`, `-3`… when taken.
pub fn unique_dir(root: &Path, slug: &str) -> PathBuf {
    let first = root.join(slug);
    if !first.exists() {
        return first;
    }
    (2..)
        .map(|n| root.join(format!("{slug}-{n}")))
        .find(|p| !p.exists())
        .expect("an unused suffix always exists")
}

/// Joins a relative path from metadata, refusing absolute paths and `..`.
pub fn safe_join(base: &Path, rel: &str) -> AppResult<PathBuf> {
    let rel_path = Path::new(rel);
    let ok = !rel.is_empty()
        && rel_path.components().all(|c| matches!(c, Component::Normal(_)));
    if !ok {
        return Err(AppError::msg(format!("Caminho inválido na obra: {rel}")));
    }
    Ok(base.join(rel_path))
}

/// Book-relative file of chapter `id`.
pub fn chapter_rel(id: &str) -> String {
    format!("{CHAPTERS_DIR}/{id}.md")
}

/// `area/`-relative file of a text that came out of the Manuscrito.
pub fn area_text_rel(id: &str) -> String {
    format!("{AREA_FILES_DIR}/{id}.md")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_from_accented_title() {
        assert_eq!(slugify("A Torre das Mil Luas!"), "a-torre-das-mil-luas");
        assert_eq!(slugify("Ção"), "cao");
    }

    #[test]
    fn slug_falls_back_when_no_letters() {
        assert_eq!(slugify("???"), "obra");
        assert_eq!(slugify(""), "obra");
    }

    #[test]
    fn unique_dir_adds_suffix() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir(tmp.path().join("obra")).unwrap();
        std::fs::create_dir(tmp.path().join("obra-2")).unwrap();
        assert_eq!(unique_dir(tmp.path(), "obra"), tmp.path().join("obra-3"));
    }

    #[test]
    fn safe_join_rejects_escape() {
        let base = Path::new("/x");
        assert!(safe_join(base, "capitulos/a.md").is_ok());
        assert!(safe_join(base, "../etc/passwd").is_err());
        assert!(safe_join(base, "/abs").is_err());
        assert!(safe_join(base, "").is_err());
    }
}
