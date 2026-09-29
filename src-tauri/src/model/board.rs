//! The book's board (`quadro/quadro.json`): free index cards in order. Each card's text lives
//! in its own file (`quadro/<id>.md`), handled by `storage::board_io`.
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

pub const BOARD_VERSION: u32 = 1;
/// Longest card title and text, in characters.
pub const TITLE_MAX: usize = 200;
pub const TEXT_MAX: usize = 20_000;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Board {
    pub version: u32,
    #[serde(default)]
    pub cards: Vec<Card>,
    /// Unknown keys survive a read/write cycle.
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for Board {
    fn default() -> Self {
        Self { version: BOARD_VERSION, cards: Vec::new(), extra: Map::new() }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Card {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// `s` cut to `max` characters (never inside one).
pub fn cut(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

impl Board {
    pub fn position(&self, id: &str) -> Option<usize> {
        self.cards.iter().position(|c| c.id == id)
    }

    /// Inserts at `index`, clamped to the end.
    pub fn insert(&mut self, index: usize, card: Card) {
        let at = index.min(self.cards.len());
        self.cards.insert(at, card);
    }

    pub fn remove(&mut self, id: &str) -> Option<Card> {
        self.position(id).map(|i| self.cards.remove(i))
    }

    /// Moves `id` to `index` (position after taking it out); false when `id` is unknown.
    pub fn move_to(&mut self, id: &str, index: usize) -> bool {
        match self.remove(id) {
            Some(card) => {
                self.insert(index, card);
                true
            }
            None => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card(id: &str) -> Card {
        Card { id: id.into(), title: id.to_uppercase(), extra: Map::new() }
    }
    fn ids(b: &Board) -> Vec<&str> {
        b.cards.iter().map(|c| c.id.as_str()).collect()
    }

    #[test]
    fn unknown_fields_survive() {
        let b: Board = serde_json::from_str(r#"{"version":1,"futuro":1,"cards":[{"id":"a","title":"A","cor":"azul"}]}"#).unwrap();
        let v = serde_json::to_value(&b).unwrap();
        assert_eq!((v["futuro"].clone(), v["cards"][0]["cor"].clone()), (1.into(), "azul".into()));
    }

    #[test]
    fn insert_move_remove_keep_order() {
        let mut b = Board::default();
        b.insert(0, card("a"));
        b.insert(99, card("c"));
        b.insert(1, card("b"));
        assert_eq!(ids(&b), vec!["a", "b", "c"]);
        assert!(b.move_to("a", 2));
        assert_eq!(ids(&b), vec!["b", "c", "a"]);
        assert!(!b.move_to("zz", 0));
        assert_eq!(b.remove("c").unwrap().id, "c");
        assert_eq!((ids(&b), b.position("a")), (vec!["b", "a"], Some(1)));
    }

    #[test]
    fn cut_counts_characters() {
        assert_eq!(cut("éé€x", 3), "éé€");
        assert_eq!(cut("ab", 5), "ab");
    }
}
