import { useState, useEffect, useRef, useCallback } from "react";

export type OSDType =
  | "volume"
  | "brightness"
  | "dnd"
  | "recording"
  | "mic_muted"
  | "call_incoming"
  | "timer"
  | "download"
  | "notification"
  | "charging"
  | null;

export interface NotificationData {
  app: string;
  appIcon?: string; // emoji or URL
  title: string;
  body: string;
  id: string;
}

export interface DownloadData {
  filename: string;
  downloadedBytes: number;
  totalBytes?: number | null;
  speedBps: number;
  paused: boolean;
}

export interface TimerData {
  remainingSec: number;
  running: boolean;
}

export interface CallData {
  callerName: string;
  callerInitial: string;
}

export interface OSDState {
  type: OSDType;
  volumePct: number;
  brightnessPct: number;
  dndEnabled: boolean;
  isRecording: boolean;
  recordingSec: number;
  isMicMuted: boolean;
  call: CallData | null;
  timer: TimerData | null;
  download: DownloadData | null;
  notification: NotificationData | null;
  chargingPct: number;
}

const AUTO_DISMISS_MS = 3500;

export function useOSDEvents() {
  const [osd, setOSD] = useState<OSDState>({
    type: null,
    volumePct: 65,
    brightnessPct: 80,
    dndEnabled: false,
    isRecording: false,
    recordingSec: 0,
    isMicMuted: false,
    call: null,
    timer: null,
    download: null,
    notification: null,
    chargingPct: 100,
  });

  const dismissTimerRef = useRef<number | null>(null);
  const recordingTickRef = useRef<number | null>(null);
  const timerTickRef = useRef<number | null>(null);

  const scheduleAutoDismiss = useCallback((delayMs = AUTO_DISMISS_MS) => {
    if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = window.setTimeout(() => {
      setOSD((prev) => ({ ...prev, type: null }));
    }, delayMs);
  }, []);

  const cancelAutoDismiss = useCallback(() => {
    if (dismissTimerRef.current) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  // --- Public API ---

  const showVolume = useCallback((pct: number) => {
    setOSD((prev) => ({ ...prev, volumePct: Math.max(0, Math.min(100, pct)) }));
  }, []);

  const showBrightness = useCallback((pct: number) => {
    setOSD((prev) => ({ ...prev, type: "brightness", brightnessPct: Math.max(0, Math.min(100, pct)) }));
    scheduleAutoDismiss();
  }, [scheduleAutoDismiss]);

  const toggleDND = useCallback(() => {
    setOSD((prev) => ({ ...prev, type: "dnd", dndEnabled: !prev.dndEnabled }));
    scheduleAutoDismiss();
  }, [scheduleAutoDismiss]);



  const startRecording = useCallback(() => {
    cancelAutoDismiss();
    if (recordingTickRef.current) window.clearInterval(recordingTickRef.current);
    setOSD((prev) => ({ ...prev, type: "recording", isRecording: true, recordingSec: 0 }));
    recordingTickRef.current = window.setInterval(() => {
      setOSD((prev) => ({ ...prev, recordingSec: prev.recordingSec + 1 }));
    }, 1000);
  }, [cancelAutoDismiss]);

  const stopRecording = useCallback(() => {
    if (recordingTickRef.current) {
      window.clearInterval(recordingTickRef.current);
      recordingTickRef.current = null;
    }
    setOSD((prev) => ({ ...prev, isRecording: false, type: null }));
  }, []);

  const toggleMicMute = useCallback(() => {
    setOSD((prev) => ({ ...prev, type: "mic_muted", isMicMuted: !prev.isMicMuted }));
    scheduleAutoDismiss();
  }, [scheduleAutoDismiss]);

  const setMicMuted = useCallback((muted: boolean, announce = true) => {
    setOSD((prev) => ({
      ...prev,
      isMicMuted: muted,
      type: muted && announce ? "mic_muted" : (!muted && prev.type === "mic_muted" ? null : prev.type),
    }));
    if (muted && announce) scheduleAutoDismiss();
  }, [scheduleAutoDismiss]);

  const showIncomingCall = useCallback((caller: CallData) => {
    cancelAutoDismiss();
    setOSD((prev) => ({ ...prev, type: "call_incoming", call: caller }));
  }, [cancelAutoDismiss]);

  const dismissCall = useCallback(() => {
    setOSD((prev) => ({ ...prev, call: null, type: null }));
  }, []);

  const startTimer = useCallback((durationSec: number) => {
    cancelAutoDismiss();
    if (timerTickRef.current) window.clearInterval(timerTickRef.current);
    setOSD((prev) => ({ ...prev, type: "timer", timer: { remainingSec: durationSec, running: true } }));
    timerTickRef.current = window.setInterval(() => {
      setOSD((prev) => {
        if (!prev.timer || prev.timer.remainingSec <= 0) {
          if (timerTickRef.current) window.clearInterval(timerTickRef.current!);
          return { ...prev, timer: { remainingSec: 0, running: false }, type: null };
        }
        return { ...prev, timer: { ...prev.timer, remainingSec: prev.timer.remainingSec - 1 } };
      });
    }, 1000);
  }, [cancelAutoDismiss]);

  const pauseResumeTimer = useCallback(() => {
    setOSD((prev) => {
      if (!prev.timer) return prev;
      const running = !prev.timer.running;
      if (running) {
        timerTickRef.current = window.setInterval(() => {
          setOSD((p) => {
            if (!p.timer || p.timer.remainingSec <= 0) {
              if (timerTickRef.current) window.clearInterval(timerTickRef.current!);
              return { ...p, timer: { remainingSec: 0, running: false }, type: null };
            }
            return { ...p, timer: { ...p.timer, remainingSec: p.timer.remainingSec - 1 } };
          });
        }, 1000);
      } else {
        if (timerTickRef.current) window.clearInterval(timerTickRef.current);
      }
      return { ...prev, timer: { ...prev.timer, running } };
    });
  }, []);

  const cancelTimer = useCallback(() => {
    if (timerTickRef.current) window.clearInterval(timerTickRef.current);
    setOSD((prev) => ({ ...prev, timer: null, type: null }));
  }, []);

  const showDownload = useCallback((data: DownloadData) => {
    cancelAutoDismiss();
    setOSD((prev) => ({ ...prev, type: "download", download: data }));
  }, [cancelAutoDismiss]);

  const updateDownload = useCallback((data: Partial<DownloadData>) => {
    setOSD((prev) => ({
      ...prev,
      download: prev.download ? { ...prev.download, ...data } : null,
    }));
  }, []);

  const dismissDownload = useCallback(() => {
    setOSD((prev) => ({ ...prev, download: null, type: prev.type === "download" ? null : prev.type }));
  }, []);

  const showNotification = useCallback((data: NotificationData) => {
    setOSD((prev) => ({ ...prev, type: "notification", notification: data }));
    scheduleAutoDismiss(5000);
  }, [scheduleAutoDismiss]);

  const dismissOSD = useCallback(() => {
    cancelAutoDismiss();
    setOSD((prev) => ({ ...prev, type: null }));
  }, [cancelAutoDismiss]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
      if (recordingTickRef.current) window.clearInterval(recordingTickRef.current);
      if (timerTickRef.current) window.clearInterval(timerTickRef.current);
    };
  }, []);

  const formatTimer = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const formatRecording = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h > 0 ? `${h}:` : ""}${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return {
    osd,
    showVolume,
    showBrightness,
    toggleDND,
    startRecording,
    stopRecording,
    toggleMicMute,
    setMicMuted,
    showIncomingCall,
    dismissCall,
    startTimer,
    pauseResumeTimer,
    cancelTimer,
    showDownload,
    updateDownload,
    dismissDownload,
    showNotification,
    dismissOSD,
    formatTimer,
    formatRecording,
  };
}
