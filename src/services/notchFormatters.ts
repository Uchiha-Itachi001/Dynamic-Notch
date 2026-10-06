import type { TrackColorTheme } from "../types";

export function formatTime(secs: number) {
  if (typeof secs !== "number" || isNaN(secs) || secs < 0) return "0:00";
  const minutes = Math.floor(secs / 60);
  const seconds = Math.floor(secs % 60);
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function formatRate(bytesPerSecond: number) {
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function getTrackColor(title: string, artist: string): TrackColorTheme {
  let hash = 0;
  const value = `${title}__${artist}`;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  const topColor = `hsl(${hue}, 90%, 82%)`;
  const bottomColor = `hsl(${hue}, 85%, 46%)`;
  return {
    waveColor: `hsl(${hue}, 88%, 58%)`,
    waveGradient: `linear-gradient(180deg, ${topColor} 0%, ${bottomColor} 100%)`,
    waveGradientTop: topColor,
    waveGradientBottom: bottomColor,
    glowColor: `hsla(${hue}, 88%, 58%, 0.45)`,
  };
}

export function getBatteryColor(percent: number, charging: boolean) {
  if (charging) return "#22c55e";
  if (percent <= 25) return "#ef4444";
  if (percent <= 75) return "#f59e0b";
  return "#22c55e";
}

export function calcNetPercent(bytesPerSecond: number) {
  if (!bytesPerSecond || bytesPerSecond <= 0) return 0;
  const logValue = Math.log10(Math.max(1, bytesPerSecond));
  return Math.min(100, Math.max(8, Math.round(((logValue - 2) / (7.7 - 2)) * 100)));
}