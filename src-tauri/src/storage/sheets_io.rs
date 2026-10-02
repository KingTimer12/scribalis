//! Disk I/O for the sheets file (`fichas.json` in the book folder).
use std::{fs, io::ErrorKind, path::Path};

use super::{atomic::write_atomic, paths::SHEETS_FILE};
use crate::error::AppResult;
use crate::model::sheets::Sheets;

/// The book's sheets; a book without the file starts with the starter templates and no sheets.
pub fn read_sheets(book_dir: &Path) -> AppResult<Sheets> {
    match fs::read_to_string(book_dir.join(SHEETS_FILE)) {
        Ok(s) => Ok(serde_json::from_str(&s)?),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(Sheets::default()),
        Err(e) => Err(e.into()),
    }
}

pub fn write_sheets(book_dir: &Path, sheets: &Sheets) -> AppResult<()> {
    write_atomic(&book_dir.join(SHEETS_FILE), serde_json::to_string_pretty(sheets)?.as_bytes())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_file_reads_as_the_starter_templates_and_saves_back() {
        let dir = tempfile::tempdir().unwrap();
        let mut sheets = read_sheets(dir.path()).unwrap();
        assert!(sheets.sheets.is_empty());
        assert!(!sheets.templates.character.is_empty());
        sheets.templates.place.clear();
        write_sheets(dir.path(), &sheets).unwrap();
        assert_eq!(read_sheets(dir.path()).unwrap(), sheets);
    }
}
