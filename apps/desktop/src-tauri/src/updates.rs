//! Self-update for the Developer ID (DMG) build only: `latest.json` on the newest GitHub Release
//! (scripts/release/latest-json.mjs), signed with the Tauri updater key. The dialog shows the release notes,
//! installs, then relaunches. Never prompts while the Booth is playing (keep-awake held).

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
                    "TDJ {} is available (you have {}).\n\n{}",
                    update.version,
                    update.current_version,
                    crate::updates::trim_notes(&notes)
                );
                let yes = app
                    .dialog()
                    .message(msg)
                    .title("Update TDJ")
                    .buttons(MessageDialogButtons::OkCancelCustom(
                        "Install and Relaunch".into(),
                        "Later".into(),
                    ))
                    .blocking_show();
                if yes && update.download_and_install(|_, _| {}, || {}).await.is_ok() {
                    app.restart();
                }
            }
            Ok(None) if manual => {
                app.dialog()
                    .message("You have the newest TDJ.")
                    .kind(MessageDialogKind::Info)
                    .blocking_show();
            }
            Err(e) if manual => {
                app.dialog()
                    .message(format!("TDJ couldn't check for updates: {e}"))
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
}
