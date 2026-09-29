//! Operations on the book's board: cards with a title (in `quadro.json`) and a text file each.
use std::path::Path;

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::ids::new_id;
use crate::model::board::{cut, Board, Card, TEXT_MAX, TITLE_MAX};
use crate::storage::board_io::{read_board, read_card_text, remove_card_text, write_board, write_card_text};

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Created {
    pub id: String,
    pub cards: Vec<Card>,
}

fn not_found() -> AppError {
    AppError::msg("Cartão não encontrado")
}

fn new_card(title: &str) -> Card {
    Card { id: new_id(), title: cut(title, TITLE_MAX), extra: Default::default() }
}

/// Loads the board, applies `f`, saves it and returns the cards.
fn edit(dir: &Path, f: impl FnOnce(&mut Board) -> AppResult<()>) -> AppResult<Vec<Card>> {
    let mut board = read_board(dir)?;
    f(&mut board)?;
    write_board(dir, &board)?;
    Ok(board.cards)
}

fn known(dir: &Path, id: &str) -> AppResult<()> {
    read_board(dir)?.position(id).map(|_| ()).ok_or_else(not_found)
}

pub fn list(dir: &Path) -> AppResult<Vec<Card>> {
    Ok(read_board(dir)?.cards)
}

/// New empty card at `index` (clamped to the end).
pub fn create(dir: &Path, index: usize, title: &str) -> AppResult<Created> {
    let card = new_card(title);
    let id = card.id.clone();
    let cards = edit(dir, |b| {
        b.insert(index, card);
        Ok(())
    })?;
    Ok(Created { id, cards })
}

pub fn rename(dir: &Path, id: &str, title: &str) -> AppResult<Vec<Card>> {
    edit(dir, |b| {
        let i = b.position(id).ok_or_else(not_found)?;
        b.cards[i].title = cut(title, TITLE_MAX);
        Ok(())
    })
}

pub fn load_text(dir: &Path, id: &str) -> AppResult<String> {
    known(dir, id)?;
    read_card_text(dir, id)
}

pub fn save_text(dir: &Path, id: &str, text: &str) -> AppResult<()> {
    known(dir, id)?;
    write_card_text(dir, id, &cut(text, TEXT_MAX))
}

pub fn move_to(dir: &Path, id: &str, index: usize) -> AppResult<Vec<Card>> {
    edit(dir, |b| if b.move_to(id, index) { Ok(()) } else { Err(not_found()) })
}

/// Removes the card from the board, then its text file (the board is already saved).
pub fn delete(dir: &Path, id: &str) -> AppResult<Vec<Card>> {
    let cards = edit(dir, |b| b.remove(id).map(|_| ()).ok_or_else(not_found))?;
    if let Err(e) = remove_card_text(dir, id) {
        eprintln!("could not remove card text {id}: {e}");
    }
    Ok(cards)
}

/// A copy of the card (title + " (cópia)", same text) right after it.
pub fn duplicate(dir: &Path, id: &str) -> AppResult<Created> {
    let board = read_board(dir)?;
    let i = board.position(id).ok_or_else(not_found)?;
    let copy = new_card(&format!("{} (cópia)", board.cards[i].title));
    write_card_text(dir, &copy.id, &read_card_text(dir, id)?)?;
    let new = copy.id.clone();
    let cards = edit(dir, |b| {
        b.insert(i + 1, copy);
        Ok(())
    })?;
    Ok(Created { id: new, cards })
}

/// Cards (title, text) added at the end, in order; returns how many.
pub fn append(dir: &Path, notes: Vec<(String, String)>) -> AppResult<usize> {
    if notes.is_empty() {
        return Ok(0);
    }
    let count = notes.len();
    let mut cards = Vec::with_capacity(count);
    for (title, text) in notes {
        let card = new_card(&title);
        write_card_text(dir, &card.id, &cut(&text, TEXT_MAX))?;
        cards.push(card);
    }
    edit(dir, |b| {
        b.cards.extend(cards);
        Ok(())
    })?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ops::library::create_book;

    fn book() -> (tempfile::TempDir, std::path::PathBuf) {
        let root = tempfile::tempdir().unwrap();
        let (dir, _meta) = create_book(root.path(), "Obra").unwrap();
        (root, dir)
    }
    fn titles(cards: &[Card]) -> Vec<&str> {
        cards.iter().map(|c| c.title.as_str()).collect()
    }

    #[test]
    fn create_rename_move_and_text() {
        let (_r, dir) = book();
        assert!(list(&dir).unwrap().is_empty());
        let a = create(&dir, 0, "Capítulo 1").unwrap();
        let b = create(&dir, 99, "Capítulo 2").unwrap();
        assert_eq!(titles(&b.cards), vec!["Capítulo 1", "Capítulo 2"]);
        save_text(&dir, &a.id, "O capítulo introduz o mundo venante").unwrap();
        assert_eq!(load_text(&dir, &a.id).unwrap(), "O capítulo introduz o mundo venante");
        assert_eq!(load_text(&dir, &b.id).unwrap(), "");
        assert_eq!(titles(&rename(&dir, &b.id, "Dois").unwrap()), vec!["Capítulo 1", "Dois"]);
        assert_eq!(titles(&move_to(&dir, &a.id, 1).unwrap()), vec!["Dois", "Capítulo 1"]);
        assert_eq!(rename(&dir, "zz", "x").unwrap_err().0, "Cartão não encontrado");
        assert_eq!(save_text(&dir, "zz", "x").unwrap_err().0, "Cartão não encontrado");
    }

    #[test]
    fn delete_removes_json_entry_then_file() {
        let (_r, dir) = book();
        let a = create(&dir, 0, "A").unwrap().id;
        save_text(&dir, &a, "texto").unwrap();
        assert!(delete(&dir, &a).unwrap().is_empty());
        assert!(!dir.join("quadro").join(format!("{a}.md")).exists());
        assert_eq!(delete(&dir, &a).unwrap_err().0, "Cartão não encontrado");
    }

    #[test]
    fn duplicate_copies_text_right_after() {
        let (_r, dir) = book();
        let a = create(&dir, 0, "A").unwrap().id;
        create(&dir, 1, "B").unwrap();
        save_text(&dir, &a, "texto").unwrap();
        let d = duplicate(&dir, &a).unwrap();
        assert_eq!(titles(&d.cards), vec!["A", "A (cópia)", "B"]);
        assert_eq!(load_text(&dir, &d.id).unwrap(), "texto");
    }

    #[test]
    fn limits_cut_by_character() {
        let (_r, dir) = book();
        let a = create(&dir, 0, &"é".repeat(TITLE_MAX + 3)).unwrap();
        assert_eq!(a.cards[0].title.chars().count(), TITLE_MAX);
        save_text(&dir, &a.id, &"€".repeat(TEXT_MAX + 3)).unwrap();
        assert_eq!(load_text(&dir, &a.id).unwrap().chars().count(), TEXT_MAX);
    }

    #[test]
    fn append_adds_cards_at_the_end() {
        let (_r, dir) = book();
        create(&dir, 0, "Antigo").unwrap();
        assert_eq!(append(&dir, vec![("Cap 1".into(), "Resumo".into())]).unwrap(), 1);
        let cards = list(&dir).unwrap();
        assert_eq!(titles(&cards), vec!["Antigo", "Cap 1"]);
        assert_eq!(load_text(&dir, &cards[1].id).unwrap(), "Resumo");
        assert_eq!(append(&dir, vec![]).unwrap(), 0);
    }
}
