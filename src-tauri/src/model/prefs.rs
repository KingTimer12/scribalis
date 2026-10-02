use serde::{Deserialize, Serialize};

pub const TEXT_PX_MIN: u8 = 14;
pub const TEXT_PX_MAX: u8 = 32;
pub const UI_SCALE_MAX: u8 = 2;
/// Daily goal bounds; the Ajustes field accepts any value in between ("1.5k", "1600").
pub const GOAL_MIN: u32 = 10;
pub const GOAL_MAX: u32 = 100_000;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase", from = "StoredPrefs")]
pub struct Prefs {
    pub theme: String,
    pub goal: u32,
    pub width: u8,
    /// Legacy text size step (0 small, 1 medium, 2 large); only read to derive `text_px`.
    pub font: u8,
    /// Chapter text size in px, even, within TEXT_PX_MIN..=TEXT_PX_MAX.
    pub text_px: u8,
    /// Interface size: 0 normal, 1 large, 2 larger.
    pub ui_scale: u8,
    /// Books whose tree sidebar is collapsed (open is the default).
    pub sidebar_closed: Vec<String>,
    /// Books whose main pane shows the Quadro tab (Editor is the default).
    pub board_tab: Vec<String>,
    /// Board card size: 0 small, 1 medium, 2 large.
    pub card_size: u8,
}

/// The prefs file as stored: newer fields may be missing in files written by older versions.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredPrefs {
    theme: String,
    goal: u32,
    width: u8,
    #[serde(default = "medium")]
    font: u8,
    #[serde(default)]
    text_px: Option<u8>,
    #[serde(default)]
    ui_scale: u8,
    #[serde(default)]
    sidebar_closed: Vec<String>,
    #[serde(default)]
    board_tab: Vec<String>,
    #[serde(default = "medium")]
    card_size: u8,
}

impl From<StoredPrefs> for Prefs {
    fn from(s: StoredPrefs) -> Self {
        // Old files only have the 3-step `font`: map it to the px it used to render at.
        let text_px = s.text_px.unwrap_or(match s.font {
            0 => 18,
            1 => 20,
            _ => 22,
        });
        Self {
            theme: s.theme,
            goal: s.goal,
            width: s.width,
            font: s.font,
            text_px: clamp_text_px(text_px),
            ui_scale: s.ui_scale.min(UI_SCALE_MAX),
            sidebar_closed: s.sidebar_closed,
            board_tab: s.board_tab,
            card_size: s.card_size,
        }
    }
}

fn medium() -> u8 {
    1
}

/// Keeps the text size inside the range and on an even px (odd values round up).
fn clamp_text_px(v: u8) -> u8 {
    let v = v.clamp(TEXT_PX_MIN, TEXT_PX_MAX);
    v + v % 2
}

impl Default for Prefs {
    fn default() -> Self {
        Self {
            theme: "light".into(),
            goal: 2000,
            width: 1,
            font: 1,
            text_px: 20,
            ui_scale: 0,
            sidebar_closed: Vec::new(),
            board_tab: Vec::new(),
            card_size: 1,
        }
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
    pub text_px: Option<u8>,
    pub ui_scale: Option<u8>,
}

impl Prefs {
    pub fn apply(mut self, p: PrefsPatch) -> Self {
        if let Some(v) = p.theme { self.theme = v; }
        if let Some(v) = p.goal { self.goal = v.clamp(GOAL_MIN, GOAL_MAX); }
        if let Some(v) = p.width { self.width = v.min(2); }
        if let Some(v) = p.font { self.font = v.min(2); }
        if let Some(v) = p.sidebar_closed { self.sidebar_closed = v; }
        if let Some(v) = p.board_tab { self.board_tab = v; }
        if let Some(v) = p.card_size { self.card_size = v.min(2); }
        if let Some(v) = p.text_px { self.text_px = clamp_text_px(v); }
        if let Some(v) = p.ui_scale { self.ui_scale = v.min(UI_SCALE_MAX); }
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
    fn goal_takes_any_value_within_bounds() {
        let p = Prefs::default().apply(PrefsPatch { goal: Some(1650), ..Default::default() });
        assert_eq!(p.goal, 1650);
        let p = p.apply(PrefsPatch { goal: Some(0), ..Default::default() });
        assert_eq!(p.goal, GOAL_MIN);
        let p = p.apply(PrefsPatch { goal: Some(9_000_000), ..Default::default() });
        assert_eq!(p.goal, GOAL_MAX);
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

#[cfg(test)]
mod size_tests {
    use super::*;

    #[test]
    fn text_and_ui_size_defaults() {
        let p = Prefs::default();
        assert_eq!((p.text_px, p.ui_scale), (20, 0));
    }

    #[test]
    fn text_px_is_derived_from_old_font_when_absent() {
        for (font, px) in [(0, 18), (1, 20), (2, 22), (9, 22)] {
            let json = format!(r#"{{"theme":"dark","goal":2000,"width":1,"font":{font}}}"#);
            let p: Prefs = serde_json::from_str(&json).unwrap();
            assert_eq!((p.text_px, p.ui_scale), (px, 0), "font {font}");
        }
    }

    #[test]
    fn stored_sizes_are_clamped_and_rounded_on_load() {
        let p: Prefs = serde_json::from_str(r#"{"theme":"dark","goal":2000,"width":1,"font":0,"textPx":41,"uiScale":7}"#).unwrap();
        assert_eq!((p.text_px, p.ui_scale), (32, 2));
        let p: Prefs = serde_json::from_str(r#"{"theme":"dark","goal":2000,"width":1,"font":0,"textPx":23}"#).unwrap();
        assert_eq!(p.text_px, 24);
    }

    #[test]
    fn patch_clamps_text_px_to_even_range_and_ui_scale() {
        let p = Prefs::default().apply(PrefsPatch { text_px: Some(3), ui_scale: Some(9), ..Default::default() });
        assert_eq!((p.text_px, p.ui_scale), (14, 2));
        let p = p.apply(PrefsPatch { text_px: Some(250), ..Default::default() });
        assert_eq!(p.text_px, 32);
        let p = p.apply(PrefsPatch { text_px: Some(21), ui_scale: Some(1), ..Default::default() });
        assert_eq!((p.text_px, p.ui_scale), (22, 1));
    }

    #[test]
    fn sizes_serialize_in_camel_case() {
        let v = serde_json::to_value(Prefs::default().apply(PrefsPatch { text_px: Some(26), ui_scale: Some(1), ..Default::default() })).unwrap();
        assert_eq!((v["textPx"].clone(), v["uiScale"].clone()), (26.into(), 1.into()));
        let patch: PrefsPatch = serde_json::from_str(r#"{"textPx":16,"uiScale":2}"#).unwrap();
        assert_eq!((patch.text_px, patch.ui_scale), (Some(16), Some(2)));
    }
}
