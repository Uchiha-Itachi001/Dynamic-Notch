use crate::services::system_events;

#[tauri::command]
pub fn set_microphone_muted(muted: bool) -> Result<(), String> {
    system_events::set_microphone_muted(muted)
}
