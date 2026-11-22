//! Self-update for the Developer ID (DMG) build only: `latest.json` on the newest GitHub Release
//! (scripts/release/latest-json.mjs), signed with the Tauri updater key. The dialog shows the release notes,
//! installs, then relaunches. Never prompts while the Booth is playing (keep-awake held). Checked on launch and from
//! Settings → About → "Check for Updates" (`check_updates`) or the app menu.
//!
//! The bundle was renamed TDJ.app → T-DJ.app in 1.0.1 (`productName`). The updater unpacks the archive's one
//! top-level `*.app` into the path of the app that is running (tauri-plugin-updater drops the first path component),
//! so an installed TDJ.app is replaced in place and keeps its name; what must not change is the executable inside
//! (`mainBinaryName`: Contents/MacOS/TDJ), which `restart` relaunches through its bundle. Tests below pin both.

use tauri::AppHandle;

#[cfg(feature = "updater")]
pub fn check(app: AppHandle, manual: bool) {
    use tauri::Manager;
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
    use tauri_plugin_updater::UpdaterExt;
    tauri::async_runtime::spawn(async move {
        if !manual && app.state::<crate::AppState>().keep_awake.is_on() {
            return; // mid-night: ask another day
        }
        let update = match app.updater() {
            Ok(u) => u.check().await,
            Err(e) => Err(e),
        };
        match update {
            Ok(Some(update)) => {
                let notes = update.body.clone().unwrap_or_default();
                let msg = format!(
                    "T-DJ {} is available (you have {}).\n\n{}",
                    update.version,
                    update.current_version,
                    crate::updates::trim_notes(&notes)
                );
                let yes = app
                    .dialog()
                    .message(msg)
                    .title("Update T-DJ")
                    .buttons(MessageDialogButtons::OkCancelCustom(
                        "Install and Relaunch".into(),
                        "Later".into(),
                    ))
                    .blocking_show();
                if !yes {
                    return;
                }
                match update.download_and_install(|_, _| {}, || {}).await {
                    Ok(()) => app.restart(),
                    Err(e) => {
                        app.dialog()
                            .message(format!(
                                "T-DJ couldn't install the update: {e}\n\nDownload it from the T-DJ page on GitHub instead."
                            ))
                            .kind(MessageDialogKind::Warning)
                            .blocking_show();
                    }
                }
            }
            Ok(None) if manual => {
                app.dialog()
                    .message("You have the newest T-DJ.")
                    .kind(MessageDialogKind::Info)
                    .blocking_show();
            }
            Err(e) if manual => {
                app.dialog()
                    .message(format!("T-DJ couldn't check for updates: {e}"))
                    .kind(MessageDialogKind::Warning)
                    .blocking_show();
            }
            _ => {}
        }
    });
}

#[cfg(not(feature = "updater"))]
pub fn check(_app: AppHandle, _manual: bool) {}

/// Release notes in a dialog: plain text, at most 1,200 characters, Markdown bullets kept readable.
#[cfg_attr(not(feature = "updater"), allow(dead_code))]
pub fn trim_notes(notes: &str) -> String {
    let plain: String = notes
        .lines()
        .filter(|l| !l.trim_start().starts_with("<!--"))
        .map(|l| {
            l.trim_start_matches('#')
                .trim_start()
                .replacen("* ", "• ", 1)
                .replacen("- ", "• ", 1)
        })
        .collect::<Vec<_>>()
        .join("\n");
    let plain = plain.trim();
    if plain.chars().count() <= 1200 {
        return plain.to_string();
    }
    let cut: String = plain.chars().take(1200).collect();
    format!("{}…", cut.trim_end())
}

#[cfg(test)]
mod tests {
    #[test]
    fn notes_are_trimmed_and_plain() {
        assert_eq!(
            super::trim_notes("## What's new\n- Pre-listen\n* Faster"),
            "What's new\n• Pre-listen\n• Faster"
        );
        let long = "x".repeat(5000);
        assert_eq!(super::trim_notes(&long).chars().count(), 1201);
    }

    /// The updater replaces the running bundle in place (an installed TDJ.app stays TDJ.app with T-DJ inside) and
    /// relaunches its executable: the executable's name and the bundle ID must never change between versions.
    #[test]
    fn an_installed_tdj_app_is_replaced_in_place() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(conf["productName"], "T-DJ");
        assert_eq!(
            conf["mainBinaryName"], "TDJ",
            "1.0.0 shipped Contents/MacOS/TDJ: keep it, or installed copies relaunch nothing"
        );
        assert_eq!(conf["identifier"], "com.ariomoniri.tdj");
        // the committed config never names an updater endpoint or key: only the DMG build adds them
        // (scripts/release/mac-build.sh → --features updater + plugins.updater), so store builds cannot update
        assert!(conf["plugins"].get("updater").is_none());
        let script = include_str!("../../../../scripts/release/mac-build.sh");
        assert!(script.contains("--features updater"));
        assert!(script.contains("releases/latest/download/latest.json"));
        // the Mac App Store and iOS builds are built without the feature
        for line in script
            .lines()
            .filter(|l| l.contains("tauri build") || l.contains("tauri ios build"))
        {
            if line.contains("mas.json") || line.contains("ios build") {
                assert!(!line.contains("updater"), "{line}");
            }
        }
    }
}
