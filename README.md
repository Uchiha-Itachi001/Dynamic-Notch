# Dynamic Notch

A lightweight, standalone Windows Dynamic Island built with **Rust (Tauri 2.0)** and **React 19**. Extracted directly from Glace with zero extra baggage (no taskbar, no start menu, no flyouts).

## Features

- **Media Notch (When Media is Playing)**:
  - Compact pill showing live album artwork thumbnail, track title, and real-time equalizer soundwave bars with dynamic palette coloring extracted from current audio track.
  - Expands on click into a full media player card: high-res cover art, track/artist details, animated waveform, interactive timeline scrubber (click to seek), playback controls (Open App, Previous, Play/Pause, Next, Mute/Unmute), and mouse wheel volume adjustment.
  - Windows Global System Media Transport Controls (GSMC) support (Spotify, YouTube, Chrome, Edge, VLC, Apple Music, etc.).

- **Performance View (When No Media is Playing)**:
  - Compact pill showing live CPU% and RAM% telemetry badges with digital clock.
  - Expands on click into a full Hardware Telemetry hub:
    - CPU Usage % arc gauge with Network download speed.
    - RAM Usage % arc gauge with active GiB memory in use.
    - GPU Usage % arc gauge with primary drive storage used.
    - Windows uptime & battery/power status.

- **Native Windows Polish**:
  - Symmetrical concave wing "ears" curling organically into the top screen bezel.
  - Moving light comet border beam around the notch perimeter.
  - Ambient background album artwork blur with vertical gradient mask.
  - 100% click-through outside the notch: Win32 `SetWindowRgn` ensures you can click all background windows, tabs, and buttons without interference.
  - **Shift-to-Peek**: Hold Shift while hovering compact notch to peek through and click background windows.
  - Click-outside backdrop collapse with smooth spring animation physics.

## Quick Start

### Development Mode
Run the provided development launcher:
```powershell
.\dev.bat
```
Or run directly:
```powershell
npm run tauri dev
```

### Production Build
```powershell
npm run tauri build
```
