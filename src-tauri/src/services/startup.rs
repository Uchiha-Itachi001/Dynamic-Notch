#[cfg(target_os = "windows")]
fn get_target_executable_path() -> Result<std::path::PathBuf, String> {
    let current = std::env::current_exe().map_err(|e| e.to_string())?;
    // If running in development (e.g. target\debug\notch.exe), prefer release\notch.exe if it exists
    if cfg!(debug_assertions) {
        if let Some(project_root) = current
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
        {
            let release_exe = project_root.join("release").join("notch.exe");
            if release_exe.exists() {
                return Ok(release_exe);
            }
        }
    }
    Ok(current)
}

#[cfg(target_os = "windows")]
fn get_startup_shortcut_path() -> Option<std::path::PathBuf> {
    std::env::var("APPDATA").ok().map(|appdata| {
        std::path::Path::new(&appdata)
            .join("Microsoft")
            .join("Windows")
            .join("Start Menu")
            .join("Programs")
            .join("Startup")
            .join("Notch.lnk")
    })
}

#[cfg(target_os = "windows")]
fn create_startup_shortcut(exe_path: &std::path::Path) {
    if let Some(shortcut_path) = get_startup_shortcut_path() {
        if let Some(parent) = shortcut_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let work_dir = exe_path.parent().unwrap_or(exe_path);
        let script = format!(
            "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('{}'); $s.TargetPath = '{}'; $s.WorkingDirectory = '{}'; $s.Description = 'Notch Dynamic Island'; $s.Save()",
            shortcut_path.display(),
            exe_path.display(),
            work_dir.display(),
        );

        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &script])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();
    }
}

#[cfg(target_os = "windows")]
fn remove_startup_shortcut() {
    if let Some(shortcut_path) = get_startup_shortcut_path() {
        if shortcut_path.exists() {
            let _ = std::fs::remove_file(shortcut_path);
        }
    }
}

#[cfg(target_os = "windows")]
fn set_startup_approved(key_subpath: &str, value_name_str: &str, enabled: bool) {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY_CURRENT_USER, KEY_SET_VALUE,
        REG_BINARY, REG_OPTION_NON_VOLATILE,
    };

    let key_path: Vec<u16> = format!("{}\0", key_subpath).encode_utf16().collect();
    let value_name: Vec<u16> = format!("{}\0", value_name_str).encode_utf16().collect();
    let mut key = Default::default();

    unsafe {
        let open_res = RegCreateKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(key_path.as_ptr()),
            None,
            None,
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            None,
            &mut key,
            None,
        );
        if open_res.is_ok() {
            let first_byte: u8 = if enabled { 0x02 } else { 0x03 };
            let approved_bytes: [u8; 12] = [first_byte, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            let _ = RegSetValueExW(
                key,
                PCWSTR(value_name.as_ptr()),
                None,
                REG_BINARY,
                Some(&approved_bytes),
            );
            let _ = RegCloseKey(key);
        }
    }
}

#[cfg(target_os = "windows")]
pub fn is_auto_start_enabled() -> Result<bool, String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY_CURRENT_USER, KEY_QUERY_VALUE,
        REG_BINARY,
    };

    // 1. Check if Startup folder shortcut exists
    let shortcut_exists = get_startup_shortcut_path().map(|p| p.exists()).unwrap_or(false);

    // 2. Check if HKCU Run registry value exists
    let key_path: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Run\0".encode_utf16().collect();
    let value_name: Vec<u16> = "Notch\0".encode_utf16().collect();
    let mut key = Default::default();

    let mut run_key_exists = false;
    unsafe {
        let open_res = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(key_path.as_ptr()),
            None,
            KEY_QUERY_VALUE,
            &mut key,
        );
        if open_res.is_ok() {
            let query_res = RegQueryValueExW(
                key,
                PCWSTR(value_name.as_ptr()),
                None,
                None,
                None,
                None,
            );
            run_key_exists = query_res.is_ok();
            let _ = RegCloseKey(key);
        }
    }

    if !shortcut_exists && !run_key_exists {
        return Ok(false);
    }

    // 3. Check if Task Manager / Explorer explicitly disabled it (first byte == 0x03)
    let approved_path: Vec<u16> =
        "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run\0"
            .encode_utf16()
            .collect();
    let mut approved_key = Default::default();
    unsafe {
        let open_res = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(approved_path.as_ptr()),
            None,
            KEY_QUERY_VALUE,
            &mut approved_key,
        );
        if open_res.is_ok() {
            let mut data_type = Default::default();
            let mut buffer = [0u8; 12];
            let mut buffer_size = buffer.len() as u32;
            let query_res = RegQueryValueExW(
                approved_key,
                PCWSTR(value_name.as_ptr()),
                None,
                Some(&mut data_type),
                Some(buffer.as_mut_ptr()),
                Some(&mut buffer_size),
            );
            let _ = RegCloseKey(approved_key);
            if query_res.is_ok() && data_type == REG_BINARY && buffer_size > 0 && buffer[0] == 0x03 {
                return Ok(false);
            }
        }
    }

    Ok(true)
}

#[cfg(not(target_os = "windows"))]
pub fn is_auto_start_enabled() -> Result<bool, String> {
    Ok(false)
}

#[cfg(target_os = "windows")]
pub fn enable_auto_start() -> Result<(), String> {
    use std::mem::size_of;
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY_CURRENT_USER, KEY_SET_VALUE,
        REG_OPTION_NON_VOLATILE, REG_SZ,
    };

    let exe_path = get_target_executable_path()?;
    let executable_cmd = format!("\"{}\"", exe_path.display());

    // 1. Create Startup folder shortcut (guaranteed Task Manager presence & startup execution)
    create_startup_shortcut(&exe_path);

    // 2. Set Registry Run key
    let key_path: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Run\0".encode_utf16().collect();
    let value_name: Vec<u16> = "Notch\0".encode_utf16().collect();
    let value: Vec<u16> = executable_cmd.encode_utf16().chain(std::iter::once(0)).collect();
    let mut key = Default::default();

    unsafe {
        let value_bytes = std::slice::from_raw_parts(value.as_ptr() as *const u8, value.len() * size_of::<u16>());
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(key_path.as_ptr()),
            None,
            None,
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            None,
            &mut key,
            None,
        )
        .ok()
        .map_err(|error| error.to_string())?;

        let result = RegSetValueExW(
            key,
            PCWSTR(value_name.as_ptr()),
            None,
            REG_SZ,
            Some(value_bytes),
        );
        let _ = RegCloseKey(key);
        result.ok().map_err(|error| error.to_string())?;
    }

    // 3. Mark as Enabled in Windows Task Manager / Explorer StartupApproved
    set_startup_approved(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run",
        "Notch",
        true,
    );
    set_startup_approved(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder",
        "Notch.lnk",
        true,
    );

    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn enable_auto_start() -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn disable_auto_start() -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegDeleteValueW, HKEY_CURRENT_USER, KEY_SET_VALUE,
    };

    // 1. Remove Startup folder shortcut
    remove_startup_shortcut();

    // 2. Remove Registry Run key
    let key_path: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Run\0".encode_utf16().collect();
    let value_name: Vec<u16> = "Notch\0".encode_utf16().collect();
    let mut key = Default::default();

    unsafe {
        let open_res = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(key_path.as_ptr()),
            None,
            KEY_SET_VALUE,
            &mut key,
        );
        if open_res.is_ok() {
            let _ = RegDeleteValueW(key, PCWSTR(value_name.as_ptr()));
            let _ = RegCloseKey(key);
        }
    }

    // 3. Mark as Disabled in StartupApproved
    set_startup_approved(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run",
        "Notch",
        false,
    );
    set_startup_approved(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder",
        "Notch.lnk",
        false,
    );

    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn disable_auto_start() -> Result<(), String> {
    Ok(())
}

pub fn ensure_auto_start() -> Result<(), String> {
    if is_auto_start_enabled().unwrap_or(false) {
        enable_auto_start()
    } else {
        Ok(())
    }
}