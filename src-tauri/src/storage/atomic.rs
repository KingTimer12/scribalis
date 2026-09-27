use std::{fs, io, path::Path};

/// Writes `path.tmp` then renames it over `path`, so a crash never leaves half a file.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".tmp");
    let tmp = path.with_file_name(name);
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_existing_file_and_leaves_no_tmp() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("a.json");
        write_atomic(&f, b"1").unwrap();
        write_atomic(&f, b"2").unwrap();
        assert_eq!(fs::read_to_string(&f).unwrap(), "2");
        assert!(!dir.path().join("a.json.tmp").exists());
    }
}
