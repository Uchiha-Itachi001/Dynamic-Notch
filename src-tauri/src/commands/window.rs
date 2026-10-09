use crate::services::window_manager;

#[tauri::command]
pub fn set_notch_expanded(expanded: bool) {
    window_manager::set_expanded(expanded);
}

#[tauri::command]
pub fn set_notch_peek(peek: bool) {
    window_manager::set_peek(peek);
}

#[link(name = "user32")]
extern "system" {
    fn LockWorkStation() -> windows::core::BOOL;
}

#[tauri::command]
pub fn launch_app(cmd: String) -> Result<(), String> {
    let trimmed = cmd.trim();
    if trimmed.is_empty() {
        return Ok(());
    }

    // Security Hardening:
    // 1. Enforce length boundary
    if trimmed.len() > 260 {
        return Err("Command exceeds maximum allowed length".to_string());
    }

    // 2. Reject shell injection & control metacharacters
    const FORBIDDEN_CHARS: &[char] = &['&', '|', ';', '>', '<', '`', '$', '%', '^', '"', '\'', '\r', '\n', '\t', '\0'];
    if trimmed.chars().any(|c| FORBIDDEN_CHARS.contains(&c) || c.is_control()) {
        return Err("Disallowed shell metacharacters detected".to_string());
    }

    // 3. Reject directory traversal
    if trimmed.contains("..") {
        return Err("Directory traversal is forbidden".to_string());
    }

    // 4. Validate schema/target format:
    // Only permit safe URI schemes or standalone trusted app executables (no path delimiters)
    let is_safe_uri = trimmed.starts_with("https://")
        || trimmed.starts_with("http://")
        || trimmed.starts_with("spotify:")
        || trimmed.starts_with("ms-settings:");

    let is_safe_app_name = !trimmed.contains('/')
        && !trimmed.contains('\\')
        && trimmed.ends_with(".exe")
        && trimmed.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-');

    if !is_safe_uri && !is_safe_app_name {
        return Err("Target is not in the allowlist of safe applications or protocols".to_string());
    }

    // 5. Execute via ShellExecuteW directly — NEVER invoking cmd.exe shell interpreter
    let mut wide: Vec<u16> = trimmed.encode_utf16().collect();
    wide.push(0);

    unsafe {
        use windows::core::PCWSTR;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        let result = ShellExecuteW(
            None,
            windows::core::w!("open"),
            PCWSTR(wide.as_ptr()),
            None,
            None,
            SW_SHOWNORMAL,
        );

        // ShellExecute returns HINSTANCE > 32 on success
        if (result.0 as isize) <= 32 {
            return Err("Failed to launch target application via Windows Shell".to_string());
        }
    }

    Ok(())
}

#[tauri::command]
pub fn open_windows_settings() {
    unsafe {
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        // Preferred native mechanism: launch ms-settings: protocol directly
        let res = ShellExecuteW(
            None,
            windows::core::w!("open"),
            windows::core::w!("ms-settings:"),
            None,
            None,
            SW_SHOWNORMAL,
        );

        // Fallback to Win+I key simulation only if ShellExecute fails
        if (res.0 as isize) <= 32 {
            use windows::Win32::UI::Input::KeyboardAndMouse::{
                keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
            };
            keybd_event(0x5B, 0, KEYBD_EVENT_FLAGS(0), 0);
            keybd_event(0x49 /* 'I' */, 0, KEYBD_EVENT_FLAGS(0), 0);
            keybd_event(0x49, 0, KEYEVENTF_KEYUP, 0);
            keybd_event(0x5B, 0, KEYEVENTF_KEYUP, 0);
        }
    }
}

#[tauri::command]
pub fn power_action(action: String) -> Result<(), String> {
    match action.trim().to_lowercase().as_str() {
        "lock" => {
            // Direct native API call — no rundll32.exe process spawning
            unsafe {
                let success = LockWorkStation();
                if !success.as_bool() {
                    return Err("LockWorkStation failed".to_string());
                }
            }
            Ok(())
        }
        _ => Err("Invalid or unsupported power action".to_string()),
    }
}

#[tauri::command]
pub fn exit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

