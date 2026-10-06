use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SystemMetrics {
    pub ram_percent: u8,
    pub total_ram_mb: u64,
    pub used_ram_mb: u64,
    pub cpu_percent: u8,
    pub battery_percent: u8,
    pub is_charging: bool,
    pub has_battery: bool,
    pub net_recv_speed_bps: u64,
    pub net_sent_speed_bps: u64,
    pub net_recv_formatted: String,
    pub net_sent_formatted: String,
    pub net_type: String,
    #[serde(default)]
    pub gpu_percent: u8,
    #[serde(default)]
    pub storage_used_gb: u32,
    #[serde(default)]
    pub storage_total_gb: u32,
    #[serde(default)]
    pub uptime_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaSessionInfo {
    pub title: String,
    pub artist: String,
    pub album_title: Option<String>,
    pub is_playing: bool,
    pub duration_sec: u64,
    pub current_sec: u64,
    pub album_art_base64: Option<String>,
    #[serde(default)]
    pub position_ms: Option<u64>,
    #[serde(default)]
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BluetoothDevice {
    pub id: String,
    pub name: String,
    pub connected: bool,
    pub battery_percent: Option<u8>,
    pub device_type: String,
}

