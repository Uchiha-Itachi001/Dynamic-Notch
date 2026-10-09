import React from "react";
import type { OSDState } from "../hooks/useOSDEvents";

interface NotchOsdProps {
  osd: OSDState;
  showing: boolean;
  renderLightBorder: () => React.ReactNode;
  renderSliderBar: (pct: number, color: string) => React.ReactNode;
  formatTimer: (secs: number) => string;
  formatBytes: (bytes: number) => string;
  formatRate: (bytesPerSecond: number) => string;
  dismissCall: () => void;
  pauseResumeTimer: () => void;
  cancelTimer: () => void;
  dismissDownload: () => void;
}

export const NotchOsd: React.FC<NotchOsdProps> = ({
  osd,
  showing,
  renderLightBorder,
  renderSliderBar,
  formatTimer,
  formatBytes,
  formatRate,
  dismissCall,
  pauseResumeTimer,
  cancelTimer,
  dismissDownload,
}) => {
  if (!showing) return null;

  const shell = (className: string, children: React.ReactNode) => (
    <div className={`dynamic-notch dynamic-notch--osd ${className}`} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="notch-ear notch-ear--left" /><div className="notch-ear notch-ear--right" />
      {renderLightBorder()}
      {children}
    </div>
  );

  if (osd.type === "call_incoming" && osd.call) {
    return shell("dynamic-notch--call", (
      <div className="osd-call-layout">
        <div className="osd-call-avatar">{osd.call.callerInitial}</div>
        <div className="osd-call-info">
          <span className="osd-call-name">{osd.call.callerName}</span>
          <span className="osd-call-sub">Incoming Call...</span>
        </div>
        <div className="osd-call-actions">
          <button className="osd-call-btn osd-call-btn--decline" onClick={dismissCall} title="Decline">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M20.4 13.5c-1.2 0-2.4-.2-3.5-.6-.5-.2-1.1 0-1.4.4l-2.2 2.7c-2.7-1.3-5-3.5-6.3-6.3l2.7-2.2c.4-.3.6-.9.4-1.4C9.8 5 9.6 3.8 9.6 2.5c0-.8-.7-1.5-1.5-1.5H3.5C2.7 1 2 1.7 2 2.5 2 13.3 10.7 22 21.5 22c.8 0 1.5-.7 1.5-1.5V15c0-.8-.7-1.5-1.6-1.5z" transform="rotate(135 12 12)" /></svg>
          </button>
          <button className="osd-call-btn osd-call-btn--accept" title="Accept">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M20.4 13.5c-1.2 0-2.4-.2-3.5-.6-.5-.2-1.1 0-1.4.4l-2.2 2.7c-2.7-1.3-5-3.5-6.3-6.3l2.7-2.2c.4-.3.6-.9.4-1.4C9.8 5 9.6 3.8 9.6 2.5c0-.8-.7-1.5-1.5-1.5H3.5C2.7 1 2 1.7 2 2.5 2 13.3 10.7 22 21.5 22c.8 0 1.5-.7 1.5-1.5V15c0-.8-.7-1.5-1.6-1.5z" /></svg>
          </button>
        </div>
      </div>
    ));
  }

  const status = {
    mic_muted: { className: "dynamic-notch--mic", iconClass: "osd-status-icon--mic", label: "Microphone", sub: "Muted", subClass: "osd-status-sub--red", icon: <><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></> },
    dnd: { className: "dynamic-notch--dnd", iconClass: "osd-status-icon--dnd", label: "Do Not Disturb", sub: osd.dndEnabled ? "On" : "Off", subClass: osd.dndEnabled ? "osd-status-sub--blue" : "osd-status-sub--dim", icon: <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" /> },
  } as const;

  if (osd.type === "mic_muted" || osd.type === "dnd") {
    const item = status[osd.type];
    return shell(item.className, (
      <div className="osd-status-layout">
        <div className={`osd-status-icon ${item.iconClass}`}><svg viewBox="0 0 24 24" width="18" height="18" fill={osd.type === "dnd" ? "currentColor" : "none"} stroke={osd.type === "dnd" ? "none" : "currentColor"} strokeWidth="2" strokeLinecap="round">{item.icon}</svg></div>
        <div className="osd-status-text"><span className="osd-status-label">{item.label}</span><span className={`osd-status-sub ${item.subClass}`}>{item.sub}</span></div>
      </div>
    ));
  }

  if (osd.type === "timer" && osd.timer) {
    return shell("dynamic-notch--timer", (
      <div className="osd-timer-layout">
        <div className="osd-timer-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 8v4l3 3" /></svg></div>
        <span className="osd-timer-value">{formatTimer(osd.timer.remainingSec)}</span>
        <div className="osd-timer-actions">
          <button className="osd-rec-btn" onClick={pauseResumeTimer} title={osd.timer.running ? "Pause" : "Resume"}>{osd.timer.running ? <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg> : <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>}</button>
          <button className="osd-rec-btn" onClick={cancelTimer} title="Cancel"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
        </div>
      </div>
    ));
  }

  if (osd.type === "download" && osd.download) {
    const { download } = osd;
    const percent = download.totalBytes && download.totalBytes > 0 ? Math.min(100, Math.round((download.downloadedBytes / download.totalBytes) * 100)) : null;
    return shell("dynamic-notch--download", (
      <div className="osd-download-layout">
        <div className="osd-dl-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg></div>
        <div className="osd-dl-info"><span className="osd-dl-filename">{download.filename}</span><div className="osd-dl-track">{percent !== null ? <div className="osd-dl-fill" style={{ width: `${percent}%` }} /> : <div className="osd-dl-fill osd-dl-fill--indeterminate" />}</div><span className="osd-dl-meta">{formatBytes(download.downloadedBytes)}{download.totalBytes ? ` / ${formatBytes(download.totalBytes)}` : ""}{" · "}{download.paused ? "Waiting for data" : formatRate(download.speedBps)}</span></div>
        <div className="osd-dl-pct">{percent !== null ? `${percent}%` : "LIVE"}</div>
        <div className="osd-dl-actions"><button className="osd-rec-btn" onClick={dismissDownload} title="Dismiss"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button></div>
      </div>
    ));
  }

  if (osd.type === "notification" && osd.notification) {
    return shell("dynamic-notch--notification", <div className="osd-notif-layout"><div className="osd-notif-app-icon">{osd.notification.appIcon || "💬"}</div><div className="osd-notif-content"><span className="osd-notif-title">{osd.notification.title}</span><span className="osd-notif-body">{osd.notification.body}</span></div><div className="osd-notif-dot" /></div>);
  }

  if (osd.type === "brightness") {
    return shell("dynamic-notch--brightness", <div className="osd-slider-layout"><div className="osd-slider-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg></div>{renderSliderBar(osd.brightnessPct, "#fbbf24")}<span className="osd-slider-value">{osd.brightnessPct}%</span></div>);
  }

  return null;
};