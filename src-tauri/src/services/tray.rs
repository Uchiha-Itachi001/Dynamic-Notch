pub fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();
    let quit_i = tauri::menu::MenuItem::with_id(handle, "quit", "Exit Notch", true, None::<&str>)?;
    let settings_i = tauri::menu::MenuItem::with_id(handle, "settings", "Settings...", true, None::<&str>)?;
    let menu = tauri::menu::Menu::with_items(handle, &[&settings_i, &quit_i])?;

    let icon = handle.default_window_icon()
        .ok_or("No default window icon found")?
        .clone();

    tauri::tray::TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "quit" => {
                    app.exit(0);
                }
                "settings" => {
                    let _ = crate::services::window_manager::open_settings_window(app);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let _ = crate::services::window_manager::open_settings_window(app);
            }
        })
        .build(handle)?;

    Ok(())
}
