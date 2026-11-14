//! Local music folders for the Booth (r22-apps-plan.md §4 `tdj-folder`).
//!
//! WebKit has no `showDirectoryPicker`, so the app picks the folder natively, remembers it, lists the audio files
//! and hands their bytes to the page (`decodeAudioData`). In the Mac App Store sandbox a folder stays readable
//! across launches only through a **security-scoped bookmark**; the bookmark bytes are stored next to the path
//! (see `platform::bookmark`), resolved on launch and the access is started before reading.

use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};

pub const AUDIO_EXT: [&str; 9] = [
    "mp3", "m4a", "aac", "flac", "wav", "aif", "aiff", "ogg", "opus",
];
const MAX_FILES: usize = 20_000;
const MAX_DEPTH: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub path: String,
    /// Security-scoped bookmark (macOS) or document bookmark (iPadOS), base64. `None` off Apple platforms.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bookmark: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AudioFile {
    /// Path relative to the folder, `/`-separated (what the page matches by title/orchestra/year).
    pub rel: String,
    pub size: u64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Store {
    pub folders: Vec<Folder>,
}

impl Store {
    pub fn load(dir: &Path) -> Store {
        std::fs::read_to_string(dir.join("folders.json"))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }
    pub fn save(&self, dir: &Path) -> std::io::Result<()> {
        std::fs::create_dir_all(dir)?;
        std::fs::write(
            dir.join("folders.json"),
            serde_json::to_vec_pretty(self).expect("serialise"),
        )
    }
    pub fn add(&mut self, path: &Path, bookmark: Option<String>) -> Folder {
        let p = path.to_string_lossy().to_string();
        if let Some(existing) = self.folders.iter_mut().find(|f| f.path == p) {
            existing.bookmark = bookmark.or(existing.bookmark.take());
            return existing.clone();
        }
        let f = Folder {
            id: format!(
                "f{}",
                self.folders.len() + 1 + (now_ms() % 1_000_000) as usize
            ),
            name: path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| p.clone()),
            path: p,
            bookmark,
        };
        self.folders.push(f.clone());
        f
    }
    pub fn remove(&mut self, id: &str) -> bool {
        let n = self.folders.len();
        self.folders.retain(|f| f.id != id);
        n != self.folders.len()
    }
    pub fn get(&self, id: &str) -> Option<&Folder> {
        self.folders.iter().find(|f| f.id == id)
    }
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

pub fn is_audio(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXT.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Every audio file under `root` (no symlink following, hidden files skipped, bounded depth and count).
pub fn list_audio(root: &Path) -> std::io::Result<Vec<AudioFile>> {
    let mut out = Vec::new();
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    while let Some((dir, depth)) = stack.pop() {
        for entry in std::fs::read_dir(&dir)? {
            let entry = entry?;
            let name = entry.file_name();
            if name.to_string_lossy().starts_with('.') {
                continue;
            }
            let ft = entry.file_type()?;
            let path = entry.path();
            if ft.is_dir() && depth < MAX_DEPTH {
                stack.push((path, depth + 1));
            } else if ft.is_file() && is_audio(&path) {
                let rel = path.strip_prefix(root).unwrap_or(&path);
                let rel = rel
                    .components()
                    .map(|c| c.as_os_str().to_string_lossy())
                    .collect::<Vec<_>>()
                    .join("/");
                out.push(AudioFile {
                    rel,
                    size: entry.metadata()?.len(),
                });
                if out.len() >= MAX_FILES {
                    return Ok(out);
                }
            }
        }
    }
    out.sort_by(|a, b| a.rel.cmp(&b.rel));
    Ok(out)
}

/// Joins a page-supplied relative path onto the folder, refusing anything that could leave it.
pub fn resolve_inside(root: &Path, rel: &str) -> Option<PathBuf> {
    let rel_path = Path::new(rel);
    if rel.is_empty() || rel_path.is_absolute() || rel.contains('\\') {
        return None;
    }
    if !rel_path
        .components()
        .all(|c| matches!(c, Component::Normal(_)))
    {
        return None;
    }
    let joined = root.join(rel_path);
    let canon_root = root.canonicalize().ok()?;
    let canon = joined.canonicalize().ok()?;
    (canon.starts_with(&canon_root) && is_audio(&canon)).then_some(canon)
}

/// Platform bookmarks. macOS: `NSURL bookmarkDataWithOptions:NSURLBookmarkCreationWithSecurityScope` and
/// `startAccessingSecurityScopedResource` on resolve. iPadOS: the same with a document-picker URL.
pub mod platform {
    use std::path::Path;

    /// Creates the bookmark for a folder the DJ just picked (inside the picker's grant).
    #[cfg(target_os = "macos")]
    pub fn bookmark(path: &Path) -> Option<String> {
        crate::apple::create_bookmark(path)
    }
    /// Re-opens access after a relaunch. Returns the (possibly moved) path.
    #[cfg(target_os = "macos")]
    pub fn open(bookmark: &str) -> Option<std::path::PathBuf> {
        crate::apple::resolve_bookmark(bookmark)
    }

    // TODO(mac): iPadOS needs a Swift plugin (UIDocumentPickerViewController for `.folder` + bookmarkData);
    // tauri-plugin-dialog cannot pick folders on iOS. Until then the iPad Booth uses the web file input.
    #[cfg(not(target_os = "macos"))]
    pub fn bookmark(_path: &Path) -> Option<String> {
        None
    }
    #[cfg(not(target_os = "macos"))]
    pub fn open(_bookmark: &str) -> Option<std::path::PathBuf> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tree() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("Di Sarli/1941")).unwrap();
        std::fs::write(d.path().join("Di Sarli/1941/Milonguero viejo.FLAC"), b"x").unwrap();
        std::fs::write(d.path().join("Di Sarli/cover.jpg"), b"x").unwrap();
        std::fs::write(d.path().join(".hidden.mp3"), b"x").unwrap();
        std::fs::write(d.path().join("La Cumparsita.mp3"), b"xyz").unwrap();
        d
    }

    #[test]
    fn lists_only_audio_sorted_and_relative() {
        let d = tree();
        let files = list_audio(d.path()).unwrap();
        let rels: Vec<_> = files.iter().map(|f| f.rel.as_str()).collect();
        assert_eq!(
            rels,
            vec!["Di Sarli/1941/Milonguero viejo.FLAC", "La Cumparsita.mp3"]
        );
        assert_eq!(files[1].size, 3);
    }

    #[test]
    fn never_reads_outside_the_folder() {
        let d = tree();
        assert!(resolve_inside(d.path(), "La Cumparsita.mp3").is_some());
        assert!(resolve_inside(d.path(), "../etc/passwd").is_none());
        assert!(resolve_inside(d.path(), "/etc/passwd").is_none());
        assert!(resolve_inside(d.path(), "Di Sarli/cover.jpg").is_none());
        assert!(resolve_inside(d.path(), "").is_none());
        #[cfg(unix)]
        {
            let outside = tempfile::tempdir().unwrap();
            std::fs::write(outside.path().join("secret.mp3"), b"x").unwrap();
            std::os::unix::fs::symlink(
                outside.path().join("secret.mp3"),
                d.path().join("link.mp3"),
            )
            .unwrap();
            assert!(resolve_inside(d.path(), "link.mp3").is_none());
        }
    }

    #[test]
    fn store_dedupes_and_persists() {
        let d = tempfile::tempdir().unwrap();
        let mut s = Store::default();
        let a = s.add(Path::new("/Music/Tango"), None);
        let b = s.add(Path::new("/Music/Tango"), Some("Ym9vaw==".into()));
        assert_eq!(a.id, b.id);
        assert_eq!(s.folders.len(), 1);
        s.save(d.path()).unwrap();
        let back = Store::load(d.path());
        assert_eq!(back.folders[0].bookmark.as_deref(), Some("Ym9vaw=="));
        let mut back = back;
        assert!(back.remove(&a.id));
        assert!(back.get(&a.id).is_none());
    }
}
