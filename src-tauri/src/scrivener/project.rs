//! A `.scriv` project on disk: where each binder item's files live (Scrivener 2 and 3).
use std::{fs, io::ErrorKind, path::{Path, PathBuf}};

use super::{binder::{parse_binder, BinderItem}, rtf::rtf_to_doc};
use crate::error::{AppError, AppResult};
use crate::model::doc::Doc;
use crate::text::words::doc_text;

#[derive(Debug)]
pub struct Project {
    pub dir: PathBuf,
    pub scrivx: PathBuf,
    pub title: String,
    v3: bool,
}

fn invalid() -> AppError {
    AppError::msg("Projeto do Scrivener inválido")
}

fn safe_key(key: &str) -> bool {
    !key.is_empty() && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn read_optional(path: &Path) -> AppResult<Option<Vec<u8>>> {
    match fs::read(path) {
        Ok(b) => Ok(Some(b)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

impl Project {
    /// Accepts the `.scriv` folder or the `.scrivx` file inside it.
    pub fn open(path: &Path) -> AppResult<Project> {
        let (dir, scrivx) = if path.is_file() {
            (path.parent().ok_or_else(invalid)?.to_path_buf(), path.to_path_buf())
        } else {
            let found = fs::read_dir(path)
                .map_err(|_| invalid())?
                .filter_map(|e| e.ok().map(|e| e.path()))
                .find(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("scrivx")))
                .ok_or_else(invalid)?;
            (path.to_path_buf(), found)
        };
        let dir_name = dir.file_name().and_then(|n| n.to_str()).unwrap_or("");
        let title = match dir_name.strip_suffix(".scriv") {
            Some(t) if !t.is_empty() => t.to_string(),
            _ => scrivx.file_stem().and_then(|s| s.to_str()).unwrap_or("Projeto").to_string(),
        };
        let v3 = dir.join("Files").join("Data").is_dir();
        Ok(Project { dir, scrivx, title, v3 })
    }

    pub fn binder(&self) -> AppResult<Vec<BinderItem>> {
        let xml = fs::read_to_string(&self.scrivx).map_err(|_| invalid())?;
        parse_binder(&xml)
    }

    fn item_dir(&self) -> PathBuf {
        self.dir.join("Files").join(if self.v3 { "Data" } else { "Docs" })
    }

    /// The item's main file (`content.*` / `<ID>.*`), text preferred as `.rtf`.
    pub fn content(&self, key: &str) -> Option<PathBuf> {
        if !safe_key(key) {
            return None;
        }
        let (dir, stem) = if self.v3 { (self.item_dir().join(key), "content") } else { (self.item_dir(), key) };
        let mut found: Vec<PathBuf> = fs::read_dir(dir)
            .ok()?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.is_file() && p.file_stem().and_then(|s| s.to_str()) == Some(stem))
            .collect();
        found.sort_by_key(|p| !p.extension().is_some_and(|x| x.eq_ignore_ascii_case("rtf")));
        found.into_iter().next()
    }

    fn side_file(&self, key: &str, v3_name: &str, v2_suffix: &str) -> Option<PathBuf> {
        if !safe_key(key) {
            return None;
        }
        Some(if self.v3 { self.item_dir().join(key).join(v3_name) } else { self.item_dir().join(format!("{key}{v2_suffix}")) })
    }

    /// The item's text; an item without a text file is an empty document.
    pub fn text(&self, key: &str) -> AppResult<Doc> {
        match self.content(key) {
            Some(p) if p.extension().is_some_and(|x| x.eq_ignore_ascii_case("rtf")) => {
                Ok(rtf_to_doc(&read_optional(&p)?.unwrap_or_default()))
            }
            _ => Ok(Doc::default()),
        }
    }

    /// Synopsis and document notes as plain text (unreadable parts are skipped).
    pub fn notes(&self, key: &str) -> String {
        let synopsis = self
            .side_file(key, "synopsis.txt", "_synopsis.txt")
            .and_then(|p| read_optional(&p).ok().flatten())
            .map(|b| String::from_utf8_lossy(&b).trim().to_string())
            .unwrap_or_default();
        let notes = self
            .side_file(key, "notes.rtf", "_notes.rtf")
            .and_then(|p| read_optional(&p).ok().flatten())
            .map(|b| doc_text(&rtf_to_doc(&b)).trim().to_string())
            .unwrap_or_default();
        [synopsis, notes].into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>().join("\n\n")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    const BINDER: &str = r#"<ScrivenerProject><Binder><BinderItem UUID="A-1" Type="Text"><Title>Um</Title></BinderItem></Binder></ScrivenerProject>"#;

    #[test]
    fn opens_scrivener3_by_folder_or_scrivx() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("Meu Livro.scriv");
        fs::create_dir_all(dir.join("Files/Data/A-1")).unwrap();
        fs::write(dir.join("Meu Livro.scrivx"), BINDER).unwrap();
        fs::write(dir.join("Files/Data/A-1/content.rtf"), r"{\rtf1 Ol\'e1\par}").unwrap();
        fs::write(dir.join("Files/Data/A-1/synopsis.txt"), "Resumo").unwrap();
        fs::write(dir.join("Files/Data/A-1/notes.rtf"), r"{\rtf1 Nota\par}").unwrap();
        for p in [dir.clone(), dir.join("Meu Livro.scrivx")] {
            let project = Project::open(&p).unwrap();
            assert_eq!(project.title, "Meu Livro");
            assert_eq!(project.binder().unwrap()[0].title, "Um");
            assert_eq!(crate::text::words::doc_text(&project.text("A-1").unwrap()), "Olá");
            assert_eq!(project.notes("A-1"), "Resumo\n\nNota");
        }
    }

    #[test]
    fn opens_scrivener2_layout_and_media() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("Velho.scriv");
        fs::create_dir_all(dir.join("Files/Docs")).unwrap();
        fs::write(dir.join("project.scrivx"), BINDER).unwrap();
        fs::write(dir.join("Files/Docs/3.rtf"), r"{\rtf1 Tr\u234?s\par}").unwrap();
        fs::write(dir.join("Files/Docs/3_notes.rtf"), r"{\rtf1 N\par}").unwrap();
        fs::write(dir.join("Files/Docs/4.jpg"), b"jpg").unwrap();
        let project = Project::open(&dir).unwrap();
        assert_eq!(crate::text::words::doc_text(&project.text("3").unwrap()), "Três");
        assert_eq!(project.notes("3"), "N");
        assert_eq!(project.content("4").unwrap().file_name().unwrap(), "4.jpg");
        // Missing text = empty document, not an error.
        assert_eq!(project.text("99").unwrap(), crate::model::doc::Doc::default());
        assert!(project.content("../x").is_none());
    }

    #[test]
    fn folder_without_scrivx_is_invalid() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(Project::open(tmp.path()).unwrap_err().0, "Projeto do Scrivener inválido");
    }
}
