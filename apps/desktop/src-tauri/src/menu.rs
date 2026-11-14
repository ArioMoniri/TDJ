//! The native menu bar (r22-motion.md §4.5 and §7.3). The web UI never draws a fake menu bar: every item here
//! is a command id the page receives as `tdj:command` (`window.addEventListener("tdj:command", e => e.detail.id)`),
//! the same ids as the web's command registry (`lib/commands.ts`). A few ids are handled natively first.

#[cfg(desktop)]
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
#[cfg(desktop)]
use tauri::{AppHandle, Runtime};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Group {
    App,
    File,
    Edit,
    View,
    Playback,
    Help,
}

#[derive(Debug, Clone, Copy)]
pub struct Command {
    pub id: &'static str,
    pub title: &'static str,
    pub accel: Option<&'static str>,
    pub group: Group,
}

const fn c(
    id: &'static str,
    title: &'static str,
    accel: Option<&'static str>,
    group: Group,
) -> Command {
    Command {
        id,
        title,
        accel,
        group,
    }
}

/// Every command of the menu bar, in menu order. Space (play/pause) is not a menu accelerator on purpose:
/// it would swallow spaces typed in fields; the page handles it (r22-motion §7.3).
pub const COMMANDS: &[Command] = &[
    c("app.settings", "Settings…", Some("CmdOrCtrl+,"), Group::App),
    c("app.server", "Connections…", None, Group::App),
    c("app.updates", "Check for Updates…", None, Group::App),
    c(
        "compose.run",
        "Compose Night",
        Some("CmdOrCtrl+Enter"),
        Group::File,
    ),
    c("export.open", "Export…", Some("CmdOrCtrl+E"), Group::File),
    c(
        "export.print",
        "Print Set List…",
        Some("CmdOrCtrl+P"),
        Group::File,
    ),
    c(
        "folder.add",
        "Add Music Folder…",
        Some("CmdOrCtrl+Shift+O"),
        Group::File,
    ),
    c("edit.search", "Find…", Some("CmdOrCtrl+F"), Group::Edit),
    c(
        "edit.palette",
        "Command Palette…",
        Some("CmdOrCtrl+K"),
        Group::Edit,
    ),
    c("go.booth", "Booth", Some("CmdOrCtrl+1"), Group::View),
    c("go.compose", "Compose", Some("CmdOrCtrl+2"), Group::View),
    c("go.library", "Library", Some("CmdOrCtrl+3"), Group::View),
    c("go.database", "Database", Some("CmdOrCtrl+4"), Group::View),
    c("go.history", "History", Some("CmdOrCtrl+5"), Group::View),
    c("go.guide", "Guide", Some("CmdOrCtrl+6"), Group::View),
    c(
        "view.sidebar",
        "Toggle Sidebar",
        Some("CmdOrCtrl+Ctrl+S"),
        Group::View,
    ),
    c(
        "view.inspector",
        "Toggle Inspector",
        Some("CmdOrCtrl+Alt+I"),
        Group::View,
    ),
    c(
        "booth.next",
        "Next Song",
        Some("CmdOrCtrl+Right"),
        Group::Playback,
    ),
    c(
        "booth.restart",
        "Restart Song",
        Some("CmdOrCtrl+Left"),
        Group::Playback,
    ),
    c(
        "booth.cue",
        "Play / Pause Cue (Headphones)",
        Some("Alt+Space"),
        Group::Playback,
    ),
    c(
        "booth.skip",
        "Skip Tanda Tonight",
        Some("CmdOrCtrl+Backspace"),
        Group::Playback,
    ),
    c(
        "booth.cumparsita",
        "Jump to La Cumparsita…",
        Some("CmdOrCtrl+Shift+E"),
        Group::Playback,
    ),
    c(
        "booth.stop",
        "Emergency Stop",
        Some("CmdOrCtrl+."),
        Group::Playback,
    ),
    c("help.guide", "TDJ Guide", None, Group::Help),
    c(
        "help.shortcuts",
        "Keyboard Shortcuts",
        Some("CmdOrCtrl+/"),
        Group::Help,
    ),
    c("help.issue", "Report a Problem…", None, Group::Help),
    c("help.privacy", "Privacy", None, Group::Help),
];

#[cfg(test)]
pub fn find(id: &str) -> Option<&'static Command> {
    COMMANDS.iter().find(|c| c.id == id)
}

/// JavaScript that delivers a command to the page (a cancelable event, so the page can claim it).
pub fn dispatch_js(id: &str) -> String {
    let id = serde_json::to_string(id).expect("string");
    format!("window.dispatchEvent(new CustomEvent('tdj:command',{{detail:{{id:{id}}},cancelable:true}}))")
}

/// The menu bar (macOS); iPadOS 26 gets the same commands as key commands from the page (r22-motion §4.5).
#[cfg(desktop)]
pub fn build<R: Runtime>(app: &AppHandle<R>, with_updates: bool) -> tauri::Result<Menu<R>> {
    let item = |cmd: &Command| {
        let mut b = MenuItemBuilder::with_id(cmd.id, cmd.title);
        if let Some(a) = cmd.accel {
            b = b.accelerator(a);
        }
        b.build(app)
    };
    let group = |g: Group| COMMANDS.iter().filter(move |c| c.group == g);

    let mut app_menu = SubmenuBuilder::new(app, "T-DJ").item(&PredefinedMenuItem::about(
        app,
        Some("About TDJ"),
        None,
    )?);
    for cmd in group(Group::App).filter(|c| with_updates || c.id != "app.updates") {
        app_menu = app_menu.item(&item(cmd)?);
    }
    let app_menu = app_menu
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let mut file = SubmenuBuilder::new(app, "File");
    for cmd in group(Group::File) {
        file = file.item(&item(cmd)?);
    }
    let file = file.separator().close_window().build()?;

    let mut edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator();
    for cmd in group(Group::Edit) {
        edit = edit.item(&item(cmd)?);
    }
    let edit = edit.build()?;

    let mut view = SubmenuBuilder::new(app, "View");
    for cmd in group(Group::View) {
        view = view.item(&item(cmd)?);
        if cmd.id == "go.guide" {
            view = view.separator();
        }
    }
    let view = view.separator().fullscreen().build()?;

    let mut playback = SubmenuBuilder::new(app, "Playback");
    for cmd in group(Group::Playback) {
        if cmd.id == "booth.stop" {
            playback = playback.separator();
        }
        playback = playback.item(&item(cmd)?);
    }
    let playback = playback.build()?;

    let window = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;

    let mut help = SubmenuBuilder::new(app, "Help");
    for cmd in group(Group::Help) {
        help = help.item(&item(cmd)?);
    }
    let help = help.build()?;

    MenuBuilder::new(app)
        .items(&[&app_menu, &file, &edit, &view, &playback, &window, &help])
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn ids_and_accelerators_are_unique() {
        let mut ids = HashSet::new();
        let mut keys = HashSet::new();
        for c in COMMANDS {
            assert!(ids.insert(c.id), "duplicate id {}", c.id);
            if let Some(a) = c.accel {
                assert!(keys.insert(a), "duplicate accelerator {a}");
            }
        }
    }

    #[test]
    fn standard_mac_shortcuts_are_not_stolen() {
        // ⌘Q ⌘W ⌘H ⌘M ⌘C ⌘V ⌘X ⌘Z ⌘A belong to the system menu items
        for c in COMMANDS {
            for k in ["Q", "W", "H", "M", "C", "V", "X", "Z", "A"] {
                assert_ne!(
                    c.accel.map(|a| a.to_string()),
                    Some(format!("CmdOrCtrl+{k}")),
                    "{} steals ⌘{k}",
                    c.id
                );
            }
            assert_ne!(c.accel, Some("Space"), "Space must stay with the page");
        }
    }

    #[test]
    fn dispatch_is_escaped() {
        assert_eq!(
            dispatch_js("go.booth"),
            "window.dispatchEvent(new CustomEvent('tdj:command',{detail:{id:\"go.booth\"},cancelable:true}))"
        );
        assert!(dispatch_js("x\"),alert(1)//").contains("\\\""));
        assert!(find("booth.stop").is_some());
    }
}
