//! Read-only Windows activity detectors for features that do not offer a
//! desktop event stream. The service never controls another application.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};
use tauri::{AppHandle, Emitter};

#[derive(Clone, serde::Serialize)]
struct CameraStatusPayload {
    active: bool,
}

#[derive(Clone, serde::Serialize)]
struct DownloadPayload {
    active: bool,
    filename: String,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    speed_bps: u64,
    paused: bool,
}

#[derive(Clone)]
struct DownloadSample {
    path: PathBuf,
    filename: String,
    size: u64,
    modified: SystemTime,
}

const CREATE_NO_WINDOW: u32 = 0x08000000;

fn camera_is_active() -> Option<bool> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    // CapabilityAccessManager powers the Windows privacy indicator. An access
    // session is live when its last start time has no later stop time.
    const SCRIPT: &str = r#"
$root = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam'
$active = $false
if (Test-Path -LiteralPath $root) {
  Get-ChildItem -LiteralPath $root -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    $p = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
    $start = [int64]($p.LastUsedTimeStart)
    $stop = [int64]($p.LastUsedTimeStop)
    if ($start -gt 0 -and $start -gt $stop) { $script:active = $true }
  }
}
if ($active) { '1' } else { '0' }
"#;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;

    match String::from_utf8_lossy(&output.stdout).trim() {
        "1" => Some(true),
        "0" => Some(false),
        _ => None,
    }
}

fn downloads_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").map(|profile| PathBuf::from(profile).join("Downloads"))
}

fn is_partial_download(path: &Path) -> bool {
    let name = path.file_name().and_then(|name| name.to_str()).unwrap_or("").to_ascii_lowercase();
    [".crdownload", ".part", ".partial", ".download", ".downloading"]
        .iter()
        .any(|suffix| name.ends_with(suffix))
}

fn display_name(path: &Path) -> String {
    let raw = path.file_name().and_then(|name| name.to_str()).unwrap_or("Download");
    for suffix in [".crdownload", ".partial", ".downloading", ".download", ".part"] {
        if let Some(name) = raw.strip_suffix(suffix) {
            return name.to_string();
        }
    }
    raw.to_string()
}

fn newest_partial_download() -> Option<DownloadSample> {
    let directory = downloads_dir()?;
    let mut newest: Option<DownloadSample> = None;

    for entry in fs::read_dir(directory).ok()?.flatten() {
        let path = entry.path();
        if !path.is_file() || !is_partial_download(&path) {
            continue;
        }
        let metadata = entry.metadata().ok()?;
        let sample = DownloadSample {
            filename: display_name(&path),
            path,
            size: metadata.len(),
            modified: metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH),
        };
        if newest.as_ref().map(|existing| sample.modified > existing.modified).unwrap_or(true) {
            newest = Some(sample);
        }
    }
    newest
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let mut camera_state: Option<bool> = None;
        let mut last_camera_check = Instant::now() - Duration::from_secs(10);
        let mut prior_sizes: HashMap<PathBuf, (u64, Instant)> = HashMap::new();
        let mut last_download_path: Option<PathBuf> = None;

        loop {
            let now = Instant::now();

            if now.duration_since(last_camera_check) >= Duration::from_secs(2) {
                last_camera_check = now;
                if let Some(active) = camera_is_active() {
                    if camera_state != Some(active) {
                        camera_state = Some(active);
                        let _ = app.emit("camera-status-changed", CameraStatusPayload { active });
                    }
                }
            }

            if let Some(sample) = newest_partial_download() {
                let (previous_size, previous_at) = prior_sizes
                    .get(&sample.path)
                    .copied()
                    .unwrap_or((sample.size, now));
                let elapsed = now.duration_since(previous_at).as_secs_f64().max(0.001);
                let speed_bps = sample.size.saturating_sub(previous_size) as f64 / elapsed;
                let paused = sample.size == previous_size && previous_at != now;
                prior_sizes.insert(sample.path.clone(), (sample.size, now));
                last_download_path = Some(sample.path);
                let _ = app.emit("download-updated", DownloadPayload {
                    active: true,
                    filename: sample.filename,
                    downloaded_bytes: sample.size,
                    total_bytes: None,
                    speed_bps: speed_bps.round() as u64,
                    paused,
                });
            } else if last_download_path.take().is_some() {
                prior_sizes.clear();
                let _ = app.emit("download-updated", DownloadPayload {
                    active: false,
                    filename: String::new(),
                    downloaded_bytes: 0,
                    total_bytes: None,
                    speed_bps: 0,
                    paused: false,
                });
            }

            std::thread::sleep(Duration::from_millis(900));
        }
    });
}
