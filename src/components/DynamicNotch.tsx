import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSystemMetrics } from "../hooks/useSystemMetrics";
import { useMediaSession } from "../hooks/useMediaSession";
import { useBluetooth } from "../hooks/useBluetooth";
import { useOSDEvents } from "../hooks/useOSDEvents";
import { useSystemEvents } from "../hooks/useSystemEvents";
import { tauriBridge } from "../services/tauriBridge";

/* ─── Priority ordering for OSD states ──────────────────────────────────────
   Higher priority states take over the notch, lower ones queue/dismiss.
   call_incoming > recording > camera > mic_muted > timer > download >
   notification > volume > brightness > dnd > airplane > (media/settings)
   ────────────────────────────────────────────────────────────────────────── */

export const DynamicNotch: React.FC = () => {
  const showBattery = true;
  const mediaBgMode = "cover";

  const systemMetrics = useSystemMetrics(true);
  const batteryPercent = systemMetrics?.battery_percent ?? 100;
  const isCharging = Boolean(systemMetrics?.is_charging);

  const { activeDevice: activeBtDevice, isConnected: isBtConnected } = useBluetooth();

  const {
    liveMedia,
    dynamicTheme,
    isPlaying: activeIsPlaying,
    currentSec: activeCurrentSec,
    durationSec: activeDuration,
    progressPercent,
    hasLiveMedia,
    togglePlay: handleTogglePlay,
    nextTrack: handleNextTrack,
    prevTrack: handlePrevTrack,
    volumeUp,
    volumeDown,
    toggleMute,
    seekTrack,
    focusMediaApp,
  } = useMediaSession(true);

  const {
    osd,
    showVolume,
    setMicMuted,
    setCameraInUse,
    dismissCall,
    pauseResumeTimer,
    cancelTimer,
    showDownload,
    dismissDownload,
    formatTimer,
  } = useOSDEvents();

  // Wire Windows state into the island. No OSD is shown without native input.
  useSystemEvents({
    showVolume,
    setMicMuted,
    setCameraInUse,
    showDownload,
    dismissDownload,
  });

  // Single combined tick state
  const [tick, setTick] = useState<{ date: Date; uptimeSec: number }>(() => ({
    date: new Date(),
    uptimeSec: 4980,
  }));
  const clockDate = tick.date;
  const currentTime = clockDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((prev) => ({ date: new Date(), uptimeSec: prev.uptimeSec + 1 }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Core expanded-card state (persistent, user-invoked)
  const [expandedType, setExpandedType] = useState<"media" | "settings" | "bluetooth" | null>(null);
  const [splitViewMode, setSplitViewMode] = useState<"media_main" | "bt_main">("media_main");
  const [hoveredMetric, setHoveredMetric] = useState<"cpu" | "ram" | "down" | "up" | null>(null);

  const [expandOnHover, setExpandOnHover] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("notch_expand_on_hover");
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("notch_expand_on_hover", JSON.stringify(expandOnHover));
    } catch {}
  }, [expandOnHover]);

  const hoverTimeoutRef = useRef<number | null>(null);
  const collapseTimeoutRef = useRef<number | null>(null);
  const [isHoverExpanded, setIsHoverExpanded] = useState<boolean>(false);
  const [isShiftDown, setIsShiftDown] = useState(false);
  const [isNotchHovered, setIsNotchHovered] = useState(false);

  const isShiftPeek = expandedType === null && osd.type === null && isShiftDown && isNotchHovered;

  useEffect(() => {
    tauriBridge.setNotchPeek(isShiftPeek);
  }, [isShiftPeek]);

  useEffect(() => {
    if (expandedType !== null) tauriBridge.setNotchExpanded(true);
  }, [expandedType]);




  const hasMediaSession = hasLiveMedia;
  const isMultiActivity = hasMediaSession && isBtConnected && activeBtDevice !== null;

  const activeTitle = liveMedia?.title?.trim() || (hasLiveMedia ? "Connecting Audio..." : "No Media Playing");
  const activeArtist = liveMedia?.artist?.trim() || (hasLiveMedia ? "Resolving Stream..." : "Ready to play");

  const formatTime = (secs: number) => {
    if (typeof secs !== "number" || isNaN(secs) || secs < 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
  };

  const formatRate = (bytesPerSecond: number) => `${formatBytes(bytesPerSecond)}/s`;



  // ── Expand/Collapse handlers ──────────────────────────────────────────────
  const handleExpandMedia = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (collapseTimeoutRef.current) { window.clearTimeout(collapseTimeoutRef.current); collapseTimeoutRef.current = null; }
    setIsHoverExpanded(false);
    tauriBridge.setNotchExpanded(true);
    setExpandedType("media");
  };

  const handleExpandSettings = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (collapseTimeoutRef.current) { window.clearTimeout(collapseTimeoutRef.current); collapseTimeoutRef.current = null; }
    setIsHoverExpanded(false);
    tauriBridge.setNotchExpanded(true);
    setExpandedType("settings");
  };

  const handleExpandBluetooth = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (collapseTimeoutRef.current) { window.clearTimeout(collapseTimeoutRef.current); collapseTimeoutRef.current = null; }
    setIsHoverExpanded(false);
    tauriBridge.setNotchExpanded(true);
    setExpandedType("bluetooth");
  };

  const handleMainPillClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (splitViewMode === "media_main") handleExpandMedia(e);
    else handleExpandBluetooth(e);
  };

  const handleSecondaryPillClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSplitViewMode((prev) => (prev === "media_main" ? "bt_main" : "media_main"));
  };

  const handleCollapse = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (collapseTimeoutRef.current) { window.clearTimeout(collapseTimeoutRef.current); collapseTimeoutRef.current = null; }
    if (hoverTimeoutRef.current) { window.clearTimeout(hoverTimeoutRef.current); hoverTimeoutRef.current = null; }
    setIsHoverExpanded(false);
    setExpandedType(null);
    setHoveredMetric(null);
    setTimeout(() => tauriBridge.setNotchExpanded(false), 280);
  };

  const handleMouseEnter = () => {
    setIsNotchHovered(true);
    if (collapseTimeoutRef.current) { window.clearTimeout(collapseTimeoutRef.current); collapseTimeoutRef.current = null; }
    if (expandOnHover && expandedType === null && osd.type === null) {
      if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = window.setTimeout(() => {
        tauriBridge.setNotchExpanded(true);
        if (hasMediaSession) setExpandedType("media");
        else if (isBtConnected && activeBtDevice !== null) setExpandedType("bluetooth");
        else setExpandedType("settings");
        setIsHoverExpanded(true);
      }, 70);
    }
  };

  const handleMouseLeave = () => {
    if (!isShiftDown) setIsNotchHovered(false);
    if (hoverTimeoutRef.current) { window.clearTimeout(hoverTimeoutRef.current); hoverTimeoutRef.current = null; }
    if (isHoverExpanded && expandedType !== null) {
      if (collapseTimeoutRef.current) window.clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = window.setTimeout(() => handleCollapse(), 280);
    }
  };

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activeDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ratio = rect.width > 0 ? clickX / rect.width : 0;
    seekTrack(Math.round(ratio * activeDuration));
  };

  const [volumeFeedbackVisible, setVolumeFeedbackVisible] = useState(false);
  const [inlineVolumePct, setInlineVolumePct] = useState<number>(() => osd.volumePct);
  const volumeFeedbackTimerRef = useRef<number | null>(null);
  const isInitialVolumeMount = useRef(true);

  const showInlineVolumeFeedback = useCallback((pct: number) => {
    setInlineVolumePct(pct);
    setVolumeFeedbackVisible(true);
    if (volumeFeedbackTimerRef.current) {
      window.clearTimeout(volumeFeedbackTimerRef.current);
    }
    volumeFeedbackTimerRef.current = window.setTimeout(() => {
      setVolumeFeedbackVisible(false);
    }, 1400);
  }, []);

  const triggerVolumeStep = useCallback((direction: number) => {
    const next = Math.max(0, Math.min(100, (inlineVolumePct || osd.volumePct) + direction * 2));
    if (direction > 0) volumeUp();
    else if (direction < 0) volumeDown();
    showInlineVolumeFeedback(next);
  }, [inlineVolumePct, osd.volumePct, volumeUp, volumeDown, showInlineVolumeFeedback]);

  useEffect(() => {
    if (isInitialVolumeMount.current) {
      isInitialVolumeMount.current = false;
      return;
    }
    showInlineVolumeFeedback(osd.volumePct);
  }, [osd.volumePct, showInlineVolumeFeedback]);

  const wheelAccumulatorRef = useRef<number>(0);
  const lastWheelTimeRef = useRef<number>(0);

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();

    // If hover-expansion timeout is pending, cancel it so scroll-to-volume takes priority
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (isHoverExpanded) {
      setIsHoverExpanded(false);
      setExpandedType(null);
    }

    const now = performance.now();
    if (now - lastWheelTimeRef.current > 300) {
      wheelAccumulatorRef.current = 0;
    }
    lastWheelTimeRef.current = now;

    wheelAccumulatorRef.current += e.deltaY;
    const threshold = 40;

    if (wheelAccumulatorRef.current <= -threshold) {
      const steps = Math.min(5, Math.max(1, Math.floor(Math.abs(wheelAccumulatorRef.current) / 80)));
      for (let i = 0; i < steps; i++) {
        volumeUp();
      }
      const next = Math.min(100, (inlineVolumePct || osd.volumePct) + steps * 2);
      showInlineVolumeFeedback(next);
      wheelAccumulatorRef.current = 0;
    } else if (wheelAccumulatorRef.current >= threshold) {
      const steps = Math.min(5, Math.max(1, Math.floor(Math.abs(wheelAccumulatorRef.current) / 80)));
      for (let i = 0; i < steps; i++) {
        volumeDown();
      }
      const next = Math.max(0, (inlineVolumePct || osd.volumePct) - steps * 2);
      showInlineVolumeFeedback(next);
      wheelAccumulatorRef.current = 0;
    }
  };

  // ── Keyboard Shortcuts (Media controls & navigation) ───────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") setIsShiftDown(true);
      if (e.key === "Escape") {
        handleCollapse();
        return;
      }

      // Ignore if typing inside any text input/field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Active media keyboard shortcuts
      if (hasMediaSession) {
        if (e.code === "Space" || e.key === " " || e.key === "k" || e.key === "K") {
          e.preventDefault();
          handleTogglePlay();
          return;
        }

        if (e.key === "ArrowRight") {
          e.preventDefault();
          if (e.shiftKey) {
            seekTrack(Math.min(activeDuration, activeCurrentSec + 5));
          } else {
            handleNextTrack();
          }
          return;
        }

        if (e.key === "ArrowLeft") {
          e.preventDefault();
          if (e.shiftKey) {
            seekTrack(Math.max(0, activeCurrentSec - 5));
          } else {
            handlePrevTrack();
          }
          return;
        }

        if (e.key === "ArrowUp") {
          e.preventDefault();
          triggerVolumeStep(1);
          return;
        }

        if (e.key === "ArrowDown") {
          e.preventDefault();
          triggerVolumeStep(-1);
          return;
        }

        if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          toggleMute();
          return;
        }

        if (e.key === "j" || e.key === "J") {
          e.preventDefault();
          seekTrack(Math.max(0, activeCurrentSec - 5));
          return;
        }

        if (e.key === "l" || e.key === "L") {
          e.preventDefault();
          seekTrack(Math.min(activeDuration, activeCurrentSec + 5));
          return;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") { setIsShiftDown(false); setIsNotchHovered(false); }
    };

    const handleBlur = () => { setIsShiftDown(false); setIsNotchHovered(false); };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [hasMediaSession, handleTogglePlay, handleNextTrack, handlePrevTrack, triggerVolumeStep, toggleMute, seekTrack, activeDuration, activeCurrentSec]);

  // ── Theme helpers ─────────────────────────────────────────────────────────
  const getTrackColor = (title: string, artist: string) => {
    let hash = 0;
    const str = `${title}__${artist}`;
    for (let i = 0; i < str.length; i++) { hash = (hash << 5) - hash + str.charCodeAt(i); hash |= 0; }
    const hue = Math.abs(hash) % 360;
    const topColor = `hsl(${hue}, 90%, 82%)`;
    const botColor = `hsl(${hue}, 85%, 46%)`;
    return {
      waveColor: `hsl(${hue}, 88%, 58%)`,
      waveGradient: `linear-gradient(180deg, ${topColor} 0%, ${botColor} 100%)`,
      waveGradientTop: topColor,
      waveGradientBottom: botColor,
      glowColor: `hsla(${hue}, 88%, 58%, 0.45)`,
    };
  };

  const fallbackTheme = getTrackColor(activeTitle, activeArtist);
  const trackTheme = {
    waveColor: dynamicTheme?.waveColor || fallbackTheme.waveColor,
    waveGradient: dynamicTheme?.waveGradient || fallbackTheme.waveGradient,
    waveGradientTop: dynamicTheme?.waveGradientTop || fallbackTheme.waveGradientTop,
    waveGradientBottom: dynamicTheme?.waveGradientBottom || fallbackTheme.waveGradientBottom,
    glowColor: dynamicTheme?.glowColor || fallbackTheme.glowColor,
  };

  const getBatteryColor = (pct: number, charging: boolean) => {
    if (charging) return "#22c55e";
    if (pct <= 25) return "#ef4444";
    if (pct <= 75) return "#f59e0b";
    return "#22c55e";
  };

  // ── Shared sub-renders ────────────────────────────────────────────────────
  const renderCompactClock = () => {
    const match = currentTime.match(/^(.*?)\s*([A-Za-z]{2,})$/);
    const timeDigits = match ? match[1] : currentTime;
    const timePeriod = match ? match[2] : "";
    return (
      <div className="notch-compact-clock-widget">
        <div className="notch-compact-digits-wrapper">
          <span className="notch-compact-digits">{timeDigits}</span>
          {timePeriod && <span className="notch-compact-period">{timePeriod}</span>}
        </div>
      </div>
    );
  };

  const renderCompactBattery = () => {
    const safePct = Math.min(100, Math.max(0, Math.round(batteryPercent)));
    const color = getBatteryColor(safePct, isCharging);
    const radius = 7.4;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (safePct / 100) * circumference;
    const fillWidth = Math.max(0.6, (safePct / 100) * 6.2);
    return (
      <div
        className={`notch-compact-battery-widget ${isCharging ? "notch-compact-battery-widget--charging" : ""}`}
        title={`Battery: ${safePct}%${isCharging ? " (Charging)" : ""}`}
      >
        <div className="notch-battery-gauge-wrapper">
          <svg width="18" height="18" viewBox="0 0 18 18" className="notch-battery-ring-svg">
            <circle cx="9" cy="9" r={radius} fill="none" stroke="rgba(255, 255, 255, 0.16)" strokeWidth="1.6" />
            <circle
              cx="9" cy="9" r={radius} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} transform="rotate(-90 9 9)"
              style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.3s ease" }}
            />
            {isCharging ? (
              <polygon points="9.8 4.2 6.8 9.2 8.8 9.2 8.2 13.8 11.4 8.8 9.4 8.8" fill={color}
                className="notch-battery-bolt" style={{ filter: `drop-shadow(0 0 3px ${color}88)` }} />
            ) : (
              <g>
                <rect x="4.6" y="6.6" width="7.8" height="4.8" rx="1.0" fill="rgba(0,0,0,0.55)" stroke={color} strokeWidth="1.0"
                  style={{ transition: "stroke 0.3s ease" }} />
                <path d="M 12.8 7.8 C 13.3 7.8 13.6 8.1 13.6 8.5 L 13.6 9.5 C 13.6 9.9 13.3 10.2 12.8 10.2 Z" fill={color}
                  style={{ transition: "fill 0.3s ease" }} />
                <rect x="5.3" y="7.3" width={fillWidth} height="3.4" rx="0.5" fill={color}
                  style={{ transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1), fill 0.3s ease" }} />
              </g>
            )}
          </svg>
        </div>
        <span className="notch-compact-battery-text" style={{ color }}>{safePct}%</span>
      </div>
    );
  };

  const renderLightBorder = () => (
    <div className="notch-light-border" aria-hidden="true">
      <div className="notch-stream-half notch-stream--left"><div className="notch-stream-comet" /></div>
      <div className="notch-stream-half notch-stream--right"><div className="notch-stream-comet" /></div>
    </div>
  );

  const renderNotchBgCover = (isMedia = false) => {
    const showCover = isMedia && mediaBgMode === "cover" && Boolean(liveMedia?.album_art_base64);
    if (!showCover) return null;
    return (
      <div className="notch-bg-cover notch-bg-cover--media" aria-hidden="true">
        <img src={liveMedia?.album_art_base64} alt="" className="notch-media-thumbnail-bg" draggable={false} />
        <div className="notch-media-thumbnail-overlay" />
      </div>
    );
  };

  // OSD bar: volume/brightness
  const renderSliderBar = (pct: number, color: string) => (
    <div className="osd-slider-track">
      <div className="osd-slider-fill" style={{ width: `${pct}%`, background: color }} />
      <div className="osd-slider-thumb" style={{ left: `${pct}%`, background: color }} />
    </div>
  );

  // ── System Stats helpers ──────────────────────────────────────────────────
  const cpuPct = Math.min(100, Math.max(0, Math.round(systemMetrics?.cpu_percent ?? 12)));
  const ramPct = Math.min(100, Math.max(0, Math.round(systemMetrics?.ram_percent ?? 45)));
  const usedRamGb = ((systemMetrics?.used_ram_mb ?? 5529) / 1024).toFixed(1);

  const calcNetPercent = (bps: number) => {
    if (!bps || bps <= 0) return 0;
    const logVal = Math.log10(Math.max(1, bps));
    const minLog = 2.0; const maxLog = 7.7;
    return Math.min(100, Math.max(8, Math.round(((logVal - minLog) / (maxLog - minLog)) * 100)));
  };
  const dlPct = calcNetPercent(systemMetrics?.net_recv_speed_bps ?? 388000);
  const ulPct = calcNetPercent(systemMetrics?.net_sent_speed_bps ?? 9200);

  const rCpu = 34, cCpu = 2 * Math.PI * rCpu, cpuOffset = cCpu - (cpuPct / 100) * cCpu;
  const rRam = 27, cRam = 2 * Math.PI * rRam, ramOffset = cRam - (ramPct / 100) * cRam;
  const rDown = 20, cDown = 2 * Math.PI * rDown, downOffset = cDown - (dlPct / 100) * cDown;
  const rUp = 13, cUp = 2 * Math.PI * rUp, upOffset = cUp - (ulPct / 100) * cUp;

  // ── Determine which "OSD card" to show ────────────────────────────────────
  // Priority: call > recording > camera > mic > timer > download > notification > brightness > dnd
  const activeOSD = osd.type;

  // Whether we should show an OSD card overtaking the main notch
  const showingOSD = activeOSD !== null && expandedType === null;

  // ── Determine base idle state ─────────────────────────────────────────────
  const showIdleCompact = expandedType === null && !showingOSD && !isMultiActivity && !hasMediaSession && (!isBtConnected || activeBtDevice === null);
  const showMediaCompact = expandedType === null && !showingOSD && !isMultiActivity && hasMediaSession;
  const showDualSplit = expandedType === null && !showingOSD && !isMultiActivity && !hasMediaSession && isBtConnected && activeBtDevice !== null;
  const showMultiSplit = expandedType === null && !showingOSD && isMultiActivity;

  // ── Hover expanded state for network info in idle ─────────────────────────


  return (
    <>
      {/* Backdrop */}
      {(expandedType !== null) && (
        <div className="island-backdrop" onClick={() => handleCollapse()} />
      )}

      <div
        className={`dynamic-notch-wrapper ${isShiftPeek ? "dynamic-notch-wrapper--peek-through" : ""}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      >

        {/* ════════════════════════════════════════════════════════════════════
            OSD STATES — Transient system events (highest priority)
            ════════════════════════════════════════════════════════════════════ */}

        {/* ── OSD: Incoming Call ── */}
        {showingOSD && activeOSD === "call_incoming" && osd.call && (
          <div className="dynamic-notch dynamic-notch--osd dynamic-notch--call"
            onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <div className="notch-ear notch-ear--left" /><div className="notch-ear notch-ear--right" />
            {renderLightBorder()}
            <div className="osd-call-layout">
              <div className="osd-call-avatar">{osd.call.callerInitial}</div>
              <div className="osd-call-info">
                <span className="osd-call-name">{osd.call.callerName}</span>
                <span className="osd-call-sub">Incoming Call...</span>
              </div>
              <div className="osd-call-actions">
                <button className="osd-call-btn osd-call-btn--decline" onClick={dismissCall} title="Decline">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M20.4 13.5c-1.2 0-2.4-.2-3.5-.6-.5-.2-1.1 0-1.4.4l-2.2 2.7c-2.7-1.3-5-3.5-6.3-6.3l2.7-2.2c.4-.3.6-.9.4-1.4C9.8 5 9.6 3.8 9.6 2.5c0-.8-.7-1.5-1.5-1.5H3.5C2.7 1 2 1.7 2 2.5 2 13.3 10.7 22 21.5 22c.8 0 1.5-.7 1.5-1.5V15c0-.8-.7-1.5-1.6-1.5z" transform="rotate(135 12 12)" />
                  </svg>
                </button>
                <button className="osd-call-btn osd-call-btn--accept" title="Accept">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M20.4 13.5c-1.2 0-2.4-.2-3.5-.6-.5-.2-1.1 0-1.4.4l-2.2 2.7c-2.7-1.3-5-3.5-6.3-6.3l2.7-2.2c.4-.3.6-.9.4-1.4C9.8 5 9.6 3.8 9.6 2.5c0-.8-.7-1.5-1.5-1.5H3.5C2.7 1 2 1.7 2 2.5 2 13.3 10.7 22 21.5 22c.8 0 1.5-.7 1.5-1.5V15c0-.8-.7-1.5-1.6-1.5z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── OSD: Camera In Use ── */}
        {showingOSD && activeOSD === "camera" && (
          <div className="dynamic-notch dynamic-notch--osd dynamic-notch--camera"
            onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <div className="notch-ear notch-ear--left" /><div className="notch-ear notch-ear--right" />
            {renderLightBorder()}
            <div className="osd-status-layout">
              <div className="osd-status-icon osd-status-icon--camera">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </div>
              <div className="osd-status-text">
                <span className="osd-status-label">Camera</span>
                <span className="osd-status-sub osd-status-sub--green">In Use</span>
              </div>
            </div>
          </div>
        )}

        {/* ── OSD: Microphone Muted ── */}
        {showingOSD && activeOSD === "mic_muted" && (
          <div className="dynamic-notch dynamic-notch--osd dynamic-notch--mic"
            onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <div className="notch-ear notch-ear--left" /><div className="notch-ear notch-ear--right" />
            {renderLightBorder()}
            <div className="osd-status-layout">
              <div className="osd-status-icon osd-status-icon--mic">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                  <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </div>
              <div className="osd-status-text">
                <span className="osd-status-label">Microphone</span>
                <span className="osd-status-sub osd-status-sub--red">Muted</span>
              </div>
            </div>
          </div>
        )}

        {/* ── OSD: Do Not Disturb ── */}
        {showingOSD && activeOSD === "dnd" && (
          <div className="dynamic-notch dynamic-notch--osd dynamic-notch--dnd"
            onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <div className="notch-ear notch-ear--left" /><div className="notch-ear notch-ear--right" />
            {renderLightBorder()}
            <div className="osd-status-layout">
              <div className="osd-status-icon osd-status-icon--dnd">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
                </svg>
              </div>
              <div className="osd-status-text">
                <span className="osd-status-label">Do Not Disturb</span>
                <span className={`osd-status-sub ${osd.dndEnabled ? "osd-status-sub--blue" : "osd-status-sub--dim"}`}>
                  {osd.dndEnabled ? "On" : "Off"}
                </span>
              </div>
            </div>
          </div>
        )}



        {/* ── OSD: Timer ── */}
        {showingOSD && activeOSD === "timer" && osd.timer && (
          <div className="dynamic-notch dynamic-notch--osd dynamic-notch--timer"
            onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <div className="notch-ear notch-ear--left" /><div className="notch-ear notch-ear--right" />
            {renderLightBorder()}
            <div className="osd-timer-layout">
              <div className="osd-timer-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 8v4l3 3" />
                </svg>
              </div>
              <span className="osd-timer-value">{formatTimer(osd.timer.remainingSec)}</span>
              <div className="osd-timer-actions">
                <button className="osd-rec-btn" onClick={pauseResumeTimer} title={osd.timer.running ? "Pause" : "Resume"}>
                  {osd.timer.running ? (
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  )}
                </button>
                <button className="osd-rec-btn" onClick={cancelTimer} title="Cancel">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── OSD: Download ── */}
        {showingOSD && activeOSD === "download" && osd.download && (
          <div className="dynamic-notch dynamic-notch--osd dynamic-notch--download"
            onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <div className="notch-ear notch-ear--left" /><div className="notch-ear notch-ear--right" />
            {renderLightBorder()}
            <div className="osd-download-layout">
              <div className="osd-dl-icon">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <div className="osd-dl-info">
                <span className="osd-dl-filename">{osd.download.filename}</span>
                <div className="osd-dl-track">
                  {osd.download.totalBytes && osd.download.totalBytes > 0 ? (
                    <div className="osd-dl-fill" style={{ width: `${Math.min(100, Math.round((osd.download.downloadedBytes / osd.download.totalBytes) * 100))}%` }} />
                  ) : (
                    <div className="osd-dl-fill osd-dl-fill--indeterminate" />
                  )}
                </div>
                <span className="osd-dl-meta">
                  {formatBytes(osd.download.downloadedBytes)}
                  {osd.download.totalBytes ? ` / ${formatBytes(osd.download.totalBytes)}` : ""}
                  {" · "}{osd.download.paused ? "Waiting for data" : formatRate(osd.download.speedBps)}
                </span>
              </div>
              <div className="osd-dl-pct">
                {osd.download.totalBytes && osd.download.totalBytes > 0
                  ? `${Math.min(100, Math.round((osd.download.downloadedBytes / osd.download.totalBytes) * 100))}%`
                  : "LIVE"}
              </div>
              <div className="osd-dl-actions">
                <button className="osd-rec-btn" onClick={dismissDownload} title="Dismiss">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── OSD: Notification ── */}
        {showingOSD && activeOSD === "notification" && osd.notification && (
          <div className="dynamic-notch dynamic-notch--osd dynamic-notch--notification"
            onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <div className="notch-ear notch-ear--left" /><div className="notch-ear notch-ear--right" />
            {renderLightBorder()}
            <div className="osd-notif-layout">
              <div className="osd-notif-app-icon">{osd.notification.appIcon || "💬"}</div>
              <div className="osd-notif-content">
                <span className="osd-notif-title">{osd.notification.title}</span>
                <span className="osd-notif-body">{osd.notification.body}</span>
              </div>
              <div className="osd-notif-dot" />
            </div>
          </div>
        )}



        {/* ── OSD: Brightness ── */}
        {showingOSD && activeOSD === "brightness" && (
          <div className="dynamic-notch dynamic-notch--osd dynamic-notch--brightness"
            onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <div className="notch-ear notch-ear--left" /><div className="notch-ear notch-ear--right" />
            {renderLightBorder()}
            <div className="osd-slider-layout">
              <div className="osd-slider-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              </div>
              {renderSliderBar(osd.brightnessPct, "#fbbf24")}
              <span className="osd-slider-value">{osd.brightnessPct}%</span>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            EXPANDED CARDS (persistent, user-invoked)
            ════════════════════════════════════════════════════════════════════ */}

        {/* ── CASE 1: Expanded Media Player ── */}
        {expandedType === "media" && (
          <div key="expanded-media" className="dynamic-notch dynamic-notch--expanded"
            onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
            style={{
              ["--wave-color" as any]: trackTheme.waveColor,
              ["--wave-gradient" as any]: trackTheme.waveGradient,
              ["--wave-gradient-top" as any]: trackTheme.waveGradientTop,
              ["--wave-gradient-bottom" as any]: trackTheme.waveGradientBottom,
              ["--wave-glow" as any]: trackTheme.glowColor,
            }}>
            <div className="notch-ear notch-ear--left" /><div className="notch-ear notch-ear--right" />
            {renderLightBorder()}{renderNotchBgCover(true)}
            <div className="notch-expanded-card">
              <div className="notch-card-top-row">
                <div className="notch-card-media-left">
                  <div className="notch-card-art">
                    <img src={liveMedia?.album_art_base64 || "/albumcover-placeholder.png"} alt="Album Art"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/albumcover-placeholder.png"; }} />
                  </div>
                  <div className="notch-card-text">
                    <span className="notch-card-title">{activeTitle}</span>
                    <span className="notch-card-artist">{activeArtist}</span>
                  </div>
                </div>
                <div className="notch-card-wave-right">
                  <div className={`notch-equalizer-wave ${!activeIsPlaying ? "notch-equalizer-wave--paused" : ""}`}>
                    <span className="notch-wave-bar" /><span className="notch-wave-bar" /><span className="notch-wave-bar" />
                    <span className="notch-wave-bar" /><span className="notch-wave-bar" />
                  </div>
                </div>
              </div>
              <div className="notch-card-scrubber-row">
                <span className="notch-time-label">{formatTime(activeCurrentSec)}</span>
                <div className="notch-scrubber-track" onClick={handleScrubberClick}>
                  <div className="notch-scrubber-fill" style={{ width: `${progressPercent}%` }} />
                  <div className="notch-scrubber-thumb" style={{ left: `${progressPercent}%` }} />
                </div>
                <span className="notch-time-label">{formatTime(activeDuration)}</span>
              </div>
              <div className="notch-card-controls-row">
                <button className="notch-btn-icon" onClick={focusMediaApp} title="Open Playing App">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </button>
                <button className="notch-btn-icon" onClick={handlePrevTrack} title="Previous">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                    <path d="M22 5.5a1.2 1.2 0 0 0-1.85-.98L13.3 9.7a1.2 1.2 0 0 0 0 1.96l6.85 5.18A1.2 1.2 0 0 0 22 15.86V5.5zm-11 0a1.2 1.2 0 0 0-1.85-.98L2.3 9.7a1.2 1.2 0 0 0 0 1.96l6.85 5.18A1.2 1.2 0 0 0 11 15.86V5.5z" />
                  </svg>
                </button>
                <button className="notch-btn-icon notch-btn-icon--play" onClick={handleTogglePlay} title={activeIsPlaying ? "Pause" : "Play"}>
                  {activeIsPlaying ? (
                    <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
                      <rect x="5.5" y="3.5" width="4.5" height="17" rx="1.8" /><rect x="14" y="3.5" width="4.5" height="17" rx="1.8" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
                      <path d="M6 4.5a1.5 1.5 0 0 1 2.3-1.28l12 7.5a1.5 1.5 0 0 1 0 2.56l-12 7.5A1.5 1.5 0 0 1 6 19.5V4.5z" />
                    </svg>
                  )}
                </button>
                <button className="notch-btn-icon" onClick={handleNextTrack} title="Next">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                    <path d="M2 5.5a1.2 1.2 0 0 1 1.85-.98L10.7 9.7a1.2 1.2 0 0 1 0 1.96l-6.85 5.18A1.2 1.2 0 0 1 2 15.86V5.5zm11 0a1.2 1.2 0 0 1 1.85-.98L21.7 9.7a1.2 1.2 0 0 1 0 1.96l-6.85 5.18A1.2 1.2 0 0 1 13 15.86V5.5z" />
                  </svg>
                </button>
                <button className="notch-btn-icon" onClick={(e) => { e.stopPropagation(); setExpandedType("settings"); }} title="System Stats">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── CASE 2: Expanded System Stats / Settings ── */}
        {expandedType === "settings" && (() => {
          const netType = systemMetrics?.net_type?.toLowerCase() ?? "wifi";
          const isDisconnected = netType === "disconnected" || netType === "none";
          const isEthernet = netType === "ethernet";

          return (
            <div key="expanded-settings" className="dynamic-notch dynamic-notch--ios-active"
              onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
              style={{ ["--wave-color" as any]: "#ff453a", ["--wave-glow" as any]: "rgba(255, 69, 58, 0.35)" }}>
              <div className="notch-ear notch-ear--left" /><div className="notch-ear notch-ear--right" />
              {renderLightBorder()}{renderNotchBgCover(false)}
              <div className="notch-expanded-settings-card" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="apple-full-header">
                  <div
                    className={`apple-full-status apple-full-status--${isDisconnected ? "offline" : isEthernet ? "ethernet" : "wifi"}`}
                    title={isDisconnected ? "No Internet" : isEthernet ? "Ethernet Connected" : "Wi-Fi Connected"}
                  >
                    <span className="apple-net-icon">
                      {isDisconnected ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="apple-wifi-offline-svg">
                          <line x1="2" y1="2" x2="22" y2="22" stroke="#ff453a" strokeWidth="2.4" />
                          <path d="M2.5 8.5C4.8 6.2 7.8 4.8 11 4.2" stroke="rgba(255,69,58,0.7)" />
                          <path d="M16.5 4.8C18.6 5.8 20.3 7.1 21.5 8.5" stroke="rgba(255,69,58,0.7)" />
                          <path d="M6 12C7.8 10.2 10 9.2 12.2 8.9" stroke="rgba(255,69,58,0.7)" />
                          <path d="M15.5 9.8C16.8 10.6 18 11.5 19 12" stroke="rgba(255,69,58,0.7)" />
                          <circle cx="12" cy="19.2" r="1.3" fill="#ff453a" />
                        </svg>
                      ) : isEthernet ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="apple-eth-svg">
                          <rect x="2" y="3" width="20" height="13" rx="2" />
                          <path d="M6 16v3M10 16v3M14 16v3M18 16v3" />
                          <line x1="2" y1="21" x2="22" y2="21" />
                        </svg>
                      ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="apple-wifi-svg">
                          <path className="apple-wifi-arc apple-wifi-arc--3" d="M2.5 8.5C8 3 16 3 21.5 8.5" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
                          <path className="apple-wifi-arc apple-wifi-arc--2" d="M6 12C9.5 8.5 14.5 8.5 18 12" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
                          <path className="apple-wifi-arc apple-wifi-arc--1" d="M9.5 15.5C11 14 13 14 14.5 15.5" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
                          <circle className="apple-wifi-dot" cx="12" cy="19.2" r="1.3" fill="currentColor" />
                        </svg>
                      )}
                    </span>
                  </div>
                  <div className="apple-full-actions">
                    {hasMediaSession && (
                      <button
                        type="button"
                        className="apple-action-icon apple-action-icon--music"
                        onClick={() => setExpandedType("media")}
                        title={`Now Playing: ${activeTitle}`}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                        </svg>
                      </button>
                    )}
                    <button type="button" className={`apple-action-pill ${expandOnHover ? "apple-action-pill--on" : ""}`}
                      onClick={() => setExpandOnHover((p) => !p)} title="Hover Expand">
                      <span className="apple-action-dot" /><span>HOVER</span>
                    </button>
                    <button type="button" className="apple-exit-icon" onClick={() => tauriBridge.exitApp()} title="Exit App">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" />
                      </svg>
                    </button>
                  </div>
                </div>
                {/* Body: Concentric Rings + Telemetry Cards */}
                <div className="apple-full-body">
                  <div className="apple-rings-large-wrap" title={`CPU: ${cpuPct}% | RAM: ${ramPct}%`}>
                    <svg width="78" height="78" viewBox="0 0 78 78" className="apple-rings-large-svg">
                      <defs>
                        <linearGradient id="appleLgRingCpu" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#ff453a" /><stop offset="100%" stopColor="#ff9f0a" />
                        </linearGradient>
                        <linearGradient id="appleLgRingRam" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#bf5af2" /><stop offset="100%" stopColor="#e879f9" />
                        </linearGradient>
                        <linearGradient id="appleLgRingDown" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#30d158" /><stop offset="100%" stopColor="#34d399" />
                        </linearGradient>
                        <linearGradient id="appleLgRingUp" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#0a84ff" /><stop offset="100%" stopColor="#38bdf8" />
                        </linearGradient>
                      </defs>

                      {/* Ring 1: Processor (CPU) */}
                      <g
                        className="apple-ring-interactive"
                        onPointerEnter={() => setHoveredMetric("cpu")}
                        onPointerLeave={() => setHoveredMetric(null)}
                        style={{
                          cursor: "pointer",
                          opacity: hoveredMetric === null || hoveredMetric === "cpu" ? 1 : 0.28,
                          transition: "opacity 0.22s ease",
                        }}
                      >
                        <circle cx="39" cy="39" r={rCpu} fill="none" stroke="rgba(255,69,58,0.16)" strokeWidth={hoveredMetric === "cpu" ? "4.1" : "3.4"} />
                        <circle cx="39" cy="39" r={rCpu} fill="none" stroke="url(#appleLgRingCpu)"
                          strokeWidth={hoveredMetric === "cpu" ? "4.1" : "3.4"} strokeLinecap="round"
                          strokeDasharray={cCpu} strokeDashoffset={cpuOffset} transform="rotate(-90 39 39)"
                          style={{
                            transition: "stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1), stroke-width 0.2s ease, filter 0.2s ease",
                            filter: hoveredMetric === "cpu"
                              ? "drop-shadow(0 0 7px rgba(255,69,58,0.95))"
                              : "drop-shadow(0 0 4px rgba(255,69,58,0.6))",
                          }} />
                        <circle cx="39" cy="39" r={rCpu} fill="none" stroke="transparent" strokeWidth="7" style={{ pointerEvents: "stroke" }}>
                          <title>Processor: {cpuPct}% Active Load</title>
                        </circle>
                      </g>

                      {/* Ring 2: Memory (RAM) */}
                      <g
                        className="apple-ring-interactive"
                        onPointerEnter={() => setHoveredMetric("ram")}
                        onPointerLeave={() => setHoveredMetric(null)}
                        style={{
                          cursor: "pointer",
                          opacity: hoveredMetric === null || hoveredMetric === "ram" ? 1 : 0.28,
                          transition: "opacity 0.22s ease",
                        }}
                      >
                        <circle cx="39" cy="39" r={rRam} fill="none" stroke="rgba(191,90,242,0.16)" strokeWidth={hoveredMetric === "ram" ? "4.1" : "3.4"} />
                        <circle cx="39" cy="39" r={rRam} fill="none" stroke="url(#appleLgRingRam)"
                          strokeWidth={hoveredMetric === "ram" ? "4.1" : "3.4"} strokeLinecap="round"
                          strokeDasharray={cRam} strokeDashoffset={ramOffset} transform="rotate(-90 39 39)"
                          style={{
                            transition: "stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1), stroke-width 0.2s ease, filter 0.2s ease",
                            filter: hoveredMetric === "ram"
                              ? "drop-shadow(0 0 7px rgba(191,90,242,0.95))"
                              : "drop-shadow(0 0 4px rgba(191,90,242,0.6))",
                          }} />
                        <circle cx="39" cy="39" r={rRam} fill="none" stroke="transparent" strokeWidth="7" style={{ pointerEvents: "stroke" }}>
                          <title>Memory: {ramPct}% ({usedRamGb} GB)</title>
                        </circle>
                      </g>

                      {/* Ring 3: Download */}
                      <g
                        className="apple-ring-interactive"
                        onPointerEnter={() => setHoveredMetric("down")}
                        onPointerLeave={() => setHoveredMetric(null)}
                        style={{
                          cursor: "pointer",
                          opacity: hoveredMetric === null || hoveredMetric === "down" ? 1 : 0.28,
                          transition: "opacity 0.22s ease",
                        }}
                      >
                        <circle cx="39" cy="39" r={rDown} fill="none" stroke="rgba(48,209,88,0.16)" strokeWidth={hoveredMetric === "down" ? "4.1" : "3.4"} />
                        <circle cx="39" cy="39" r={rDown} fill="none" stroke="url(#appleLgRingDown)"
                          strokeWidth={hoveredMetric === "down" ? "4.1" : "3.4"} strokeLinecap="round"
                          strokeDasharray={cDown} strokeDashoffset={downOffset} transform="rotate(-90 39 39)"
                          style={{
                            transition: "stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1), stroke-width 0.2s ease, filter 0.2s ease",
                            filter: hoveredMetric === "down"
                              ? "drop-shadow(0 0 7px rgba(48,209,88,0.95))"
                              : "drop-shadow(0 0 4px rgba(48,209,88,0.6))",
                          }} />
                        <circle cx="39" cy="39" r={rDown} fill="none" stroke="transparent" strokeWidth="7" style={{ pointerEvents: "stroke" }}>
                          <title>Download: ↓ {systemMetrics?.net_recv_formatted ?? "0 B/s"}</title>
                        </circle>
                      </g>

                      {/* Ring 4: Upload */}
                      <g
                        className="apple-ring-interactive"
                        onPointerEnter={() => setHoveredMetric("up")}
                        onPointerLeave={() => setHoveredMetric(null)}
                        style={{
                          cursor: "pointer",
                          opacity: hoveredMetric === null || hoveredMetric === "up" ? 1 : 0.28,
                          transition: "opacity 0.22s ease",
                        }}
                      >
                        <circle cx="39" cy="39" r={rUp} fill="none" stroke="rgba(56,189,248,0.16)" strokeWidth={hoveredMetric === "up" ? "4.1" : "3.4"} />
                        <circle cx="39" cy="39" r={rUp} fill="none" stroke="url(#appleLgRingUp)"
                          strokeWidth={hoveredMetric === "up" ? "4.1" : "3.4"} strokeLinecap="round"
                          strokeDasharray={cUp} strokeDashoffset={upOffset} transform="rotate(-90 39 39)"
                          style={{
                            transition: "stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1), stroke-width 0.2s ease, filter 0.2s ease",
                            filter: hoveredMetric === "up"
                              ? "drop-shadow(0 0 7px rgba(56,189,248,0.95))"
                              : "drop-shadow(0 0 4px rgba(56,189,248,0.6))",
                          }} />
                        <circle cx="39" cy="39" r={rUp} fill="none" stroke="transparent" strokeWidth="7" style={{ pointerEvents: "stroke" }}>
                          <title>Upload: ↑ {systemMetrics?.net_sent_formatted ?? "0 B/s"}</title>
                        </circle>
                      </g>
                    </svg>
                  </div>
                  <div className="apple-rings-large-divider" />
                  <div className="apple-telemetry-cards">
                    <div
                      className={`apple-tel-card ${hoveredMetric === "cpu" ? "apple-tel-card--active-cpu" : ""}`}
                      onPointerEnter={() => setHoveredMetric("cpu")}
                      onPointerLeave={() => setHoveredMetric(null)}
                    >
                      <div className="apple-tel-card-header">
                        <span className="apple-vital-dot apple-vital-dot--cpu" />
                        <span className="apple-tel-card-title">Processor</span>
                      </div>
                      <div className="apple-tel-card-val-row">
                        <span className="apple-tel-card-val">{cpuPct}%</span>
                        <span className="apple-tel-card-sub">Active Load</span>
                      </div>
                    </div>
                    <div
                      className={`apple-tel-card ${hoveredMetric === "ram" ? "apple-tel-card--active-ram" : ""}`}
                      onPointerEnter={() => setHoveredMetric("ram")}
                      onPointerLeave={() => setHoveredMetric(null)}
                    >
                      <div className="apple-tel-card-header">
                        <span className="apple-vital-dot apple-vital-dot--ram" />
                        <span className="apple-tel-card-title">Memory</span>
                      </div>
                      <div className="apple-tel-card-val-row">
                        <span className="apple-tel-card-val">{ramPct}%</span>
                        <span className="apple-tel-card-sub">{usedRamGb} GB</span>
                      </div>
                    </div>
                    <div
                      className={`apple-tel-card ${hoveredMetric === "down" ? "apple-tel-card--active-down" : ""}`}
                      onPointerEnter={() => setHoveredMetric("down")}
                      onPointerLeave={() => setHoveredMetric(null)}
                    >
                      <div className="apple-tel-card-header">
                        <span className="apple-vital-dot apple-vital-dot--net" />
                        <span className="apple-tel-card-title">Download</span>
                      </div>
                      <div className="apple-tel-card-val-row">
                        <span className="apple-tel-card-val apple-tel-card-val--down">↓ {systemMetrics?.net_recv_formatted ?? "0 B/s"}</span>
                      </div>
                    </div>
                    <div
                      className={`apple-tel-card ${hoveredMetric === "up" ? "apple-tel-card--active-up" : ""}`}
                      onPointerEnter={() => setHoveredMetric("up")}
                      onPointerLeave={() => setHoveredMetric(null)}
                    >
                      <div className="apple-tel-card-header">
                        <span className="apple-vital-dot apple-vital-dot--up" />
                        <span className="apple-tel-card-title">Upload</span>
                      </div>
                      <div className="apple-tel-card-val-row">
                        <span className="apple-tel-card-val apple-tel-card-val--up">↑ {systemMetrics?.net_sent_formatted ?? "0 B/s"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="apple-full-footer">
                  <div className="apple-footer-left">
                    <span className="apple-footer-dot" /><span>Real-Time Hardware Telemetry</span>
                  </div>
                  <button type="button" className="apple-settings-link" onClick={() => tauriBridge.openWindowsSettings()} title="Windows Settings">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                    <span>Settings</span>
                  </button>
                </div>

              </div>
            </div>
          );
        })()}

        {/* ── CASE 3: Expanded Bluetooth Card ── */}
        {expandedType === "bluetooth" && (
          <div key="expanded-bluetooth" className="dynamic-notch dynamic-notch--bluetooth-expanded"
            onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
            style={{ ["--wave-color" as any]: "#22c55e", ["--wave-glow" as any]: "rgba(34, 197, 94, 0.45)" }}>
            <div className="notch-ear notch-ear--left" /><div className="notch-ear notch-ear--right" />
            {renderLightBorder()}{renderNotchBgCover(false)}
            <div className="notch-bluetooth-expanded-card">
              <div className="notch-bt-badge">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5" />
                  <line x1="1" y1="12" x2="4" y2="12" stroke="#94a3b8" strokeWidth="2" />
                  <line x1="20" y1="12" x2="23" y2="12" stroke="#94a3b8" strokeWidth="2" />
                </svg>
              </div>
              <div className="notch-bt-info">
                <span className="notch-bt-status">Connected</span>
                <span className="notch-bt-name">{activeBtDevice?.name || "Bluetooth Device"}</span>
              </div>
              <div className="notch-bt-battery-ring-container">
                <svg className="notch-bt-ring-svg" width="42" height="42" viewBox="0 0 42 42">
                  <circle cx="21" cy="21" r={15} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3.2" />
                  <circle cx="21" cy="21" r={15} fill="none" stroke="#22c55e" strokeWidth="3.2" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 15}
                    strokeDashoffset={2 * Math.PI * 15 - ((activeBtDevice?.battery_percent ?? 100) / 100) * 2 * Math.PI * 15}
                    transform="rotate(-90 21 21)"
                    style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }} />
                </svg>
                <span className="notch-bt-ring-text">
                  {activeBtDevice?.battery_percent != null ? `${activeBtDevice.battery_percent}%` : "100%"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            COMPACT / IDLE STATES
            ════════════════════════════════════════════════════════════════════ */}

        {/* ── CASE 4: Multi-Activity Split (Media + BT both active) ── */}
        {showMultiSplit && (
          <div className="notch-split-container">
            <div className={`dynamic-notch notch-split-main ${splitViewMode === "media_main" ? "notch-split-main--media" : "notch-split-main--bluetooth"}`}
              onClick={handleMainPillClick}
              style={{
                ["--wave-color" as any]: splitViewMode === "media_main" ? trackTheme.waveColor : "#22c55e",
                ["--wave-gradient" as any]: splitViewMode === "media_main" ? trackTheme.waveGradient : undefined,
                ["--wave-gradient-top" as any]: splitViewMode === "media_main" ? trackTheme.waveGradientTop : undefined,
                ["--wave-gradient-bottom" as any]: splitViewMode === "media_main" ? trackTheme.waveGradientBottom : undefined,
                ["--wave-glow" as any]: splitViewMode === "media_main" ? trackTheme.glowColor : "rgba(34, 197, 94, 0.45)",
              }}>
              <div className="notch-ear notch-ear--left" /><div className="notch-ear notch-ear--right" />
              {renderLightBorder()}{renderNotchBgCover(splitViewMode === "media_main")}
              {splitViewMode === "media_main" ? (
                <div className="notch-split-media-layout" title={activeTitle}>
                  <div className="notch-album-thumb">
                    <img src={liveMedia?.album_art_base64 || "/albumcover-placeholder.png"} alt="Album Art"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/albumcover-placeholder.png"; }} />
                  </div>
                  <span className="notch-split-media-name">{activeTitle}</span>
                  <div className={`notch-equalizer-wave ${!activeIsPlaying ? "notch-equalizer-wave--paused" : ""}`}>
                    <span className="notch-wave-bar" /><span className="notch-wave-bar" /><span className="notch-wave-bar" /><span className="notch-wave-bar" />
                  </div>
                </div>
              ) : (
                <div className="notch-split-bt-layout">
                  <div className="notch-split-bt-icon">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5" />
                    </svg>
                  </div>
                  <div className="notch-split-bt-name">{activeBtDevice?.name || "Bluetooth"}</div>
                  <div className="notch-mini-battery-ring">
                    <svg width="13" height="13" viewBox="0 0 13 13">
                      <circle cx="6.5" cy="6.5" r={4.8} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.8" />
                      <circle cx="6.5" cy="6.5" r={4.8} fill="none" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 4.8}
                        strokeDashoffset={2 * Math.PI * 4.8 - ((activeBtDevice?.battery_percent ?? 85) / 100) * 2 * Math.PI * 4.8}
                        transform="rotate(-90 6.5 6.5)" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
            <div className="dynamic-notch notch-split-secondary" onClick={handleSecondaryPillClick}
              style={{
                ["--wave-color" as any]: splitViewMode === "media_main" ? "#22c55e" : trackTheme.waveColor,
                ["--wave-glow" as any]: splitViewMode === "media_main" ? "rgba(34,197,94,0.45)" : trackTheme.glowColor,
              }} title={splitViewMode === "media_main" ? "Switch active card" : activeTitle}>
              <div className="notch-ear notch-ear--left" /><div className="notch-ear notch-ear--right" />
              {renderLightBorder()}{renderNotchBgCover(splitViewMode !== "media_main")}
              {splitViewMode === "media_main" ? (
                <div className="notch-mini-battery-ring">
                  <svg width="13" height="13" viewBox="0 0 13 13">
                    <circle cx="6.5" cy="6.5" r={4.8} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.8" />
                    <circle cx="6.5" cy="6.5" r={4.8} fill="none" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 4.8}
                      strokeDashoffset={2 * Math.PI * 4.8 - ((activeBtDevice?.battery_percent ?? 85) / 100) * 2 * Math.PI * 4.8}
                      transform="rotate(-90 6.5 6.5)" />
                  </svg>
                </div>
              ) : (
                <div className="notch-album-thumb notch-album-thumb--mini">
                  <img src={liveMedia?.album_art_base64 || "/albumcover-placeholder.png"} alt="Album Art"
                    onError={(e) => { (e.target as HTMLImageElement).src = "/albumcover-placeholder.png"; }} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CASE 5: Dual Split (Clock+Battery left / BT right, no media) ── */}
        {showDualSplit && (
          <div className="notch-split-container">
            <div className="dynamic-notch notch-split-main notch-split-main--default"
              onClick={handleExpandSettings}
              style={{ ["--wave-color" as any]: "#38bdf8", ["--wave-glow" as any]: "rgba(56,189,248,0.45)", cursor: "pointer" }}>
              <div className="notch-ear notch-ear--left" /><div className="notch-ear notch-ear--right" />
              {renderLightBorder()}{renderNotchBgCover(false)}
              <div className="notch-compact-layout" style={{ gap: "8px", padding: "0 4px", width: "100%" }}>
                <div className="notch-compact-left">{renderCompactClock()}</div>
                <div className="notch-compact-right-morph">
                  <div className={`notch-swap-layer-compact ${volumeFeedbackVisible ? "notch-swap-layer-compact--hidden" : "notch-swap-layer-compact--active"}`}>
                    {showBattery && renderCompactBattery()}
                  </div>
                  <div className={`notch-swap-layer-compact ${volumeFeedbackVisible ? "notch-swap-layer-compact--active" : "notch-swap-layer-compact--hidden"}`}>
                    <div className="notch-compact-volume">
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                        {inlineVolumePct > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
                      </svg>
                      <span>{inlineVolumePct}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="dynamic-notch notch-split-secondary" onClick={handleExpandBluetooth}
              style={{ ["--wave-color" as any]: "#22c55e", ["--wave-glow" as any]: "rgba(34,197,94,0.45)", cursor: "pointer" }}
              title={`Bluetooth: ${activeBtDevice?.name} (${activeBtDevice?.battery_percent ?? 100}%)`}>
              <div className="notch-ear notch-ear--left" /><div className="notch-ear notch-ear--right" />
              {renderLightBorder()}{renderNotchBgCover(false)}
              <div className="notch-mini-battery-ring">
                <svg width="13" height="13" viewBox="0 0 13 13">
                  <circle cx="6.5" cy="6.5" r={4.8} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.8" />
                  <circle cx="6.5" cy="6.5" r={4.8} fill="none" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 4.8}
                    strokeDashoffset={2 * Math.PI * 4.8 - ((activeBtDevice?.battery_percent ?? 85) / 100) * 2 * Math.PI * 4.8}
                    transform="rotate(-90 6.5 6.5)" />
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* ── CASE 6: Media Compact (Active, single activity) ── */}
        {showMediaCompact && (
            <div key="compact-media" className={`dynamic-notch dynamic-notch--activity ${volumeFeedbackVisible ? "dynamic-notch--volume-feedback" : ""}`}
            onClick={(e) => handleExpandMedia(e)}
            style={{
              ["--wave-color" as any]: trackTheme.waveColor,
              ["--wave-gradient" as any]: trackTheme.waveGradient,
              ["--wave-gradient-top" as any]: trackTheme.waveGradientTop,
              ["--wave-gradient-bottom" as any]: trackTheme.waveGradientBottom,
              ["--wave-glow" as any]: trackTheme.glowColor,
            }}>
            <div className="notch-ear notch-ear--left" /><div className="notch-ear notch-ear--right" />
            {renderLightBorder()}{renderNotchBgCover(true)}
            <div className="notch-activity-layout">
              <div className="notch-activity-left">
                <div className="notch-album-thumb">
                  <img src={liveMedia?.album_art_base64 || "/albumcover-placeholder.png"} alt="Album Art"
                    onError={(e) => { (e.target as HTMLImageElement).src = "/albumcover-placeholder.png"; }} />
                </div>
              </div>
              <div className="notch-activity-middle">
                <div className={`notch-swap-layer notch-swap-layer--title ${volumeFeedbackVisible ? "notch-swap-layer--hidden" : "notch-swap-layer--active"}`}>
                  <span className="notch-activity-title">{activeTitle}</span>
                </div>
                <div className={`notch-swap-layer notch-swap-layer--volume ${volumeFeedbackVisible ? "notch-swap-layer--active" : "notch-swap-layer--hidden"}`}>
                  <div className="notch-inline-volume">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                      {inlineVolumePct > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
                      {inlineVolumePct > 50 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
                    </svg>
                    <div className="notch-inline-volume-bar">
                      <div className="notch-inline-volume-fill" style={{ width: `${inlineVolumePct}%` }} />
                    </div>
                    <span className="notch-inline-volume-text">{inlineVolumePct}%</span>
                  </div>
                </div>
              </div>
              <div className="notch-activity-right">
                <div className={`notch-equalizer-wave ${!activeIsPlaying ? "notch-equalizer-wave--paused" : ""}`}>
                  <span className="notch-wave-bar" /><span className="notch-wave-bar" /><span className="notch-wave-bar" />
                  <span className="notch-wave-bar" /><span className="notch-wave-bar" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── CASE 7: Idle Compact (Clock + Battery) ── */}
        {showIdleCompact && (
          <div key="compact-idle" className={`dynamic-notch dynamic-notch--compact ${volumeFeedbackVisible ? "dynamic-notch--volume-feedback" : ""}`}
            onClick={handleExpandSettings}
            style={{ ["--wave-color" as any]: "#38bdf8", ["--wave-glow" as any]: "rgba(56,189,248,0.45)", cursor: "pointer" }}>
            <div className="notch-ear notch-ear--left" /><div className="notch-ear notch-ear--right" />
            {renderLightBorder()}{renderNotchBgCover(false)}
            <div className="notch-compact-layout">
              <div className="notch-compact-left">{renderCompactClock()}</div>
              <div className="notch-compact-right-morph">
                <div className={`notch-swap-layer-compact ${volumeFeedbackVisible ? "notch-swap-layer-compact--hidden" : "notch-swap-layer-compact--active"}`}>
                  {showBattery && renderCompactBattery()}
                </div>
                <div className={`notch-swap-layer-compact ${volumeFeedbackVisible ? "notch-swap-layer-compact--active" : "notch-swap-layer-compact--hidden"}`}>
                  <div className="notch-compact-volume">
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                      {inlineVolumePct > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
                    </svg>
                    <span>{inlineVolumePct}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
};
