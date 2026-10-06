/// System Events Service
/// Polls Windows audio volume, mic mute state, and emits Tauri events.
/// Runs in a background thread every 300ms and only emits events on change.

use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[derive(Clone, serde::Serialize)]
pub struct VolumeChangedPayload {
    pub volume_pct: u8,   // 0-100
    pub muted: bool,
}

#[derive(Clone, serde::Serialize)]
pub struct MicStatusPayload {
    pub muted: bool,
}

/// WASAPI: get default render (speaker) endpoint scalar volume 0.0-1.0
/// Returns (volume_pct 0-100, is_muted)
#[cfg(target_os = "windows")]
fn get_speaker_volume() -> Option<(u8, bool)> {
    use windows::Win32::Media::Audio::{
        eRender, eConsole, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
    };

    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(
            &MMDeviceEnumerator,
            None,
            CLSCTX_INPROC_SERVER,
        ).ok()?;

        let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole).ok()?;
        let endpoint: IAudioEndpointVolume = device.Activate(CLSCTX_INPROC_SERVER, None).ok()?;

        let scalar = endpoint.GetMasterVolumeLevelScalar().ok()?;
        let muted = endpoint.GetMute().ok()?.as_bool();
        let pct = (scalar * 100.0).round().clamp(0.0, 100.0) as u8;
        Some((pct, muted))
    }
}

/// WASAPI: get default capture (microphone) endpoint mute state
#[cfg(target_os = "windows")]
fn get_mic_muted() -> Option<bool> {
    use windows::Win32::Media::Audio::{
        eCapture, eConsole, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
    };

    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(
            &MMDeviceEnumerator,
            None,
            CLSCTX_INPROC_SERVER,
        ).ok()?;

        let device = enumerator.GetDefaultAudioEndpoint(eCapture, eConsole).ok()?;
        let endpoint: IAudioEndpointVolume = device.Activate(CLSCTX_INPROC_SERVER, None).ok()?;
        let muted = endpoint.GetMute().ok()?.as_bool();
        Some(muted)
    }
}

/// Sets the default capture endpoint's mute state without shelling out. The
/// IPC surface is boolean-only, avoiding device names or command strings.
#[cfg(target_os = "windows")]
pub fn set_microphone_muted(muted: bool) -> Result<(), String> {
    use windows::Win32::Media::Audio::{
        eCapture, eConsole, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
    };

    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(
            &MMDeviceEnumerator,
            None,
            CLSCTX_INPROC_SERVER,
        ).map_err(|_| "Windows could not open the microphone.".to_string())?;
        let device = enumerator.GetDefaultAudioEndpoint(eCapture, eConsole)
            .map_err(|_| "No default microphone is available.".to_string())?;
        let endpoint: IAudioEndpointVolume = device.Activate(CLSCTX_INPROC_SERVER, None)
            .map_err(|_| "Windows could not control the microphone.".to_string())?;
        endpoint.SetMute(muted, std::ptr::null())
            .map_err(|_| "Windows could not change microphone mute.".to_string())?;
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn set_microphone_muted(_muted: bool) -> Result<(), String> {
    Err("Microphone controls are only available on Windows.".to_string())
}

pub fn start(app: AppHandle) {
    let last_vol = Arc::new(AtomicU8::new(255)); // sentinel: uninitialized
    let last_muted = Arc::new(AtomicU8::new(255)); // sentinel: uninitialized
    let last_mic_muted = Arc::new(AtomicU8::new(255)); // sentinel: uninitialized

    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(300));

            // ── Speaker volume + mute ──────────────────────────────────────
            #[cfg(target_os = "windows")]
            if let Some((pct, muted)) = get_speaker_volume() {
                let prev_vol = last_vol.load(Ordering::Relaxed);
                let prev_muted = last_muted.load(Ordering::Relaxed);

                // Capture the initial snapshot silently. A volume card should
                // only appear after an actual user or system change.
                if prev_vol == 255 {
                    last_vol.store(pct, Ordering::Relaxed);
                    last_muted.store(u8::from(muted), Ordering::Relaxed);
                } else if prev_vol != pct || prev_muted != u8::from(muted) {
                    last_vol.store(pct, Ordering::Relaxed);
                    last_muted.store(u8::from(muted), Ordering::Relaxed);

                    let _ = app.emit("volume-changed", VolumeChangedPayload {
                        volume_pct: pct,
                        muted,
                    });
                }
            }

            // ── Mic mute state ────────────────────────────────────────────
            #[cfg(target_os = "windows")]
            if let Some(mic_muted) = get_mic_muted() {
                let prev = last_mic_muted.load(Ordering::Relaxed);
                if prev == 255 {
                    last_mic_muted.store(u8::from(mic_muted), Ordering::Relaxed);
                } else if prev != u8::from(mic_muted) {
                    last_mic_muted.store(u8::from(mic_muted), Ordering::Relaxed);
                    let _ = app.emit("mic-status-changed", MicStatusPayload { muted: mic_muted });
                }
            }
        }
    });
}
