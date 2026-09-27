use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    pub theme: String,
    pub goal: u32,
    pub width: u8,
    pub font: u8,
}

impl Default for Prefs {
    fn default() -> Self {
        Self { theme: "light".into(), goal: 2000, width: 1, font: 1 }
    }
}

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PrefsPatch {
    pub theme: Option<String>,
    pub goal: Option<u32>,
    pub width: Option<u8>,
    pub font: Option<u8>,
}

impl Prefs {
    pub fn apply(mut self, p: PrefsPatch) -> Self {
        if let Some(v) = p.theme { self.theme = v; }
        if let Some(v) = p.goal { self.goal = v; }
        if let Some(v) = p.width { self.width = v.min(2); }
        if let Some(v) = p.font { self.font = v.min(2); }
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patch_merges_and_clamps() {
        let p = Prefs::default().apply(PrefsPatch { width: Some(9), goal: Some(5000), ..Default::default() });
        assert_eq!((p.width, p.goal, p.theme.as_str()), (2, 5000, "light"));
    }
}
