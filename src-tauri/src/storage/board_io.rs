//! Disk I/O for the book's board: `quadro/quadro.json` and one `quadro/<id>.md` per card.
use std::{fs, io::ErrorKind, path::{Path, PathBuf}};

use super::{atomic::write_atomic, paths::{safe_join, BOARD_DIR, BOARD_FILE}};
use crate::error::AppResult;
use crate::model::board::Board;

fn text_path(book_dir: &Path, id: &str) -> AppResult<PathBuf> {
    safe_join(&book_dir.join(BOARD_DIR), &format!("{id}.md"))
}

/// The board; a book without `quadro/` has an empty one.
pub fn read_board(book_dir: &Path) -> AppResult<Board> {
    match fs::read_to_string(book_dir.join(BOARD_DIR).join(BOARD_FILE)) {
        Ok(s) => Ok(serde_json::from_str(&s)?),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(Board::default()),
        Err(e) => Err(e.into()),
    }
}

pub fn write_board(book_dir: &Path, board: &Board) -> AppResult<()> {
    let dir = book_dir.join(BOARD_DIR);
    fs::create_dir_all(&dir)?;
    write_atomic(&dir.join(BOARD_FILE), serde_json::to_string_pretty(board)?.as_bytes())?;
    Ok(())
}

/// A card's text; a missing file reads as empty.
pub fn read_card_text(book_dir: &Path, id: &str) -> AppResult<String> {
    match fs::read_to_string(text_path(book_dir, id)?) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.into()),
    }
}

pub fn write_card_text(book_dir: &Path, id: &str, text: &str) -> AppResult<()> {
    fs::create_dir_all(book_dir.join(BOARD_DIR))?;
    write_atomic(&text_path(book_dir, id)?, text.as_bytes())?;
    Ok(())
}

/// Removes a card's text file; one already gone is fine.
pub fn remove_card_text(book_dir: &Path, id: &str) -> AppResult<()> {
    match fs::remove_file(text_path(book_dir, id)?) {
        Err(e) if e.kind() != ErrorKind::NotFound => Err(e.into()),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::board::Card;

    #[test]
    fn missing_board_and_text_read_empty_and_writes_create_the_folder() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        assert!(read_board(dir).unwrap().cards.is_empty());
        assert_eq!(read_card_text(dir, "a").unwrap(), "");
        let mut b = Board::default();
        b.insert(0, Card { id: "a".into(), title: "Cap 1".into(), extra: Default::default() });
        write_board(dir, &b).unwrap();
        write_card_text(dir, "a", "Introduz o mundo").unwrap();
        assert_eq!(read_board(dir).unwrap(), b);
        assert_eq!(read_card_text(dir, "a").unwrap(), "Introduz o mundo");
        assert!(dir.join("quadro/a.md").is_file());
        remove_card_text(dir, "a").unwrap();
        remove_card_text(dir, "a").unwrap(); // already gone: fine
        assert!(!dir.join("quadro/a.md").exists());
        assert!(read_card_text(dir, "../x").is_err());
    }
}
