use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::{HWND, POINT};
use windows::Win32::Graphics::Dwm::{
    DwmExtendFrameIntoClientArea, DwmSetWindowAttribute, DWMNCRP_DISABLED,
    DWMWA_NCRENDERING_POLICY, DWMWA_TRANSITIONS_FORCEDISABLED,
};
use windows::Win32::Graphics::Gdi::{CreateRectRgn, SetWindowRgn};
use windows::Win32::UI::Controls::MARGINS;
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_SHIFT};
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetWindowLongW, SetWindowLongW, SetWindowPos, SetWindowTextW, ShowWindow,
    GWL_EXSTYLE, GWL_STYLE, HWND_TOPMOST, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    SW_HIDE, SW_SHOWNOACTIVATE,
    WS_BORDER, WS_CAPTION, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW, WS_MAXIMIZEBOX,
    WS_MINIMIZEBOX, WS_POPUP, WS_SYSMENU, WS_THICKFRAME, WS_VISIBLE,
};

#[derive(Clone, Copy, Debug)]
#[allow(dead_code)]
pub struct NotchWindowConfig {
    pub hwnd: isize,
    pub monitor_x: i32,
    pub monitor_y: i32,
    pub monitor_w: i32,
    pub monitor_h: i32,
    pub scale_factor: f64,
}

static NOTCH_CONFIG: Mutex<Option<NotchWindowConfig>> = Mutex::new(None);
static IS_EXPANDED: AtomicBool = AtomicBool::new(false);
static IS_PEEK: AtomicBool = AtomicBool::new(false);
static IS_FULLSCREEN_SUPPRESSED: AtomicBool = AtomicBool::new(false);
static HOVER_SESSION_ID: AtomicU64 = AtomicU64::new(0);
static CURRENT_PEEK_KEY: Mutex<String> = Mutex::new(String::new());

unsafe extern "system" fn notch_subclass_proc(
    hwnd: windows::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
    _uidsubclass: usize,
    _refdata: usize,
) -> windows::Win32::Foundation::LRESULT {
    match msg {
        // Prevent Windows DWM from painting non-client caption bar on window focus/activation
        windows::Win32::UI::WindowsAndMessaging::WM_NCACTIVATE => {
            windows::Win32::Foundation::LRESULT(1)
        }
        windows::Win32::UI::WindowsAndMessaging::WM_NCPAINT => {
            windows::Win32::Foundation::LRESULT(0)
        }
        windows::Win32::UI::WindowsAndMessaging::WM_SETTEXT => {
            windows::Win32::Foundation::LRESULT(1)
        }
        windows::Win32::UI::WindowsAndMessaging::WM_ERASEBKGND => {
            windows::Win32::Foundation::LRESULT(1)
        }
        _ => windows::Win32::UI::Shell::DefSubclassProc(hwnd, msg, wparam, lparam),
    }
}

pub fn init_window(
    hwnd: HWND,
    monitor_x: i32,
    monitor_y: i32,
    monitor_w: i32,
    monitor_h: i32,
    scale_factor: f64,
) {
    let config = NotchWindowConfig {
        hwnd: hwnd.0 as isize,
        monitor_x,
        monitor_y,
        monitor_w,
        monitor_h,
        scale_factor,
    };

    if let Ok(mut guard) = NOTCH_CONFIG.lock() {
        *guard = Some(config);
    }

    unsafe {
        // Strip caption, borders, sysmenu, maximize/minimize boxes
        let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
        let clean = (style
            & !(WS_CAPTION.0
                | WS_SYSMENU.0
                | WS_BORDER.0
                | WS_THICKFRAME.0
                | WS_MINIMIZEBOX.0
                | WS_MAXIMIZEBOX.0))
            | WS_POPUP.0
            | WS_VISIBLE.0;
        SetWindowLongW(hwnd, GWL_STYLE, clean as i32);

        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        let clean_ex = (ex_style & !WS_EX_APPWINDOW.0) | WS_EX_TOOLWINDOW.0;
        SetWindowLongW(hwnd, GWL_EXSTYLE, clean_ex as i32);

        // Disable DWM non-client rendering policy and transition animations
        let policy = DWMNCRP_DISABLED.0 as u32;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_NCRENDERING_POLICY,
            &policy as *const _ as *const _,
            std::mem::size_of::<u32>() as u32,
        );

        let disable_trans: u32 = 1;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_TRANSITIONS_FORCEDISABLED,
            &disable_trans as *const _ as *const _,
            std::mem::size_of::<u32>() as u32,
        );

        // 100% transparent glass frame (-1 margins)
        let margins = MARGINS {
            cxLeftWidth: -1,
            cxRightWidth: -1,
            cyTopHeight: -1,
            cyBottomHeight: -1,
        };
        let _ = DwmExtendFrameIntoClientArea(hwnd, &margins);

        // Blank window title
        let empty_title: Vec<u16> = vec![0];
        let _ = SetWindowTextW(hwnd, windows::core::PCWSTR(empty_title.as_ptr()));

        // Subclass window to drop WM_NCACTIVATE, WM_NCPAINT, WM_SETTEXT, WM_ERASEBKGND
        let _ = windows::Win32::UI::Shell::SetWindowSubclass(
            hwnd,
            Some(notch_subclass_proc),
            101,
            0,
        );

        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            monitor_x,
            monitor_y,
            monitor_w,
            monitor_h,
            SWP_FRAMECHANGED | SWP_NOACTIVATE,
        );

        update_region();
    }
}

pub fn set_expanded(expanded: bool) {
    IS_EXPANDED.store(expanded, Ordering::Relaxed);
    update_region();
}

pub fn set_peek(peek: bool) {
    let prev = IS_PEEK.swap(peek, Ordering::Relaxed);
    if prev != peek {
        update_region();
    }
}

pub fn set_hover_active(app: AppHandle, hovered: bool, peek_key: String) {
    if let Ok(mut guard) = CURRENT_PEEK_KEY.lock() {
        *guard = peek_key;
    }

    if hovered {
        let session_id = HOVER_SESSION_ID.fetch_add(1, Ordering::SeqCst) + 1;
        std::thread::Builder::new()
            .name("notch-peek-watcher".to_string())
            .spawn(move || {
                run_peek_watcher(app, session_id);
            })
            .ok();
    } else {
        // Invalidate any active hover watcher session
        HOVER_SESSION_ID.fetch_add(1, Ordering::SeqCst);
        if IS_PEEK.swap(false, Ordering::Relaxed) {
            update_region();
            let _ = app.emit("notch-peek-changed", false);
        }
    }
}

fn run_peek_watcher(app: AppHandle, session_id: u64) {
    let mut last_key_down = false;

    while HOVER_SESSION_ID.load(Ordering::SeqCst) == session_id {
        let key_str = CURRENT_PEEK_KEY
            .lock()
            .map(|g| g.clone())
            .unwrap_or_else(|_| "Shift".to_string());

        let vkey = match key_str.as_str() {
            "Control" | "Ctrl" => VK_CONTROL.0 as i32,
            _ => VK_SHIFT.0 as i32,
        };

        // 1. Check global physical key state (pure non-action modifiers only)
        let key_is_down = unsafe { (GetAsyncKeyState(vkey) as u16 & 0x8000) != 0 };
        last_key_down = key_is_down;

        // 2. Check cursor position relative to notch
        let mut pt = POINT::default();
        let cursor_ok = unsafe { GetCursorPos(&mut pt).is_ok() };

        let cursor_over_notch = if cursor_ok {
            if let Ok(guard) = NOTCH_CONFIG.lock() {
                if let Some(c) = *guard {
                    let scale = c.scale_factor;
                    let notch_w = (204.0 * scale).round() as i32;
                    let notch_h = (34.0 * scale).round() as i32;
                    let notch_left = c.monitor_x + ((c.monitor_w - notch_w) / 2).max(0);
                    let notch_right = notch_left + notch_w;
                    let notch_top = c.monitor_y;
                    let notch_bottom = notch_top + notch_h;

                    // Generous 20px hit-test buffer around compact notch
                    pt.x >= (notch_left - 20)
                        && pt.x <= (notch_right + 20)
                        && pt.y >= (notch_top - 5)
                        && pt.y <= (notch_bottom + 20)
                } else {
                    true
                }
            } else {
                true
            }
        } else {
            true
        };

        // If card was explicitly expanded, don't interfere with expanded mode
        if IS_EXPANDED.load(Ordering::Relaxed) {
            if IS_PEEK.swap(false, Ordering::Relaxed) {
                update_region();
                let _ = app.emit("notch-peek-changed", false);
            }
            std::thread::sleep(std::time::Duration::from_millis(30));
            continue;
        }

        let was_peek = IS_PEEK.load(Ordering::Relaxed);

        if key_is_down && !was_peek {
            // User pressed peek key while hovering -> empty window region (100% click-through)
            IS_PEEK.store(true, Ordering::Relaxed);
            update_region();
            let _ = app.emit("notch-peek-changed", true);
        } else if !key_is_down && was_peek {
            // User released peek key -> restore compact window region
            IS_PEEK.store(false, Ordering::Relaxed);
            update_region();
            let _ = app.emit("notch-peek-changed", false);

            // Re-assert hover state so cursor remains active over the notch
            let _ = app.emit("notch-hover-state", cursor_over_notch);
        }

        // If key is released and cursor has departed the notch, disarm only this exact session
        if !key_is_down && !cursor_over_notch {
            let _ = HOVER_SESSION_ID.compare_exchange(
                session_id,
                session_id.wrapping_add(1),
                Ordering::SeqCst,
                Ordering::Relaxed,
            );
            let _ = app.emit("notch-hover-state", false);
            break;
        }

        std::thread::sleep(std::time::Duration::from_millis(16)); // ~60fps responsive polling
    }

    if HOVER_SESSION_ID.load(Ordering::SeqCst) == session_id || !last_key_down {
        if IS_PEEK.swap(false, Ordering::Relaxed) {
            update_region();
            let _ = app.emit("notch-peek-changed", false);
        }
    }
}

pub fn set_fullscreen_suppressed(suppressed: bool) {
    let prev = IS_FULLSCREEN_SUPPRESSED.swap(suppressed, Ordering::Relaxed);
    if prev != suppressed {
        update_region();
    }
}

pub fn is_fullscreen_suppressed() -> bool {
    IS_FULLSCREEN_SUPPRESSED.load(Ordering::Relaxed)
}

pub fn get_notch_hwnd() -> Option<HWND> {
    if let Ok(guard) = NOTCH_CONFIG.lock() {
        if let Some(c) = *guard {
            return Some(HWND(c.hwnd as *mut _));
        }
    }
    None
}

pub fn get_notch_monitor() -> Option<(i32, i32, i32, i32)> {
    if let Ok(guard) = NOTCH_CONFIG.lock() {
        if let Some(c) = *guard {
            return Some((c.monitor_x, c.monitor_y, c.monitor_w, c.monitor_h));
        }
    }
    None
}

pub fn update_region() {
    let config = match NOTCH_CONFIG.lock() {
        Ok(guard) => match *guard {
            Some(c) => c,
            None => return,
        },
        Err(_) => return,
    };

    let hwnd = HWND(config.hwnd as *mut _);
    let monitor_w = config.monitor_w;
    let monitor_h = config.monitor_h;
    let scale = config.scale_factor;

    let suppressed = IS_FULLSCREEN_SUPPRESSED.load(Ordering::Relaxed);
    let expanded = IS_EXPANDED.load(Ordering::Relaxed);
    let peek = IS_PEEK.load(Ordering::Relaxed);

    unsafe {
        if suppressed {
            // Fullscreen application active (movie, video, photo viewer, game):
            // Fully hide notch window and set 0 region so it never blocks the screen
            let rgn_empty = CreateRectRgn(0, 0, 0, 0);
            let _ = SetWindowRgn(hwnd, Some(rgn_empty), false);
            let _ = ShowWindow(hwnd, SW_HIDE);
            return;
        }

        // Restore window visibility without stealing focus from active application
        let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);

        let mut client_rect = windows::Win32::Foundation::RECT::default();
        let _ = windows::Win32::UI::WindowsAndMessaging::GetClientRect(hwnd, &mut client_rect);
        let actual_w = if client_rect.right > client_rect.left {
            client_rect.right - client_rect.left
        } else {
            monitor_w
        };
        let actual_h = if client_rect.bottom > client_rect.top {
            client_rect.bottom - client_rect.top
        } else {
            monitor_h
        };

        if peek {
            // When peek-through is active (hover + Shift), window region is empty (100% click-through)
            let rgn_empty = CreateRectRgn(0, 0, 0, 0);
            let _ = SetWindowRgn(hwnd, Some(rgn_empty), true);
        } else if expanded {
            // Re-assert HWND_TOPMOST so expanded notch is always above all windows
            let _ = SetWindowPos(
                hwnd,
                Some(HWND_TOPMOST),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );

            // Expanded: capture full monitor for backdrop click-to-dismiss
            let rgn_full = CreateRectRgn(0, 0, actual_w, actual_h);
            let _ = SetWindowRgn(hwnd, Some(rgn_full), true);
        } else {
            // Re-assert HWND_TOPMOST in compact resting state
            let _ = SetWindowPos(
                hwnd,
                Some(HWND_TOPMOST),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );

            // Compact Notch resting mode:
            // Centered top notch closely hugging the compact pill (~148-180px width + 8px ears + small buffer)
            // Leaves 100% of adjacent window tabs, minimize/maximize buttons, and desktop click-through!
            let notch_w = (204.0 * scale).round() as i32;
            let notch_h = (32.0 * scale).round() as i32;
            let notch_left = ((actual_w - notch_w) / 2).max(0);
            let notch_right = (notch_left + notch_w).min(actual_w);

            let rgn_notch = CreateRectRgn(notch_left, 0, notch_right, notch_h);
            let _ = SetWindowRgn(hwnd, Some(rgn_notch), true);
        }
    }
}


