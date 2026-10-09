use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Dwm::{
    DwmExtendFrameIntoClientArea, DwmSetWindowAttribute, DWMNCRP_DISABLED,
    DWMWA_NCRENDERING_POLICY, DWMWA_TRANSITIONS_FORCEDISABLED,
};
use windows::Win32::Graphics::Gdi::{CreateRectRgn, SetWindowRgn};
use windows::Win32::UI::Controls::MARGINS;
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongW, SetWindowLongW, SetWindowPos, SetWindowTextW, GWL_EXSTYLE, GWL_STYLE,
    HWND_TOPMOST, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
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
    IS_PEEK.store(peek, Ordering::Relaxed);
    update_region();
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

    let expanded = IS_EXPANDED.load(Ordering::Relaxed);
    let peek = IS_PEEK.load(Ordering::Relaxed);

    unsafe {
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

