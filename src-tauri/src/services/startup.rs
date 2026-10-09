#[cfg(target_os = "windows")]
pub fn is_auto_start_enabled() -> Result<bool, String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY_CURRENT_USER, KEY_QUERY_VALUE,
    };

    let key_path: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Run\0".encode_utf16().collect();
    let value_name: Vec<u16> = "Notch\0".encode_utf16().collect();
    let mut key = Default::default();

    unsafe {
        let open_res = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(key_path.as_ptr()),
            None,
            KEY_QUERY_VALUE,
            &mut key,
        );
        if !open_res.is_ok() {
            return Ok(false);
        }

        let query_res = RegQueryValueExW(
            key,
            PCWSTR(value_name.as_ptr()),
            None,
            None,
            None,
            None,
        );
        let _ = RegCloseKey(key);
        Ok(query_res.is_ok())
    }
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

    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let executable = format!("\"{}\"", executable.display());
    let key_path: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Run\0".encode_utf16().collect();
    let value_name: Vec<u16> = "Notch\0".encode_utf16().collect();
    let value: Vec<u16> = executable.encode_utf16().chain(std::iter::once(0)).collect();
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
        result.ok().map_err(|error| error.to_string())
    }
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
        if !open_res.is_ok() {
            return Ok(());
        }

        let _ = RegDeleteValueW(key, PCWSTR(value_name.as_ptr()));
        let _ = RegCloseKey(key);
        Ok(())
    }
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