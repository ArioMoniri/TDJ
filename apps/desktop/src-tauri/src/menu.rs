//! The native menu bar (r22-motion.md §4.5 and §7.3). The web UI never draws a fake menu bar: every item here
//! is a command id the page receives as `tdj:command` (`window.addEventListener("tdj:command", e => e.detail.id)`),
//! the same ids as the web's command registry (`lib/commands.ts`). A few ids are handled natively first.

#[cfg(desktop)]
use tauri::menu::{
    AboutMetadata, Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
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

/// Wave 3: the Turkish title of a command (the web app's own words, docs/i18n-glossary.md).
pub fn title_tr(id: &str) -> Option<&'static str> {
    Some(match id {
        "app.settings" => "Ayarlar…",
        "app.server" => "Bağlantılar…",
        "app.updates" => "Güncellemeleri Denetle…",
        "compose.run" => "Geceyi Oluştur",
        "export.open" => "Aktar…",
        "export.print" => "Set Listesini Yazdır…",
        "folder.add" => "Müzik Klasörü Ekle…",
        "edit.search" => "Bul…",
        "edit.palette" => "Komut Paleti…",
        "go.booth" => "Kabin",
        "go.compose" => "Gece Oluştur",
        "go.library" => "Kütüphane",
        "go.database" => "Veritabanı",
        "go.history" => "Geçmiş",
        "go.guide" => "Rehber",
        "view.sidebar" => "Kenar Çubuğunu Göster/Gizle",
        "view.inspector" => "Denetçiyi Göster/Gizle",
        "booth.next" => "Sonraki Şarkı",
        "booth.restart" => "Şarkıyı Baştan Başlat",
        "booth.cue" => "Ön Dinlemeyi Çal / Duraklat (Kulaklık)",
        "booth.skip" => "Tandayı Bu Gece Atla",
        "booth.cumparsita" => "La Cumparsita'ya Geç…",
        "booth.stop" => "Acil Durdur",
        "help.guide" => "TDJ Rehberi",
        "help.shortcuts" => "Klavye Kısayolları",
        "help.issue" => "Sorun Bildir…",
        "help.privacy" => "Gizlilik",
        _ => return None,
    })
}

/// The About panel's copyright line (the same as Info.plist's NSHumanReadableCopyright).
pub const COPYRIGHT: &str = "© 2026 Ariorad Moniri";

/// The About panel's credit, in small type under the copyright (en + tr, like the web's `about.developed_by`).
pub fn about_credit(turkish: bool) -> &'static str {
    if turkish {
        "Geliştiren: Ariorad Moniri"
    } else {
        "Developed by Ariorad Moniri"
    }
}

/// The menu's own words (submenus and the system items) in English or Turkish.
pub fn chrome(turkish: bool) -> [&'static str; 18] {
    if turkish {
        [
            "TDJ Hakkında",
            "Dosya",
            "Düzen",
            "Görünüm",
            "Çalma",
            "Pencere",
            "Yardım",
            "Geri Al",
            "Yinele",
            "Kes",
            "Kopyala",
            "Yapıştır",
            "Tümünü Seç",
            "Küçült",
            "Büyüt",
            "Tam Ekran",
            "Pencereyi Kapat",
            "Hizmetler",
        ]
    } else {
        [
            "About TDJ",
            "File",
            "Edit",
            "View",
            "Playback",
            "Window",
            "Help",
            "Undo",
            "Redo",
            "Cut",
            "Copy",
            "Paste",
            "Select All",
            "Minimize",
            "Zoom",
            "Enter Full Screen",
            "Close Window",
            "Services",
        ]
    }
}

/// A Turkish system: its first preferred language is Turkish (the web UI's Auto follows the same list).
pub fn is_turkish(languages: &[String]) -> bool {
    languages
        .first()
        .map(|l| l.to_ascii_lowercase().starts_with("tr"))
        .unwrap_or(false)
}

/// The system's preferred languages, most preferred first.
#[cfg(target_os = "macos")]
pub fn system_languages() -> Vec<String> {
    use core_foundation::array::{CFArray, CFArrayRef};
    use core_foundation::base::TCFType;
    use core_foundation::string::CFString;
    extern "C" {
        fn CFLocaleCopyPreferredLanguages() -> CFArrayRef;
    }
    // SAFETY: a Copy function returns a +1 array of CFStrings, owned by the wrapper
    unsafe {
        let r = CFLocaleCopyPreferredLanguages();
        if r.is_null() {
            return vec![];
        }
        let a: CFArray<CFString> = CFArray::wrap_under_create_rule(r);
        a.iter().map(|s| s.to_string()).collect()
    }
}
#[cfg(not(target_os = "macos"))]
pub fn system_languages() -> Vec<String> {
    ["LC_ALL", "LC_MESSAGES", "LANG"]
        .iter()
        .filter_map(|k| std::env::var(k).ok())
        .filter(|v| !v.is_empty() && v != "C" && v != "POSIX")
        .take(1)
        .collect()
}

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
    // wave 3: Turkish titles on a Turkish system
    let turkish = is_turkish(&system_languages());
    let [about, file_t, edit_t, view_t, playback_t, window_t, help_t, undo, redo, cut, copy, paste, select_all, minimize, zoom, fullscreen, close, services] =
        chrome(turkish);
    let item = |cmd: &Command| {
        let title = if turkish {
            title_tr(cmd.id).unwrap_or(cmd.title)
        } else {
            cmd.title
        };
        let mut b = MenuItemBuilder::with_id(cmd.id, title);
        if let Some(a) = cmd.accel {
            b = b.accelerator(a);
        }
        b.build(app)
    };
    let group = |g: Group| COMMANDS.iter().filter(move |c| c.group == g);

    // name, version and icon still come from the bundle; only these two lines are set here
    let about_meta = AboutMetadata {
        copyright: Some(COPYRIGHT.into()),
        credits: Some(about_credit(turkish).into()),
        ..Default::default()
    };
    let mut app_menu = SubmenuBuilder::new(app, "T-DJ").item(&PredefinedMenuItem::about(
        app,
        Some(about),
        Some(about_meta),
    )?);
    for cmd in group(Group::App).filter(|c| with_updates || c.id != "app.updates") {
        app_menu = app_menu.item(&item(cmd)?);
    }
    let app_menu = app_menu
        .separator()
        .services_with_text(services)
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let mut file = SubmenuBuilder::new(app, file_t);
    for cmd in group(Group::File) {
        file = file.item(&item(cmd)?);
    }
    let file = file.separator().close_window_with_text(close).build()?;

    // 2026-11: Undo / Redo walk the page's one edit history (a night's swaps, moves, adds, pins) through
    // `tdj:command` edit.undo / edit.redo (web components/EditKeys.tsx); in a text field the page hands them to the
    // field, so typing keeps its own undo. Redo shows the standard ⇧⌘Z; ⌘Y (the owner's second redo key) is no menu
    // item's key equivalent (test redo_shows_shift_cmd_z_and_cmd_y_reaches_the_page), so AppKit hands it to the page
    let undo_item = MenuItemBuilder::with_id("edit.undo", undo)
        .accelerator("CmdOrCtrl+Z")
        .build(app)?;
    let redo_item = MenuItemBuilder::with_id("edit.redo", redo)
        .accelerator("CmdOrCtrl+Shift+Z")
        .build(app)?;
    let mut edit = SubmenuBuilder::new(app, edit_t)
        .item(&undo_item)
        .item(&redo_item)
        .separator()
        .cut_with_text(cut)
        .copy_with_text(copy)
        .paste_with_text(paste)
        .select_all_with_text(select_all)
        .separator();
    for cmd in group(Group::Edit) {
        edit = edit.item(&item(cmd)?);
    }
    let edit = edit.build()?;

    let mut view = SubmenuBuilder::new(app, view_t);
    for cmd in group(Group::View) {
        view = view.item(&item(cmd)?);
        if cmd.id == "go.guide" {
            view = view.separator();
        }
    }
    let view = view.separator().fullscreen_with_text(fullscreen).build()?;

    let mut playback = SubmenuBuilder::new(app, playback_t);
    for cmd in group(Group::Playback) {
        if cmd.id == "booth.stop" {
            playback = playback.separator();
        }
        playback = playback.item(&item(cmd)?);
    }
    let playback = playback.build()?;

    let window = SubmenuBuilder::new(app, window_t)
        .minimize_with_text(minimize)
        .maximize_with_text(zoom)
        .separator()
        .close_window_with_text(close)
        .build()?;

    let mut help = SubmenuBuilder::new(app, help_t);
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
    fn about_panel_credits_the_author_in_both_languages() {
        assert_eq!(COPYRIGHT, "© 2026 Ariorad Moniri");
        assert_eq!(about_credit(false), "Developed by Ariorad Moniri");
        assert_eq!(about_credit(true), "Geliştiren: Ariorad Moniri");
        // the bundle's copyright says the same (macOS shows Info.plist's when no metadata is passed)
        let plist = include_str!("../Info.plist");
        assert!(plist.contains(&format!("<string>{COPYRIGHT}</string>")));
    }

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
    fn redo_shows_shift_cmd_z_and_cmd_y_reaches_the_page() {
        // 2026-11: ⌘Y redoes through the page (web lib/keymap.ts edit.redo); a menu item on it would swallow it
        for c in COMMANDS {
            assert_ne!(c.accel, Some("CmdOrCtrl+Y"), "{} steals ⌘Y (redo)", c.id);
            assert_ne!(c.accel, Some("CmdOrCtrl+Shift+Z"), "{} steals ⇧⌘Z (redo)", c.id);
        }
    }

    #[test]
    fn every_command_has_a_turkish_title() {
        for c in COMMANDS {
            let t = title_tr(c.id).unwrap_or_else(|| panic!("no Turkish title for {}", c.id));
            assert_ne!(t, c.title, "{} is not translated", c.id);
        }
        assert_eq!(chrome(true).len(), chrome(false).len());
    }

    #[test]
    fn turkish_follows_the_first_system_language() {
        let l = |xs: &[&str]| xs.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(is_turkish(&l(&["tr-TR", "en-US"])));
        assert!(is_turkish(&l(&["tr"])));
        assert!(!is_turkish(&l(&["en-GB", "tr-TR"])));
        assert!(!is_turkish(&l(&[])));
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
