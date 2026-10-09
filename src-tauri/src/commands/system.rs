use crate::services::{startup, system_events};

#[tauri::command]
pub fn set_microphone_muted(muted: bool) -> Result<(), String> {
    system_events::set_microphone_muted(muted)
}

#[tauri::command]
pub fn get_auto_start_status() -> Result<bool, String> {
    startup::is_auto_start_enabled()
}

#[tauri::command]
pub fn set_auto_start(enabled: bool) -> Result<(), String> {
    if enabled {
        startup::enable_auto_start()
    } else {
        startup::disable_auto_start()
    }
}
