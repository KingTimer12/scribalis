use std::{fs, io::{self, Write}, path::Path};

/// Writes `path.tmp`, flushes it to disk, then renames it over `path`,
/// so neither a crash nor a power loss leaves half a file.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".tmp");
    let tmp = path.with_file_name(name);
    let mut file = fs::File::create(&tmp)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
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
