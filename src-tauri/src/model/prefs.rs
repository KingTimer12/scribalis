use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    pub theme: String,
    pub goal: u32,
    pub width: u8,
    pub font: u8,
    /// Books whose tree sidebar is collapsed (open is the default).
    #[serde(default)]
    pub sidebar_closed: Vec<String>,
    /// Books whose main pane shows the Quadro tab (Editor is the default).
    #[serde(default)]
    pub board_tab: Vec<String>,
    /// Board card size: 0 small, 1 medium, 2 large.
    #[serde(default = "medium")]
    pub card_size: u8,
}

fn medium() -> u8 {
    1
}

impl Default for Prefs {
    fn default() -> Self {
        Self { theme: "light".into(), goal: 2000, width: 1, font: 1, sidebar_closed: Vec::new(), board_tab: Vec::new(), card_size: 1 }
    }
}

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PrefsPatch {
    pub theme: Option<String>,
    pub goal: Option<u32>,
    pub width: Option<u8>,
    pub font: Option<u8>,
    pub sidebar_closed: Option<Vec<String>>,
    pub board_tab: Option<Vec<String>>,
    pub card_size: Option<u8>,
}

impl Prefs {
    pub fn apply(mut self, p: PrefsPatch) -> Self {
        if let Some(v) = p.theme { self.theme = v; }
        if let Some(v) = p.goal { self.goal = v; }
        if let Some(v) = p.width { self.width = v.min(2); }
        if let Some(v) = p.font { self.font = v.min(2); }
        if let Some(v) = p.sidebar_closed { self.sidebar_closed = v; }
        if let Some(v) = p.board_tab { self.board_tab = v; }
        if let Some(v) = p.card_size { self.card_size = v.min(2); }
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn closed_sidebars_are_replaced_and_default_to_none() {
        let p: Prefs = serde_json::from_str(r#"{"theme":"dark","goal":2000,"width":1,"font":1}"#).unwrap();
        assert!(p.sidebar_closed.is_empty());
        let p = p.apply(PrefsPatch { sidebar_closed: Some(vec!["b1".into()]), ..Default::default() });
        assert_eq!(p.sidebar_closed, vec!["b1".to_string()]);
        assert_eq!(serde_json::to_value(&p).unwrap()["sidebarClosed"][0], "b1");
    }

    #[test]
    fn patch_merges_and_clamps() {
        let p = Prefs::default().apply(PrefsPatch { width: Some(9), goal: Some(5000), ..Default::default() });
        assert_eq!((p.width, p.goal, p.theme.as_str()), (2, 5000, "light"));
    }

    #[test]
    fn board_tab_and_card_size_default_and_clamp() {
        let p: Prefs = serde_json::from_str(r#"{"theme":"dark","goal":2000,"width":1,"font":1}"#).unwrap();
        assert!(p.board_tab.is_empty());
        assert_eq!(p.card_size, 1);
        let p = p.apply(PrefsPatch { board_tab: Some(vec!["b1".into()]), card_size: Some(7), ..Default::default() });
        assert_eq!((p.board_tab.clone(), p.card_size), (vec!["b1".to_string()], 2));
        let v = serde_json::to_value(&p).unwrap();
        assert_eq!((v["boardTab"][0].clone(), v["cardSize"].clone()), ("b1".into(), 2.into()));
    }
}
