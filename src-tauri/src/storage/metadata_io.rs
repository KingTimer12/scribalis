use std::{fs, path::Path};

use super::{atomic::write_atomic, paths::META_FILE};
use crate::error::AppResult;
use crate::model::metadata::Metadata;

pub fn read_metadata(dir: &Path) -> AppResult<Metadata> {
    let raw = fs::read_to_string(dir.join(META_FILE))?;
    Ok(serde_json::from_str(&raw)?)
}

pub fn write_metadata(dir: &Path, meta: &Metadata) -> AppResult<()> {
    let json = serde_json::to_vec_pretty(meta)?;
    write_atomic(&dir.join(META_FILE), &json)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_then_read() {
        let dir = tempfile::tempdir().unwrap();
        let meta = Metadata::new("id1".into(), "Obra", vec![]);
        write_metadata(dir.path(), &meta).unwrap();
        assert_eq!(read_metadata(dir.path()).unwrap(), meta);
    }
}
