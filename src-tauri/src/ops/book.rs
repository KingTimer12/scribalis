use std::path::Path;

use crate::error::AppResult;
use crate::ids::{new_id, now_ms};
use crate::model::{metadata::{Metadata, Separator}, patches::{BookPatch, ImageSlot}, workspace::find};
use crate::storage::{images::{import_as, import_cover, remove_image}, metadata_io::write_metadata, workspace_io::read_workspace};

/// Deletes an image the metadata no longer references. The change is already
/// saved, so a failure here (e.g. a locked file) only leaves an orphan behind.
fn discard_image(dir: &Path, rel: &str) {
    if let Err(e) = remove_image(dir, rel) {
        eprintln!("could not remove old image {rel}: {e}");
    }
}

/// Applies a patch. Only an `open` change leaves `updated_at` alone.
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
    // An id that is not in the tree is ignored: a stale or bogus id must never be persisted.
    if let Some(open) = patch.open {
        if read_workspace(dir).is_ok_and(|ws| find(&ws.items, &open).is_some()) {
            meta.open = Some(open);
        }
    }
    if touched {
        meta.updated_at = now_ms();
    }
    write_metadata(dir, meta)?;
    // Only delete old image after metadata is persisted
    if let Some(old) = old_separator_image {
        discard_image(dir, &old);
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
        discard_image(dir, &old);
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
        discard_image(dir, &old);
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
    fn open_is_saved_and_not_a_touch() {
        let root = tempfile::tempdir().unwrap();
        let (dir, mut meta) = create_book(root.path(), "Obra").unwrap();
        meta.updated_at = 5;
        let id = crate::model::manuscript::chapters(&read_workspace(&dir).unwrap().items)[0].id.clone();
        update(&dir, &mut meta, BookPatch { open: Some(id.clone()), ..Default::default() }).unwrap();
        assert_eq!((meta.open.as_deref(), meta.updated_at), (Some(id.as_str()), 5));
        assert_eq!(crate::storage::metadata_io::read_metadata(&dir).unwrap().open.as_deref(), Some(id.as_str()));
    }

    #[test]
    fn open_ignores_ids_that_are_not_in_the_tree() {
        let root = tempfile::tempdir().unwrap();
        let (dir, mut meta) = create_book(root.path(), "Obra").unwrap();
        let before = meta.open.clone();
        update(&dir, &mut meta, BookPatch { open: Some("ghost".into()), ..Default::default() }).unwrap();
        assert_eq!(meta.open, before);
        assert_eq!(crate::storage::metadata_io::read_metadata(&dir).unwrap().open, before);
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
        meta.updated_at = 5;
        update(&dir, &mut meta, BookPatch {
            title: Some("Novo Título".into()),
            author: Some("Autor".into()),
            ..Default::default()
        }).unwrap();
        let reread = crate::storage::metadata_io::read_metadata(&dir).unwrap();
        assert_eq!(reread.title, "Novo Título");
        assert_eq!(reread.author, "Autor");
        assert!(reread.updated_at > 5);
    }
}
