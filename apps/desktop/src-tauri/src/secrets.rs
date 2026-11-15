//! Secrets on the device: the DJ's model keys (BYOK) and the Spotify session, in the OS keychain (macOS Keychain,
//! iPadOS Keychain) through the `keyring` crate. The page never reads a secret back: it may only store one, ask
//! whether one exists, or delete it; the native side uses them for its own requests (`net.rs`).

use std::collections::HashMap;
use std::sync::Mutex;

/// The Keychain service every TDJ item lives under.
pub const SERVICE: &str = "com.ariomoniri.tdj";

/// Names the page may write: one model key per provider. Spotify tokens are written by `net.rs` only.
pub fn page_may_write(name: &str) -> bool {
    matches!(
        name,
        "ai.anthropic" | "ai.openai" | "ai.gemini" | "ai.openrouter"
    )
}

pub const SPOTIFY_REFRESH: &str = "spotify.refresh";

pub trait SecretStore: Send + Sync {
    fn get(&self, name: &str) -> Option<String>;
    fn set(&self, name: &str, value: &str) -> Result<(), String>;
    fn delete(&self, name: &str) -> Result<(), String>;
}

/// The OS keychain.
pub struct Keychain;

impl SecretStore for Keychain {
    fn get(&self, name: &str) -> Option<String> {
        keyring::Entry::new(SERVICE, name).ok()?.get_password().ok()
    }
    fn set(&self, name: &str, value: &str) -> Result<(), String> {
        keyring::Entry::new(SERVICE, name)
            .and_then(|e| e.set_password(value))
            .map_err(|_| "The key could not be saved in your Keychain.".to_string())
    }
    fn delete(&self, name: &str) -> Result<(), String> {
        match keyring::Entry::new(SERVICE, name).and_then(|e| e.delete_credential()) {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("The key could not be removed from your Keychain.".into()),
        }
    }
}

/// In memory: tests, and platforms without a keychain (Linux development builds).
#[derive(Default)]
pub struct Memory(Mutex<HashMap<String, String>>);

impl SecretStore for Memory {
    fn get(&self, name: &str) -> Option<String> {
        self.0.lock().unwrap().get(name).cloned()
    }
    fn set(&self, name: &str, value: &str) -> Result<(), String> {
        self.0
            .lock()
            .unwrap()
            .insert(name.to_string(), value.to_string());
        Ok(())
    }
    fn delete(&self, name: &str) -> Result<(), String> {
        self.0.lock().unwrap().remove(name);
        Ok(())
    }
}

/// The store this build uses: the Keychain on Apple platforms, memory elsewhere (a Linux check run keeps nothing).
pub fn platform_store() -> Box<dyn SecretStore> {
    if cfg!(any(target_os = "macos", target_os = "ios")) {
        Box::new(Keychain)
    } else {
        Box::new(Memory::default())
    }
}

/// `secret_set` from the page: only allowed names, trimmed, empty means delete.
pub fn page_set(store: &dyn SecretStore, name: &str, value: &str) -> Result<(), String> {
    if !page_may_write(name) {
        return Err("Unknown key.".into());
    }
    let v = value.trim();
    if v.is_empty() {
        return store.delete(name);
    }
    if v.len() > 4096 || v.chars().any(|c| c.is_control()) {
        return Err("That does not look like an API key.".into());
    }
    store.set(name, v)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_page_writes_model_keys_only() {
        let s = Memory::default();
        assert!(page_set(&s, "ai.anthropic", " sk-ant-x ").is_ok());
        assert_eq!(s.get("ai.anthropic").as_deref(), Some("sk-ant-x"));
        assert!(page_set(&s, SPOTIFY_REFRESH, "stolen").is_err());
        assert!(page_set(&s, "ai.other", "x").is_err());
        assert!(page_set(&s, "ai.openai", "a\nb").is_err());
        page_set(&s, "ai.anthropic", "").unwrap();
        assert!(s.get("ai.anthropic").is_none());
    }
}
