use std::path::Path;

use crate::error::AppResult;
use crate::ids::{new_id, now_ms};
use crate::model::{metadata::{Metadata, Separator}, patches::{BookPatch, ImageSlot}};
use crate::storage::{images::{import_as, import_cover, remove_image}, metadata_io::write_metadata};

/// Applies a patch. Only a `cur` change leaves `updated_at` alone.
pub fn update(dir: &Path, meta: &mut Metadata, patch: BookPatch) -> AppResult<()> {
    let mut touched = false;
    let mut old_separator_image = None;
    if let Some(title) = patch.title {
        meta.title = title;
        touched = true;
    }
    if let Some(author) = patch.author {
        meta.author = author;
        touched = true;
    }
    if let Some(text) = patch.separator_text {
        if let Separator::Image { image } = &meta.separator {
            old_separator_image = Some(image.clone());
        }
        meta.separator = Separator::Text { text };
        touched = true;
    }
    if let Some(cur) = patch.cur {
        meta.cur = cur.min(meta.chapters.len().saturating_sub(1));
    }
    if touched {
        meta.updated_at = now_ms();
    }
    write_metadata(dir, meta)?;
    // Only delete old image after metadata is persisted
    if let Some(old) = old_separator_image {
        remove_image(dir, &old)?;
    }
    Ok(())
}

fn current(meta: &Metadata, slot: ImageSlot) -> Option<String> {
    match slot {
        ImageSlot::Cover => meta.cover.clone(),
        ImageSlot::Header => meta.header.clone(),
        ImageSlot::Footer => meta.footer.clone(),
        ImageSlot::Separator => match &meta.separator {
            Separator::Image { image } => Some(image.clone()),
            Separator::Text { .. } => None,
        },
    }
}

fn assign(meta: &mut Metadata, slot: ImageSlot, rel: Option<String>) {
    match slot {
        ImageSlot::Cover => meta.cover = rel,
        ImageSlot::Header => meta.header = rel,
        ImageSlot::Footer => meta.footer = rel,
        ImageSlot::Separator => {
            meta.separator = match rel {
                Some(image) => Separator::Image { image },
                None => Separator::default(),
            }
        }
    }
}

/// Imports `src` into the slot, replacing (and deleting) the previous file.
pub fn set_image(dir: &Path, meta: &mut Metadata, slot: ImageSlot, src: &Path) -> AppResult<()> {
    let old = current(meta, slot);
    // Import the new file first (before modifying metadata)
    let rel = match slot {
        ImageSlot::Cover => import_cover(src, dir)?,
        ImageSlot::Header => import_as(src, dir, "cabecalho")?,
        ImageSlot::Footer => import_as(src, dir, "rodape")?,
        ImageSlot::Separator => import_as(src, dir, "separador")?,
    };
    let rel_copy = rel.clone();
    assign(meta, slot, Some(rel));
    meta.updated_at = now_ms();
    write_metadata(dir, meta)?;
    // Only delete old image after metadata is persisted
    if let Some(old) = old.filter(|o| *o != rel_copy) {
        remove_image(dir, &old)?;
    }
    Ok(())
}

pub fn clear_image(dir: &Path, meta: &mut Metadata, slot: ImageSlot) -> AppResult<()> {
    let old = current(meta, slot);
    assign(meta, slot, None);
    meta.updated_at = now_ms();
    write_metadata(dir, meta)?;
    // Only delete old image after metadata is persisted
    if let Some(old) = old {
        remove_image(dir, &old)?;
    }
    Ok(())
}

/// Copies an image to be referenced from a chapter; returns its relative path.
pub fn insert_image(dir: &Path, src: &Path) -> AppResult<String> {
    import_as(src, dir, &new_id())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ops::library::create_book;

    fn png(dir: &Path) -> std::path::PathBuf {
        let p = dir.join("src.png");
        image::RgbImage::from_pixel(20, 20, image::Rgb([1, 2, 3])).save(&p).unwrap();
        p
    }

    #[test]
    fn separator_switches_between_image_and_text() {
        let root = tempfile::tempdir().unwrap();
        let (dir, mut meta) = create_book(root.path(), "Obra").unwrap();
        let src = png(root.path());
        set_image(&dir, &mut meta, ImageSlot::Separator, &src).unwrap();
        assert_eq!(meta.separator, Separator::Image { image: "imagens/separador.png".into() });
        update(&dir, &mut meta, BookPatch { separator_text: Some("~".into()), ..Default::default() }).unwrap();
        assert_eq!(meta.separator, Separator::Text { text: "~".into() });
        assert!(!dir.join("imagens/separador.png").exists());
    }

    #[test]
    fn clear_header_deletes_file() {
        let root = tempfile::tempdir().unwrap();
        let (dir, mut meta) = create_book(root.path(), "Obra").unwrap();
        set_image(&dir, &mut meta, ImageSlot::Header, &png(root.path())).unwrap();
        assert!(dir.join("imagens/cabecalho.png").exists());
        clear_image(&dir, &mut meta, ImageSlot::Header).unwrap();
        assert_eq!(meta.header, None);
        assert!(!dir.join("imagens/cabecalho.png").exists());
    }

    #[test]
    fn cur_is_clamped_and_not_a_touch() {
        let root = tempfile::tempdir().unwrap();
        let (dir, mut meta) = create_book(root.path(), "Obra").unwrap();
        meta.updated_at = 5;
        update(&dir, &mut meta, BookPatch { cur: Some(9), ..Default::default() }).unwrap();
        assert_eq!((meta.cur, meta.updated_at), (0, 5));
    }

    #[test]
    fn insert_image_returns_path_and_file_exists() {
        let root = tempfile::tempdir().unwrap();
        let (dir, _meta) = create_book(root.path(), "Obra").unwrap();
        let src = png(root.path());
        let rel = insert_image(&dir, &src).unwrap();
        assert!(rel.starts_with("imagens/"));
        assert!(rel.ends_with(".png"));
        assert!(dir.join(&rel).exists());
    }

    #[test]
    fn update_persists_title_and_author() {
        let root = tempfile::tempdir().unwrap();
        let (dir, mut meta) = create_book(root.path(), "Obra").unwrap();
        update(&dir, &mut meta, BookPatch {
            title: Some("Novo Título".into()),
            author: Some("Autor".into()),
            ..Default::default()
        }).unwrap();
        let reread = crate::storage::metadata_io::read_metadata(&dir).unwrap();
        assert_eq!(reread.title, "Novo Título");
        assert_eq!(reread.author, "Autor");
        assert!(reread.updated_at > 0);
    }
}
