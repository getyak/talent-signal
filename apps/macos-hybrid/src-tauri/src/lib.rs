mod backend;
mod models;
mod native;

use native::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState::new().expect("initialize bounded native state");
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(state)
        .setup(|app| {
            native::purge_capture_cache_on_startup(app.handle()).map_err(std::io::Error::other)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            native::activate_session_binding,
            native::session_binding_status,
            native::disconnect_session_binding,
            native::desktop_capabilities,
            native::capture_selected_window,
            native::cancel_capture,
            native::recognize_local_text,
            native::open_quick_panel,
            native::notify_state,
        ])
        .run(tauri::generate_context!())
        .expect("run Talent Signal Hybrid");
}
