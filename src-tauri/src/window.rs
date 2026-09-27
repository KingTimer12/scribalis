use tauri::{App, Manager, Theme, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const MAIN: &str = "main";

/// Creates the main window. macOS keeps its native traffic lights over our top bar;
/// elsewhere the native frame is removed and the top bar draws its own buttons.
pub fn build_main(app: &App, theme: &str) -> tauri::Result<WebviewWindow> {
    let builder = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::default())
        .title("scribalis")
        .inner_size(1440.0, 900.0)
        .theme(Some(to_theme(theme)));

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        // Vertically centred in the 64px top bar.
        .traffic_light_position(tauri::LogicalPosition::new(20.0, 25.0));

    #[cfg(not(target_os = "macos"))]
    let builder = builder.decorations(false);

    builder.build()
}

/// Keeps the native window chrome (macOS title bar, shadows, menus) in the app's theme.
pub fn apply_theme(app: &tauri::AppHandle, theme: &str) {
    if let Some(window) = app.get_webview_window(MAIN) {
        // Cosmetic only: a failure must not fail the preference save.
        let _ = window.set_theme(Some(to_theme(theme)));
    }
}

fn to_theme(theme: &str) -> Theme {
    if theme == "dark" { Theme::Dark } else { Theme::Light }
}
