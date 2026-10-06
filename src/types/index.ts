export interface SystemMetrics {
  ram_percent: number;
  total_ram_mb: number;
  used_ram_mb: number;
  cpu_percent: number;
  battery_percent: number;
  is_charging: boolean;
  has_battery: boolean;
  net_recv_speed_bps: number;
  net_sent_speed_bps: number;
  net_recv_formatted: string;
  net_sent_formatted: string;
  net_type: string;
  gpu_percent?: number;
  storage_used_gb?: number;
  storage_total_gb?: number;
  uptime_seconds?: number;
}

export interface MediaSessionInfo {
  title: string;
  artist: string;
  album_title?: string;
  is_playing: boolean;
  duration_sec: number;
  current_sec: number;
  album_art_base64?: string;
  position_ms?: number;
  duration_ms?: number;
}

export interface TrackColorTheme {
  waveColor: string;
  waveGradient: string;
  waveGradientTop: string;
  waveGradientBottom: string;
  glowColor: string;
}

export interface BluetoothDevice {
  id: string;
  name: string;
  connected: boolean;
  battery_percent?: number | null;
  device_type?: "audio" | "peripheral" | "phone" | "other" | string;
}

