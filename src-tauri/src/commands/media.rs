use crate::models::types::MediaSessionInfo;
use crate::services::media_host;

#[tauri::command]
pub fn media_toggle_play_pause() {
    media_host::toggle_play_pause();
}

#[tauri::command]
pub fn media_next_track() {
    media_host::next_track();
}

#[tauri::command]
pub fn media_prev_track() {
    media_host::prev_track();
}

#[tauri::command]
pub fn media_volume_up() {
    media_host::volume_up();
}

#[tauri::command]
pub fn media_volume_down() {
    media_host::volume_down();
}

#[tauri::command]
pub fn media_volume_mute() {
    media_host::volume_mute();
}

#[tauri::command]
pub fn media_seek(position_sec: u64) {
    media_host::seek_media(position_sec);
}

#[tauri::command]
pub fn media_focus_app() {
    media_host::focus_media_app();
}

#[tauri::command]
pub fn get_media_session_info() -> Option<MediaSessionInfo> {
    media_host::get_current_media_session().map(|s| MediaSessionInfo {
        title: s.title,
        artist: s.artist,
        album_title: s.album_title,
        is_playing: s.is_playing,
        duration_sec: s.duration_sec,
        current_sec: s.current_sec,
        album_art_base64: s.album_art_base64,
        position_ms: s.position_ms,
        duration_ms: s.duration_ms,
    })
}
