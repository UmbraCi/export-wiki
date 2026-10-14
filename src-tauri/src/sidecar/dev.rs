use std::path::{Path, PathBuf};
use std::time::SystemTime;

pub fn source_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../sidecar")
}

pub fn program() -> PathBuf {
    source_dir().join(if cfg!(windows) {
        ".venv/Scripts/python.exe"
    } else {
        ".venv/bin/python"
    })
}

pub type SourceStamp = Vec<(PathBuf, SystemTime, u64)>;

pub fn source_stamp(dir: &Path) -> std::io::Result<SourceStamp> {
    let mut stamp = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let kind = entry.file_type()?;
        if kind.is_dir() && entry.file_name() != "__pycache__" {
            stamp.extend(source_stamp(&path)?);
        } else if kind.is_file() && path.extension().is_some_and(|ext| ext == "py") {
            let metadata = entry.metadata()?;
            stamp.push((path, metadata.modified()?, metadata.len()));
        }
    }
    stamp.sort();
    Ok(stamp)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_python_changes_additions_and_deletions_but_ignores_cache() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("main.py");
        std::fs::write(&file, "pass").unwrap();
        let original = source_stamp(dir.path()).unwrap();
        std::fs::create_dir(dir.path().join("__pycache__")).unwrap();
        std::fs::write(dir.path().join("__pycache__/cache.py"), "ignored").unwrap();
        std::fs::write(dir.path().join("notes.txt"), "ignored").unwrap();
        assert_eq!(original, source_stamp(dir.path()).unwrap());
        std::fs::write(&file, "print('changed')").unwrap();
        let edited = source_stamp(dir.path()).unwrap();
        assert_ne!(original, edited);
        let added = dir.path().join("new.py");
        std::fs::write(&added, "pass").unwrap();
        assert_ne!(edited, source_stamp(dir.path()).unwrap());
        std::fs::remove_file(added).unwrap();
        assert_eq!(edited, source_stamp(dir.path()).unwrap());
        std::fs::remove_file(file).unwrap();
        assert!(source_stamp(dir.path()).unwrap().is_empty());
    }
}
