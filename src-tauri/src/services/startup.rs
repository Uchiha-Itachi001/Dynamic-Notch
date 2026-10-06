#[cfg(all(target_os = "windows", not(debug_assertions)))]
pub fn ensure_auto_start() -> Result<(), String> {
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
            0,
            None,
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            None,
            &mut key,
            None,
        )
            .map_err(|error| error.to_string())?;
        let result = RegSetValueExW(key, PCWSTR(value_name.as_ptr()), 0, REG_SZ, Some(value_bytes));
        let _ = RegCloseKey(key);
        result.map_err(|error| error.to_string())
    }
}

#[cfg(any(not(target_os = "windows"), debug_assertions))]
pub fn ensure_auto_start() -> Result<(), String> {
    Ok(())
}