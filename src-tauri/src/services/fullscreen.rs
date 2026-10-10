use tauri::Emitter;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetAncestor, GetClassNameW, GetDesktopWindow, GetForegroundWindow, GetShellWindow,
    GetWindowLongW, GetWindowRect, IsIconic, IsWindow, IsWindowVisible, GA_ROOTOWNER, GWL_STYLE,
    WS_CAPTION,
};

pub fn start(app_handle: tauri::AppHandle) {
    std::thread::Builder::new()
        .name("fullscreen-watcher".to_string())
        .spawn(move || {
            loop {
                std::thread::sleep(std::time::Duration::from_millis(200));

                let notch_hwnd = match super::window_manager::get_notch_hwnd() {
                    Some(h) => h,
                    None => continue,
                };

                let is_fs = unsafe { check_foreground_fullscreen(notch_hwnd) };
                let current_suppressed = super::window_manager::is_fullscreen_suppressed();

                if is_fs != current_suppressed {
                    super::window_manager::set_fullscreen_suppressed(is_fs);
                    let _ = app_handle.emit("fullscreen-app-changed", is_fs);
                }
            }
        })
        .expect("failed to spawn fullscreen watcher thread");
}

unsafe fn check_foreground_fullscreen(notch_hwnd: HWND) -> bool {
    let fg = GetForegroundWindow();
    if fg.0.is_null() {
        return false;
    }

    // Resolve root owner so child popups/context menus in fullscreen apps don't trigger flash unhide
    let root = GetAncestor(fg, GA_ROOTOWNER);
    let target = if !root.0.is_null() && IsWindow(Some(root)).as_bool() {
        root
    } else {
        fg
    };

    // Never suppress or unsuppress based on the Notch window itself
    if target == notch_hwnd || fg == notch_hwnd {
        return super::window_manager::is_fullscreen_suppressed();
    }

    // Target must be a valid, visible, non-minimized window
    if !IsWindow(Some(target)).as_bool() || !IsWindowVisible(target).as_bool() || IsIconic(target).as_bool() {
        return false;
    }

    // Ignore Windows desktop and shell windows
    let shell = GetShellWindow();
    let desktop = GetDesktopWindow();
    if fg == shell || fg == desktop || target == shell || target == desktop {
        return false;
    }

    // Ignore cloaked windows (suspended UWP apps, virtual desktop background windows)
    let mut cloaked: u32 = 0;
    let hr = DwmGetWindowAttribute(
        target,
        DWMWA_CLOAKED,
        &mut cloaked as *mut _ as *mut _,
        std::mem::size_of::<u32>() as u32,
    );
    if hr.is_ok() && cloaked != 0 {
        return false;
    }

    // Ignore desktop background and taskbar classes
    let mut class_buf = [0u16; 256];
    let len = GetClassNameW(target, &mut class_buf);
    if len > 0 {
        let class_name = String::from_utf16_lossy(&class_buf[..len as usize]);
        if matches!(
            class_name.as_str(),
            "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd"
        ) {
            return false;
        }
    }

    // Determine which monitor the target window is on
    let hmon = MonitorFromWindow(target, MONITOR_DEFAULTTONEAREST);
    if hmon.0.is_null() {
        return false;
    }

    let mut mi = MONITORINFO {
        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    if !GetMonitorInfoW(hmon, &mut mi).as_bool() {
        return false;
    }

    // If Notch monitor is known, only hide when the fullscreen window is on the same monitor
    if let Some((mon_x, mon_y, _, _)) = super::window_manager::get_notch_monitor() {
        let is_same_monitor = mi.rcMonitor.left == mon_x && mi.rcMonitor.top == mon_y;
        if !is_same_monitor {
            return false;
        }
    }

    let mut target_rect = RECT::default();
    if GetWindowRect(target, &mut target_rect).is_err() {
        return false;
    }

    let m = mi.rcMonitor;
    // Check if the target window completely covers the monitor
    let covers_monitor = target_rect.left <= m.left
        && target_rect.top <= m.top
        && target_rect.right >= m.right
        && target_rect.bottom >= m.bottom;

    if !covers_monitor {
        return false;
    }

    // Edge case: Auto-hidden taskbar (rcWork == rcMonitor).
    // In that configuration, regular maximized windows have WS_CAPTION (title bar).
    // True fullscreen applications (movies, video players, games, photo viewers) strip WS_CAPTION.
    let w = mi.rcWork;
    let taskbar_auto_hidden =
        w.left == m.left && w.top == m.top && w.right == m.right && w.bottom == m.bottom;
    if taskbar_auto_hidden {
        let style = GetWindowLongW(target, GWL_STYLE) as u32;
        let has_caption = (style & WS_CAPTION.0) == WS_CAPTION.0;
        if has_caption {
            return false;
        }
    }

    true
}
