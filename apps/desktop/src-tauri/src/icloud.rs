//! iCloud Documents mirror of the sync log (docs/SYNC.md). The page's sync engine (apps/web/src/lib/sync) writes the
//! same encrypted records it sends to the sync server, one file each, into the app's ubiquity container, so the
//! Apple apps signed in to one iCloud account keep syncing with no server reachable. Files hold ciphertext only: the
//! sync code never leaves the device, and Apple sees what the server sees.
//!
//! Layout: `<container>/Documents/sync/<space>/<record id>.tdjsync`, `<space>` a hash of the space id (32
//! base64url characters). The container is the first one in the app's entitlements
//! (`com.apple.developer.ubiquity-container-identifiers`, `iCloud.<bundle id>`), asked for with a nil identifier,
//! so a fork with its own bundle ID uses its own container without a code change.
//!
//! Which builds: the Mac App Store and iOS (iPhone + iPad) builds carry the iCloud entitlements. The Developer ID DMG
//! does not (`updater` feature): `icloud_status` answers `unsupported` there and the DMG syncs with a code only.
//!
//! The folder operations are plain files (testable on Linux); only finding the container and asking iCloud to
//! download a file that is not on this device yet is Apple code.

use serde::Serialize;
use std::path::{Path, PathBuf};

type Res<T> = Result<T, String>;

/// one record's file: its record id (22 base64url characters) and the extension
pub const EXT: &str = ".tdjsync";
/// a sealed record is at most this long (the server's limit, lib/server/sync.ts SYNC_LIMITS.blobChars)
pub const MAX_BLOB: usize = 350_000;

#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct Status {
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<&'static str>,
}

#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct FileInfo {
    pub name: String,
    /// ms since the epoch
    pub modified: u64,
    pub size: u64,
}

fn b64url(s: &str) -> bool {
    s.bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}
pub fn valid_space(s: &str) -> bool {
    s.len() == 32 && b64url(s)
}
pub fn valid_name(n: &str) -> bool {
    n.strip_suffix(EXT)
        .is_some_and(|rid| rid.len() == 22 && b64url(rid))
}
fn valid_blob(d: &str) -> bool {
    !d.is_empty() && d.len() <= MAX_BLOB && b64url(d)
}

/// A space's folder under a root (the container's `Documents/sync`, or a temp folder in tests).
pub struct Folder {
    root: PathBuf,
}

impl Folder {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Folder { root: root.into() }
    }
    fn dir(&self, space: &str) -> Res<PathBuf> {
        if !valid_space(space) {
            return Err("bad space".into());
        }
        Ok(self.root.join(space))
    }
    /// The records present on this device. A file iCloud has not downloaded yet shows as `.<name>.icloud`:
    /// it is handed to `pending` (which asks iCloud for it) and listed on a later round.
    pub fn list(&self, space: &str, pending: &dyn Fn(&Path)) -> Res<Vec<FileInfo>> {
        let dir = self.dir(space)?;
        let Ok(rd) = std::fs::read_dir(&dir) else {
            return Ok(vec![]);
        };
        let mut out = vec![];
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if let Some(real) = name
                .strip_prefix('.')
                .and_then(|n| n.strip_suffix(".icloud"))
            {
                if valid_name(real) {
                    pending(&dir.join(real));
                }
                continue;
            }
            if !valid_name(&name) {
                continue;
            }
            let Ok(meta) = e.metadata() else { continue };
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            out.push(FileInfo {
                name,
                modified,
                size: meta.len(),
            });
        }
        out.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(out)
    }
    pub fn read(&self, space: &str, name: &str) -> Res<Option<String>> {
        if !valid_name(name) {
            return Err("bad name".into());
        }
        let p = self.dir(space)?.join(name);
        match std::fs::read_to_string(&p) {
            Ok(s) if valid_blob(s.trim()) => Ok(Some(s.trim().to_string())),
            Ok(_) => Ok(None),
            Err(_) => Ok(None),
        }
    }
    /// Writes one record: a temporary file renamed over the old one, so iCloud never uploads half a record.
    pub fn write(&self, space: &str, name: &str, data: &str) -> Res<()> {
        if !valid_name(name) {
            return Err("bad name".into());
        }
        if !valid_blob(data) {
            return Err("not a sealed record".into());
        }
        let dir = self.dir(space)?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let tmp = dir.join(format!(".{name}.tmp"));
        std::fs::write(&tmp, data).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, dir.join(name)).map_err(|e| e.to_string())
    }
    /// Reset sync code: the old space's folder goes (on every device, through iCloud).
    pub fn remove(&self, space: &str) -> Res<()> {
        let dir = self.dir(space)?;
        match std::fs::remove_dir_all(&dir) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

// ---------------------------------------------------------------- the container (Apple builds with iCloud)

/// The container's `Documents/sync`, or why there is none: "off" (no iCloud account or iCloud Drive off),
/// "unsupported" (a build without the iCloud entitlements: the DMG, Linux checks).
#[cfg(all(any(target_os = "macos", target_os = "ios"), not(feature = "updater")))]
fn root() -> Result<PathBuf, &'static str> {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send};
    use objc2_foundation::NSString;
    unsafe {
        let fm: Retained<AnyObject> = msg_send![class!(NSFileManager), defaultManager];
        // nil when no iCloud account is signed in or iCloud Drive is off for this app
        let token: *mut AnyObject = msg_send![&*fm, ubiquityIdentityToken];
        if token.is_null() {
            return Err("off");
        }
        let nil: *const AnyObject = std::ptr::null();
        let url: *mut AnyObject = msg_send![&*fm, URLForUbiquityContainerIdentifier: nil];
        if url.is_null() {
            // signed in, but this build has no container entitlement
            return Err("unsupported");
        }
        let path: *mut NSString = msg_send![url, path];
        if path.is_null() {
            return Err("unsupported");
        }
        Ok(PathBuf::from((*path).to_string())
            .join("Documents")
            .join("sync"))
    }
}
#[cfg(not(all(any(target_os = "macos", target_os = "ios"), not(feature = "updater"))))]
fn root() -> Result<PathBuf, &'static str> {
    Err("unsupported")
}

/// Asks iCloud to bring a record that is only in the cloud onto this device.
#[cfg(all(any(target_os = "macos", target_os = "ios"), not(feature = "updater")))]
fn start_download(p: &Path) {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send};
    use objc2_foundation::{NSString, NSURL};
    unsafe {
        let fm: Retained<AnyObject> = msg_send![class!(NSFileManager), defaultManager];
        let url = NSURL::fileURLWithPath(&NSString::from_str(&p.to_string_lossy()));
        let err: *mut *mut AnyObject = std::ptr::null_mut();
        let _: bool = msg_send![&*fm, startDownloadingUbiquitousItemAtURL: &*url, error: err];
    }
}
#[cfg(not(all(any(target_os = "macos", target_os = "ios"), not(feature = "updater"))))]
fn start_download(_p: &Path) {}

fn folder() -> Res<Folder> {
    root().map(Folder::new).map_err(|r| r.to_string())
}

/// iCloud work blocks (the first call can wait on the container): off the main thread and the async workers
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Res<T> + Send + 'static) -> Res<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------- commands (capabilities/default.json)

#[tauri::command]
pub async fn icloud_status() -> Status {
    blocking(|| {
        Ok(match root() {
            Ok(_) => Status {
                available: true,
                reason: None,
            },
            Err(r) => Status {
                available: false,
                reason: Some(r),
            },
        })
    })
    .await
    .unwrap_or(Status {
        available: false,
        reason: Some("error"),
    })
}

#[tauri::command]
pub async fn icloud_list(space: String) -> Res<Vec<FileInfo>> {
    blocking(move || folder()?.list(&space, &start_download)).await
}

#[tauri::command]
pub async fn icloud_read(space: String, name: String) -> Res<Option<String>> {
    blocking(move || folder()?.read(&space, &name)).await
}

#[tauri::command]
pub async fn icloud_write(space: String, name: String, data: String) -> Res<()> {
    blocking(move || folder()?.write(&space, &name, &data)).await
}

#[tauri::command]
pub async fn icloud_remove(space: String) -> Res<()> {
    blocking(move || folder()?.remove(&space)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    const SPACE: &str = "abcdefghijklmnopqrstuvwxyzABCDEF";
    const NAME: &str = "AAAAAAAAAAAAAAAAAAAAAA.tdjsync";

    #[test]
    fn names_and_spaces_cannot_leave_the_folder() {
        assert!(valid_space(SPACE));
        assert!(!valid_space("../../../../etc/passwd/xxxxxxxxxx"));
        assert!(!valid_space("short"));
        assert!(valid_name(NAME));
        assert!(!valid_name("../AAAAAAAAAAAAAAAAAAAA.tdjsync"));
        assert!(!valid_name("AAAAAAAAAAAAAAAAAAAAAA.txt"));
        let dir = tempfile::tempdir().unwrap();
        let f = Folder::new(dir.path());
        assert!(f.write("../x", NAME, "AQID").is_err());
        assert!(f.write(SPACE, "../../evil", "AQID").is_err());
    }

    #[test]
    fn write_list_read_remove() {
        let dir = tempfile::tempdir().unwrap();
        let f = Folder::new(dir.path());
        assert_eq!(f.list(SPACE, &|_| {}).unwrap(), vec![]);
        f.write(SPACE, NAME, "AQIDBAUG-_").unwrap();
        // overwriting is a rename: no temporary file is left behind
        f.write(SPACE, NAME, "AQIDBAUGBwg").unwrap();
        let l = f.list(SPACE, &|_| {}).unwrap();
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].name, NAME);
        assert_eq!(l[0].size, 11);
        assert_eq!(f.read(SPACE, NAME).unwrap().as_deref(), Some("AQIDBAUGBwg"));
        f.remove(SPACE).unwrap();
        assert_eq!(f.list(SPACE, &|_| {}).unwrap(), vec![]);
        f.remove(SPACE).unwrap();
    }

    #[test]
    fn only_ciphertext_is_written() {
        let dir = tempfile::tempdir().unwrap();
        let f = Folder::new(dir.path());
        assert!(f.write(SPACE, NAME, "{\"title\":\"Saturday\"}").is_err());
        assert!(f.write(SPACE, NAME, "").is_err());
        assert!(f.write(SPACE, NAME, &"A".repeat(MAX_BLOB + 1)).is_err());
    }

    #[test]
    fn a_file_still_in_the_cloud_is_asked_for_not_listed() {
        let dir = tempfile::tempdir().unwrap();
        let f = Folder::new(dir.path());
        std::fs::create_dir_all(dir.path().join(SPACE)).unwrap();
        std::fs::write(dir.path().join(SPACE).join(format!(".{NAME}.icloud")), b"").unwrap();
        std::fs::write(dir.path().join(SPACE).join("notes.txt"), b"x").unwrap();
        let asked = RefCell::new(vec![]);
        let l = f
            .list(SPACE, &|p| asked.borrow_mut().push(p.to_path_buf()))
            .unwrap();
        assert!(l.is_empty());
        assert_eq!(asked.borrow().len(), 1);
        assert!(asked.borrow()[0].ends_with(NAME));
    }

    #[test]
    fn no_icloud_off_apple() {
        // Linux checks (and the DMG): sync codes only
        if !cfg!(any(target_os = "macos", target_os = "ios")) {
            assert_eq!(root(), Err("unsupported"));
        }
    }
}
