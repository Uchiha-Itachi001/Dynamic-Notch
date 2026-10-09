import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { SystemMetrics, MediaSessionInfo, BluetoothDevice } from "../types";

export interface DownloadActivity {
  active: boolean;
  filename: string;
  downloaded_bytes: number;
  total_bytes?: number | null;
  speed_bps: number;
  paused: boolean;
}

export const tauriBridge = {
  // Media controls
  getMediaSessionInfo: async (): Promise<MediaSessionInfo | null> => {
    try {
      return await invoke<MediaSessionInfo | null>("get_media_session_info");
    } catch (e) {
      console.error("getMediaSessionInfo error:", e);
      return null;
    }
  },

  onMediaSessionUpdated: (callback: (session: MediaSessionInfo | null) => void): Promise<UnlistenFn> => {
    return listen<MediaSessionInfo | null>("media-session-updated", (event) => {
      callback(event.payload);
    });
  },

  toggleMediaPlayPause: async (): Promise<void> => {
    try {
      await invoke("media_toggle_play_pause");
    } catch (e) {
      console.error("mediaTogglePlayPause error:", e);
    }
  },

  mediaNextTrack: async (): Promise<void> => {
    try {
      await invoke("media_next_track");
    } catch (e) {
      console.error("mediaNextTrack error:", e);
    }
  },

  mediaPrevTrack: async (): Promise<void> => {
    try {
      await invoke("media_prev_track");
    } catch (e) {
      console.error("mediaPrevTrack error:", e);
    }
  },

  mediaVolumeUp: async (): Promise<void> => {
    try {
      await invoke("media_volume_up");
    } catch (e) {
      console.error("mediaVolumeUp error:", e);
    }
  },

  mediaVolumeDown: async (): Promise<void> => {
    try {
      await invoke("media_volume_down");
    } catch (e) {
      console.error("mediaVolumeDown error:", e);
    }
  },

  mediaVolumeMute: async (): Promise<void> => {
    try {
      await invoke("media_volume_mute");
    } catch (e) {
      console.error("mediaVolumeMute error:", e);
    }
  },

  mediaSeek: async (positionSec: number): Promise<void> => {
    try {
      await invoke("media_seek", { positionSec });
    } catch (e) {
      console.error("mediaSeek error:", e);
    }
  },

  focusMediaApp: async (): Promise<void> => {
    try {
      await invoke("media_focus_app");
    } catch (e) {
      console.error("focusMediaApp error:", e);
    }
  },

  // System metrics
  getSystemMetrics: async (): Promise<SystemMetrics> => {
    try {
      return await invoke<SystemMetrics>("get_system_metrics");
    } catch (e) {
      console.error("getSystemMetrics error:", e);
      return {
        ram_percent: 45,
        total_ram_mb: 16384,
        used_ram_mb: 7372,
        cpu_percent: 12,
        battery_percent: 100,
        is_charging: true,
        has_battery: true,
        net_recv_speed_bps: 0,
        net_sent_speed_bps: 0,
        net_recv_formatted: "0 B/s",
        net_sent_formatted: "0 B/s",
        net_type: "wifi",
        gpu_percent: 6,
        storage_used_gb: 220,
        storage_total_gb: 512,
      };
    }
  },

  getBluetoothDevices: async (): Promise<BluetoothDevice[]> => {
    try {
      return await invoke<BluetoothDevice[]>("get_bluetooth_devices");
    } catch (e) {
      console.error("getBluetoothDevices error:", e);
      return [];
    }
  },

  // Microphone


  setMicrophoneMuted: async (muted: boolean): Promise<boolean> => {
    try {
      await invoke("set_microphone_muted", { muted });
      return true;
    } catch (e) {
      console.error("setMicrophoneMuted error:", e);
      return false;
    }
  },

  // Dynamic notch window expansion & peek
  setNotchExpanded: async (expanded: boolean): Promise<void> => {
    try {
      await invoke("set_notch_expanded", { expanded });
    } catch (e) {
      console.error("setNotchExpanded error:", e);
    }
  },

  setNotchPeek: async (peek: boolean): Promise<void> => {
    try {
      await invoke("set_notch_peek", { peek });
    } catch (e) {
      console.error("setNotchPeek error:", e);
    }
  },

  launchApp: async (cmd: string): Promise<void> => {
    try {
      await invoke("launch_app", { cmd });
    } catch (e) {
      console.error("launchApp error:", e);
    }
  },

  openWindowsSettings: async (): Promise<void> => {
    try {
      await invoke("open_windows_settings");
    } catch (e) {
      console.error("openWindowsSettings error:", e);
    }
  },

  powerAction: async (action: "lock" | "sleep" | "restart" | "shutdown"): Promise<void> => {
    try {
      await invoke("power_action", { action });
    } catch (e) {
      console.error("powerAction error:", e);
    }
  },

  exitApp: async (): Promise<void> => {
    try {
      await invoke("exit_app");
    } catch (e) {
      console.error("exitApp error:", e);
      window.close();
    }
  },

  getAutoStartStatus: async (): Promise<boolean> => {
    try {
      return await invoke<boolean>("get_auto_start_status");
    } catch (e) {
      console.error("getAutoStartStatus error:", e);
      return false;
    }
  },

  setAutoStart: async (enabled: boolean): Promise<boolean> => {
    try {
      await invoke("set_auto_start", { enabled });
      return true;
    } catch (e) {
      console.error("setAutoStart error:", e);
      return false;
    }
  },

  // System event listeners (Rust → Frontend)
  onVolumeChanged: (callback: (payload: { volume_pct: number; muted: boolean }) => void): Promise<UnlistenFn> => {
    return listen<{ volume_pct: number; muted: boolean }>("volume-changed", (event) => {
      callback(event.payload);
    });
  },

  onMicStatusChanged: (callback: (payload: { muted: boolean }) => void): Promise<UnlistenFn> => {
    return listen<{ muted: boolean }>("mic-status-changed", (event) => {
      callback(event.payload);
    });
  },

  onCameraStatusChanged: (callback: (payload: { active: boolean }) => void): Promise<UnlistenFn> => {
    return listen<{ active: boolean }>("camera-status-changed", (event) => {
      callback(event.payload);
    });
  },

  onDownloadUpdated: (callback: (payload: DownloadActivity) => void): Promise<UnlistenFn> => {
    return listen<DownloadActivity>("download-updated", (event) => {
      callback(event.payload);
    });
  },
};

