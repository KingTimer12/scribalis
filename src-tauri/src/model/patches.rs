use serde::Deserialize;

use super::metadata::Status;

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct BookPatch {
    pub title: Option<String>,
    pub author: Option<String>,
    /// Id of the node just opened.
    pub open: Option<String>,
    pub separator_text: Option<String>,
}

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChapterPatch {
    pub title: Option<String>,
    pub notes: Option<String>,
    pub status: Option<Status>,
}

#[derive(Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ImageSlot {
    Cover,
    Header,
    Footer,
    Separator,
}
