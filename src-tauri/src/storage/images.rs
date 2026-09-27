use std::{fs, io::ErrorKind, path::Path};

use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, ImageReader};

use super::{atomic::write_atomic, paths::{safe_join, IMAGES_DIR}};
use crate::error::{AppError, AppResult};

pub const ALLOWED_EXTENSIONS: [&str; 4] = ["png", "jpg", "jpeg", "webp"];
const COVER_W: u32 = 400;
const COVER_H: u32 = 600;
const COVER_QUALITY: u8 = 85;

fn unreadable() -> AppError {
    AppError::msg("Não foi possível ler a imagem")
}

/// Crops `src` to 400×600 (cover fit) and saves it as `imagens/capa.jpg`.
pub fn import_cover(src: &Path, book_dir: &Path) -> AppResult<String> {
    let img = ImageReader::open(src)?.with_guessed_format()?.decode().map_err(|_| unreadable())?;
    let fitted = img.resize_to_fill(COVER_W, COVER_H, FilterType::Lanczos3).to_rgb8();
    let mut buf = Vec::new();
    JpegEncoder::new_with_quality(&mut buf, COVER_QUALITY)
        .encode_image(&fitted)
        .map_err(|_| AppError::msg("Não foi possível salvar a capa"))?;
    let rel = format!("{IMAGES_DIR}/capa.jpg");
    fs::create_dir_all(book_dir.join(IMAGES_DIR))?;
    write_atomic(&book_dir.join(&rel), &buf)?;
    Ok(rel)
}

/// Copies `src` unchanged to `imagens/<stem>.<ext>` after checking it decodes.
pub fn import_as(src: &Path, book_dir: &Path, stem: &str) -> AppResult<String> {
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| ALLOWED_EXTENSIONS.contains(&e.as_str()))
        .ok_or_else(|| AppError::msg("Escolha um arquivo de imagem"))?;
    ImageReader::open(src)?.with_guessed_format()?.into_dimensions().map_err(|_| unreadable())?;
    let rel = format!("{IMAGES_DIR}/{stem}.{ext}");
    fs::create_dir_all(book_dir.join(IMAGES_DIR))?;
    fs::copy(src, book_dir.join(&rel))?;
    Ok(rel)
}

/// Deletes an image referenced by metadata; a missing file is fine.
pub fn remove_image(book_dir: &Path, rel: &str) -> AppResult<()> {
    match fs::remove_file(safe_join(book_dir, rel)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png(dir: &Path, w: u32, h: u32) -> std::path::PathBuf {
        let path = dir.join("in.png");
        image::RgbImage::from_pixel(w, h, image::Rgb([200, 10, 10])).save(&path).unwrap();
        path
    }

    #[test]
    fn cover_is_400x600_jpeg() {
        let tmp = tempfile::tempdir().unwrap();
        let src = png(tmp.path(), 1000, 300);
        let rel = import_cover(&src, tmp.path()).unwrap();
        assert_eq!(rel, "imagens/capa.jpg");
        let out = image::open(tmp.path().join(&rel)).unwrap();
        assert_eq!((out.width(), out.height()), (400, 600));
    }

    #[test]
    fn import_as_keeps_extension() {
        let tmp = tempfile::tempdir().unwrap();
        let src = png(tmp.path(), 10, 10);
        assert_eq!(import_as(&src, tmp.path(), "cabecalho").unwrap(), "imagens/cabecalho.png");
    }

    #[test]
    fn rejects_non_image() {
        let tmp = tempfile::tempdir().unwrap();
        let txt = tmp.path().join("a.txt");
        fs::write(&txt, "x").unwrap();
        assert!(import_as(&txt, tmp.path(), "x").is_err());
        let fake = tmp.path().join("b.png");
        fs::write(&fake, "not an image").unwrap();
        assert!(import_cover(&fake, tmp.path()).is_err());
    }

    #[test]
    fn remove_missing_is_ok() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(remove_image(tmp.path(), "imagens/nada.png").is_ok());
    }
}
