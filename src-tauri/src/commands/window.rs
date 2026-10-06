use crate::services::window_manager;
use std::process::Command;

#[tauri::command]
pub fn set_notch_expanded(expanded: bool) {
    window_manager::set_expanded(expanded);
}

#[tauri::command]
pub fn set_notch_peek(peek: bool) {
    window_manager::set_peek(peek);
}

#[tauri::command]
pub fn launch_app(cmd: String) -> Result<(), String> {
    let trimmed = cmd.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    let _ = Command::new("cmd")
        .args(["/C", "start", "", trimmed])
        .spawn();
    Ok(())
}

#[tauri::command]
pub fn open_windows_settings() {
    unsafe {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
        };
        keybd_event(0x5B, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x49 /* 'I' */, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(0x49, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(0x5B, 0, KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn power_action(action: String) -> Result<(), String> {
    match action.as_str() {
        "lock" => {
            let _ = Command::new("rundll32.exe")
                .args(["user32.dll,LockWorkStation"])
                .spawn();
            Ok(())
        }
        _ => Ok(()),
    }
}

#[tauri::command]
pub fn exit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

