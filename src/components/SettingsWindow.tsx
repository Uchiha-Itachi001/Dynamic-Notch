import { useState, useEffect } from "react";
import { emit } from "@tauri-apps/api/event";
import {
  Sliders,
  Eye,
  Music,
  Cpu,
  Info,
  Power,
  Keyboard,
  Sparkles,
  Volume2,
  Disc,
  Activity,
  Zap,
  ExternalLink,
  Check,
  Shield,
} from "lucide-react";
import { tauriBridge } from "../services/tauriBridge";
import { useSystemMetrics } from "../hooks/useSystemMetrics";
import "../styles/settings-window.css";

type SettingsCategory = "general" | "hover" | "media" | "hardware" | "about";

export function SettingsWindow() {
  const [activeTab, setActiveTab] = useState<SettingsCategory>("general");

  // State: Auto-start
  const [autoStart, setAutoStart] = useState<boolean>(false);
  const [autoStartLoading, setAutoStartLoading] = useState<boolean>(true);

  // State: Expand on hover
  const [expandOnHover, setExpandOnHover] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("notch_expand_on_hover");
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  // State: Peek Key
  const [peekKey, setPeekKey] = useState<"Shift" | "Control">(() => {
    try {
      const saved = localStorage.getItem("notch_peek_key");
      return saved === "Control" ? "Control" : "Shift";
    } catch {
      return "Shift";
    }
  });

  // State: Media background mode
  const [mediaBgMode, setMediaBgMode] = useState<"cover" | "tint" | "plain">(() => {
    try {
      const saved = localStorage.getItem("notch_media_background");
      return saved === "tint" || saved === "plain" || saved === "cover" ? saved : "cover";
    } catch {
      return "cover";
    }
  });

  // Live telemetry for previewing hardware status
  const systemMetrics = useSystemMetrics(activeTab === "hardware");

  // Load auto-start state from backend on mount
  useEffect(() => {
    tauriBridge.getAutoStartStatus().then((status) => {
      setAutoStart(status);
      setAutoStartLoading(false);
    });
  }, []);

  const handleToggleAutoStart = async () => {
    const nextVal = !autoStart;
    setAutoStart(nextVal);
    const success = await tauriBridge.setAutoStart(nextVal);
    if (!success) {
      setAutoStart(!nextVal);
    }
  };

  const handleToggleExpandOnHover = async () => {
    const nextVal = !expandOnHover;
    setExpandOnHover(nextVal);
    localStorage.setItem("notch_expand_on_hover", JSON.stringify(nextVal));
    await emit("notch-settings-updated", { key: "expandOnHover", value: nextVal });
  };

  const handleChangePeekKey = async (key: "Shift" | "Control") => {
    setPeekKey(key);
    localStorage.setItem("notch_peek_key", key);
    await tauriBridge.setNotchHoverActive(false, key);
    await emit("notch-settings-updated", { key: "peekKey", value: key });
  };

  const handleChangeMediaBgMode = async (mode: "cover" | "tint" | "plain") => {
    setMediaBgMode(mode);
    localStorage.setItem("notch_media_background", mode);
    await emit("notch-settings-updated", { key: "mediaBgMode", value: mode });
  };

  return (
    <div className="settings-window-container">
      {/* ── Left Sidebar ────────────────────────────────────────── */}
      <aside className="settings-sidebar">
        <div className="settings-sidebar-header">
          <div className="settings-app-logo">N</div>
          <div className="settings-app-meta">
            <span className="settings-app-title">Notch Settings</span>
            <span className="settings-app-version">Version 0.2.1</span>
          </div>
        </div>

        <nav className="settings-nav-list">
          <button
            className={`settings-nav-item ${activeTab === "general" ? "settings-nav-item--active" : ""}`}
            onClick={() => setActiveTab("general")}
          >
            <div className="settings-icon-squircle gradient-blue">
              <Sliders size={16} strokeWidth={2.4} />
            </div>
            <span className="settings-nav-label">General</span>
          </button>

          <button
            className={`settings-nav-item ${activeTab === "hover" ? "settings-nav-item--active" : ""}`}
            onClick={() => setActiveTab("hover")}
          >
            <div className="settings-icon-squircle gradient-green">
              <Eye size={16} strokeWidth={2.4} />
            </div>
            <span className="settings-nav-label">Hover & Peek</span>
          </button>

          <button
            className={`settings-nav-item ${activeTab === "media" ? "settings-nav-item--active" : ""}`}
            onClick={() => setActiveTab("media")}
          >
            <div className="settings-icon-squircle gradient-pink">
              <Music size={16} strokeWidth={2.4} />
            </div>
            <span className="settings-nav-label">Media & Island</span>
          </button>

          <button
            className={`settings-nav-item ${activeTab === "hardware" ? "settings-nav-item--active" : ""}`}
            onClick={() => setActiveTab("hardware")}
          >
            <div className="settings-icon-squircle gradient-orange">
              <Cpu size={16} strokeWidth={2.4} />
            </div>
            <span className="settings-nav-label">Telemetry & Rings</span>
          </button>

          <button
            className={`settings-nav-item ${activeTab === "about" ? "settings-nav-item--active" : ""}`}
            onClick={() => setActiveTab("about")}
          >
            <div className="settings-icon-squircle gradient-purple">
              <Info size={16} strokeWidth={2.4} />
            </div>
            <span className="settings-nav-label">About & Power</span>
          </button>
        </nav>

        <div className="settings-sidebar-footer">
          <div
            className="settings-quick-pill"
            onClick={() => tauriBridge.openWindowsSettings()}
            title="Open Windows 11 Settings App"
          >
            <span>Windows Settings</span>
            <ExternalLink size={12} strokeWidth={2} />
          </div>
        </div>
      </aside>

      {/* ── Right Content Area ──────────────────────────────────── */}
      <main className="settings-content">
        {/* ── SECTION: GENERAL ── */}
        {activeTab === "general" && (
          <>
            <div className="settings-header-section">
              <div className="settings-icon-squircle settings-icon-squircle--large gradient-blue">
                <Sliders size={20} strokeWidth={2.4} />
              </div>
              <div className="settings-header-text">
                <h1 className="settings-category-title">General Preferences</h1>
                <p className="settings-category-desc">Manage startup behavior and system integration.</p>
              </div>
            </div>

            <div className="settings-card-group">
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-left">
                    <div className="settings-icon-squircle gradient-blue">
                      <Power size={16} strokeWidth={2.4} />
                    </div>
                    <div className="settings-row-info">
                      <span className="settings-row-title">Launch on Windows Startup</span>
                      <span className="settings-row-desc">Automatically launch Notch when Windows starts up.</span>
                    </div>
                  </div>
                  <div className="settings-row-right">
                    <button
                      className={`settings-switch ${autoStart ? "settings-switch--active" : ""}`}
                      onClick={handleToggleAutoStart}
                      disabled={autoStartLoading}
                      aria-label="Toggle Auto-Start"
                    >
                      <div className="settings-switch-thumb" />
                    </button>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row-left">
                    <div className="settings-icon-squircle gradient-cyan">
                      <Sparkles size={16} strokeWidth={2.4} />
                    </div>
                    <div className="settings-row-info">
                      <span className="settings-row-title">Dynamic OSD Priority</span>
                      <span className="settings-row-desc">Volume, calls, and notifications temporarily take precedence over idle clock.</span>
                    </div>
                  </div>
                  <div className="settings-row-right">
                    <span className="settings-badge">Enabled</span>
                  </div>
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-left">
                    <div className="settings-icon-squircle gradient-purple">
                      <Shield size={16} strokeWidth={2.4} />
                    </div>
                    <div className="settings-row-info">
                      <span className="settings-row-title">Single Instance Protection</span>
                      <span className="settings-row-desc">Guarantees zero duplicate instances or thread collisions via Win32 named mutex.</span>
                    </div>
                  </div>
                  <div className="settings-row-right">
                    <span className="settings-badge">Active</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── SECTION: HOVER & PEEK ── */}
        {activeTab === "hover" && (
          <>
            <div className="settings-header-section">
              <div className="settings-icon-squircle settings-icon-squircle--large gradient-green">
                <Eye size={20} strokeWidth={2.4} />
              </div>
              <div className="settings-header-text">
                <h1 className="settings-category-title">Hover & Peek Interactions</h1>
                <p className="settings-category-desc">Configure gesture expansion timing and modifier key peek triggers.</p>
              </div>
            </div>

            <div className="settings-card-group">
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-left">
                    <div className="settings-icon-squircle gradient-green">
                      <Eye size={16} strokeWidth={2.4} />
                    </div>
                    <div className="settings-row-info">
                      <span className="settings-row-title">Expand on Mouse Hover</span>
                      <span className="settings-row-desc">Hovering over the compact notch smoothly expands it into full card view.</span>
                    </div>
                  </div>
                  <div className="settings-row-right">
                    <button
                      className={`settings-switch ${expandOnHover ? "settings-switch--active" : ""}`}
                      onClick={handleToggleExpandOnHover}
                      aria-label="Toggle Expand on Hover"
                    >
                      <div className="settings-switch-thumb" />
                    </button>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row-left">
                    <div className="settings-icon-squircle gradient-cyan">
                      <Keyboard size={16} strokeWidth={2.4} />
                    </div>
                    <div className="settings-row-info">
                      <span className="settings-row-title">Notch Peek Trigger Key</span>
                      <span className="settings-row-desc">Hold this modifier while cursor is near notch to glance without stealing app focus.</span>
                    </div>
                  </div>
                  <div className="settings-row-right">
                    <div className="settings-segmented">
                      <button
                        className={`settings-segmented-btn ${peekKey === "Shift" ? "settings-segmented-btn--active" : ""}`}
                        onClick={() => handleChangePeekKey("Shift")}
                      >
                        Shift
                      </button>
                      <button
                        className={`settings-segmented-btn ${peekKey === "Control" ? "settings-segmented-btn--active" : ""}`}
                        onClick={() => handleChangePeekKey("Control")}
                      >
                        Control
                      </button>
                    </div>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row-left">
                    <div className="settings-icon-squircle gradient-blue">
                      <Volume2 size={16} strokeWidth={2.4} />
                    </div>
                    <div className="settings-row-info">
                      <span className="settings-row-title">Hover-Scroll Master Volume</span>
                      <span className="settings-row-desc">Scroll mouse wheel anywhere over compact notch to adjust volume with inline feedback.</span>
                    </div>
                  </div>
                  <div className="settings-row-right">
                    <span className="settings-badge">Always Active</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── SECTION: MEDIA & ISLAND ── */}
        {activeTab === "media" && (
          <>
            <div className="settings-header-section">
              <div className="settings-icon-squircle settings-icon-squircle--large gradient-pink">
                <Music size={20} strokeWidth={2.4} />
              </div>
              <div className="settings-header-text">
                <h1 className="settings-category-title">Media & Dynamic Island</h1>
                <p className="settings-category-desc">Customize media player aesthetics, background blur, and track switching.</p>
              </div>
            </div>

            <div className="settings-card-group">
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-left">
                    <div className="settings-icon-squircle gradient-pink">
                      <Music size={16} strokeWidth={2.4} />
                    </div>
                    <div className="settings-row-info">
                      <span className="settings-row-title">Media Background Rendering</span>
                      <span className="settings-row-desc">Select how the album artwork interacts with the notch surface.</span>
                    </div>
                  </div>
                  <div className="settings-row-right">
                    <div className="settings-segmented">
                      <button
                        className={`settings-segmented-btn ${mediaBgMode === "cover" ? "settings-segmented-btn--active" : ""}`}
                        onClick={() => handleChangeMediaBgMode("cover")}
                      >
                        Cover Blur
                      </button>
                      <button
                        className={`settings-segmented-btn ${mediaBgMode === "tint" ? "settings-segmented-btn--active" : ""}`}
                        onClick={() => handleChangeMediaBgMode("tint")}
                      >
                        Tint
                      </button>
                      <button
                        className={`settings-segmented-btn ${mediaBgMode === "plain" ? "settings-segmented-btn--active" : ""}`}
                        onClick={() => handleChangeMediaBgMode("plain")}
                      >
                        OLED Plain
                      </button>
                    </div>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row-left">
                    <div className="settings-icon-squircle gradient-orange">
                      <Disc size={16} strokeWidth={2.4} />
                    </div>
                    <div className="settings-row-info">
                      <span className="settings-row-title">Smooth Song Crossfade Transitions</span>
                      <span className="settings-row-desc">3.2s retention buffer prevents dropout to clock/battery when changing tracks.</span>
                    </div>
                  </div>
                  <div className="settings-row-right">
                    <span className="settings-badge">Smooth Crossfade</span>
                  </div>
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-left">
                    <div className="settings-icon-squircle gradient-purple">
                      <Keyboard size={16} strokeWidth={2.4} />
                    </div>
                    <div className="settings-row-info">
                      <span className="settings-row-title">Media Hotkeys Reference</span>
                      <span className="settings-row-desc">Space / K (Play/Pause), Left/Right Arrows (Tracks), Up/Down (Volume), M (Mute).</span>
                    </div>
                  </div>
                  <div className="settings-row-right">
                    <span className="settings-badge">Enabled</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── SECTION: HARDWARE & TELEMETRY ── */}
        {activeTab === "hardware" && (
          <>
            <div className="settings-header-section">
              <div className="settings-icon-squircle settings-icon-squircle--large gradient-orange">
                <Cpu size={20} strokeWidth={2.4} />
              </div>
              <div className="settings-header-text">
                <h1 className="settings-category-title">Hardware Telemetry & Rings</h1>
                <p className="settings-category-desc">Live performance sensors, memory optimizer, and concentric activity rings.</p>
              </div>
            </div>

            <div className="settings-card-group">
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-left">
                    <div className="settings-icon-squircle gradient-orange">
                      <Cpu size={16} strokeWidth={2.4} />
                    </div>
                    <div className="settings-row-info">
                      <span className="settings-row-title">Processor Load</span>
                      <span className="settings-row-desc">Real-time CPU kernel load measurement.</span>
                    </div>
                  </div>
                  <div className="settings-row-right">
                    <span className="settings-badge">{systemMetrics?.cpu_percent ?? 0}% Load</span>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row-left">
                    <div className="settings-icon-squircle gradient-purple">
                      <Activity size={16} strokeWidth={2.4} />
                    </div>
                    <div className="settings-row-info">
                      <span className="settings-row-title">Physical Memory (RAM)</span>
                      <span className="settings-row-desc">
                        {((systemMetrics?.used_ram_mb ?? 0) / 1024).toFixed(1)} GB used of {((systemMetrics?.total_ram_mb ?? 16384) / 1024).toFixed(0)} GB
                      </span>
                    </div>
                  </div>
                  <div className="settings-row-right">
                    <span className="settings-badge">{systemMetrics?.ram_percent ?? 0}% Utilized</span>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row-left">
                    <div className="settings-icon-squircle gradient-green">
                      <Zap size={16} strokeWidth={2.4} />
                    </div>
                    <div className="settings-row-info">
                      <span className="settings-row-title">RAM Working Set Auto-Flush</span>
                      <span className="settings-row-desc">Native Win32 EmptyWorkingSet sweeps unneeded memory pages every 45s.</span>
                    </div>
                  </div>
                  <div className="settings-row-right">
                    <span className="settings-badge">Optimized</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── SECTION: ABOUT & POWER ── */}
        {activeTab === "about" && (
          <>
            <div className="settings-header-section">
              <div className="settings-icon-squircle settings-icon-squircle--large gradient-purple">
                <Info size={20} strokeWidth={2.4} />
              </div>
              <div className="settings-header-text">
                <h1 className="settings-category-title">About Notch</h1>
                <p className="settings-category-desc">System information, developer credits, and application management.</p>
              </div>
            </div>

            <div className="settings-card-group">
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-left">
                    <div className="settings-icon-squircle gradient-blue">
                      <Info size={16} strokeWidth={2.4} />
                    </div>
                    <div className="settings-row-info">
                      <span className="settings-row-title">Architecture</span>
                      <span className="settings-row-desc">Tauri 2.0 (Rust) + React 19 + TypeScript + Vite. Standalone zero-fluff notch.</span>
                    </div>
                  </div>
                  <div className="settings-row-right">
                    <span className="settings-badge">v0.2.1</span>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row-left">
                    <div className="settings-icon-squircle gradient-green">
                      <Check size={16} strokeWidth={2.4} />
                    </div>
                    <div className="settings-row-info">
                      <span className="settings-row-title">System Tray Notification Icon</span>
                      <span className="settings-row-desc">Persistent hidden icon in taskbar notification overflow area.</span>
                    </div>
                  </div>
                  <div className="settings-row-right">
                    <span className="settings-badge">Connected</span>
                  </div>
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-left">
                    <div className="settings-icon-squircle gradient-red">
                      <Power size={16} strokeWidth={2.4} />
                    </div>
                    <div className="settings-row-info">
                      <span className="settings-row-title">Exit Notch</span>
                      <span className="settings-row-desc">Completely terminate all background threads and release resources.</span>
                    </div>
                  </div>
                  <div className="settings-row-right">
                    <button
                      className="settings-btn settings-btn--danger"
                      onClick={() => tauriBridge.exitApp()}
                    >
                      Quit Notch
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
