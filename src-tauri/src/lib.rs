mod commands;
mod models;
mod services;

use tauri::Manager;

#[cfg(not(test))]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 1. Single-instance enforcement
    let mutex_name: Vec<u16> = "Global\\Notch_SingleInstance_Mutex\0".encode_utf16().collect();
    let _mutex = unsafe {
        windows::Win32::System::Threading::CreateMutexW(
            None,
            false,
            windows::core::PCWSTR(mutex_name.as_ptr()),
        )
    };
    if unsafe { windows::Win32::Foundation::GetLastError() }
        == windows::Win32::Foundation::ERROR_ALREADY_EXISTS
    {
        eprintln!("[notch] Another instance of Notch is already running. Exiting.");
        return;
    }

    // 2. Ensure WebView2 compositor initializes with transparent surface
    std::env::set_var("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "0");

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::media::media_toggle_play_pause,
            commands::media::media_next_track,
            commands::media::media_prev_track,
            commands::media::media_volume_up,
            commands::media::media_volume_down,
            commands::media::media_volume_mute,
            commands::media::media_seek,
            commands::media::media_focus_app,
            commands::media::get_media_session_info,
            commands::metrics::get_system_metrics,
            commands::bluetooth::get_bluetooth_devices,
            commands::system::set_microphone_muted,
            commands::window::set_notch_expanded,
            commands::window::set_notch_peek,
            commands::window::launch_app,
            commands::window::open_windows_settings,
            commands::window::power_action,
            commands::window::exit_app,
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            let mon_res = window.primary_monitor();
            let cur_res = window.current_monitor();
            let app_mon_res = app.primary_monitor();

            let monitor_opt = mon_res
                .ok()
                .flatten()
                .or_else(|| cur_res.ok().flatten())
                .or_else(|| app_mon_res.ok().flatten());

            let (pos_x, pos_y, width, height, scale_factor) = if let Some(monitor) = monitor_opt {
                let size = monitor.size();
                let pos = monitor.position();
                (
                    pos.x,
                    pos.y,
                    size.width as i32,
                    size.height as i32,
                    monitor.scale_factor(),
                )
            } else {
                unsafe {
                    use windows::Win32::UI::WindowsAndMessaging::{
                        GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN,
                    };
                    let w = GetSystemMetrics(SM_CXSCREEN);
                    let h = GetSystemMetrics(SM_CYSCREEN);
                    let sf = window.scale_factor().unwrap_or(1.0);
                    (0, 0, w, h, sf)
                }
            };

            if let Ok(hwnd) = window.hwnd() {
                let win32_hwnd = windows::Win32::Foundation::HWND(hwnd.0 as _);
                services::window_manager::init_window(
                    win32_hwnd,
                    pos_x,
                    pos_y,
                    width,
                    height,
                    scale_factor,
                );
            }

            services::media_host::start_watcher(app.handle().clone());
            services::bluetooth::start();
            services::system_events::start(app.handle().clone());
            services::activity::start(app.handle().clone());

            // Background RAM trimmer: flushes unused heap pages every 45s
            std::thread::spawn(|| {
                use windows::Win32::System::ProcessStatus::EmptyWorkingSet;
                use windows::Win32::System::Threading::GetCurrentProcess;
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(45));
                    unsafe {
                        let _ = EmptyWorkingSet(GetCurrentProcess());
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Notch");

    app.run(|_app_handle, _event| {});
}
