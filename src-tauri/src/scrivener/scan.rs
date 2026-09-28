//! What the import screen shows: the binder without the trash.
use serde::Serialize;

use super::{binder::{BinderItem, ItemKind}, project::Project};
use crate::error::AppResult;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanItem {
    pub key: String,
    pub kind: String,
    pub title: String,
    pub children: Vec<ScanItem>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanView {
    pub title: String,
    pub items: Vec<ScanItem>,
}

fn kind_name(k: &ItemKind) -> &'static str {
    match k {
        ItemKind::Draft => "draft",
        ItemKind::Research => "research",
        ItemKind::Folder | ItemKind::Trash => "folder",
        ItemKind::Text => "text",
        ItemKind::Image => "image",
        ItemKind::File => "file",
    }
}

fn to_scan(items: &[BinderItem]) -> Vec<ScanItem> {
    items
        .iter()
        .filter(|i| i.kind != ItemKind::Trash)
        .map(|i| ScanItem {
            key: i.key.clone(),
            kind: kind_name(&i.kind).to_string(),
            title: if i.title.trim().is_empty() { "Sem título".to_string() } else { i.title.trim().to_string() },
            children: to_scan(&i.children),
        })
        .collect()
}

pub fn scan(project: &Project) -> AppResult<ScanView> {
    Ok(ScanView { title: project.title.clone(), items: to_scan(&project.binder()?) })
}
